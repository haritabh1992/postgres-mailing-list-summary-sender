-- Remove all unused SQL functions
-- This migration drops 18 functions that are not referenced in any active codepath
-- All functions have been verified to have no usage in:
-- - Active cron jobs
-- - Database triggers
-- - TypeScript/JavaScript code (frontend and edge functions)
-- - Other SQL functions

-- ============================================================================
-- Test Functions (4 functions)
-- ============================================================================
-- These test functions were created for manual testing but are not used
-- in any automated way or called from application code

DROP FUNCTION IF EXISTS public.test_hourly_cron();
DROP FUNCTION IF EXISTS public.test_cron_trigger();
DROP FUNCTION IF EXISTS public.test_http_cron_call();
DROP FUNCTION IF EXISTS public.test_full_pipeline_cron();

-- ============================================================================
-- Config/Show Functions (5 functions)
-- ============================================================================
-- These functions return configuration or schema information but are never
-- called from application code or used in any automated processes

DROP FUNCTION IF EXISTS public.show_split_cron_config();
DROP FUNCTION IF EXISTS public.show_weekly_cron_config();
DROP FUNCTION IF EXISTS public.show_secure_config();
DROP FUNCTION IF EXISTS public.show_simplified_schema();
DROP FUNCTION IF EXISTS public.show_webhook_config();

-- ============================================================================
-- Unused Utility Functions (8 functions)
-- ============================================================================
-- These utility functions were created for various purposes but are never
-- actually called from any part of the application

-- Cron and pipeline status functions
DROP FUNCTION IF EXISTS public.get_cron_status();
DROP FUNCTION IF EXISTS public.get_pipeline_history(integer);

-- Data retrieval functions (never called)
DROP FUNCTION IF EXISTS public.get_current_week_threads();
DROP FUNCTION IF EXISTS public.get_subscription_history_stats();
DROP FUNCTION IF EXISTS public.get_weekly_stats(DATE);
DROP FUNCTION IF EXISTS public.get_top_discussions(DATE, INTEGER);

-- Configuration functions (never called)
DROP FUNCTION IF EXISTS public.update_webhook_config(text, text);
DROP FUNCTION IF EXISTS public.set_cron_config(text, text);

-- ============================================================================
-- Obsolete Pipeline Functions (1 function)
-- ============================================================================
-- This function was part of the old full pipeline approach which was replaced
-- by split cron jobs, which were later replaced by separate individual crons

DROP FUNCTION IF EXISTS public.trigger_full_pipeline();

-- ============================================================================
-- Summary
-- ============================================================================
-- Total functions removed: 18
-- - Test functions: 4
-- - Config/show functions: 5
-- - Utility functions: 8
-- - Obsolete pipeline functions: 1
--
-- All functions have been verified to have no active references in the codebase.

