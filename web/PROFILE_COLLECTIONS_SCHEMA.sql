-- Profile Collections (Instagram-like "saved" collections)
--
-- Run this in Supabase SQL Editor for your project.
-- These tables let a user create collections and assign the same item to
-- multiple collections.
--
-- Notes:
-- - This assumes your existing tables live in the `public` schema (default in Supabase).
--   The app uses `.from("items")`, so it expects `public.items`.
-- - This project currently uses the Supabase anon key (no auth JWT). If you have
--   RLS enabled, you must add your own policies.

create table if not exists profile_collections (
  id bigserial primary key,
  owner_username text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_collections_owner_name_unique unique (owner_username, name)
);

create index if not exists profile_collections_owner_username_idx
  on profile_collections (owner_username);

-- Create mapping table WITHOUT the FK first (so this script can run even if the `items`
-- table isn't present in the current database/project yet).
create table if not exists profile_collection_items (
  id bigserial primary key,
  collection_id bigint not null references profile_collections(id) on delete cascade,
  item_id bigint not null,
  created_at timestamptz not null default now(),
  constraint profile_collection_items_unique unique (collection_id, item_id)
);

create index if not exists profile_collection_items_collection_id_idx
  on profile_collection_items (collection_id);

create index if not exists profile_collection_items_item_id_idx
  on profile_collection_items (item_id);

-- If `public.items` exists, add the FK constraint (optional but recommended).
do $$
begin
  if to_regclass('public.items') is not null then
    begin
      execute 'alter table profile_collection_items
        add constraint profile_collection_items_item_id_fkey
        foreign key (item_id) references public.items(id) on delete cascade';
    exception
      when duplicate_object then
        null;
    end;
  end if;
end $$;

