-- Fix RLS policy for drop_risk_signals to allow service role to insert data

-- Allow service role to insert drop risk signals (for background scanner)
CREATE POLICY "allow service role insert drop risk"
    ON drop_risk_signals
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role' OR auth.jwt() IS NULL);

-- Also allow service role to read (for troubleshooting)
CREATE POLICY "allow service role read drop risk"
    ON drop_risk_signals
    FOR SELECT
    USING (auth.role() = 'service_role' OR auth.jwt() IS NULL);
