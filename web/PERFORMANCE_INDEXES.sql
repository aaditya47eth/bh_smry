-- Performance indexes for frequently queried paths in Next.js APIs.
-- Run once in Supabase SQL editor (safe: IF NOT EXISTS).

-- Lot page / checklist lookups.
create index if not exists idx_items_lot_id on public.items(lot_id);
create index if not exists idx_items_lot_id_created_at on public.items(lot_id, created_at);
create index if not exists idx_items_lot_id_cancelled on public.items(lot_id, cancelled);

-- Profile/person page lookups by collector.
create index if not exists idx_items_username on public.items(username);
create index if not exists idx_items_username_cancelled on public.items(username, cancelled);

-- Session validation in server auth middleware.
create index if not exists idx_auth_sessions_token_hash_not_revoked
  on public.auth_sessions(token_hash)
  where revoked = false;
