import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { arbitrateBooking } from "@/lib/arbitration";

interface ArbitrationRequestBody {
  booking_id: string;
  creator_joined_at: string | null;
  customer_joined_at: string | null;
}

/**
 * Manual/simulated entry point: lets a meeting-end log (or a human testing)
 * report presence timestamps directly, in lieu of a real video provider
 * webhook. Writes them to the booking, then defers to the shared
 * arbitrateBooking() so the business rules only live in one place — the same
 * function the automatic cron uses.
 */
export async function POST(request: NextRequest) {
  try {
    // This endpoint moves money (it can trigger a Stripe refund), so it must
    // never be reachable by an unauthenticated third party even if they guess
    // a booking_id. In production this header would come from the video
    // provider's webhook signing scheme; for now it's a shared secret set
    // alongside the other server-only env vars.
    const expectedSecret = process.env.ARBITRATION_WEBHOOK_SECRET;
    if (!expectedSecret) {
      throw new Error("Missing ARBITRATION_WEBHOOK_SECRET environment variable");
    }
    if (request.headers.get("x-webhook-secret") !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<ArbitrationRequestBody>;
    const { booking_id } = body;

    if (!booking_id) {
      return NextResponse.json({ error: "booking_id est requis." }, { status: 400 });
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

    const { data: existingBooking, error: fetchError } = await supabase
      .from("bookings")
      .select("status")
      .eq("id", booking_id)
      .single();

    if (fetchError || !existingBooking) {
      return NextResponse.json({ error: "Booking introuvable." }, { status: 404 });
    }

    // Don't let a replayed event overwrite the join timestamps of a booking
    // that's already been arbitrated — arbitrateBooking() below will no-op
    // the status anyway, but the historical record shouldn't shift under it.
    const alreadyArbitrated = ["no_show_creator", "no_show_client", "completed"].includes(
      existingBooking.status,
    );

    if (!alreadyArbitrated) {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          creator_joined_at: creatorJoinedAt ? creatorJoinedAt.toISOString() : null,
          customer_joined_at: customerJoinedAt ? customerJoinedAt.toISOString() : null,
        })
        .eq("id", booking_id);

      if (updateError) {
        throw updateError;
      }
    }

    const result = await arbitrateBooking(booking_id);

    return NextResponse.json({
      booking_id: result.bookingId,
      status: result.status,
      refund_id: result.refundId,
      creator_lateness_minutes: result.creatorLatenessMinutes,
      customer_lateness_minutes: result.customerLatenessMinutes,
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
