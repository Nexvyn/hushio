const ALLOWED_ART = /^(https:\/\/|data:image\/|blob:|localart:|http:\/\/localart\.localhost\/)/i;
const YOUTUBE_THUMB = /^(https:\/\/i\.ytimg\.com\/vi\/[^/?#]+\/)(default|mqdefault|hqdefault|sddefault|hq720)(?:\.jpg)?(?:\?.*)?$/i;

export function artworkUrlOk(url: string): boolean {
  return ALLOWED_ART.test(url);
}

export function upgradeArtwork(input: string | null | undefined, target = 544): string {
  const url = input?.trim() ?? "";
  if (!artworkUrlOk(url)) return "";
  return url
    .replace(/150x150|50x50/g, "500x500")
    .replace(YOUTUBE_THUMB, (_, prefix: string, name: string) => {
      const lower = name.toLowerCase();
      const size = lower === "default" || lower === "mqdefault" ? "hqdefault" : lower;
      return `${prefix}${size}.jpg`;
    })
    .replace(/=s\d+/g, `=s${target}`)
    .replace(/=w\d+(-c)?-h\d+/g, `=w${target}$1-h${target}`)
    .replace(/\/w\d+(-c)?-h\d+((?:-[a-z0-9]+)*)\//, `/w${target}$1-h${target}$2/`)
    .replace(/\/default\.jpg(?:\?.*)?$/i, "/hqdefault.jpg");
}
