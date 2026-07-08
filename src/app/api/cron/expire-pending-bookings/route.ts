import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";

// How long a booking can sit unpaid before its slot is freed back up. Kept
// short — a checkout abandoned this long ago is essentially never coming
// back, and until this runs the slot is unbookable by anyone else.
const PENDING_BOOKING_EXPIRY_MINUTES = 10;

function getStripe(): Stripe {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  return new Stripe(stripeSecretKey);
}

/**
 * Frees up slots blocked by abandoned checkouts. A `pending` booking is
 * inserted before the Stripe Checkout Session even exists (see
 * /api/checkout) — if the customer never pays, nothing else ever moves it
 * out of `pending`, so without this it would block its slot forever.
 *
 * Also proactively expires the Stripe session itself: a customer who still
 * has the abandoned checkout tab open must not be able to complete payment
 * for a booking we're about to delete, which would capture real money with
 * no booking left to attach it to (no refund path, no arbitration).
 *
 * Meant to be triggered by the same external scheduler as the other crons.
 */
async function handleCronRequest(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("[/api/cron/expire-pending-bookings] Missing CRON_SECRET environment variable");
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }
  if (request.headers.get("x-cron-secret") !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - PENDING_BOOKING_EXPIRY_MINUTES * 60_000).toISOString();

  const { data: staleBookings, error } = await supabase
    .from("bookings")
    .select("id, stripe_payment_id")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (error) {
    console.error("[/api/cron/expire-pending-bookings]", error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }

  let expired = 0;
  let skipped = 0;

  for (const booking of staleBookings ?? []) {
    if (booking.stripe_payment_id) {
      try {
        await getStripe().checkout.sessions.expire(booking.stripe_payment_id);
      } catch (stripeError) {
        // Stripe rejects this if the session is already paid, expired, or
        // canceled. If it's "already paid", the confirmation webhook is on
        // its way (or already landed) — the conditional delete below is
        // what actually protects against that race, not this catch.
        console.warn(
          `[/api/cron/expire-pending-bookings] booking ${booking.id}: échec expire() Stripe (probablement déjà payé/expiré)`,
          stripeError,
        );
      }
    }

    // Conditional on status still being "pending": if the confirmation
    // webhook raced in between the select above and this delete, this
    // simply deletes 0 rows instead of destroying a just-confirmed booking.
    const { data: deleted, error: deleteError } = await supabase
      .from("bookings")
      .delete()
      .eq("id", booking.id)
      .eq("status", "pending")
      .select("id");

    if (deleteError) {
      console.error(`[/api/cron/expire-pending-bookings] booking ${booking.id}:`, deleteError);
      continue;
    }

    if (deleted && deleted.length > 0) {
      expired++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ expired, skipped });
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request);
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request);
}
