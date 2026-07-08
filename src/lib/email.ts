import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  throw new Error("Missing RESEND_API_KEY environment variable");
}

const resend = new Resend(resendApiKey);

// Server-only (uses a secret API key) — never import this file from a
// "use client" component.

const FROM_ADDRESS = "Yessrr <reservations@yessrr.fr>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

interface BookingConfirmationInput {
  bookingId: string;
  customerEmail: string;
  customerName: string;
  creatorEmail: string;
  creatorName: string;
  slotTime: string; // ISO timestamp
}

/**
 * Emails both parties once a booking is confirmed. Delivery failures are
 * logged, not thrown — a Resend hiccup must never undo an already-paid
 * booking, so this is intentionally best-effort.
 *
 * Links to our own /call/<bookingId> gate rather than the raw Jitsi URL —
 * that page enforces the join time window and records presence for
 * arbitration, neither of which meet.jit.si does on its own.
 */
export async function sendBookingConfirmationEmails(input: BookingConfirmationInput): Promise<void> {
  const formattedSlot = new Date(input.slotTime).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const customerCallUrl = `${APP_URL}/call/${input.bookingId}?role=customer`;
  const creatorCallUrl = `${APP_URL}/call/${input.bookingId}?role=creator`;

  const results = await Promise.allSettled([
    resend.emails.send({
      from: FROM_ADDRESS,
      to: input.customerEmail,
      subject: `Ton appel avec ${input.creatorName} est confirmé`,
      html: renderConfirmationEmail({
        greeting: `Salut ${input.customerName},`,
        body: `Ton appel avec <strong>${input.creatorName}</strong> est confirmé pour le ${formattedSlot}.`,
        callUrl: customerCallUrl,
      }),
    }),
    resend.emails.send({
      from: FROM_ADDRESS,
      to: input.creatorEmail,
      subject: `Nouvelle réservation confirmée avec ${input.customerName}`,
      html: renderConfirmationEmail({
        greeting: `Salut ${input.creatorName},`,
        body: `<strong>${input.customerName}</strong> a réservé un appel avec toi pour le ${formattedSlot}.`,
        callUrl: creatorCallUrl,
      }),
    }),
  ]);

  const recipients = [input.customerEmail, input.creatorEmail];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[email] échec d'envoi à ${recipients[index]}:`, result.reason);
    }
  });
}

function renderConfirmationEmail({
  greeting,
  body,
  callUrl,
}: {
  greeting: string;
  body: string;
  callUrl: string;
}) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <p>${greeting}</p>
      <p>${body}</p>
      <p style="margin: 24px 0;">
        <a href="${callUrl}" style="display:inline-block; padding:10px 20px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">
          Rejoindre l'appel
        </a>
      </p>
      <p style="color:#888; font-size:12px;">Lien direct : ${callUrl}</p>
    </div>
  `;
}
