import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SkeletonSwap } from "./SkeletonSwap";

describe("SkeletonSwap", () => {
  it("shows the skeleton while loading and the content once loaded", async () => {
    const { rerender } = render(
      <SkeletonSwap loading skeleton={<div role="status" aria-label="Loading thing" />}>
        <p>Loaded content</p>
      </SkeletonSwap>,
    );
    expect(screen.getByRole("status", { name: "Loading thing" })).toBeTruthy();
    expect(screen.queryByText("Loaded content")).toBeNull();

    rerender(
      <SkeletonSwap loading={false} skeleton={<div role="status" aria-label="Loading thing" />}>
        <p>Loaded content</p>
      </SkeletonSwap>,
    );
    expect(screen.getByText("Loaded content")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading thing" })).toBeNull());
  });

  it("renders content straight away when it never loaded", () => {
    render(
      <SkeletonSwap loading={false} skeleton={<div role="status" aria-label="Loading thing" />}>
        <p>Cached content</p>
      </SkeletonSwap>,
    );
    expect(screen.getByText("Cached content")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading thing" })).toBeNull();
  });
});
