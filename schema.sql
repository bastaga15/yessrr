-- ============================================================
-- Yessrr / WeeAllo — schéma initial (PostgreSQL / Supabase)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- creators
-- ------------------------------------------------------------
create table creators (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  email              text not null unique,
  slug               text not null unique,
  hourly_rate_cents  integer not null default 0,
  stripe_connect_id  text unique,
  -- last time we emailed this creator to finish Stripe Connect onboarding
  -- because money was sitting unpaid on the platform balance for them
  stripe_connect_reminder_sent_at timestamptz,
  -- secret link (no creator login system yet) used to access /manage/<token>
  management_token   text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at         timestamptz not null default now()
);

-- ------------------------------------------------------------
-- weekly_availability_rules
-- ------------------------------------------------------------
-- One recurring weekly window per day (e.g. "Monday 09:00-18:00"). Bookable
-- slots are computed live from these rules minus existing bookings — nothing
-- here is ever touched by the booking flow, so editing your schedule can
-- never affect an already-booked slot. Supersedes the old `availabilities`
-- table, which this fresh-install script no longer creates (still present
-- and unused on databases created before this migration).
create table weekly_availability_rules (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday .. 6 = Saturday
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),

  check (end_time > start_time),
  unique (creator_id, day_of_week)
);

-- ------------------------------------------------------------
-- availability_overrides
-- ------------------------------------------------------------
-- Sits on top of weekly_availability_rules: for a given date, an override
-- (if one exists) takes precedence entirely — either a custom window
-- (is_available = true) or blocking the day outright (is_available = false),
-- regardless of what the recurring rule says. No override for a date = fall
-- back to the recurring rule.
create table availability_overrides (
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

-- ------------------------------------------------------------
-- bookings
-- ------------------------------------------------------------
create table bookings (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references creators(id) on delete restrict,
  customer_email    text not null,
  customer_name     text not null,
  slot_time         timestamptz not null,
  video_room_id     text,
  video_room_url    text,
  status            text not null default 'pending'
                      check (status in (
                        'pending',
                        'confirmed',
                        'no_show_client',
                        'no_show_creator',
                        'completed'
                      )),
  stripe_payment_id   text,
  amount_cents        integer, -- charged amount, captured at checkout time (independent of hourly_rate_cents, which can change later)
  stripe_transfer_id  text, -- null until the creator's 90% share has been transferred (see src/lib/payouts.ts)
  creator_joined_at   timestamptz,
  customer_joined_at  timestamptz,
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,
  created_at          timestamptz not null default now(),

  -- empêche le double-booking d'un même créneau chez un créateur
  unique (creator_id, slot_time)
);

create index idx_bookings_creator_id on bookings (creator_id);
create index idx_bookings_status on bookings (status);

-- un paiement Stripe donné ne doit être rattaché qu'à une seule réservation
-- (index partiel : plusieurs bookings peuvent rester à null tant qu'ils ne sont pas payés)
create unique index idx_bookings_stripe_payment_id
  on bookings (stripe_payment_id)
  where stripe_payment_id is not null;
