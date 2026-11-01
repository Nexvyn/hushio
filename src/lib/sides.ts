import { pairKey } from "./taste";

export const MERGE_AT = 0.3;
export const MAX_SIDES = 4;
const BACK_TO_BACK_CAP = 3;

export type SideArtist = { key: string; artistId: string | null; name: string; score: number };
export type Side = { members: SideArtist[]; total: number };

export function tieWeight(
  a: SideArtist,
  b: SideArtist,
  related: (artistId: string) => readonly string[],
  pairs: ReadonlyMap<string, number>,
): number {
  const catalogue =
    a.artistId !== null && b.artistId !== null && (related(a.artistId).includes(b.artistId) || related(b.artistId).includes(a.artistId))
      ? 1
      : 0;
  const heard = Math.min(1, (pairs.get(pairKey(a.key, b.key)) ?? 0) / BACK_TO_BACK_CAP);
  return Math.min(1, catalogue + heard);
}

function averageLink(
  left: readonly SideArtist[],
  right: readonly SideArtist[],
  weight: (a: SideArtist, b: SideArtist) => number,
): number {
  let sum = 0;
  for (const a of left) for (const b of right) sum += weight(a, b);
  return sum / (left.length * right.length);
}

export function clusterSides(
  artists: readonly SideArtist[],
  related: (artistId: string) => readonly string[],
  pairs: ReadonlyMap<string, number>,
): Side[] {
  const weight = (a: SideArtist, b: SideArtist) => tieWeight(a, b, related, pairs);
  let groups: SideArtist[][] = artists.map((artist) => [artist]);

  for (;;) {
    let best = -1;
    let bestI = -1;
    let bestJ = -1;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const link = averageLink(groups[i], groups[j], weight);
        if (link > best) {
          best = link;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0 || best < MERGE_AT) break;
    groups[bestI] = [...groups[bestI], ...groups[bestJ]];
    groups = groups.filter((_, index) => index !== bestJ);
  }

  return groups
    .filter((members) => members.length >= 2)
    .map((members) => ({ members, total: members.reduce((sum, member) => sum + member.score, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_SIDES)
    .map((side) => ({ ...side, members: [...side.members].sort((a, b) => b.score - a.score) }));
}
