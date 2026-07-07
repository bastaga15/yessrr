import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";

const SESSION_PRICE_EUR_CENTS = 5000;

interface CheckoutRequestBody {
  creator_slug: string;
  customer_email: string;
  customer_name: string;
  slot_time: string;
}

function slugToName(slug: string) {
  return decodeURIComponent(slug)
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// MVP shim: slots are bare "HH:MM" strings with no date yet (no real availabilities
// wired up). Anchor them to today so the timestamptz/unique(creator_id, slot_time)
// constraints in bookings have a valid value to work with.
function slotTimeToTimestamp(slotTime: string) {
  const [hours, minutes] = slotTime.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CheckoutRequestBody>;
    const { creator_slug, customer_email, customer_name, slot_time } = body;

    if (!creator_slug || !customer_email || !customer_name || !slot_time) {
      return NextResponse.json(
        { error: "Champs manquants : creator_slug, customer_email, customer_name, slot_time sont requis." },
        { status: 400 },
      );
    }

    const derivedName = slugToName(creator_slug);

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id, name")
      .ilike("name", derivedName)
      .limit(1)
      .maybeSingle();

    if (creatorError) {
      throw creatorError;
    }
    if (!creator) {
      return NextResponse.json(
        { error: `Créateur introuvable pour "${derivedName}".` },
        { status: 404 },
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable");
    }
    const stripe = new Stripe(stripeSecretKey);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        creator_id: creator.id,
        customer_email,
        customer_name,
        slot_time: slotTimeToTimestamp(slot_time),
        status: "pending",
      })
      .select("id")
      .single();

    if (bookingError) {
      if (bookingError.code === "23505") {
        return NextResponse.json(
          { error: "Ce créneau vient d'être réservé par quelqu'un d'autre." },
          { status: 409 },
        );
      }
      throw bookingError;
    }

    try {
      const origin = request.nextUrl.origin;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Appel avec ${creator.name} — créneau ${slot_time}`,
              },
              unit_amount: SESSION_PRICE_EUR_CENTS,
            },
            quantity: 1,
          },
        ],
        metadata: {
          booking_id: booking.id,
          customer_name,
        },
        success_url: `${origin}/${creator_slug}?booking=success`,
        cancel_url: `${origin}/${creator_slug}?booking=canceled`,
      });

      if (!session.url) {
        throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");
      }

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ stripe_payment_id: session.id })
        .eq("id", booking.id);

      if (updateError) {
        throw updateError;
      }

      return NextResponse.json({ url: session.url });
    } catch (stripeStepError) {
      // Don't leave an orphaned pending booking blocking this slot if Stripe/update failed.
      await supabase.from("bookings").delete().eq("id", booking.id);
      throw stripeStepError;
    }
  } catch (error) {
    console.error("[/api/checkout]", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
