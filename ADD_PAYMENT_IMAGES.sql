-- ============================================
-- ADD IMAGE SUPPORT TO PAYMENT HISTORY
-- ============================================
-- Run this in Supabase SQL Editor to add image support
-- ============================================

-- Add image_urls column to store multiple payment screenshot URLs
ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- Add batch_id to group payments made together
ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS batch_id UUID DEFAULT gen_random_uuid();

-- Add index for batch_id for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_history_batch_id ON payment_history(batch_id);

-- Verify the changes
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'payment_history'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Payment history now supports images
-- ============================================

