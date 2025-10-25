-- Add cron job to generate weekly summary every Friday at 8am UTC
-- This will call trigger_generate_summary_for_date() which generates summaries for the past week

-- Schedule the function to run every Friday at 5am UTC
-- Format: minute hour day month day_of_week (cron format)
-- 0 5 * * 5 means: at minute 0, hour 5, every day of month, every month, on Friday (5)
SELECT cron.schedule(
  'generate-weekly-summary-friday',
  '0 5 * * 5',  -- Every Friday at 5:00 AM UTC
  'SELECT trigger_generate_summary_for_date(NOW()::DATE);'
);

-- Add comment explaining the schedule
COMMENT ON FUNCTION trigger_generate_summary_for_date(DATE) IS 
  'Generates weekly summary for posts. Called by cron job every Friday at 5am UTC.';
