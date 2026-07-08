import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendReminderEmails } from "@/lib/email";

interface ReminderWindow {
  column: "reminder_24h_sent_at" | "reminder_1h_sent_at";
  hoursBefore: number;
  previousHoursBefore: number;
  label: "24h" | "1h";
}

// Bands are non-overlapping (each window's lower bound is the previous
// window's threshold) — otherwise a booking under 1h away would also match
// the "within 24h" condition and get both reminders in the same run.
const REMINDER_WINDOWS: ReminderWindow[] = [
  { column: "reminder_1h_sent_at", hoursBefore: 1, previousHoursBefore: 0, label: "1h" },
  { column: "reminder_24h_sent_at", hoursBefore: 24, previousHoursBefore: 1, label: "24h" },
];

/**
 * Sends J-1 and H-1 reminder emails. Meant to be hit every few minutes by
 * the same external scheduler as /api/cron/arbitration. For each window,
 * finds `confirmed` bookings whose slot_time has just crossed the
 * "N hours before" threshold and haven't been reminded yet — the null-check
 * on the tracking column (rather than a tight time window) makes this
 * robust to the cron running late or being missed on a given tick.
 */
async function handleCronRequest(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("[/api/cron/reminders] Missing CRON_SECRET environment variable");
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }
  if (request.headers.get("x-cron-secret") !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sent = 0;
  let failed = 0;

  for (const window of REMINDER_WINDOWS) {
    const upperBound = new Date(Date.now() + window.hoursBefore * 60 * 60 * 1000).toISOString();
    const lowerBound = new Date(Date.now() + window.previousHoursBefore * 60 * 60 * 1000).toISOString();

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("id, customer_email, customer_name, slot_time, creators(name, email)")
      .eq("status", "confirmed")
      .is(window.column, null)
      .lte("slot_time", upperBound)
      .gt("slot_time", lowerBound);

    if (error) {
      console.error(`[/api/cron/reminders] échec de la requête pour ${window.label}`, error);
      continue;
    }

    for (const booking of bookings ?? []) {
      const creator = Array.isArray(booking.creators) ? booking.creators[0] : booking.creators;
      if (!creator) continue;

      try {
        await sendReminderEmails(
          {
            bookingId: booking.id,
            customerEmail: booking.customer_email,
            customerName: booking.customer_name,
            creatorEmail: creator.email,
            creatorName: creator.name,
            slotTime: booking.slot_time,
          },
          window.label,
        );

        const { error: updateError } = await supabase
          .from("bookings")
          .update({ [window.column]: new Date().toISOString() })
          .eq("id", booking.id);

        if (updateError) throw updateError;
        sent++;
      } catch (sendError) {
        failed++;
        console.error(`[/api/cron/reminders] booking ${booking.id} (${window.label}):`, sendError);
      }
    }
  }

  return NextResponse.json({ sent, failed });
}

export async function POST(request: NextRequest) {
  return handleCronRequest(request);
}

export async function GET(request: NextRequest) {
  return handleCronRequest(request);
}
