import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Fallback values taken from the existing legacy config (`js/supabase-config.js`).
// This avoids blocking local dev if `.env.local` is missing, while still allowing
// env vars to override for deployments.
const DEFAULT_SUPABASE_URL = "https://tqbeaihrdtkcroiezame.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmVhaWhyZHRrY3JvaWV6YW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDk3ODMsImV4cCI6MjA3NzMyNTc4M30.TCpWEAhq08ivt3NbT7Lvw135qcCshkJH1X58y-T2rmw";

let cached: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;

  // NEXT_PUBLIC_* is safe on the client; this matches the existing vanilla setup
  // that used the Supabase anon key in the browser.
  // Use direct env access so Next can inline it in client bundles.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  cached = createClient(url, anonKey);
  return cached;
}

