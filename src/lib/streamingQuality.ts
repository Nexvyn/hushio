import { useSettings, type StreamingQuality } from "../stores/settings";

const QUALITY_KBPS: Record<StreamingQuality, number | undefined> = {
  low: 48,
  medium: 128,
  high: 256,
  lossless: undefined,
};

export const DATA_SAVER_KBPS = 48;

export function streamBitrate(quality: StreamingQuality, dataSaver: boolean): number | undefined {
  if (dataSaver) return DATA_SAVER_KBPS;
  return QUALITY_KBPS[quality];
}

export function currentStreamBitrate(): number | undefined {
  const { streamingQuality, dataSaver } = useSettings.getState();
  return streamBitrate(streamingQuality, dataSaver);
}
