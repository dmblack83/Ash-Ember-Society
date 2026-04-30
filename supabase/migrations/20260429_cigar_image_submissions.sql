-- Cigar Image Submissions
-- Users submit photos for approval; admins approve/reject from /admin.

/* ── is_admin flag on profiles ──────────────────────────────────── */

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

/* ── Pending storage bucket ─────────────────────────────────────── */
-- Private bucket — only service role reads/writes.
-- Signed URLs are generated server-side for admin previews.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cigar-photos-pending',
  'cigar-photos-pending',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Only service role may read/write (no user-facing RLS policies needed)

/* ── cigar_image_submissions table ─────────────────────────────── */

CREATE TABLE IF NOT EXISTS cigar_image_submissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cigar_id     uuid        NOT NULL REFERENCES cigar_catalog(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  storage_path text        NOT NULL,   -- path within cigar-photos-pending bucket
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid        REFERENCES profiles(id)
);

-- One pending submission per cigar at a time
CREATE UNIQUE INDEX IF NOT EXISTS cigar_image_submissions_one_pending
  ON cigar_image_submissions (cigar_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS cigar_image_submissions_user_idx
  ON cigar_image_submissions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cigar_image_submissions_status_idx
  ON cigar_image_submissions (status, created_at DESC);

ALTER TABLE cigar_image_submissions ENABLE ROW LEVEL SECURITY;

-- Users can see their own submissions
CREATE POLICY "cigar_image_submissions_select_own"
  ON cigar_image_submissions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own (unique index enforces one pending per cigar)
CREATE POLICY "cigar_image_submissions_insert_own"
  ON cigar_image_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
