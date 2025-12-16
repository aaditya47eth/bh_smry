-- ============================================
-- BIDDING FEATURE TABLES
-- For syncing bidding data across all users
-- ============================================

-- Table 1: Bidding Posts (tracked Facebook posts)
CREATE TABLE IF NOT EXISTS bidding_posts (
    id BIGSERIAL PRIMARY KEY,
    post_url TEXT NOT NULL UNIQUE,
    post_number TEXT,
    images TEXT[], -- Array of image URLs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: Bidding Watchers (active watchers)
CREATE TABLE IF NOT EXISTS bidding_watchers (
    id BIGSERIAL PRIMARY KEY,
    post_url TEXT NOT NULL REFERENCES bidding_posts(post_url) ON DELETE CASCADE,
    my_name TEXT NOT NULL,
    interval_sec INTEGER DEFAULT 120,
    is_running BOOLEAN DEFAULT true,
    created_by TEXT, -- Username who started it
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_url, created_by) -- One watcher per post per user
);

-- Table 3: Bidding Bids (all bids tracked)
CREATE TABLE IF NOT EXISTS bidding_bids (
    id BIGSERIAL PRIMARY KEY,
    post_url TEXT NOT NULL REFERENCES bidding_posts(post_url) ON DELETE CASCADE,
    item_number INTEGER NOT NULL CHECK (item_number >= 1 AND item_number <= 50),
    amount INTEGER NOT NULL CHECK (amount >= 10),
    bidder_name TEXT NOT NULL,
    raw_comment TEXT,
    relative_time TEXT, -- Scraped time (e.g., "4m")
    comment_images TEXT[], -- Array of image URLs
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_url, item_number, amount, bidder_name) -- Prevent duplicates
);

-- Table 4: Bidding Cookies (Facebook authentication cookies)
CREATE TABLE IF NOT EXISTS bidding_cookies (
    id BIGSERIAL PRIMARY KEY,
    cookies_json JSONB NOT NULL, -- Store cookies as JSON
    updated_by TEXT, -- Username who updated it
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(id) -- Only one cookie set at a time
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bidding_posts_url ON bidding_posts(post_url);
CREATE INDEX IF NOT EXISTS idx_bidding_watchers_url ON bidding_watchers(post_url);
CREATE INDEX IF NOT EXISTS idx_bidding_watchers_running ON bidding_watchers(is_running);
CREATE INDEX IF NOT EXISTS idx_bidding_bids_post_url ON bidding_bids(post_url);
CREATE INDEX IF NOT EXISTS idx_bidding_bids_item ON bidding_bids(post_url, item_number);
CREATE INDEX IF NOT EXISTS idx_bidding_bids_timestamp ON bidding_bids(timestamp DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE bidding_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidding_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidding_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidding_cookies ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all authenticated users to read/write
-- (You can restrict this later based on access_level if needed)
-- Drop existing policies if they exist (for idempotent script)
DROP POLICY IF EXISTS "Allow all authenticated users to read bidding posts" ON bidding_posts;
DROP POLICY IF EXISTS "Allow all authenticated users to insert bidding posts" ON bidding_posts;
DROP POLICY IF EXISTS "Allow all authenticated users to update bidding posts" ON bidding_posts;
DROP POLICY IF EXISTS "Allow all authenticated users to read bidding watchers" ON bidding_watchers;
DROP POLICY IF EXISTS "Allow all authenticated users to insert bidding watchers" ON bidding_watchers;
DROP POLICY IF EXISTS "Allow all authenticated users to update bidding watchers" ON bidding_watchers;
DROP POLICY IF EXISTS "Allow all authenticated users to delete bidding watchers" ON bidding_watchers;
DROP POLICY IF EXISTS "Allow all authenticated users to read bidding bids" ON bidding_bids;
DROP POLICY IF EXISTS "Allow all authenticated users to insert bidding bids" ON bidding_bids;
DROP POLICY IF EXISTS "Allow all authenticated users to read bidding cookies" ON bidding_cookies;
DROP POLICY IF EXISTS "Allow all authenticated users to insert bidding cookies" ON bidding_cookies;
DROP POLICY IF EXISTS "Allow all authenticated users to update bidding cookies" ON bidding_cookies;

CREATE POLICY "Allow all authenticated users to read bidding posts"
    ON bidding_posts FOR SELECT
    USING (true);

CREATE POLICY "Allow all authenticated users to insert bidding posts"
    ON bidding_posts FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update bidding posts"
    ON bidding_posts FOR UPDATE
    USING (true);

CREATE POLICY "Allow all authenticated users to read bidding watchers"
    ON bidding_watchers FOR SELECT
    USING (true);

CREATE POLICY "Allow all authenticated users to insert bidding watchers"
    ON bidding_watchers FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update bidding watchers"
    ON bidding_watchers FOR UPDATE
    USING (true);

CREATE POLICY "Allow all authenticated users to delete bidding watchers"
    ON bidding_watchers FOR DELETE
    USING (true);

CREATE POLICY "Allow all authenticated users to read bidding bids"
    ON bidding_bids FOR SELECT
    USING (true);

CREATE POLICY "Allow all authenticated users to insert bidding bids"
    ON bidding_bids FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to read bidding cookies"
    ON bidding_cookies FOR SELECT
    USING (true);

CREATE POLICY "Allow all authenticated users to insert bidding cookies"
    ON bidding_cookies FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update bidding cookies"
    ON bidding_cookies FOR UPDATE
    USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at (drop first if exists)
DROP TRIGGER IF EXISTS update_bidding_posts_updated_at ON bidding_posts;
DROP TRIGGER IF EXISTS update_bidding_watchers_updated_at ON bidding_watchers;
DROP TRIGGER IF EXISTS update_bidding_cookies_updated_at ON bidding_cookies;

CREATE TRIGGER update_bidding_posts_updated_at BEFORE UPDATE ON bidding_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bidding_watchers_updated_at BEFORE UPDATE ON bidding_watchers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bidding_cookies_updated_at BEFORE UPDATE ON bidding_cookies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

