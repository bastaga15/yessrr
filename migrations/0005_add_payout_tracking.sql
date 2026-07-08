-- ============================================================
-- Migration: track charged amount + payout transfer per booking
-- Run this once in the Supabase SQL editor against the live database.
--
-- Needed for deferred Stripe Connect onboarding: a booking can be charged
-- (and arbitrated) before the creator has connected a payout account. The
-- charged amount is captured at checkout time (independent of the creator's
-- current hourly_rate_cents, which could change later); stripe_transfer_id
-- stays null until the creator's 90% share has actually been transferred.
-- ============================================================

alter table bookings add column if not exists amount_cents integer;
alter table bookings add column if not exists stripe_transfer_id text;
