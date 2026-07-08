import { Resend } from "resend";
import { generateCallToken } from "@/lib/call-tokens";

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  throw new Error("Missing RESEND_API_KEY environment variable");
}

const resend = new Resend(resendApiKey);

// Server-only (uses a secret API key) — never import this file from a
// "use client" component.

const FROM_ADDRESS = "Yessrr <reservations@yessrr.fr>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export interface BookingEmailContext {
  bookingId: string;
  customerEmail: string;
  customerName: string;
  creatorEmail: string;
  creatorName: string;
  slotTime: string; // ISO timestamp
}

function formatSlot(slotTime: string): string {
  return new Date(slotTime).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

// Uses a signed per-role token rather than a bare ?role= string — otherwise
// the customer's and creator's emails for the same booking would differ
// only by that string, and either party could edit their own link to claim
// the other's role and record a fake join timestamp for them.
function callUrl(bookingId: string, role: "customer" | "creator"): string {
  return `${APP_URL}/call/${bookingId}?token=${generateCallToken(bookingId, role)}`;
}

/** Delivery failures are logged, never thrown — a Resend hiccup must never undo a booking outcome that's already been decided. */
async function sendEmails(sends: { to: string; subject: string; html: string }[]): Promise<void> {
  const results = await Promise.allSettled(
    sends.map((send) => resend.emails.send({ from: FROM_ADDRESS, ...send })),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[email] échec d'envoi à ${sends[index].to}:`, result.reason);
    }
  });
}

/**
 * Emails both parties once a booking is confirmed. Links to our own
 * /call/<bookingId> gate rather than the raw Jitsi URL — that page enforces
 * the join time window and records presence for arbitration, neither of
 * which meet.jit.si does on its own.
 */
export async function sendBookingConfirmationEmails(input: BookingEmailContext): Promise<void> {
  const formattedSlot = formatSlot(input.slotTime);

  await sendEmails([
    {
      to: input.customerEmail,
      subject: `Ton appel avec ${input.creatorName} est confirmé`,
      html: renderEmail({
        greeting: `Salut ${input.customerName},`,
        bodyHtml: `<p>Ton appel avec <strong>${input.creatorName}</strong> est confirmé pour le ${formattedSlot}.</p>`,
        cta: { label: "Rejoindre l'appel", url: callUrl(input.bookingId, "customer") },
      }),
    },
    {
      to: input.creatorEmail,
      subject: `Nouvelle réservation confirmée avec ${input.customerName}`,
      html: renderEmail({
        greeting: `Salut ${input.creatorName},`,
        bodyHtml: `<p><strong>${input.customerName}</strong> a réservé un appel avec toi pour le ${formattedSlot}.</p>`,
        cta: { label: "Rejoindre l'appel", url: callUrl(input.bookingId, "creator") },
      }),
    },
  ]);
}

/** J-1 ("24h") or H-1 ("1h") reminder, sent to both parties. */
export async function sendReminderEmails(
  input: BookingEmailContext,
  timing: "24h" | "1h",
): Promise<void> {
  const formattedSlot = formatSlot(input.slotTime);
  const when = timing === "24h" ? "demain" : "dans moins d'une heure";

  await sendEmails([
    {
      to: input.customerEmail,
      subject: `Rappel : ton appel avec ${input.creatorName} est ${when}`,
      html: renderEmail({
        greeting: `Salut ${input.customerName},`,
        bodyHtml: `<p>Petit rappel : ton appel avec <strong>${input.creatorName}</strong> est prévu ${when}, le ${formattedSlot}.</p>`,
        cta: { label: "Rejoindre l'appel", url: callUrl(input.bookingId, "customer") },
      }),
    },
    {
      to: input.creatorEmail,
      subject: `Rappel : ton appel avec ${input.customerName} est ${when}`,
      html: renderEmail({
        greeting: `Salut ${input.creatorName},`,
        bodyHtml: `<p>Petit rappel : ton appel avec <strong>${input.customerName}</strong> est prévu ${when}, le ${formattedSlot}.</p>`,
        cta: { label: "Rejoindre l'appel", url: callUrl(input.bookingId, "creator") },
      }),
    },
  ]);
}

