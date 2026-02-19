import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://tqbeaihrdtkcroiezame.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmVhaWhyZHRrY3JvaWV6YW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDk3ODMsImV4cCI6MjA3NzMyNTc4M30.TCpWEAhq08ivt3NbT7Lvw135qcCshkJH1X58y-T2rmw";

export function getSupabaseServerClient(): SupabaseClient {
  // Using the anon key server-side is fine for read-only routes; for privileged
  // operations you'd typically use a service role key (never expose it to client).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, anonKey);
}

