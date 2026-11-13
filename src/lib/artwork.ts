const ALLOWED_ART = /^(https:\/\/|data:image\/|blob:|localart:|http:\/\/localart\.localhost\/)/i;
const YOUTUBE_THUMB = /^(https:\/\/i\.ytimg\.com\/vi\/[^/?#]+\/)(default|mqdefault|hqdefault|sddefault|hq720)(?:\.jpg)?(?:\?.*)?$/i;
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
    .replace(/\/w\d+(-c)?-h\d+((?:-[a-z0-9]+)*)\//, `/w${size}$1-h${size}$2/`)
    .replace(/\/default\.jpg(?:\?.*)?$/i, "/hqdefault.jpg");
}
