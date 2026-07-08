import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getConnectStatus } from "@/lib/stripe-connect";
import { sendStripeConnectReminderEmail } from "@/lib/email";

// Don't re-email a creator more than once every 3 days, even though this
// cron itself runs every 5 minutes alongside arbitration/reminders.
const REMINDER_INTERVAL_DAYS = 3;

interface CreatorRow {
  id: string;
  name: string;
  email: string;
  stripe_connect_id: string | null;
  management_token: string;
  stripe_connect_reminder_sent_at: string | null;
}

/**
 * Finds creators with money stuck on the platform balance (a `completed` or
 * `no_show_client` booking whose payout was never transferred) because they
 * never finished Stripe Connect onboarding, and nudges them by email —
 * otherwise that money just sits there indefinitely with nothing prompting
 * them back to /manage/<token> (see PROJECT_STATUS.md item 7).
 */
async function handleCronRequest(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("[/api/cron/stripe-connect-reminders] Missing CRON_SECRET environment variable");
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }
  if (request.headers.get("x-cron-secret") !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pendingBookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("creator_id, amount_cents")
    .in("status", ["completed", "no_show_client"])
    .is("stripe_transfer_id", null)
    .not("amount_cents", "is", null);

  if (bookingsError) {
    console.error("[/api/cron/stripe-connect-reminders]", bookingsError);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }

  const pendingByCreator = new Map<string, { amountCents: number; count: number }>();
  for (const booking of pendingBookings ?? []) {
    const existing = pendingByCreator.get(booking.creator_id) ?? { amountCents: 0, count: 0 };
    existing.amountCents += booking.amount_cents ?? 0;
    existing.count += 1;
    pendingByCreator.set(booking.creator_id, existing);
  }

  if (pendingByCreator.size === 0) {
    return NextResponse.json({ sent: 0, skipped: 0 });
  }

  const throttleCutoff = new Date(Date.now() - REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: creators, error: creatorsError } = await supabase
    .from("creators")
    .select("id, name, email, stripe_connect_id, management_token, stripe_connect_reminder_sent_at")
    .in("id", Array.from(pendingByCreator.keys()));

  if (creatorsError) {
    console.error("[/api/cron/stripe-connect-reminders]", creatorsError);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const creator of (creators ?? []) as CreatorRow[]) {
    if (creator.stripe_connect_reminder_sent_at && creator.stripe_connect_reminder_sent_at > throttleCutoff) {
      skipped++;
      continue;
    }

    const connectStatus = await getConnectStatus(creator.stripe_connect_id);
    if (connectStatus.payoutsEnabled) {
      // Connect-ready but the transfer just hasn't run yet (e.g. a transient
      // Stripe error) — releasePendingPayouts on their next /manage load
      // will sweep it, no need to nudge them to "finish onboarding".
      skipped++;
      continue;
    }

    const pending = pendingByCreator.get(creator.id)!;

    try {
      await sendStripeConnectReminderEmail({
        creatorEmail: creator.email,
        creatorName: creator.name,
        managementToken: creator.management_token,
        pendingAmountCents: pending.amountCents,
        pendingBookingsCount: pending.count,
      });

      const { error: updateError } = await supabase
        .from("creators")
        .update({ stripe_connect_reminder_sent_at: new Date().toISOString() })
        .eq("id", creator.id);

      if (updateError) throw updateError;
      sent++;
    } catch (error) {
      console.error(`[/api/cron/stripe-connect-reminders] creator ${creator.id}:`, error);
    }
  }

  return NextResponse.json({ sent, skipped });
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request);
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request);
}
