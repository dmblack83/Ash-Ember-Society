-- Migration: 20260506_moderation_log_table_comment
-- Adds a `comment on table` to moderation_log so the deny-all-by-design
-- RLS posture is visible in Supabase Studio / pgAdmin / pg_dump output,
-- not just in the original migration file's inline comment.
--
-- Phase 3 P3.4 follow-up to the 2026-05-06 security audit. The
-- service-client audit (project_service_client_audit_2026-05-06.md)
-- confirmed moderation_log is intentionally service-role-only — but
-- a future maintainer browsing the database might mistake "RLS enabled,
-- zero policies" for a forgotten policy and try to add user-facing
-- read access. The catalog comment makes the intent explicit.

comment on table moderation_log is
  'Service-role-only audit log of Vision API moderation calls. RLS enabled with NO policies BY DESIGN — clients should never read this. Writes happen via service-role from /api/avatar, /api/upload/cigar-image, /api/upload/image, /api/vision/analyze. Image bytes are NEVER stored; only metadata + safety scores.';
