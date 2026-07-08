import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SLOT_DURATION_MINUTES } from "@/lib/availability";
import { resolveRoleFromToken } from "@/lib/call-tokens";
import { CallGate } from "./call-gate";

const EARLY_ACCESS_MINUTES = 15;

// Presence and timing must always be evaluated fresh — never cache this page.
export const dynamic = "force-dynamic";

function StatusMessage({ message }: { message: string }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20 blur-3xl" />
      <p className="relative z-10 max-w-sm text-neutral-300">{message}</p>
    </div>
  );
}

export default async function CallPage({
  params,
  searchParams,
}: {
  params: { bookingId: string };
  searchParams: { token?: string };
}) {
  const role = resolveRoleFromToken(params.bookingId, searchParams.token);
  if (!role) {
    notFound();
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, slot_time, video_room_url")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (!booking) {
    notFound();
  }

  const slotTime = new Date(booking.slot_time);
  const windowStart = new Date(slotTime.getTime() - EARLY_ACCESS_MINUTES * 60_000);
  const windowEnd = new Date(slotTime.getTime() + SLOT_DURATION_MINUTES * 60_000);
  const now = new Date();

  const formattedSlot = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(slotTime);

  if (booking.status === "pending") {
    return <StatusMessage message="Cette réservation n'est pas encore confirmée." />;
  }

  if (booking.status !== "confirmed") {
    return <StatusMessage message="Cette session est terminée." />;
  }

  if (now < windowStart) {
    return (
      <StatusMessage
        message={`Ton appel est prévu le ${formattedSlot}. Reviens 15 minutes avant l'heure.`}
      />
    );
  }

  if (now > windowEnd) {
    return <StatusMessage message="Cette session est terminée." />;
  }

  if (!booking.video_room_url) {
    return <StatusMessage message="Le lien de visio n'est pas encore prêt, réessaie dans un instant." />;
  }

  return (
    <CallGate
      bookingId={booking.id}
      token={searchParams.token!}
      videoRoomUrl={booking.video_room_url}
      formattedSlot={formattedSlot}
    />
  );
}
