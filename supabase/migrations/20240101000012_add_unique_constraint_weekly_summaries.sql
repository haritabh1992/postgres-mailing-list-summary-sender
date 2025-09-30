-- Add unique constraint to weekly_summaries table for proper upsert functionality
ALTER TABLE weekly_summaries 
ADD CONSTRAINT weekly_summaries_week_dates_unique 
UNIQUE (week_start_date, week_end_date);
