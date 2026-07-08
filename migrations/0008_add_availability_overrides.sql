-- ============================================================
-- Migration: date-specific availability overrides
-- Run this once in the Supabase SQL editor against the live database.
--
-- Sits on top of weekly_availability_rules: for a given date, an override
-- (if one exists) takes precedence over the recurring rule entirely — either
-- replacing it with a custom window (is_available = true) or blocking the
-- day outright (is_available = false), regardless of what the recurring
-- rule would otherwise say. No override for a date = fall back to the
-- recurring rule as before. Like the recurring rules, this only affects
-- slot *generation* — existing bookings are never touched.
-- ============================================================

create table if not exists availability_overrides (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references creators(id) on delete cascade,
  date         date not null,
  is_available boolean not null,
  start_time   time,
  end_time     time,
  created_at   timestamptz not null default now(),

  check (
    (is_available = true and start_time is not null and end_time is not null and end_time > start_time)
    or
    (is_available = false and start_time is null and end_time is null)
  ),
  unique (creator_id, date)
);
