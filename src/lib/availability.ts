import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { supabase } from "@/lib/supabase";

const TIMEZONE = "Europe/Paris";
export const SLOT_DURATION_MINUTES = 60;
const BOOKING_WINDOW_DAYS = 30;

export interface WeeklyRule {
  day_of_week: number; // 0 = Sunday .. 6 = Saturday
  start_time: string; // "HH:MM:SS" (Postgres `time`)
  end_time: string;
}

export interface AvailabilityOverride {
  date: string; // "yyyy-MM-dd"
  is_available: boolean;
  start_time: string | null; // "HH:MM:SS", set only when is_available
  end_time: string | null;
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

export async function getAvailabilityOverrides(creatorId: string): Promise<AvailabilityOverride[]> {
  const { data, error } = await supabase
    .from("availability_overrides")
    .select("date, is_available, start_time, end_time")
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
 * Resolves the effective window (if any) for a specific date, applying the
 * "override wins entirely" rule: a date-specific override — whether a
 * custom window or a full block — always takes precedence over the
 * recurring weekly rule, which is only consulted when no override exists.
 */
function resolveWindowForDate(
  dayOfWeek: number,
  dateStr: string,
  rulesByDay: Map<number, WeeklyRule>,
  overridesByDate: Map<string, AvailabilityOverride>,
): { start_time: string; end_time: string } | null {
  const override = overridesByDate.get(dateStr);
  if (override) {
    if (!override.is_available) return null;
    return { start_time: override.start_time!, end_time: override.end_time! };
  }

  const rule = rulesByDay.get(dayOfWeek);
  return rule ? { start_time: rule.start_time, end_time: rule.end_time } : null;
}

/**
 * All bookable slots for the next month, derived live from the creator's
 * weekly rules (plus any date-specific overrides) with already-booked slots
 * removed. Nothing is ever persisted here — editing the schedule later can't
 * corrupt or unbook anything, since bookings live in a completely separate
 * table.
 */
export async function generateAvailableSlots(creatorId: string): Promise<AvailableSlot[]> {
  const [rules, overrides] = await Promise.all([
    getWeeklyRules(creatorId),
    getAvailabilityOverrides(creatorId),
  ]);

  const rulesByDay = new Map<number, WeeklyRule>();
  for (const rule of rules) rulesByDay.set(rule.day_of_week, rule);

  const overridesByDate = new Map<string, AvailabilityOverride>();
  for (const override of overrides) overridesByDate.set(override.date, override);

  if (rulesByDay.size === 0 && overridesByDate.size === 0) return [];

  const now = new Date();
  const candidates: AvailableSlot[] = [];

  for (let dayOffset = 0; dayOffset < BOOKING_WINDOW_DAYS; dayOffset++) {
    const localDay = toZonedTime(now, TIMEZONE);
    localDay.setDate(localDay.getDate() + dayOffset);

    const dateStr = formatDateOnly(localDay);
    const window = resolveWindowForDate(localDay.getDay(), dateStr, rulesByDay, overridesByDate);
    if (!window) continue;

    const startTotalMinutes = timeToMinutes(window.start_time);
    const endTotalMinutes = timeToMinutes(window.end_time);

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
 * creator's declared availability windows (recurring rule or override), on
 * the correct 60-minute grid, and isn't in the past.
 */
export async function isSlotWithinRules(creatorId: string, isoSlotTime: string): Promise<boolean> {
  const slotDate = new Date(isoSlotTime);
  if (Number.isNaN(slotDate.getTime()) || slotDate.getTime() <= Date.now()) {
    return false;
  }

  const zoned = toZonedTime(slotDate, TIMEZONE);
  const dateStr = formatDateOnly(zoned);

  const [rules, overrides] = await Promise.all([
    getWeeklyRules(creatorId),
    getAvailabilityOverrides(creatorId),
  ]);

  const rulesByDay = new Map<number, WeeklyRule>();
  for (const rule of rules) rulesByDay.set(rule.day_of_week, rule);

  const overridesByDate = new Map<string, AvailabilityOverride>();
  for (const override of overrides) overridesByDate.set(override.date, override);

  const window = resolveWindowForDate(zoned.getDay(), dateStr, rulesByDay, overridesByDate);
  if (!window) return false;

  const slotMinutes = zoned.getHours() * 60 + zoned.getMinutes();
  const startTotalMinutes = timeToMinutes(window.start_time);
  const endTotalMinutes = timeToMinutes(window.end_time);

  const isOnGrid = (slotMinutes - startTotalMinutes) % SLOT_DURATION_MINUTES === 0;

  return (
    isOnGrid &&
    slotMinutes >= startTotalMinutes &&
    slotMinutes + SLOT_DURATION_MINUTES <= endTotalMinutes
  );
}
