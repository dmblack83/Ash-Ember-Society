import { describe, it, expect } from "vitest";
import {
  decideCommentNotifications,
  truncateComment,
  type CommentNotifyContext,
} from "../lounge/comment-notify";

const base: CommentNotifyContext = {
  postId:         "post-1",
  commenterId:    "commenter",
  commenterName:  "Mike D.",
  content:        "That draw sounds perfect. What was the pairing?",
  postAuthorId:   "author",
  parentAuthorId: null,
};

describe("decideCommentNotifications", () => {
  it("top-level comment notifies the post author", () => {
    const out = decideCommentNotifications(base);
    expect(out).toHaveLength(1);
    expect(out[0].recipientId).toBe("author");
    expect(out[0].category).toBe("lounge_comment");
    expect(out[0].payload.title).toBe("Mike D. commented on your post");
    expect(out[0].payload.body).toBe('"That draw sounds perfect. What was the pairing?"');
    expect(out[0].payload.url).toBe("/lounge/post-1");
    expect(out[0].payload.tag).toBe("lounge-post-post-1");
  });

  it("never notifies the commenter about their own comment", () => {
    expect(
      decideCommentNotifications({ ...base, postAuthorId: "commenter" }),
    ).toEqual([]);
  });

  it("reply notifies the parent comment author", () => {
    const out = decideCommentNotifications({
      ...base,
      postAuthorId:   "commenter", // replying on their own post
      parentAuthorId: "parent",
    });
    expect(out).toHaveLength(1);
    expect(out[0].recipientId).toBe("parent");
    expect(out[0].category).toBe("lounge_reply");
    expect(out[0].payload.title).toBe("Mike D. replied to your comment");
  });

  it("reply on a third party's post notifies parent author AND post author", () => {
    const out = decideCommentNotifications({ ...base, parentAuthorId: "parent" });
    expect(out).toHaveLength(2);
    const reply   = out.find((n) => n.category === "lounge_reply");
    const comment = out.find((n) => n.category === "lounge_comment");
    expect(reply?.recipientId).toBe("parent");
    expect(comment?.recipientId).toBe("author");
  });

  it("reply beats comment: parent author who is also the post author gets ONE notification", () => {
    const out = decideCommentNotifications({ ...base, parentAuthorId: "author" });
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("lounge_reply");
    expect(out[0].recipientId).toBe("author");
  });

  it("replying to your own comment does not notify yourself", () => {
    const out = decideCommentNotifications({ ...base, parentAuthorId: "commenter" });
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("lounge_comment");
    expect(out[0].recipientId).toBe("author");
  });

  it("missing display name falls back to 'A member'", () => {
    const out = decideCommentNotifications({ ...base, commenterName: null });
    expect(out[0].payload.title).toBe("A member commented on your post");
  });

  it("missing post author (deleted account) produces no notification", () => {
    expect(
      decideCommentNotifications({ ...base, postAuthorId: null }),
    ).toEqual([]);
  });
});

describe("truncateComment", () => {
  it("keeps short comments intact", () => {
    expect(truncateComment("Nice smoke.")).toBe("Nice smoke.");
  });

  it("truncates long comments to 100 chars with an ellipsis", () => {
    const long = "a".repeat(150);
    const out = truncateComment(long);
    expect(out).toHaveLength(100);
    expect(out.endsWith("…")).toBe(true);
  });

  it("collapses newlines so the notification body is one line", () => {
    expect(truncateComment("line one\n\nline two")).toBe("line one line two");
  });
});
