-- ============================================================
-- Migration: track whether J-1 / H-1 reminder emails were sent
-- Run this once in the Supabase SQL editor against the live database.
-- ============================================================

alter table bookings add column if not exists reminder_24h_sent_at timestamptz;
alter table bookings add column if not exists reminder_1h_sent_at timestamptz;
