const ALLOWED_ART = /^(https:\/\/|data:image\/|blob:|localart:|http:\/\/localart\.localhost\/|asset:\/\/localhost\/|http:\/\/asset\.localhost\/)/i;
const YOUTUBE_THUMB = /^(https:\/\/i\.ytimg\.com\/vi\/[^/?#]+\/)(default|mqdefault|hqdefault|sddefault|hq720)(?:\.jpg)?(?:\?.*)?$/i;
const YOUTUBE_LARGE = /^(https:\/\/i\.ytimg\.com\/vi\/[^/?#]+\/)(?:hqdefault|sddefault|maxresdefault)\.jpg(?:\?.*)?$/i;
const GOOGLE_ART = /^https:\/\/(?:lh3\.googleusercontent\.com|yt3\.googleusercontent\.com|yt3\.ggpht\.com)\//i;
const SMALL_THUMB_MAX = 120;
const SIZE_STEPS = [96, 144, 226, 360, 544, 800, 1024] as const;
const MAX_DPR = 2;
export const DATA_SAVER_ART_SIZE = 160;
const DEFAULT_ART_SIZE = 544;

let artSize = DEFAULT_ART_SIZE;

export function setArtworkSize(size: number): void {
  artSize = size;
}

export function artworkUrlOk(url: string): boolean {
  return ALLOWED_ART.test(url);
}

export function upgradeArtwork(input: string | null | undefined, target = 544): string {
  const url = input?.trim() ?? "";
  if (!artworkUrlOk(url)) return "";
  const size = target === 544 ? artSize : target;
  const placeholder = size === DEFAULT_ART_SIZE ? "500x500" : `${size}x${size}`;
  return url
    .replace(/150x150|50x50/g, placeholder)
    .replace(YOUTUBE_THUMB, (_, prefix: string, name: string) => {
      const lower = name.toLowerCase();
      const size = lower === "default" || lower === "mqdefault" ? "hqdefault" : lower;
      return `${prefix}${size}.jpg`;
    })
    .replace(/=s\d+/g, `=s${size}`)
    .replace(/=w\d+(-c)?-h\d+/g, `=w${size}$1-h${size}`)
    .replace(/\/w\d+(-c)?-h\d+((?:-[a-z0-9]+)*)\//, `/w${size}$1-h${size}$2/`);
}

function devicePixelRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

export function thumbPixels(target: number, dpr = devicePixelRatio()): number {
  const need = Math.ceil(target * Math.min(dpr, MAX_DPR));
  return SIZE_STEPS.find((step) => step >= need) ?? SIZE_STEPS[SIZE_STEPS.length - 1];
}

export function thumbArtwork(input: string | null | undefined, target: number, dpr?: number): string {
  const url = input?.trim() ?? "";
  if (!artworkUrlOk(url)) return "";
  if (YOUTUBE_LARGE.test(url)) {
    return target <= SMALL_THUMB_MAX ? url.replace(YOUTUBE_LARGE, "$1mqdefault.jpg") : upgradeArtwork(url);
  }
  if (GOOGLE_ART.test(url)) return upgradeArtwork(url, thumbPixels(target, dpr));
  return url;
}
