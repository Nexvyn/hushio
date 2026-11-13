import { getSession, MARKET, withRetry } from "./innertube";
import { asArray, at, collect, isRecord, text } from "./innertube";

export type Comment = {
  id: string;
  author: string;
  avatar: string | null;
  body: string;
  likes: number;
  published: string;
};

export type CommentsPage = {
  comments: Comment[];
  continuation: string | null;
};

function plain(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function avatarOf(node: unknown): string | null {
  const thumbnails = asArray(at(node, "authorThumbnail", "thumbnails"));
  const url = at(thumbnails.at(-1), "url");
  return typeof url === "string" ? url : null;
}

function numberOf(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  const match = /^([\d.,]+)\s*([KMB])?/i.exec(trimmed);
  if (!match) return 0;
  const digits = match[1].replace(/,/g, "");
  const base = Number(digits);
  if (!Number.isFinite(base)) return 0;
  const scale = match[2]?.toUpperCase();
  if (scale === "K") return Math.round(base * 1_000);
  if (scale === "M") return Math.round(base * 1_000_000);
  if (scale === "B") return Math.round(base * 1_000_000_000);
  return base;
}

function legacyComment(node: unknown): Comment | null {
  const thread = at(node, "commentThreadRenderer");
  const source = isRecord(thread) ? thread : node;
  let renderer = at(source, "comment", "commentRenderer");
  if (!isRecord(renderer)) {
    renderer = at(source, "commentViewModel", "commentViewModel");
  }
  if (!isRecord(renderer)) return null;
  const author = text(at(renderer, "authorText")).trim();
  const body = text(at(renderer, "contentText")).trim();
  if (!author || !body) return null;
  return {
    id: plain(at(renderer, "commentId")).trim() || `${author}-${body.slice(0, 24)}`,
    author,
    avatar: avatarOf(renderer),
    body,
    likes: numberOf(plain(at(renderer, "voteCount", "simpleText"))),
    published: text(at(renderer, "publishedTimeText")).trim(),
  };
}

function frameworkComment(payload: unknown): Comment | null {
  const author = plain(at(payload, "author", "displayName")).trim();
  const body = plain(at(payload, "properties", "content", "content")).trim();
  if (!author || !body) return null;
  const avatar = plain(at(payload, "author", "avatarThumbnailUrl")).trim();
  return {
    id: plain(at(payload, "properties", "commentId")).trim() || `${author}-${body.slice(0, 24)}`,
    author,
    avatar: avatar ? avatar : null,
    body,
    likes: numberOf(at(payload, "toolbar", "likeCountNotliked")),
    published: plain(at(payload, "properties", "publishedTime")).trim(),
  };
}

function continuationItems(node: unknown): unknown[] {
  const items = at(node, "continuationItems");
  return Array.isArray(items) ? items : [];
}

export function parseComments(data: unknown): CommentsPage {
  const comments: Comment[] = [];
  const seen = new Set<string>();

  const push = (comment: Comment | null) => {
    if (!comment) return;
    if (seen.has(comment.id)) return;
    seen.add(comment.id);
    comments.push(comment);
  };

  for (const command of collect(data, "reloadContinuationItemsCommand")) {
    for (const entry of continuationItems(command)) {
      push(legacyComment(entry));
    }
  }
  for (const command of collect(data, "appendContinuationItemsAction")) {
    for (const entry of continuationItems(command)) {
      push(legacyComment(entry));
    }
  }
  for (const payload of collect(data, "commentEntityPayload")) {
    push(frameworkComment(payload));
  }

  return { comments, continuation: commentsContinuationToken(data) };
}

export function commentsContinuationToken(data: unknown): string | null {
  const commands = [
    ...collect(data, "reloadContinuationItemsCommand"),
    ...collect(data, "appendContinuationItemsAction"),
  ];
  for (const command of commands) {
    for (const entry of continuationItems(command)) {
      const token = at(
        entry,
        "continuationItemRenderer",
        "continuationEndpoint",
        "continuationCommand",
        "token",
      );
      if (typeof token === "string") return token;
    }
  }
  return null;
}

async function next(videoId?: string, continuation?: string): Promise<unknown> {
  const { innertube } = await getSession(MARKET);
  const response = await withRetry(() =>
    innertube.actions.execute("/next", {
      ...(videoId ? { videoId } : {}),
      ...(continuation ? { continuation } : {}),
      client: "WEB",
    }),
  );
  return response.data;
}

export async function fetchComments(videoId: string, continuation?: string): Promise<CommentsPage> {
  const data = await next(videoId, continuation);
  return parseComments(data);
}
