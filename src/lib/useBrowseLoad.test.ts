import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useBrowseLoad } from "./useBrowseLoad";

describe("useBrowseLoad", () => {
  it("loads the key and exposes the data", async () => {
    const load = vi.fn(async (key: string) => `page ${key}`);
    const { result } = renderHook(() => useBrowseLoad("abc", load));

    expect(result.current.state).toEqual({ status: "loading" });
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: "page abc" }));
    expect(load).toHaveBeenCalledWith("abc");
  });

  it("reports an error and reloads on retry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ok");
    const { result } = renderHook(() => useBrowseLoad("abc", load));

    await waitFor(() => expect(result.current.state).toEqual({ status: "error" }));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: "ok" }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("ignores a result that arrives after the key changed", async () => {
    let resolveFirst: (value: string) => void = () => {};
    const load = vi
      .fn()
      .mockImplementationOnce(() => new Promise<string>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce("second");
    const { result, rerender } = renderHook(({ key }) => useBrowseLoad(key, load), {
      initialProps: { key: "first" },
    });

    rerender({ key: "second" });
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: "second" }));

    act(() => resolveFirst("stale"));
    expect(result.current.state).toEqual({ status: "ready", data: "second" });
  });
});
