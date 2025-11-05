-- ============================================
-- URGENT: UPDATE DATABASE FOR NEW REVIEW SYSTEM
-- ============================================
-- Run this IMMEDIATELY in Supabase SQL Editor
-- ============================================

-- Step 1: Drop old constraint
ALTER TABLE user_reviews DROP CONSTRAINT IF EXISTS user_reviews_status_check;

-- Step 2: Update all existing review statuses to new values
UPDATE user_reviews SET status = 'visible' WHERE status IN ('live', 'under_review');
UPDATE user_reviews SET status = 'hidden' WHERE status = 'rejected';

-- Step 3: Add new constraint with correct values
ALTER TABLE user_reviews ADD CONSTRAINT user_reviews_status_check 
CHECK (status IN ('visible', 'hidden'));

-- Step 4: Change default status to 'hidden' for new reviews
ALTER TABLE user_reviews ALTER COLUMN status SET DEFAULT 'hidden';

-- Step 5: Add username index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_reviews_username ON user_reviews(username);

-- Step 6: Verify the update
SELECT 
    id,
    username,
    status,
    created_at
FROM user_reviews
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- DONE! You should see all reviews with status 'visible' or 'hidden'
-- ============================================

