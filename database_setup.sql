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

-- Step 3: Verify the setup
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
