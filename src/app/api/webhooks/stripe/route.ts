import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { generateJitsiRoom } from "@/lib/jitsi";
import { sendBookingConfirmationEmails } from "@/lib/email";

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    console.error("[/api/webhooks/stripe] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);

  // Stripe signs the raw request body — it must be read as text, not parsed
  // as JSON, or the signature check below will always fail.
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature) {
      throw new Error("Missing stripe-signature header.");
    }
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (signatureError) {
    const message =
      signatureError instanceof Error ? signatureError.message : "Signature invalide.";
    console.error("[/api/webhooks/stripe] signature verification failed:", message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[/api/webhooks/stripe] failed to process ${event.type}`, error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) {
    console.error(
      `[/api/webhooks/stripe] checkout.session.completed (${session.id}) sans metadata.booking_id`,
    );
    return;
  }

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, creator_id, customer_email, customer_name, slot_time")
    .eq("id", bookingId)
    .single();

  if (fetchError || !booking) {
    console.error(`[/api/webhooks/stripe] booking ${bookingId} introuvable`);
    return;
  }

  // Idempotency: Stripe redelivers events (retries, duplicate webhooks).
  // Only a booking still "pending" should be confirmed by this event.
  if (booking.status !== "pending") {
    return;
  }

  const { roomName, roomUrl } = generateJitsiRoom(booking.id);

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      video_room_id: roomName,
      video_room_url: roomUrl,
    })
    .eq("id", booking.id);

  if (updateError) {
    throw updateError;
  }

  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("name, email")
    .eq("id", booking.creator_id)
    .single();

  if (creatorError || !creator) {
    console.error(`[/api/webhooks/stripe] créateur introuvable pour booking ${booking.id}, emails non envoyés`);
    return;
  }

  await sendBookingConfirmationEmails({
    bookingId: booking.id,
    customerEmail: booking.customer_email,
    customerName: booking.customer_name,
    creatorEmail: creator.email,
    creatorName: creator.name,
    slotTime: booking.slot_time,
  });
}
