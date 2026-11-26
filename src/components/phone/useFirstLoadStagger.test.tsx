import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useFirstLoadStagger } from "./useFirstLoadStagger";

function Probe({ ready }: { ready: boolean }) {
  const stagger = useFirstLoadStagger(ready);
  return (
    <ol data-testid="list" className={stagger.className}>
      {[0, 1, 2].map((index) => (
        <li key={index}>{index}</li>
      ))}
    </ol>
  );
}

afterEach(cleanup);

describe("useFirstLoadStagger", () => {
  it("never applies a stagger class, so lists fade in with the page", () => {
    const { rerender } = render(<Probe ready={false} />);
    expect(screen.getByTestId("list").className).toBe("");
    rerender(<Probe ready />);
    expect(screen.getByTestId("list").className).toBe("");
  });
});
