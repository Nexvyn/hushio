import { PlayRound } from "../components/PlayRound";
import { t } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { MusicNote, Plus } from "@phosphor-icons/react";
import { ActionMenu } from "../components/ActionMenu";
import { Button } from "../components/Button";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { Icon } from "../components/Icon";
import { PhoneIcon } from "../components/phone/PhoneIcon";
import { PHONE_PILL } from "../components/phone/heroButtons";
import { replayJournal } from "../lib/bridge";
import { fmtTime } from "../lib/format";
import { daylist } from "../lib/daylist";
import type { JournalEntry } from "../lib/replay";
import { songOf, trackMenuItems } from "../lib/trackActions";
import { usePhone } from "../lib/usePhone";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";
import "../styles/social.css";

function DaylistIcon({ icon }: { icon: Parameters<typeof Icon>[0]["icon"] }) {
  return usePhone() ? <PhoneIcon icon={icon} /> : <Icon icon={icon} />;
}

function Artwork({ track }: { track?: Track }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [track?.thumb]);
  return <span className="social-art"><DaylistIcon icon={MusicNote} />{track?.thumb && !failed && <img decoding="async" src={track.thumb} alt="" loading="lazy" onError={() => setFailed(true)} />}</span>;
}

function TrackList({ tracks, source }: { tracks: Track[]; source: string }) {
  const currentId = usePlayer(state => state.queue[state.index]?.id);
  const playing = usePlayer(state => state.playing);
  return <ol className="social-tracks" aria-label={`${source} songs`}>{tracks.map((track, index) => {
    const current = currentId === track.id;
    return <li key={track.id} className="social-track" data-current={current || undefined}>
      <button type="button" className="social-track-play" aria-label={`${current && playing ? "Pause" : "Play"} ${track.title}`} aria-current={current ? "true" : undefined}
        onClick={() => current ? usePlayer.getState().toggle() : usePlayer.getState().playQueue(tracks, index, source)}>
        <span className="social-track-number">{current && playing ? <span className="social-playing-mark" aria-hidden="true" /> : index + 1}</span>
        <Artwork track={track} /><span className="social-track-text"><span>{track.title}</span><span>{track.artist || "Unknown artist"}</span></span>
        <span className="social-duration">{track.duration ? fmtTime(track.duration) : ""}</span>
      </button>
      <ActionMenu label={`Options for ${track.title}`} phoneIcon={true} items={() => trackMenuItems(songOf(track))} />
    </li>;
  })}</ol>;
}

export function DaylistView() {
  const phone = usePhone();
  const history = useLibrary(state => state.history);
  const liked = useLibrary(state => state.liked);
  const createPlaylist = useLibrary(state => state.createPlaylist);
  const addToPlaylist = useLibrary(state => state.addToPlaylist);
  const navigate = useNavigation(state => state.navigate);
  const [now, setNow] = useState(() => new Date());
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  useEffect(() => {
    let active = true;
    void replayJournal().then(entries => { if (active) setJournal(entries); }).catch(() => {});
    return () => { active = false; };
  }, [history]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const daily = useMemo(() => daylist(history, liked, now, journal), [history, liked, now, journal]);
  const covers = [...new Set(daily.tracks.flatMap(track => (track.thumb ? [track.thumb] : [])))].slice(0, 4);

  const save = (title: string, tracks: Track[]) => {
    const id = createPlaylist(title);
    for (const track of tracks) addToPlaylist(id, track);
    useUI.getState().toast(`Saved "${title}" to your library`, "success");
  };

  const playActions = daily.tracks.length ? (phone ? <>
    <PlayRound phone onClick={() => usePlayer.getState().playQueue(daily.tracks, 0, daily.title)} />
    <button type="button" onClick={() => save(daily.title, daily.tracks)} className={PHONE_PILL}><HeroIcon icon={Plus} />{t("dialog.save")}</button>
  </> : <>
    <PlayRound onClick={() => usePlayer.getState().playQueue(daily.tracks, 0, daily.title)} />
    <Button className="gap-2" onClick={() => save(daily.title, daily.tracks)}><DaylistIcon icon={Plus} /><span>Save playlist</span></Button>
  </>) : null;

  const empty = <EmptyState title="Your Daylist is getting started" message="Like a few songs or listen to music. Your daylist will grow with you." icon={MusicNote} action={{ label: "Find music", onClick: () => navigate({ name: "search" }) }} />;

  return <div className="social-page">
    <div key="daylist" role="tabpanel" aria-label="Daylist" tabIndex={0} className="social-panel">
      <CollectionHero
        title={daily.title}
        eyebrow="Daylist"
        description={`Based on your listening and favorites. Next refresh at ${daily.next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`}
        covers={covers}
        facts={daily.tracks.length ? `${daily.tracks.length} songs` : undefined}
        icon={MusicNote}
      >
        {playActions}
      </CollectionHero>
      <div className="mt-6">{daily.tracks.length ? <TrackList tracks={daily.tracks} source={daily.title} /> : empty}</div>
    </div>
  </div>;
}
