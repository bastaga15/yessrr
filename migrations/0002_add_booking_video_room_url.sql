-- ============================================================
-- Migration: bookings.video_room_url (Daily.co join link)
-- Run this once in the Supabase SQL editor against the live database.
-- ============================================================

-- video_room_id already stores the Daily.co room name (internal identifier);
-- video_room_url stores the actual join link shown to the client and creator.
alter table bookings add column if not exists video_room_url text;
