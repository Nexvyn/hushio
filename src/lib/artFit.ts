const WIDE_ART_RATIO = 1.6;

export type ArtFit = "contain" | "cover";

export function artFitFor(image: { naturalWidth: number; naturalHeight: number }): ArtFit {
  const { naturalWidth: width, naturalHeight: height } = image;
  return height > 0 && width / height >= WIDE_ART_RATIO ? "contain" : "cover";
}
