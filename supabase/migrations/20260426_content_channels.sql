-- Partner YouTube channels
CREATE TABLE IF NOT EXISTS content_channels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_channel_id  text UNIQUE NOT NULL,
  handle              text NOT NULL,
  name                text NOT NULL,
  description         text,
  thumbnail_url       text,
  subscriber_count    bigint,
  uploads_playlist_id text NOT NULL,
  custom_url          text,
  last_synced_at      timestamptz,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- Latest 5 videos per channel (retired videos stay for data integrity)
CREATE TABLE IF NOT EXISTS content_videos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id       uuid NOT NULL REFERENCES content_channels(id) ON DELETE CASCADE,
  youtube_video_id text UNIQUE NOT NULL,
  title            text NOT NULL,
  description      text,
  thumbnail_url    text,
  published_at     timestamptz,
  view_count       bigint DEFAULT 0,
  duration_seconds int,
  position         smallint,   -- 1-5 when active, NULL when retired
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- In-app likes on videos (member/premium only)
CREATE TABLE IF NOT EXISTS content_video_likes (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id   uuid NOT NULL REFERENCES content_videos(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

-- In-app comments on videos (all authenticated users)
CREATE TABLE IF NOT EXISTS content_video_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id   uuid NOT NULL REFERENCES content_videos(id) ON DELETE CASCADE,
  content    text NOT NULL CHECK (length(content) >= 1 AND length(content) <= 500),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE content_channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_videos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_video_likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_video_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read active channels"  ON content_channels      FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "read videos"           ON content_videos        FOR SELECT TO authenticated USING (true);
CREATE POLICY "read likes"            ON content_video_likes   FOR SELECT TO authenticated USING (true);
CREATE POLICY "read comments"         ON content_video_comments FOR SELECT TO authenticated USING (true);

-- Likes: member/premium only
CREATE POLICY "member like"  ON content_video_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND membership_tier IN ('member','premium')
  ));
CREATE POLICY "unlike own"   ON content_video_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Comments: ALL authenticated users can post
CREATE POLICY "authenticated can comment" ON content_video_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "edit own comment"   ON content_video_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "delete own comment" ON content_video_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Service role bypass for sync route
CREATE POLICY "service channels" ON content_channels      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service videos"   ON content_videos        FOR ALL TO service_role USING (true) WITH CHECK (true);
