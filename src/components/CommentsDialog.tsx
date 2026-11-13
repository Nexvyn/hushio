import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import { Cancel01Icon, Chat01Icon, ThumbsUpIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import type { Comment } from "../lib/comments";
import { useComments } from "../stores/comments";

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-wash text-[13px] font-semibold text-ink-2"
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return <img src={src} alt="" loading="lazy" className="size-9 shrink-0 rounded-full object-cover" />;
}

function CommentRow({ comment }: { comment: Comment }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <Avatar src={comment.avatar} name={comment.author} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-ink-1">{comment.author}</span>
          {comment.published && <span className="text-[12px] text-ink-2">{comment.published}</span>}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-1/90">{comment.body}</p>
        {comment.likes > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] tabular-nums text-ink-2">
            <Icon icon={ThumbsUpIcon} />
            {comment.likes}
          </span>
        )}
      </div>
    </li>
  );
}

function Panel({ videoId }: { videoId: string }) {
  const comments = useComments((state) => state.comments);
  const status = useComments((state) => state.status);
  const continuation = useComments((state) => state.continuation);
  const load = useComments((state) => state.load);
  const loadMore = useComments((state) => state.loadMore);
  const close = useComments((state) => state.close);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load(videoId);
  }, [load, videoId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        tabIndex={-1}
        className="glass-strong animate-pop-in relative flex max-h-[min(640px,80vh)] w-[min(520px,calc(100vw-48px))] flex-col rounded-2xl outline-none"
      >
        <header className="flex items-center gap-3 border-b border-separator px-5 py-4">
          <span aria-hidden="true" className="text-ink-2">
            <Icon icon={Chat01Icon} />
          </span>
          <h2 className="flex-1 text-[15px] font-semibold text-ink-1">Comments</h2>
          <button
            type="button"
            aria-label="Close comments"
            onClick={close}
            className="hit-area flex h-8 w-8 items-center justify-center rounded-full text-ink-2 motion-safe:transition-colors hover:bg-hover hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Icon icon={Cancel01Icon} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {status === "loading" && comments.length === 0 && (
            <div role="status" aria-label="Loading comments" className="space-y-4 p-5">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex gap-3">
                  <div className="size-9 shrink-0 rounded-full bg-wash" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-wash" />
                    <div className="h-3 w-full rounded bg-wash" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {status === "failed" && comments.length === 0 && (
            <div className="p-5">
              <ErrorState
                title="Couldn't load the comments"
                message="Check your connection, then try again."
                action={{ label: "Try again", onClick: () => void load(videoId) }}
              />
            </div>
          )}
          {status !== "loading" && comments.length === 0 && status !== "failed" && (
            <EmptyState title="No comments yet" message="Nobody has written anything about this song." />
          )}
          {comments.length > 0 && (
            <ul className="divide-y divide-separator">
              {comments.map((comment) => (
                <CommentRow key={comment.id} comment={comment} />
              ))}
            </ul>
          )}
        </div>

        {continuation && (
          <footer className="border-t border-separator px-5 py-3">
            <Button onClick={() => void loadMore(videoId)} disabled={status === "loading"}>
              Load more
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}

export function CommentsDialog() {
  const videoId = useComments((state) => state.videoId);
  return (
    <AnimatePresence>
      {videoId && <Panel key={videoId} videoId={videoId} />}
    </AnimatePresence>
  );
}
