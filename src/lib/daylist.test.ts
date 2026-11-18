import { describe, it, expect } from 'vitest';
import { daylist } from './daylist';
const track = (id: string) => ({ id, title: id, artist: 'Artist', thumb: null });
describe('daylist', () => {
  it('refreshes at the next local four-hour boundary including midnight', () => {
    const now = new Date(2026, 10, 17, 23, 59);
    const result = daylist([], [track('a')], now);
    expect(result.next).toEqual(new Date(2026, 10, 18, 0));
    expect(result.tracks).toEqual([track('a')]);
  });
});
