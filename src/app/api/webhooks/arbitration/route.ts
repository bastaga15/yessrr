import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";

/**
 * Grace periods for the arbitration protocol. A party is only considered a
 * no-show once they exceed their grace period — arriving early or exactly on
 * time never counts against them.
 */
const CREATOR_GRACE_PERIOD_MINUTES = 10;
const CUSTOMER_GRACE_PERIOD_MINUTES = 15;

type ArbitratedStatus = "no_show_creator" | "no_show_client" | "completed";

// Once a booking has reached one of these statuses, arbitration has already run.
// Meeting-end webhooks can be delivered more than once (retries, duplicate
// events) — replaying one against an already-arbitrated booking must be a
// no-op, otherwise we'd risk double-refunding a creator no-show.
const ALREADY_ARBITRATED: ReadonlySet<string> = new Set([
  "no_show_creator",
  "no_show_client",
  "completed",
]);

interface ArbitrationRequestBody {
  booking_id: string;
  creator_joined_at: string | null;
  customer_joined_at: string | null;
}

export async function POST(request: NextRequest) {
  try {
    // --- Step 0: authenticate the caller -----------------------------------
    // This endpoint moves money (it can trigger a Stripe refund), so it must
    // never be reachable by an unauthenticated third party even if they guess
    // a booking_id. In production this header would come from the video
    // provider's webhook signing scheme (Daily.co, Zoom, ...); for now it's a
    // shared secret set alongside the other server-only env vars.
    const expectedSecret = process.env.ARBITRATION_WEBHOOK_SECRET;
    if (!expectedSecret) {
      throw new Error("Missing ARBITRATION_WEBHOOK_SECRET environment variable");
    }
    if (request.headers.get("x-webhook-secret") !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- Step 1: parse & validate the payload -------------------------------
    const body = (await request.json()) as Partial<ArbitrationRequestBody>;
    const { booking_id } = body;

    if (!booking_id) {
      return NextResponse.json(
        { error: "booking_id est requis." },
        { status: 400 },
      );
    }

    let creatorJoinedAt: Date | null;
    let customerJoinedAt: Date | null;
    try {
      creatorJoinedAt = parseNullableTimestamp(body.creator_joined_at, "creator_joined_at");
      customerJoinedAt = parseNullableTimestamp(body.customer_joined_at, "customer_joined_at");
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : "Payload invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // --- Step 2: load the booking (source of truth for slot_time & payment) --
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, status, slot_time, stripe_payment_id")
      .eq("id", booking_id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking introuvable." }, { status: 404 });
    }

    if (ALREADY_ARBITRATED.has(booking.status)) {
      return NextResponse.json({
        booking_id: booking.id,
        status: booking.status,
        message: "Booking déjà arbitré, aucune action effectuée.",
      });
    }

    // --- Step 3: business rules ---------------------------------------------
    const slotTime = new Date(booking.slot_time);
    const creatorLatenessMinutes = minutesLate(slotTime, creatorJoinedAt);
    const customerLatenessMinutes = minutesLate(slotTime, customerJoinedAt);

    // Rule 1 — No-Show Créateur: absent, or arrived more than 10min late.
    // The creator is the one being paid, so their absence is refunded in full.
    const creatorIsNoShow =
      creatorLatenessMinutes === null || creatorLatenessMinutes > CREATOR_GRACE_PERIOD_MINUTES;

    let status: ArbitratedStatus;
    let refundId: string | null = null;

    if (creatorIsNoShow) {
      status = "no_show_creator";
      refundId = await refundBooking(booking.id, booking.stripe_payment_id);
    } else {
      // Rule 2 — No-Show Client: creator showed up, but the client was absent
      // or more than 15min late. Funds are already captured at checkout time
      // (mode: "payment" captures immediately) — "valider les fonds" simply
      // means: do nothing to the payment, just record the outcome.
      const customerIsNoShow =
        customerLatenessMinutes === null ||
        customerLatenessMinutes > CUSTOMER_GRACE_PERIOD_MINUTES;

      // Rule 3 — Match Parfait: both parties were on time.
      status = customerIsNoShow ? "no_show_client" : "completed";
    }

    // --- Step 4: persist the outcome ----------------------------------------
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status,
        creator_joined_at: creatorJoinedAt ? creatorJoinedAt.toISOString() : null,
        customer_joined_at: customerJoinedAt ? customerJoinedAt.toISOString() : null,
      })
      .eq("id", booking.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      booking_id: booking.id,
      status,
      refund_id: refundId,
      creator_lateness_minutes: creatorLatenessMinutes,
      customer_lateness_minutes: customerLatenessMinutes,
    });
  } catch (error) {
    console.error("[/api/webhooks/arbitration]", error);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Parses a nullable ISO-8601 timestamp coming from the webhook payload.
 * Returns null for "never joined". Throws for a present-but-unparseable value
 * so the caller can turn it into a 400 instead of a generic 500.
 */
function parseNullableTimestamp(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} doit être une chaîne ISO-8601 ou null.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} n'est pas un timestamp ISO valide.`);
  }
  return date;
}

/**
 * Minutes between the scheduled slot and the moment someone actually joined.
 * Negative or zero means on time / early. Null means they never joined.
 */
function minutesLate(slotTime: Date, joinedAt: Date | null): number | null {
  if (!joinedAt) return null;
  return (joinedAt.getTime() - slotTime.getTime()) / 60_000;
}

/**
 * Refunds the payment tied to a booking. `stripe_payment_id` stores the
 * Checkout Session id (cs_...), but stripe.refunds.create needs a
 * PaymentIntent id — so we resolve the session first.
 *
 * Returns the refund id, or null if there was nothing to refund (payment
 * never completed) — this is logged rather than thrown, since the booking's
 * status still needs to move to `no_show_creator` either way.
 */
async function refundBooking(
  bookingId: string,
  stripePaymentId: string | null,
): Promise<string | null> {
  if (!stripePaymentId) {
    console.warn(`[arbitration] booking ${bookingId}: pas de stripe_payment_id, remboursement ignoré.`);
    return null;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  const stripe = new Stripe(stripeSecretKey);

  const session = await stripe.checkout.sessions.retrieve(stripePaymentId);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  if (!paymentIntentId) {
    console.warn(
      `[arbitration] booking ${bookingId}: session ${stripePaymentId} sans payment_intent (paiement jamais finalisé), remboursement ignoré.`,
    );
    return null;
  }

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    metadata: { booking_id: bookingId, reason: "creator_no_show" },
  });

  return refund.id;
}
