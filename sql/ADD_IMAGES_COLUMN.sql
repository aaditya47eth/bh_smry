-- Add images column to bidding_posts
ALTER TABLE public.bidding_posts 
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::JSONB;
