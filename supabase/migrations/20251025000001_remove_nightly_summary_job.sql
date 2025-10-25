-- Remove the nightly-summary-send cron job and clean up related functions
-- This migration removes the weekly summary generation and email sending functionality

-- 1. Unschedule the nightly-summary-send cron job
SELECT cron.unschedule('nightly-summary-send');

-- 2. Remove the cron job entry from cron_schedule table
DELETE FROM cron_schedule WHERE task_name = 'nightly-summary-send';

-- 3. Drop the trigger function for nightly summary
DROP FUNCTION IF EXISTS trigger_nightly_summary_send();

-- 4. Drop the test function for nightly cron
DROP FUNCTION IF EXISTS test_nightly_cron();

-- 5. Add comment explaining the change
