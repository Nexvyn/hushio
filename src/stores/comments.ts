import { create } from "zustand";
import { fetchComments, type Comment } from "../lib/comments";

export type CommentsStatus = "idle" | "loading" | "loaded" | "failed";

type CommentsState = {
  videoId: string | null;
  comments: Comment[];
  continuation: string | null;
  status: CommentsStatus;
  open: (videoId: string) => void;
  close: () => void;
  load: (videoId: string) => Promise<void>;
  loadMore: (videoId: string) => Promise<void>;
};

export const useComments = create<CommentsState>()((set, get) => ({
  videoId: null,
  comments: [],
  continuation: null,
  status: "idle",

  open: (videoId) => set({ videoId, comments: [], continuation: null, status: "idle" }),

  close: () => set({ videoId: null, comments: [], continuation: null, status: "idle" }),

  load: async (videoId) => {
    set({ status: "loading" });
    try {
      const page = await fetchComments(videoId);
      set({ comments: page.comments, continuation: page.continuation, status: "loaded" });
    } catch {
      set({ status: "failed" });
    }
  },

  loadMore: async (videoId) => {
    const continuation = get().continuation;
    if (!continuation) return;
    set({ status: "loading" });
    try {
      const page = await fetchComments(videoId, continuation);
      const seen = new Set(get().comments.map((comment) => comment.id));
      const added = page.comments.filter((comment) => !seen.has(comment.id));
      set({
        comments: [...get().comments, ...added],
        continuation: page.continuation,
        status: "loaded",
      });
    } catch {
      set({ status: "failed" });
    }
  },
}));
