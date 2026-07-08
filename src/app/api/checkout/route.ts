import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { isSlotWithinRules } from "@/lib/availability";

interface CheckoutRequestBody {
  creator_slug: string;
  customer_email: string;
  customer_name: string;
  slot_time: string; // ISO timestamp, must match one of the creator's declared availability windows
}

function formatSlotTime(isoSlotTime: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(isoSlotTime));
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

    const { data: creator, error: creatorError } = await supabase
      .from("creators")
      .select("id, name, hourly_rate_cents")
      .eq("slug", creator_slug)
      .maybeSingle();

    if (creatorError) {
      throw creatorError;
    }
    if (!creator) {
      return NextResponse.json(
        { error: `Créateur introuvable pour "${creator_slug}".` },
        { status: 404 },
      );
    }

    if (!(await isSlotWithinRules(creator.id, slot_time))) {
      return NextResponse.json(
        { error: "Ce créneau n'est plus disponible." },
        { status: 400 },
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
        slot_time,
        status: "pending",
        // Captured now, independent of the creator's current hourly_rate_cents
        // (which could change later) — this is what payouts.ts pays 90% of.
        amount_cents: creator.hourly_rate_cents,
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
                name: `Appel avec ${creator.name} — ${formatSlotTime(slot_time)}`,
              },
              unit_amount: creator.hourly_rate_cents,
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
