-- Tracks the last time a creator was emailed to finish Stripe Connect
-- onboarding, so /api/cron/stripe-connect-reminders can throttle re-sends
-- instead of emailing on every cron tick while money sits unpaid.
alter table creators
  add column stripe_connect_reminder_sent_at timestamptz;
