import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackTimeline } from "./PlaybackTimeline";
afterEach(cleanup);
describe("playback timeline", () => {
  it("previews a drag and seeks once on release", () => {
    const seek = vi.fn();
    render(<PlaybackTimeline position={10} duration={200} onSeek={seek} trackId="a" />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    fireEvent.pointerDown(slider); fireEvent.change(slider, { target: { value: "80" } });
    expect(seek).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(seek).toHaveBeenCalledExactlyOnceWith(80);
  });
  it("supports keyboard seeking without interrupting every preview step", () => {
    const seek = vi.fn();
    render(<PlaybackTimeline position={10} duration={200} onSeek={seek} />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    fireEvent.keyDown(slider, { key: "ArrowRight" }); fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(seek).not.toHaveBeenCalled(); fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(seek).toHaveBeenCalledExactlyOnceWith(20);
  });
  it("accepts assistive range changes without waiting for a pointer event", () => {
    const seek = vi.fn(); render(<PlaybackTimeline position={10} duration={200} onSeek={seek} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "45" } });
    expect(seek).toHaveBeenCalledWith(45);
  });
  it("disables seeking when the track length is unknown", () => {
    render(<PlaybackTimeline position={0} duration={NaN} onSeek={vi.fn()} />);
    expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  });
});
