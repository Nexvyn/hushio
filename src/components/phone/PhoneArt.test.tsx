import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PhoneArt } from "./PhoneArt";

afterEach(cleanup);

describe("PhoneArt pending state", () => {
  it("keeps a pending image quiet and shows the fallback only when art is absent or failed", () => {
    const pending = render(<PhoneArt src="https://example.test/pending.jpg" />);
    expect(pending.container.querySelector("svg")).toBeNull();
    fireEvent.error(pending.container.querySelector("img")!);
    expect(pending.container.querySelector("svg")).toBeTruthy();
    pending.unmount();

    const missing = render(<PhoneArt src={null} />);
    expect(missing.container.querySelector("svg")).toBeTruthy();
  });
});
