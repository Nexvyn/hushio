import { useEffect, useMemo, useSyncExternalStore } from "react";
import { fetchHomePage, type HomeShelf } from "./home";
import { getRadio, type Market } from "./innertube";
import { createHomeStream } from "./homeStream";
import type { Track } from "../types";

const streams = new Map<string, ReturnType<typeof createHomeStream>>();
export function useHomeStream(region: Market, cacheKey: string, initial: HomeShelf[], continuation: string | null, seeds: Track[]) {
  const regionKey = `${region.location}:${region.lang}`;
  const controller = useMemo(() => {
    let stream = streams.get(regionKey);
    if (!stream) {
      stream = createHomeStream({ browse: (market, token) => fetchHomePage(market, token), radio: getRadio });
      streams.set(regionKey, stream);
      if (streams.size > 3) streams.delete(streams.keys().next().value!);
    }
    return stream;
  }, [regionKey]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.configure(cacheKey, region, initial, continuation, seeds);
  }, [controller, cacheKey, region.location, region.lang, initial, continuation, seeds]);
  const current = state.key === cacheKey ? state : { key: cacheKey, shelves: [], loading: false, error: null, done: false };
  return { ...current, loadMore: controller.loadMore };
}
