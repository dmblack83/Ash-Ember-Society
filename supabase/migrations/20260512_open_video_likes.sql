-- Open video likes to all authenticated users.
--
-- The original `member like` policy (in 20260426_content_channels.sql)
-- restricted INSERTs on content_video_likes to users whose
-- membership_tier was 'member' or 'premium'. Free users hit a 403
-- when tapping the like button on Discover > Channels videos.
--
-- Product decision: likes and comments should be open to every
-- authenticated user throughout the app. The tier-gated feature set
-- stays in place for posting in the lounge, shop discounts, events,
-- etc. — not lightweight engagement actions like likes.
--
-- This drops the membership-gated INSERT policy and replaces it with
-- one that only verifies the inserted row matches the caller's
-- identity. The matching DELETE policy ("unlike own") is unchanged
-- because it was already open to any authenticated owner.

DROP POLICY IF EXISTS "member like" ON content_video_likes;

CREATE POLICY "authenticated can like" ON content_video_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
