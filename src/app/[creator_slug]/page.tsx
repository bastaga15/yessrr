import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateAvailableSlots } from "@/lib/availability";
import { BookingExperience, type DaySlots } from "./booking-experience";

// Availability and booked slots change constantly — never let Next.js cache
// the underlying Supabase fetches for this page.
export const dynamic = "force-dynamic";

function formatDayLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function CreatorBookingPage({
  params,
}: {
  params: { creator_slug: string };
}) {
  const { data: creator } = await supabase
    .from("creators")
    .select("id, name, slug")
    .eq("slug", params.creator_slug)
    .maybeSingle();

  if (!creator) {
    notFound();
  }

  const slots = await generateAvailableSlots(creator.id);

  const days: DaySlots[] = [];
  for (const slot of slots) {
    let day = days.find((d) => d.date === slot.date);
    if (!day) {
      day = { date: slot.date, label: formatDayLabel(slot.date), slots: [] };
      days.push(day);
    }
    day.slots.push({ time: slot.time, iso: slot.iso });
  }

  return (
    <BookingExperience creatorSlug={creator.slug} creatorName={creator.name} days={days} />
  );
}
