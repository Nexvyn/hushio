import { isAndroidAgent } from "./androidPlayback";

export type NetworkType = "wifi" | "cellular" | "unknown";

export type ConnectionSnapshot = {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
};

type ConnectionSource = ConnectionSnapshot & {
  addEventListener?: (type: "change", listener: () => void) => void;
};

export function classifyNetwork(connection: ConnectionSnapshot | undefined): NetworkType {
  if (!connection) return "unknown";
  if (connection.type === "wifi" || connection.type === "ethernet") return "wifi";
  if (connection.type === "cellular") return "cellular";
  return "unknown";
}

function readConnection(): ConnectionSource | undefined {
  return (navigator as Navigator & { connection?: ConnectionSource }).connection;
}

function readNetworkType(): NetworkType {
  if (!isAndroidAgent(navigator.userAgent)) return "wifi";
  return classifyNetwork(readConnection());
}

let networkType: NetworkType = readNetworkType();
const listeners = new Set<(type: NetworkType) => void>();

readConnection()?.addEventListener?.("change", () => {
  networkType = readNetworkType();
  for (const listener of listeners) listener(networkType);
});

export function currentNetworkType(): NetworkType {
  return networkType;
}

export function subscribeNetworkType(listener: (type: NetworkType) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
