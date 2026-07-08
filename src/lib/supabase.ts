import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
  );
}

// Service-role key bypasses RLS — server-side use only (Route Handlers, Server Components).
// Never import this file from a "use client" component.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    // Next.js patches the global fetch and persists a Data Cache to disk for
    // any request made during Server Component rendering — including ones
    // made by this client. `export const dynamic = "force-dynamic"` on a
    // page is supposed to cover this but has proven unreliable in dev
    // (stale entries survive even full server restarts). Forcing "no-store"
    // here, at the source, is the actual fix: booking status/availability
    // must never be served stale.
    fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }),
  },
});
