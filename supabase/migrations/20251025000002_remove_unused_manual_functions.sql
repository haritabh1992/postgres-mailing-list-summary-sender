-- Remove unused functions that are no longer needed
-- These functions were created for manual testing but are not actually used

-- 1. Drop the unused trigger_generate_summary_only function
DROP FUNCTION IF EXISTS public.trigger_generate_summary_only();

-- 2. Remove the unused cron_schedule entry for generate-summary-only
DELETE FROM cron_schedule WHERE task_name = 'generate-summary-only';

-- 3. Add comment explaining the cleanup
COMMENT ON TABLE cron_schedule IS 'Tracks scheduled cron jobs. Cleaned up to remove unused manual functions.';
