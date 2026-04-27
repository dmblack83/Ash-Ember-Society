-- Link a user profile to a partner channel (set manually by admin via SQL)
ALTER TABLE content_channels
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_channels_user_id ON content_channels(user_id);

-- Allow a burn report to reference a partner channel video (optional)
ALTER TABLE smoke_logs
  ADD COLUMN IF NOT EXISTS content_video_id uuid REFERENCES content_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS smoke_logs_content_video_id ON smoke_logs(content_video_id);
