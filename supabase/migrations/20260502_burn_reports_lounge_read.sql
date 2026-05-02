-- Migration: 20260502_burn_reports_lounge_read
-- The original burn_reports policies (20260502_burn_reports_table.sql)
-- only allow a row's owner to SELECT it, which means Lounge viewers
-- can't see the Thirds section on a burn report someone else has
-- shared via a forum post. The post itself is already visible to any
-- authenticated user, so the attached thirds metadata should be too.
--
-- This adds a second SELECT policy: any authenticated user may read a
-- burn_reports row whose smoke_log_id is referenced by some forum_post.
-- PostgreSQL evaluates SELECT policies as an OR — owners still see
-- their own private (un-shared) burn_reports under the original policy.

create policy "lounge readers can read attached burn_reports"
  on burn_reports for select to authenticated
  using (
    exists (
      select 1 from forum_posts
      where forum_posts.smoke_log_id = burn_reports.smoke_log_id
    )
  );
