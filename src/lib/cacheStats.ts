export const IMAGE_CACHE_LIMITS_MB = [256, 512, 1024, 2048] as const;
export const DEFAULT_IMAGE_CACHE_MB = 256;

const UNITS = ["KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

export function limitLabel(megabytes: number): string {
  return megabytes >= 1024 ? `${megabytes / 1024} GB` : `${megabytes} MB`;
}
