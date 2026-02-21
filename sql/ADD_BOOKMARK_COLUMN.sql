ALTER TABLE public.bidding_watchers ADD COLUMN IF NOT EXISTS is_bookmarked BOOLEAN DEFAULT FALSE;
