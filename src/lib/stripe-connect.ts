import Stripe from "stripe";

export interface ConnectStatus {
  connected: boolean; // has a Stripe connected account at all
  payoutsEnabled: boolean; // that account can actually receive payouts
}

/**
 * Live status check against Stripe — not cached anywhere. Called on
 * /manage/[token] page loads and before checkout, both low-frequency
 * enough that a direct API call is simpler than maintaining webhook-synced
 * state in Supabase.
 */
export async function getConnectStatus(stripeConnectId: string | null): Promise<ConnectStatus> {
  if (!stripeConnectId) {
    return { connected: false, payoutsEnabled: false };
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  const stripe = new Stripe(stripeSecretKey);

  const account = await stripe.accounts.retrieve(stripeConnectId);
  return {
    connected: true,
    payoutsEnabled: Boolean(account.payouts_enabled && account.charges_enabled),
  };
}
