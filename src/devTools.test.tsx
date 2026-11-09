import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("agentation", async () => {
  const React = await import("react");
  return { Agentation: () => React.createElement("span", { "data-testid": "agentation-mock" }) };
});

import { mountDevTools } from "./devTools";

describe("mountDevTools", () => {
  afterEach(() => {
    document.getElementById("devtools")?.remove();
  });

  it("adds a container to the body and renders the toolbar into it", async () => {
    mountDevTools();

    const container = document.getElementById("devtools");
    expect(container?.parentElement).toBe(document.body);
    expect(await screen.findByTestId("agentation-mock")).toBeTruthy();
    expect(container?.contains(screen.getByTestId("agentation-mock"))).toBe(true);
  });
});
