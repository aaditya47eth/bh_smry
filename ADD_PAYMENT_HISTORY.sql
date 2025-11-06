-- ============================================
-- ADD PAYMENT HISTORY TABLE
-- ============================================
-- Run this in Supabase SQL Editor to create payment history tracking
-- ============================================

-- Create payment_history table
CREATE TABLE IF NOT EXISTS payment_history (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    lot_id BIGINT REFERENCES lots(id) ON DELETE CASCADE,
    lot_name TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT NOT NULL -- Admin username who created this entry
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_username ON payment_history(username);
CREATE INDEX IF NOT EXISTS idx_payment_history_lot_id ON payment_history(lot_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_date ON payment_history(payment_date);

-- Verify the table
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'payment_history'
ORDER BY ordinal_position;

-- ============================================
-- DONE! Payment history table is ready
-- ============================================

