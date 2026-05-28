/*
 * Client-side fetcher for the Home notifications card.
 *
 * Calls the get_notification_summary() RPC, which is security-invoker
 * and scoped by auth.uid() — the browser client carries the user's
 * session, so RLS on forum_posts / forum_comments still applies.
 *
 * One row per thread with activity from others (capped at 10 server-
 * side, newest-active first). Rows are retained regardless of read
 * state: `unseen_count > 0` means unread (new comments since the user
 * last viewed the thread); `total_count` is lifetime activity shown
 * once the row is read.
 */

import { createClient } from "@/utils/supabase/client";

export interface NotificationSummaryRow {
  post_id:      string;
  title:        string;
  unseen_count: number;             // bigint from PG; counts are tiny
  total_count:  number;             // all comments from others in window
  kind:         "authored" | "participated";
  latest_at:    string;
}

export async function fetchNotificationSummary(): Promise<NotificationSummaryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_notification_summary");
  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationSummaryRow[];
}
