-- ============================================================
-- Migration: set a DEFAULT on creators.management_token
-- Run this once in the Supabase SQL editor against the live database.
--
-- Bug fix: migration 0003 added this column and backfilled existing rows,
-- but never set a DEFAULT — so every insert since then had to supply its
-- own value, which the onboarding route didn't do. Fixed in application
-- code (src/app/api/creator/onboarding/route.ts now generates one), but the
-- DB should still guarantee this as defense-in-depth for any other insert
-- path.
-- ============================================================

alter table creators
  alter column management_token set default encode(gen_random_bytes(24), 'hex');
