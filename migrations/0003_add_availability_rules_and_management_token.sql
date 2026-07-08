-- ============================================================
-- Migration: weekly availability rules + creator management token
-- Run this once in the Supabase SQL editor against the live database.
-- ============================================================

-- Secret link (no creator login system exists yet) used to access
-- /manage/<token> and edit one's own availability.
alter table creators add column if not exists management_token text;
update creators
set management_token = encode(gen_random_bytes(24), 'hex')
where management_token is null;
alter table creators alter column management_token set not null;
alter table creators add constraint creators_management_token_key unique (management_token);

-- One recurring weekly window per day (e.g. "Monday 09:00-18:00"). Actual
-- bookable slots are computed live from these rules minus existing bookings —
-- nothing here is ever touched by the booking flow, so editing your schedule
-- can never affect an already-booked slot.
create table if not exists weekly_availability_rules (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday .. 6 = Saturday
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),

  check (end_time > start_time),
  unique (creator_id, day_of_week)
);