/** Creator no-show: customer refunded in full, creator notified they missed a paid booking. */
export async function sendNoShowCreatorEmails(input: BookingEmailContext): Promise<void> {
  const formattedSlot = formatSlot(input.slotTime);

  await sendEmails([
    {
      to: input.customerEmail,
      subject: `Tu as été remboursé pour ton appel du ${formattedSlot}`,
      html: renderEmail({
        greeting: `Salut ${input.customerName},`,
        bodyHtml: `<p><strong>${input.creatorName}</strong> ne s'est pas présenté à votre appel du ${formattedSlot}. Conformément à notre protocole, tu as été remboursé intégralement — le remboursement apparaîtra sous quelques jours sur ton moyen de paiement.</p>`,
      }),
    },
    {
      to: input.creatorEmail,
      subject: `Absence à ton appel du ${formattedSlot}`,
      html: renderEmail({
        greeting: `Salut ${input.creatorName},`,
        bodyHtml: `<p>Tu ne t'es pas présenté à l'appel prévu avec <strong>${input.customerName}</strong> le ${formattedSlot}. Le client a été intégralement remboursé, conformément à notre protocole.</p>`,
      }),
    },
  ]);
}

/** Customer no-show: creator paid as normal, customer notified funds weren't refunded. */
export async function sendNoShowClientEmails(input: BookingEmailContext): Promise<void> {
  const formattedSlot = formatSlot(input.slotTime);

  await sendEmails([
    {
      to: input.creatorEmail,
      subject: `Tu es payé pour ton appel du ${formattedSlot}`,
      html: renderEmail({
        greeting: `Salut ${input.creatorName},`,
        bodyHtml: `<p><strong>${input.customerName}</strong> ne s'est pas présenté à votre appel du ${formattedSlot}. Tu étais bien présent — conformément à notre protocole, tu es payé normalement pour cette réservation.</p>`,
      }),
    },
    {
      to: input.customerEmail,
      subject: `Ton appel du ${formattedSlot} n'a pas eu lieu`,
      html: renderEmail({
        greeting: `Salut ${input.customerName},`,
        bodyHtml: `<p>Tu ne t'es pas présenté à l'appel prévu avec <strong>${input.creatorName}</strong> le ${formattedSlot}. Conformément à notre protocole, ce paiement n'est pas remboursé.</p>`,
      }),
    },
  ]);
}

/** Sent to the customer once a booking completes successfully. */
export async function sendReviewRequestEmail(input: BookingEmailContext): Promise<void> {
  await sendEmails([
    {
      to: input.customerEmail,
      subject: `Comment s'est passé ton appel avec ${input.creatorName} ?`,
      html: renderEmail({
        greeting: `Salut ${input.customerName},`,
        bodyHtml: `<p>Ton appel avec <strong>${input.creatorName}</strong> est terminé — on espère que ça s'est bien passé ! Réponds directement à cet email pour nous dire comment ça s'est passé, ton avis nous aide à améliorer Yessrr.</p>`,
      }),
    },
  ]);
}

/**
 * Nudges a creator who has money sitting on the platform balance because
 * they never finished Stripe Connect onboarding — see
 * src/lib/payouts.ts#releasePendingPayouts and /api/cron/stripe-connect-reminders,
 * which throttles how often this actually gets sent per creator.
 */
export async function sendStripeConnectReminderEmail(input: {
  creatorEmail: string;
  creatorName: string;
  managementToken: string;
  pendingAmountCents: number;
  pendingBookingsCount: number;
}): Promise<void> {
  const amount = (input.pendingAmountCents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
  const bookingsLabel =
    input.pendingBookingsCount === 1 ? "1 réservation" : `${input.pendingBookingsCount} réservations`;

  await sendEmails([
    {
      to: input.creatorEmail,
      subject: `${amount} t'attendent sur Yessrr`,
      html: renderEmail({
        greeting: `Salut ${input.creatorName},`,
        bodyHtml: `<p>Tu as ${bookingsLabel} payée${input.pendingBookingsCount > 1 ? "s" : ""} sur Yessrr pour un total de <strong>${amount}</strong>, mais cet argent reste bloqué tant que tu n'as pas terminé la configuration de ton compte Stripe. Ça prend deux minutes.</p>`,
        cta: { label: "Configurer mon compte Stripe", url: `${APP_URL}/manage/${input.managementToken}` },
      }),
    },
  ]);
}

function renderEmail({
  greeting,
  bodyHtml,
  cta,
}: {
  greeting: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
}): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <p style="font-weight: 700; font-size: 18px; color: #6366f1; margin: 0 0 24px;">Yessrr</p>
      <p>${greeting}</p>
      ${bodyHtml}
      ${
        cta
          ? `<p style="margin: 24px 0;">
              <a href="${cta.url}" style="display:inline-block; padding:10px 20px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">
                ${cta.label}
              </a>
            </p>
            <p style="color:#888; font-size:12px;">Lien direct : ${cta.url}</p>`
          : ""
      }
    </div>
  `;
}
