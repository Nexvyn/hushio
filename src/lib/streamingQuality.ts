import { useSettings, type StreamingQuality } from "../stores/settings";
import { currentNetworkType, type NetworkType } from "./networkType";

const QUALITY_KBPS: Record<StreamingQuality, number | undefined> = {
  low: 48,
  medium: 128,
  high: 256,
  lossless: undefined,
};

export const DATA_SAVER_KBPS = 48;

export function streamBitrate(input: {
  network: NetworkType;
  wifiQuality: StreamingQuality;
  mobileQuality: StreamingQuality;
  dataSaver: boolean;
}): number | undefined {
  if (input.dataSaver) return DATA_SAVER_KBPS;
  const quality = input.network === "cellular" ? input.mobileQuality : input.wifiQuality;
  return QUALITY_KBPS[quality];
}

export function currentStreamBitrate(): number | undefined {
  const { streamingQuality, mobileStreamingQuality, dataSaver } = useSettings.getState();
  return streamBitrate({
    network: currentNetworkType(),
    wifiQuality: streamingQuality,
    mobileQuality: mobileStreamingQuality,
    dataSaver,
  });
}
