import { useEffect, useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Slider } from "../components/Slider";
import { audio, playStream, seekTo, TEST_SONG_ID } from "../lib/audio";
import { useUI } from "../stores/ui";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function HomeView() {
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const sync = () => {
      setPosition(audio.currentTime);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    return () => {
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", sync);
    };
  }, []);

  const play = async () => {
    setBusy(true);
    try {
      await playStream(TEST_SONG_ID);
    } catch (error) {
      useUI.getState().toast(`Could not play the test song: ${describeError(error)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[34px] font-extrabold tracking-[-0.03em] text-ink-1">Home</h1>
      <div className="flex items-center gap-3">
        <Button variant="primary" className="gap-2" disabled={busy} onClick={play}>
          <Icon icon={PlayIcon} />
          Play test song
        </Button>
        <Slider
          label="Seek"
          min={0}
          max={duration || 1}
          step={0.1}
          value={position}
          disabled={duration === 0}
          onChange={seekTo}
        />
      </div>
    </div>
  );
}
