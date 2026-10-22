import { PlayIcon } from "@hugeicons/core-free-icons";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { TEST_SONG_ID, TEST_SONG_TITLE } from "../lib/audio";
import { playFromRow } from "../stores/player";
import type { Track } from "../types";

const TEST_TRACK: Track = {
  id: TEST_SONG_ID,
  title: TEST_SONG_TITLE,
  artist: "Test",
  thumb: `https://i.ytimg.com/vi/${TEST_SONG_ID}/hqdefault.jpg`,
};

export function HomeView() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[34px] font-extrabold tracking-[-0.03em] text-ink-1">Home</h1>
      <div className="flex items-center gap-3">
        <Button variant="primary" className="gap-2" onClick={() => playFromRow([TEST_TRACK], 0)}>
          <Icon icon={PlayIcon} />
          Play test song
        </Button>
      </div>
    </div>
  );
}
