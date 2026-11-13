import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("agentation", async () => {
  const React = await import("react");
  return { Agentation: () => React.createElement("span", { "data-testid": "agentation-mock" }) };
});

vi.mock("mesurer", async () => {
  const React = await import("react");
  return { Mesurer: () => React.createElement("span", { "data-testid": "mesurer-mock" }) };
});

import { mountDevTools } from "./devTools";

describe("mountDevTools", () => {
  afterEach(() => {
    document.getElementById("devtools")?.remove();
  });

  it("adds a container to the body and renders the toolbar and measurer into it", async () => {
    mountDevTools();

    const container = document.getElementById("devtools");
    expect(container?.parentElement).toBe(document.body);
    expect(container?.style.position).toBe("relative");
    expect(container?.style.zIndex).toBe("2147483000");
    expect(await screen.findByTestId("agentation-mock")).toBeTruthy();
    expect(await screen.findByTestId("mesurer-mock")).toBeTruthy();
    expect(container?.contains(screen.getByTestId("agentation-mock"))).toBe(true);
    expect(container?.contains(screen.getByTestId("mesurer-mock"))).toBe(true);
  });
});
