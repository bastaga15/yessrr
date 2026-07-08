import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { getConnectStatus } from "@/lib/stripe-connect";
import { payoutBooking } from "@/lib/payouts";

/**
 * Grace periods for the arbitration protocol. A party is only considered a
 * no-show once they exceed their grace period — arriving early or exactly on
 * time never counts against them.
 */
const CREATOR_GRACE_PERIOD_MINUTES = 10;
const CUSTOMER_GRACE_PERIOD_MINUTES = 15;

export type ArbitratedStatus = "no_show_creator" | "no_show_client" | "completed";

// Once a booking has reached one of these statuses, arbitration has already run.
// Both the manual webhook and the cron can be replayed/re-triggered — hitting
// an already-arbitrated booking must be a no-op, otherwise we'd risk
// double-refunding a creator no-show.
const ALREADY_ARBITRATED: ReadonlySet<string> = new Set([
  "no_show_creator",
  "no_show_client",
  "completed",
]);

export interface ArbitrationResult {
  bookingId: string;
  status: ArbitratedStatus | "already_arbitrated";
  refundId: string | null;
  transferId: string | null;
  creatorLatenessMinutes: number | null;
  customerLatenessMinutes: number | null;
}

/**
 * Runs the arbitration protocol against a booking's *already-stored*
 * creator_joined_at / customer_joined_at (populated by /api/bookings/join
 * during the actual call). This is the single source of truth for the
 * business rules — both the manual/simulated webhook and the automatic cron
 * call into this function so the rules only ever live in one place.
 */
export async function arbitrateBooking(bookingId: string): Promise<ArbitrationResult> {
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select(
      "id, creator_id, status, slot_time, stripe_payment_id, amount_cents, creator_joined_at, customer_joined_at",
    )
    .eq("id", bookingId)
    .single();

  if (fetchError || !booking) {
    throw new Error(`Booking ${bookingId} introuvable.`);
  }

  if (ALREADY_ARBITRATED.has(booking.status)) {
    return {
      bookingId: booking.id,
      status: "already_arbitrated",
      refundId: null,
      transferId: null,
      creatorLatenessMinutes: null,
      customerLatenessMinutes: null,
    };
  }

  const slotTime = new Date(booking.slot_time);
  const creatorJoinedAt = booking.creator_joined_at ? new Date(booking.creator_joined_at) : null;
  const customerJoinedAt = booking.customer_joined_at ? new Date(booking.customer_joined_at) : null;

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
      customerLatenessMinutes === null || customerLatenessMinutes > CUSTOMER_GRACE_PERIOD_MINUTES;

    // Rule 3 — Match Parfait: both parties were on time.
    status = customerIsNoShow ? "no_show_client" : "completed";
  }

  const { error: updateError } = await supabase.from("bookings").update({ status }).eq("id", booking.id);
  if (updateError) {
    throw updateError;
  }

  let transferId: string | null = null;
  if (status === "no_show_client" || status === "completed") {
    transferId = await tryPayoutBooking(booking);
  }

  return {
    bookingId: booking.id,
    status,
    refundId,
    transferId,
    creatorLatenessMinutes,
    customerLatenessMinutes,
  };
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
 * Pays the creator their 90% share, but only if they're already Connect-ready
 * at arbitration time. If not (deferred onboarding — see
 * src/lib/payouts.ts#releasePendingPayouts), the booking is simply left with
 * a null stripe_transfer_id: the money stays on the platform balance until
 * they finish connecting, at which point releasePendingPayouts sweeps it up.
 */
async function tryPayoutBooking(booking: {
  id: string;
  creator_id: string;
  amount_cents: number | null;
}): Promise<string | null> {
  const { data: creator, error } = await supabase
    .from("creators")
    .select("stripe_connect_id")
    .eq("id", booking.creator_id)
    .single();

  if (error || !creator?.stripe_connect_id) {
    return null;
  }

  const connectStatus = await getConnectStatus(creator.stripe_connect_id);
  if (!connectStatus.payoutsEnabled) {
    return null;
  }

  return payoutBooking(booking, creator.stripe_connect_id);
}

/**
 * Refunds the payment tied to a booking. `stripe_payment_id` stores the
 * Checkout Session id (cs_...), but stripe.refunds.create needs a
 * PaymentIntent id — so we resolve the session first.
 *
 * Returns the refund id, or null if there was nothing to refund (payment
 * never completed) — this is logged rather than thrown, since the booking's
 * status still needs to move to `no_show_creator` either way.
 *
 * A plain refund is enough here: checkout charges the platform directly
 * (see src/app/api/checkout/route.ts) and payouts only ever happen later,
 * once arbitration decides in the creator's favor — so there's never a
 * transfer to reverse at refund time.
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
