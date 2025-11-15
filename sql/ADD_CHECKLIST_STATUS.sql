-- ============================================
-- ADD CHECKLIST STATUS COLUMN TO ITEMS TABLE
-- ============================================
-- Run this in Supabase SQL Editor to add rejected status support
-- ============================================

-- Add checklist_status column to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS checklist_status TEXT DEFAULT 'unchecked' CHECK (checklist_status IN ('unchecked', 'checked', 'rejected'));

-- Migrate existing data: set checklist_status based on current checked boolean
UPDATE items 
SET checklist_status = CASE 
    WHEN checked = TRUE THEN 'checked'
    ELSE 'unchecked'
END
WHERE checklist_status IS NULL OR checklist_status = 'unchecked';

-- Create index for faster filtering by status
CREATE INDEX IF NOT EXISTS idx_items_checklist_status ON items(checklist_status);

-- Verify the changes
SELECT 
    COUNT(*) as total_items,
    SUM(CASE WHEN checklist_status = 'unchecked' THEN 1 ELSE 0 END) as unchecked_count,
    SUM(CASE WHEN checklist_status = 'checked' THEN 1 ELSE 0 END) as checked_count,
    SUM(CASE WHEN checklist_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
FROM items;

-- ============================================
-- DONE! Checklist now supports three states:
-- 1. unchecked (default)
-- 2. checked (green checkmark)
-- 3. rejected (red cross)
-- ============================================


