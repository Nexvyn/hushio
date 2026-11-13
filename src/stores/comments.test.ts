import { beforeEach, describe, expect, it, vi } from "vitest";

const comments = vi.hoisted(() => ({ fetchComments: vi.fn() }));

vi.mock("../lib/comments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/comments")>()),
  fetchComments: comments.fetchComments,
}));

import { useComments } from "./comments";

const first = {
  id: "c1",
  author: "Nova",
  avatar: null,
  body: "Great song",
  likes: 3,
  published: "2 days ago",
};

describe("comments store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComments.setState({ videoId: null, comments: [], continuation: null, status: "idle" });
  });

  it("opens with a clean list", () => {
    useComments.getState().open("vid");
    expect(useComments.getState().videoId).toBe("vid");
    expect(useComments.getState().comments).toEqual([]);
  });

  it("loads the comments of the video", async () => {
    comments.fetchComments.mockResolvedValue({ comments: [first], continuation: "tok" });
    useComments.getState().open("vid");
    await useComments.getState().load("vid");
    expect(useComments.getState().comments).toEqual([first]);
    expect(useComments.getState().continuation).toBe("tok");
    expect(useComments.getState().status).toBe("loaded");
  });

  it("keeps the comments it already has when a read fails", async () => {
    comments.fetchComments.mockResolvedValue({ comments: [first], continuation: null });
    useComments.getState().open("vid");
    await useComments.getState().load("vid");
    comments.fetchComments.mockRejectedValue(new Error("offline"));
    await useComments.getState().load("vid");
    expect(useComments.getState().comments).toEqual([first]);
    expect(useComments.getState().status).toBe("failed");
  });

  it("adds the next page without repeating a comment", async () => {
    comments.fetchComments.mockResolvedValueOnce({ comments: [first], continuation: "tok" });
    useComments.getState().open("vid");
    await useComments.getState().load("vid");
    comments.fetchComments.mockResolvedValueOnce({
      comments: [first, { ...first, id: "c2", body: "Same" }],
      continuation: null,
    });
    await useComments.getState().loadMore("vid");
    expect(useComments.getState().comments.map((comment) => comment.id)).toEqual(["c1", "c2"]);
  });

  it("closes the list", () => {
    useComments.getState().open("vid");
    useComments.getState().close();
    expect(useComments.getState().videoId).toBeNull();
  });
});
