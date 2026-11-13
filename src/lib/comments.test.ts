import { describe, expect, it } from "vitest";
import { commentsContinuationToken, parseComments } from "./comments";

const LEGACY = {
  onResponseReceivedEndpoints: [
    {
      reloadContinuationItemsCommand: {
        continuationItems: [
          {
            commentThreadRenderer: {
              comment: {
                commentRenderer: {
                  commentId: "c1",
                  authorText: { runs: [{ text: "Nova" }] },
                  contentText: { runs: [{ text: "Great song" }] },
                  publishedTimeText: { runs: [{ text: "2 days ago" }] },
                  voteCount: { simpleText: "1.2K" },
                  authorThumbnail: { thumbnails: [{ url: "https://img/a.jpg" }] },
                },
              },
            },
          },
        ],
      },
    },
  ],
};

const FRAMEWORK = {
  frameworkUpdates: {
    entityBatchUpdate: {
      mutations: [
        {
          payload: {
            commentEntityPayload: {
              author: { displayName: "Echo", avatarThumbnailUrl: "https://img/e.jpg" },
              properties: {
                commentId: "c2",
                content: { content: "Same here" },
                publishedTime: "1 hour ago",
              },
              toolbar: { likeCountNotliked: "7" },
            },
          },
        },
      ],
    },
  },
};

describe("parseComments", () => {
  it("reads the author, body, likes and time of a comment", () => {
    const page = parseComments(LEGACY);
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]).toMatchObject({
      id: "c1",
      author: "Nova",
      body: "Great song",
      likes: 1200,
      published: "2 days ago",
      avatar: "https://img/a.jpg",
    });
  });

  it("reads the newer comment shape", () => {
    const page = parseComments(FRAMEWORK);
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]).toMatchObject({
      id: "c2",
      author: "Echo",
      body: "Same here",
      likes: 7,
      published: "1 hour ago",
      avatar: "https://img/e.jpg",
    });
  });

  it("leaves out a comment with no author or no text", () => {
    const page = parseComments({
      onResponseReceivedEndpoints: [
        {
          reloadContinuationItemsCommand: {
            continuationItems: [
              {
                commentThreadRenderer: {
                  comment: { commentRenderer: { commentId: "x", authorText: { runs: [] }, contentText: { runs: [] } } },
                },
              },
            ],
          },
        },
      ],
    });
    expect(page.comments).toHaveLength(0);
  });

  it("keeps a comment that comes twice only once", () => {
    const page = parseComments({
      onResponseReceivedEndpoints: [
        { reloadContinuationItemsCommand: { continuationItems: LEGACY.onResponseReceivedEndpoints[0].reloadContinuationItemsCommand.continuationItems } },
        { appendContinuationItemsAction: { continuationItems: LEGACY.onResponseReceivedEndpoints[0].reloadContinuationItemsCommand.continuationItems } },
      ],
    });
    expect(page.comments).toHaveLength(1);
  });

  it("finds the continuation token", () => {
    const token = commentsContinuationToken({
      onResponseReceivedEndpoints: [
        {
          reloadContinuationItemsCommand: {
            continuationItems: [
              {
                continuationItemRenderer: {
                  continuationEndpoint: { continuationCommand: { token: "tok" } },
                },
              },
            ],
          },
        },
      ],
    });
    expect(token).toBe("tok");
  });
});
