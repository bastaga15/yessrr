import Stripe from "stripe";
import { supabase } from "@/lib/supabase";

const PLATFORM_COMMISSION_RATE = 0.1; // Yessrr keeps 10%, the rest is transferred to the creator

function getStripe(): Stripe {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  return new Stripe(stripeSecretKey);
}

/**
 * Transfers a creator's 90% share for one booking. Called either
 * immediately (arbitration decided in the creator's favor and they're
 * already Connect-ready) or later via releasePendingPayouts (they weren't
 * ready yet at the time). Idempotency is the caller's responsibility —
 * only call this for a booking whose `stripe_transfer_id` is still null.
 */
export async function payoutBooking(
  booking: { id: string; amount_cents: number | null },
  stripeConnectId: string,
): Promise<string> {
  const stripe = getStripe();
  const amount = Math.round((booking.amount_cents ?? 0) * (1 - PLATFORM_COMMISSION_RATE));

  const transfer = await stripe.transfers.create({
    amount,
    currency: "eur",
    destination: stripeConnectId,
    metadata: { booking_id: booking.id },
  });

  const { error } = await supabase
    .from("bookings")
    .update({ stripe_transfer_id: transfer.id })
    .eq("id", booking.id);

  if (error) {
    throw error;
  }

  return transfer.id;
}

/**
 * Sweeps for bookings that were decided in a creator's favor (`completed` or
 * `no_show_client`) but are still sitting on the platform balance because
 * the creator wasn't Connect-ready at arbitration time. Meant to be called
 * whenever we learn a creator just became payouts-ready — typically on
 * their first `/manage/<token>` page load after finishing Stripe onboarding.
 * Returns how many transfers succeeded.
 */
export async function releasePendingPayouts(
  creatorId: string,
  stripeConnectId: string,
): Promise<number> {
  const { data: pending, error } = await supabase
    .from("bookings")
    .select("id, amount_cents")
    .eq("creator_id", creatorId)
    .in("status", ["completed", "no_show_client"])
    .is("stripe_transfer_id", null)
    .not("amount_cents", "is", null);

  if (error) {
    throw error;
  }
  if (!pending || pending.length === 0) {
    return 0;
  }

  const results = await Promise.allSettled(
    pending.map((booking) => payoutBooking(booking, stripeConnectId)),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[payouts] échec du transfert pour booking ${pending[index].id}:`, result.reason);
    }
  });

  return results.filter((result) => result.status === "fulfilled").length;
}
