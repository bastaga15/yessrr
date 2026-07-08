-- ============================================================
-- Migration: creators.slug (unique booking URL) + creators.hourly_rate_cents
-- Run this once in the Supabase SQL editor against the live database.
-- ============================================================

alter table creators add column if not exists slug text;
alter table creators add column if not exists hourly_rate_cents integer not null default 0;

-- Backfill any pre-existing rows so the NOT NULL / UNIQUE constraints below
-- don't fail on data that predates this migration.
update creators
set slug = lower(regexp_replace(name, '\s+', '-', 'g')) || '-' || substr(id::text, 1, 8)
where slug is null;

alter table creators alter column slug set not null;
alter table creators add constraint creators_slug_key unique (slug);
