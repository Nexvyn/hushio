import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { YouTubeMusicPrompt } from "./YouTubeMusicPrompt";

const code = { userCode: "ABCD-EFGH", verificationUrl: "https://www.google.com/device", expiresAt: 0 };

afterEach(cleanup);

describe("YouTubeMusicPrompt", () => {
  it("shows the user code with the device page and opens or cancels from the buttons", async () => {
    const onOpen = vi.fn();
    const onCancel = vi.fn();
    render(<YouTubeMusicPrompt code={code} busy={false} error={null} onOpen={onOpen} onCancel={onCancel} />);

    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
    expect(screen.getByText("Go to google.com/device and enter this code.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Open google.com/device" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows the connecting line while the code is requested", () => {
    render(<YouTubeMusicPrompt code={null} busy={true} error={null} onOpen={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the reason from a failed connection", () => {
    render(
      <YouTubeMusicPrompt code={null} busy={false} error="The code expired. Get a new one." onOpen={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("alert").textContent).toBe("The code expired. Get a new one.");
  });
});
