-- Fix the RLS policy for drop_risk_signals table
-- The previous policy used USING (auth.role() = 'authenticated') which doesn't work correctly
-- This migration drops the old policy and creates a new one with the correct syntax

-- Drop the old policy
DROP POLICY IF EXISTS "allow authenticated read drop risk" ON drop_risk_signals;

-- Create the corrected policy using TO authenticated instead of USING clause
CREATE POLICY "allow authenticated read drop risk"
    ON drop_risk_signals
    FOR SELECT
    TO authenticated
    USING (true);
