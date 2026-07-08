import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { supabase } from "@/lib/supabase";

const TIMEZONE = "Europe/Paris";
export const SLOT_DURATION_MINUTES = 60;
const BOOKING_WINDOW_DAYS = 14;

export interface WeeklyRule {
  day_of_week: number; // 0 = Sunday .. 6 = Saturday
  start_time: string; // "HH:MM:SS" (Postgres `time`)
  end_time: string;
}

export interface AvailableSlot {
  date: string; // "2026-07-13", Europe/Paris calendar date
  time: string; // "09:00", Europe/Paris wall-clock time
  iso: string; // real UTC instant, what gets sent to /api/checkout
}

export async function getWeeklyRules(creatorId: string): Promise<WeeklyRule[]> {
  const { data, error } = await supabase
    .from("weekly_availability_rules")
    .select("day_of_week, start_time, end_time")
    .eq("creator_id", creatorId);

  if (error) throw error;
  return data ?? [];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * All bookable slots for the next two weeks, derived live from the
 * creator's weekly rules with already-booked slots removed. Nothing is ever
 * persisted here — editing the rules later can't corrupt or unbook anything,
 * since bookings live in a completely separate table.
 */
export async function generateAvailableSlots(creatorId: string): Promise<AvailableSlot[]> {
  const rules = await getWeeklyRules(creatorId);
  if (rules.length === 0) return [];

  const rulesByDay = new Map<number, WeeklyRule>();
  for (const rule of rules) rulesByDay.set(rule.day_of_week, rule);

  const now = new Date();
  const candidates: AvailableSlot[] = [];

  for (let dayOffset = 0; dayOffset < BOOKING_WINDOW_DAYS; dayOffset++) {
    const localDay = toZonedTime(now, TIMEZONE);
    localDay.setDate(localDay.getDate() + dayOffset);

    const rule = rulesByDay.get(localDay.getDay());
    if (!rule) continue;

    const dateStr = formatDateOnly(localDay);
    const startTotalMinutes = timeToMinutes(rule.start_time);
    const endTotalMinutes = timeToMinutes(rule.end_time);

    for (
      let minutes = startTotalMinutes;
      minutes + SLOT_DURATION_MINUTES <= endTotalMinutes;
      minutes += SLOT_DURATION_MINUTES
    ) {
      const timeStr = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const utcDate = fromZonedTime(`${dateStr}T${timeStr}:00`, TIMEZONE);

      if (utcDate.getTime() <= now.getTime()) continue;

      candidates.push({ date: dateStr, time: timeStr, iso: utcDate.toISOString() });
    }
  }

  if (candidates.length === 0) return [];

  const { data: existingBookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("slot_time")
    .eq("creator_id", creatorId)
    .in("status", ["pending", "confirmed"])
    .gte("slot_time", candidates[0].iso)
    .lte("slot_time", candidates[candidates.length - 1].iso);

  if (bookingsError) throw bookingsError;

  const takenTimestamps = new Set(
    (existingBookings ?? []).map((booking) => new Date(booking.slot_time).getTime()),
  );

  return candidates.filter((slot) => !takenTimestamps.has(new Date(slot.iso).getTime()));
}

/**
 * Server-side defense in depth for /api/checkout: never trust a slot_time
 * sent by the client without checking it actually falls inside one of the
 * creator's declared availability windows, on the correct 60-minute grid,
 * and isn't in the past.
 */
export async function isSlotWithinRules(creatorId: string, isoSlotTime: string): Promise<boolean> {
  const slotDate = new Date(isoSlotTime);
  if (Number.isNaN(slotDate.getTime()) || slotDate.getTime() <= Date.now()) {
    return false;
  }

  const rules = await getWeeklyRules(creatorId);
  const zoned = toZonedTime(slotDate, TIMEZONE);
  const rule = rules.find((r) => r.day_of_week === zoned.getDay());
  if (!rule) return false;

  const slotMinutes = zoned.getHours() * 60 + zoned.getMinutes();
  const startTotalMinutes = timeToMinutes(rule.start_time);
  const endTotalMinutes = timeToMinutes(rule.end_time);

  const isOnGrid = (slotMinutes - startTotalMinutes) % SLOT_DURATION_MINUTES === 0;

  return (
    isOnGrid &&
    slotMinutes >= startTotalMinutes &&
    slotMinutes + SLOT_DURATION_MINUTES <= endTotalMinutes
  );
}
