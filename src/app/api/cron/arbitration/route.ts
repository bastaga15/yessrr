import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { arbitrateBooking } from "@/lib/arbitration";
import { SLOT_DURATION_MINUTES } from "@/lib/availability";

// Wait a bit past the end of the call before arbitrating, so a slightly late
// /api/bookings/join call isn't racing the cron.
const GRACE_PERIOD_AFTER_CALL_MINUTES = 15;

/**
 * Scans `confirmed` bookings whose call window has passed and runs
 * arbitration automatically, using whatever creator_joined_at /
 * customer_joined_at were recorded via /api/bookings/join during the actual
 * call. This is the reliable fallback — unlike an in-browser "left the call"
 * event, it doesn't depend on anyone's tab staying open or their network
 * holding up.
 *
 * Meant to be triggered by an external scheduler (GitHub Actions cron,
 * Upstash, cron-job.org, or a crontab entry on your own server) every few
 * minutes. Supports GET too since some free schedulers only do simple pings.
 */
async function handleCronRequest(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("[/api/cron/arbitration] Missing CRON_SECRET environment variable");
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }
  if (request.headers.get("x-cron-secret") !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - (SLOT_DURATION_MINUTES + GRACE_PERIOD_AFTER_CALL_MINUTES) * 60_000,
  ).toISOString();

  const { data: eligibleBookings, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .lte("slot_time", cutoff);

  if (error) {
    console.error("[/api/cron/arbitration]", error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }

  const results = await Promise.allSettled(
    (eligibleBookings ?? []).map((booking) => arbitrateBooking(booking.id)),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `[/api/cron/arbitration] booking ${eligibleBookings![index].id} failed:`,
        result.reason,
      );
    }
  });

  return NextResponse.json({
    processed: results.length,
    failed: results.filter((r) => r.status === "rejected").length,
  });
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request);
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request);
}
