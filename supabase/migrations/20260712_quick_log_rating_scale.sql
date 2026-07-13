-- ------------------------------------------------------------------
-- Quick smoke logs: unify overall_rating onto the 1-100 scale.
--
-- The "Log a Smoke" quick flow stored overall_rating as 1-10 while
-- burn reports store 1-100 in the same column, so mixed-scale
-- averages were nonsense (a 9/10 quick log + 90/100 burn report
-- averaged to 49.5). The quick-log UI now writes 1-100; this
-- migration lifts existing quick-log rows onto the same scale.
--
-- Rows linked to a burn_reports entry are left untouched — those were
-- always recorded on the 1-100 slider, even if rated very low.
--
-- MANUAL APPLY: run in the Supabase SQL editor (same workflow as
-- 20260702_report_number_rpc.sql). Run the preview first.
-- ------------------------------------------------------------------

-- Preview: rows that will change (and any low-rated burn reports that
-- will NOT change, for a sanity check before running the update).
-- SELECT sl.id, sl.smoked_at, sl.overall_rating,
--        (br.smoke_log_id IS NOT NULL) AS is_burn_report
-- FROM smoke_logs sl
-- LEFT JOIN burn_reports br ON br.smoke_log_id = sl.id
-- WHERE sl.overall_rating BETWEEN 1 AND 10
-- ORDER BY is_burn_report, sl.smoked_at;

UPDATE smoke_logs sl
SET overall_rating = sl.overall_rating * 10
WHERE sl.overall_rating BETWEEN 1 AND 10
  AND NOT EXISTS (
    SELECT 1 FROM burn_reports br WHERE br.smoke_log_id = sl.id
  );

-- Verify: no non-burn-report rows should remain at <= 10, and no row
-- anywhere should exceed 100.
-- SELECT
--   count(*) FILTER (WHERE overall_rating BETWEEN 1 AND 10
--     AND NOT EXISTS (SELECT 1 FROM burn_reports br WHERE br.smoke_log_id = smoke_logs.id))
--     AS remaining_ten_scale_quick_logs,   -- expect 0
--   count(*) FILTER (WHERE overall_rating > 100) AS over_100,  -- expect 0
--   min(overall_rating) AS min_rating,
--   max(overall_rating) AS max_rating
-- FROM smoke_logs
-- WHERE overall_rating IS NOT NULL;
