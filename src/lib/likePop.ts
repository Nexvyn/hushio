export type LikeSnapshot = { id: string | null; liked: boolean };

export function likeJustAdded(before: LikeSnapshot, after: LikeSnapshot): boolean {
  return after.id !== null && before.id === after.id && !before.liked && after.liked;
}
