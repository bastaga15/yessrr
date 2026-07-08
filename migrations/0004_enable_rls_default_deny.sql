-- ============================================================
-- Migration: enable RLS (default-deny, no policies) on all tables
-- Run this once in the Supabase SQL editor against the live database.
--
-- Safe to run any time: the app only ever talks to Supabase through the
-- service-role key (src/lib/supabase.ts), which bypasses RLS entirely.
-- Enabling RLS here changes nothing for the app — it only closes off the
-- anon/public key as a way to read or write data directly.
-- ============================================================

alter table creators enable row level security;
alter table bookings enable row level security;
alter table weekly_availability_rules enable row level security;
alter table availabilities enable row level security; -- legacy, unused table
