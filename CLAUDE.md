# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `PROJECT_STATUS.md` for product context, what's built vs. pending, and infra/account state — this file is strictly about the code.

## Commands

- `npm run dev` — start the dev server (auto-falls back to port 3001/3002 if 3000 is busy)
- `npm run build` — production build (also what Vercel runs on every push to `main`)
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck

There is no automated test suite in this project. Verify changes by running the dev server and exercising the flow (curl against API routes, or a browser for pages) — not with a test runner.

## Database migrations

No ORM, no migration tool. `schema.sql` is the fresh-install source of truth; `migrations/*.sql` are the incremental changes already applied, in order, to the live Supabase database. A schema change needs both a new `migrations/NNNN_*.sql` file and the matching edit to `schema.sql`. These have to be run manually in the Supabase SQL editor — there's no way to execute DDL from this environment or from the app itself (only the REST/service-role client, which can't run raw SQL).

## Architecture

**Everything is server-only.** `src/lib/supabase.ts` exports one Supabase client built with the `service_role` key (bypasses RLS) and forces `cache: "no-store"` on every request it makes. Never import it from a `"use client"` component — there is no client-side Supabase usage anywhere in this codebase, by design. RLS is enabled with no policies (default-deny) on every table as defense-in-depth; since the app only ever reaches the DB through this service-role client, RLS is otherwise irrelevant to it.

**No auth system exists.** Creators don't log in. Each creator gets a `management_token` (random string, `creators.management_token`) generated at signup; `/manage/[token]` is the only thing gating availability edits. Treat it like a bearer credential, not a session.

### Booking lifecycle

This is the core flow and spans most of `src/app/api/`:

1. **`/api/creator/onboarding`** — creates a `creators` row. The slug is client-chosen (not server-generated); validated for uniqueness with a pre-check plus a race-safe fallback on the `23505` unique-violation from the insert itself.
2. **`/api/creator/availability`** (used by `/manage/[token]`) — replaces a creator's full set of `weekly_availability_rules` (one row per day-of-week). **Availability is never materialized into concrete slots.** `src/lib/availability.ts#generateAvailableSlots` computes real bookable datetimes live, for a rolling 14-day window in `Europe/Paris`, from the rules minus existing `bookings` in that range. This is why editing a schedule can never corrupt an already-booked slot — bookings live in a separate table that nothing here touches.
3. **`/api/checkout`** — re-validates the requested `slot_time` server-side via `isSlotWithinRules` (never trusts the client's chosen slot), inserts a `pending` booking, creates a Stripe Checkout Session with `unit_amount` = the creator's `hourly_rate_cents`, and stores `booking_id` in the session metadata. Rolls back (deletes) the booking if the Stripe step fails, so a failed checkout can't leave an orphaned row blocking that slot forever.
4. **`/api/webhooks/stripe`** — the only place a booking moves `pending` → `confirmed`. Verifies the Stripe signature against the **raw** request body (`request.text()`, not `.json()` — parsing first breaks the signature check). On `checkout.session.completed`, generates a Jitsi room (`src/lib/jitsi.ts` — just a URL scheme, no API or key needed) and emails both parties (`src/lib/email.ts`) links to `/call/[bookingId]?role=...`, never the raw Jitsi URL.
5. **`/call/[bookingId]`** — gates entry to the call by time window (opens 15min before `slot_time`, closes `SLOT_DURATION_MINUTES` after — exported from `availability.ts` so both places agree on how long a call is). Clicking "Join" calls `/api/bookings/join`, which sets `creator_joined_at`/`customer_joined_at` **once** — first join wins, since a later reconnect must never push the recorded timestamp later than the true arrival (that's exactly what arbitration measures).
6. **Arbitration** (`src/lib/arbitration.ts#arbitrateBooking`) is the single source of truth for the business rules; two thin routes call into it and must stay thin:
   - **`/api/webhooks/arbitration`** — manual/simulated trigger. Accepts explicit join timestamps in the request body, writes them, then calls `arbitrateBooking`. Predates real presence-tracking and is still useful for testing a scenario directly.
   - **`/api/cron/arbitration`** — the real automatic trigger, meant to be hit every few minutes by an external scheduler. Scans `confirmed` bookings whose call window has passed and arbitrates each using whatever presence was actually recorded in step 5.
   - Rules: creator absent or >10min late → refund (resolved via the Checkout Session's `payment_intent` — `stripe_payment_id` stores the *session* id, not the intent id, so the session must be retrieved first) → `no_show_creator`. Creator on time but customer absent or >15min late → `no_show_client` (funds stay captured, no action taken). Both on time → `completed`. Idempotent — bookings already in a terminal status are skipped, so replayed events can't double-refund.

### Known gotchas (read before "fixing" these again)

- **Next.js's fetch Data Cache serves stale Supabase reads**, and this survives even a full `next dev` restart (it's persisted to disk in `.next/cache`). `export const dynamic = "force-dynamic"` on a page is not reliable enough on its own to prevent it — the real fix is the `cache: "no-store"` set on the Supabase client's `fetch` in `src/lib/supabase.ts`. If data looks stale, check that first, not the query logic.
- **`vercel.json` must declare `"framework": "nextjs"`.** The Vercel project was created via `vercel project add` rather than the normal interactive flow, which left the dashboard's Framework Preset as "Other" — without the override, builds fail looking for a `public/` output directory.
- Deploys are git-based: pushing to `main` on `github.com/bastaga15/yessrr` auto-deploys to Vercel production. `vercel --prod` from the CLI is no longer the normal path.

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `ARBITRATION_WEBHOOK_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`. See a working `.env.local` for current local values (never commit it). Production values live in the Vercel project's env vars (`vercel env ls`) — local and production intentionally have *different* `STRIPE_WEBHOOK_SECRET` values, one per Stripe webhook endpoint.
