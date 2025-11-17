-- ============================================
-- DATABASE SETUP FOR NUMBER LOGIN
-- ============================================
-- Run this in Supabase SQL Editor before deployment
-- ============================================

-- Step 1: Update existing users to ensure username is set
UPDATE users 
SET username = COALESCE(username, number)
WHERE username IS NULL OR username = '';

-- Step 2: Add index for faster number lookups
CREATE INDEX IF NOT EXISTS idx_users_number ON users(number);

-- Step 3: Add checked column to items table for checklist feature
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS checked BOOLEAN DEFAULT FALSE;

-- Step 4: Add locked column to lots table for lock/unlock feature
ALTER TABLE lots 
ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

-- Step 5: Add image_url column to items table if not exists
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Step 6: Create user reviews table for review images
CREATE TABLE IF NOT EXISTS user_reviews (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    image_url TEXT NOT NULL,
    status TEXT DEFAULT 'hidden' CHECK (status IN ('visible', 'hidden')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_reviews_status ON user_reviews(status);
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_id ON user_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_username ON user_reviews(username);

-- Update existing reviews to new status values (if table already exists)
-- Change 'live' to 'visible', 'under_review' to 'visible', 'rejected' to 'hidden'
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_reviews') THEN
        -- Drop old constraint if exists
        ALTER TABLE user_reviews DROP CONSTRAINT IF EXISTS user_reviews_status_check;
        
        -- Update old status values
        UPDATE user_reviews SET status = 'visible' WHERE status IN ('live', 'under_review');
        UPDATE user_reviews SET status = 'hidden' WHERE status = 'rejected';
        
        -- Add new constraint
        ALTER TABLE user_reviews ADD CONSTRAINT user_reviews_status_check CHECK (status IN ('visible', 'hidden'));
    END IF;
END $$;

-- Step 7: Verify the setup
SELECT 
    number as phone_number,
    username as display_name,
    access_level,
    CASE 
        WHEN password IS NULL OR password = '' THEN '⚠️ NOT SET' 
        ELSE '✓ SET' 
    END as password_status
FROM users
ORDER BY access_level, username;

-- ============================================
-- DONE! Database is ready for deployment
-- ============================================

