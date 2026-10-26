import { useCallback, useEffect, useState } from "react";

export type LoadState<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

export function useBrowseLoad<T>(key: string, load: (key: string) => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    load(key).then(
      (data) => {
        if (live) setState({ status: "ready", data });
      },
      () => {
        if (live) setState({ status: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [key, load, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  return { state, retry };
}
