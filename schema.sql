-- ============================================================
-- Yessrr / WeeAllo — schéma initial (PostgreSQL / Supabase)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- creators
-- ------------------------------------------------------------
create table creators (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text not null unique,
  stripe_connect_id text unique,
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------
-- availabilities
-- ------------------------------------------------------------
create table availabilities (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  slot_time  timestamptz not null,
  is_booked  boolean not null default false,
  created_at timestamptz not null default now(),

  -- un créneau donné ne peut exister qu'une fois par créateur
  unique (creator_id, slot_time)
);

-- accélère la recherche des créneaux libres d'un créateur
create index idx_availabilities_free_slots
  on availabilities (creator_id, slot_time)
  where is_booked = false;

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
  status            text not null default 'pending'
                      check (status in (
                        'pending',
                        'confirmed',
                        'no_show_client',
                        'no_show_creator',
                        'completed'
                      )),
  stripe_payment_id   text,
  creator_joined_at   timestamptz,
  customer_joined_at  timestamptz,
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
