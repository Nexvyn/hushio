import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Clock01Icon, Share08Icon, UserIcon, Album01Icon } from "@hugeicons/core-free-icons";
import { BarChart, type Bar } from "../components/BarChart";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Icon } from "../components/Icon";
import { ReplayShareSheet } from "../components/ReplayShareSheet";
import { APP_NAME } from "../lib/app";
import { useArtTint } from "../lib/palette";
import { plural } from "../lib/plural";
import { useCountUp } from "../lib/countUp";
import { buildReplayCard } from "../lib/replayCard";
import { forgetReplayCache, loadReplay, useListeningNow } from "../lib/replayData";
import {
  REPLAY_PERIODS,
  activityDays,
  biggestDay,
  fmtHours,
  fmtMinutes,
  periodLabel,
  peakHour,
  streaks,
  type ReplayData,
  type ReplayPeriod,
} from "../lib/replay";

let rememberedPeriod: ReplayPeriod = "month";

const WEEK_EMPTY = "Your week fills in as you listen — every song you play from now on counts here.";
const OTHER_EMPTY = `Play something first — Replay fills in as ${APP_NAME} counts what you actually listen to.`;

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; data: ReplayData };

function Cover({ src, round = false }: { src: string | null; round?: boolean }) {
  const shape = round ? "rounded-full" : "rounded-[9px]";
  if (!src) {
    return <span aria-hidden="true" className={`block h-12 w-12 shrink-0 ${shape} bg-wash`} />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`block h-12 w-12 shrink-0 ${shape} object-cover outline outline-1 -outline-offset-1 outline-black/10 [[data-theme=dark]_&]:outline-white/10`}
    />
  );
}

function PeriodSwitch({ value, onChange }: { value: ReplayPeriod; onChange: (period: ReplayPeriod) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + REPLAY_PERIODS.length) % REPLAY_PERIODS.length;
    onChange(REPLAY_PERIODS[next].id);
    buttons.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="Replay period" className="flex flex-wrap gap-1 rounded-full bg-wash p-1">
      {REPLAY_PERIODS.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium motion-safe:transition-colors motion-safe:duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              selected ? "bg-accent text-on-accent" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <div className="rounded-[16px] bg-panel p-5">
      <p className="text-[32px] font-extrabold tabular-nums tracking-[-0.02em] text-ink-1">{shown.toLocaleString()}</p>
      <p className="mt-1 text-[12.5px] text-ink-2">{label}</p>
    </div>
  );
}

function Hero({
  minutes,
  plays,
  activeDays,
  tint,
  onShare,
}: {
  minutes: number;
  plays: number;
  activeDays: number;
  tint: string;
  onShare: () => void;
}) {
  const shown = useCountUp(minutes);
  return (
    <section aria-labelledby="replay-hero" className="relative overflow-hidden rounded-[26px] bg-panel p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(135deg, rgb(${tint} / 0.35), transparent 70%)` }}
      />
      <div className="relative">
        <h2 id="replay-hero" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-2">
          Minutes listened
        </h2>
        <p className="mt-2 font-display text-[88px] font-extrabold leading-none tabular-nums tracking-[-0.04em] text-ink-1">
          {shown.toLocaleString()}
        </p>
        <p className="mt-3 text-[14px] text-ink-2">
          {plural(plays, "play", "plays")} · {plural(activeDays, "day", "days")} of listening
        </p>
        <Button variant="secondary" className="mt-5 gap-2" onClick={onShare}>
          <Icon icon={Share08Icon} />
          Share
        </Button>
      </div>
    </section>
  );
}

function LinerNotes({ data }: { data: ReplayData }) {
  const [artist] = data.artists;
  const hour = peakHour(data.hours);
  const total = data.hours.reduce((sum, value) => sum + value, 0);
  if (!artist && hour === null) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {artist && (
        <div className="rounded-[16px] bg-panel p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-2">Top artist</p>
          <p className="mt-2 truncate text-[22px] font-semibold text-ink-1">{artist.name}</p>
          <p className="mt-1 text-[13px] tabular-nums text-ink-2">
            {fmtHours(artist.ms)} · {plural(artist.plays, "play", "plays")}
          </p>
        </div>
      )}
      {hour !== null && total > 0 && (
        <div className="rounded-[16px] bg-panel p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-2">Your hour</p>
          <p className="mt-2 text-[22px] font-semibold text-ink-1">
            {new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" })}
          </p>
          <p className="mt-1 text-[13px] tabular-nums text-ink-2">
            {Math.max(1, Math.round((data.hours[hour] / total) * 100))}% of all your listening
          </p>
        </div>
      )}
    </div>
  );
}

function TopSongs({ data }: { data: ReplayData }) {
  const top = data.tracks[0]?.ms ?? 1;
  return (
    <section aria-labelledby="replay-songs" className="space-y-4">
      <h2 id="replay-songs" className="text-[24px] font-semibold tracking-[-0.01em] text-ink-1">
        Top songs
      </h2>
      <ol className="m-0 list-none p-0">
        {data.tracks.slice(0, 10).map((track, index) => (
          <li key={track.id} className="flex items-center gap-4 border-b border-separator py-3 last:border-b-0">
            <span className="w-6 shrink-0 text-[13px] tabular-nums text-ink-3">{String(index + 1).padStart(2, "0")}</span>
            <Cover src={track.thumb} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink-1">{track.title}</p>
              <p className="truncate text-[12.5px] text-ink-2">{track.artist}</p>
              <div aria-hidden="true" className="mt-2 h-1 rounded-full bg-wash">
                <div
                  className="h-full rounded-full bg-ink-1/70"
                  style={{ width: `${Math.max(4, (track.ms / top) * 100)}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className="text-[14px] text-ink-1">{fmtHours(track.ms)}</p>
              <p className="text-[12px] text-ink-2">{plural(track.plays, "play", "plays")}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TopArtists({ data }: { data: ReplayData }) {
  const rows = data.artists.length >= 8 ? 8 : 4;
  return (
    <section aria-labelledby="replay-artists" className="space-y-4">
      <h2 id="replay-artists" className="text-[24px] font-semibold tracking-[-0.01em] text-ink-1">
        Top artists
      </h2>
      <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
        {data.artists.slice(0, rows).map((artist, index) => (
          <li key={artist.name} className="flex items-center gap-3 rounded-[16px] bg-panel p-4">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
                index === 0 ? "bg-white text-black" : "bg-wash text-ink-2"
              }`}
            >
              {index + 1}
            </span>
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wash text-ink-2">
              <Icon icon={UserIcon} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-ink-1">{artist.name}</p>
              <p className="text-[12.5px] tabular-nums text-ink-2">{fmtHours(artist.ms)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TopAlbums({ data }: { data: ReplayData }) {
  if (data.albums.length === 0) return null;
  return (
    <section aria-labelledby="replay-albums" className="space-y-4">
      <h2 id="replay-albums" className="text-[24px] font-semibold tracking-[-0.01em] text-ink-1">
        Top albums
      </h2>
      <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
        {data.albums.slice(0, 8).map((album, index) => (
          <li key={`${album.title}|${album.artist}`} className="flex items-center gap-3 rounded-[16px] bg-panel p-4">
            <span className="w-5 shrink-0 text-[12px] tabular-nums text-ink-3">{index + 1}</span>
            <Icon icon={Album01Icon} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-ink-1" title={album.title}>
                {album.title}
              </p>
              <p className="truncate text-[12.5px] tabular-nums text-ink-2">
                {album.artist ? `${album.artist} · ` : ""}
                {fmtHours(album.ms)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Pattern({ data, period, today }: { data: ReplayData; period: ReplayPeriod; today: Date }) {
  const days = activityDays(period, data.days, today);
  const active = days.filter((entry) => entry.ms > 0).length;
  const biggest = biggestDay(data.days);
  const bars: Bar[] = days.map((entry) => ({
    label: entry.date,
    value: entry.ms,
    text: entry.ms > 0 ? fmtHours(entry.ms) : "no music",
  }));
  const hourBars: Bar[] = data.hours.map((value, hour) => ({
    label: `${hour}:00`,
    value,
    text: value > 0 ? fmtHours(value) : "no music",
  }));
  return (
    <section aria-labelledby="replay-listening" className="space-y-6">
      <h2 id="replay-listening" className="text-[24px] font-semibold tracking-[-0.01em] text-ink-1">
        Your listening
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <CountTile label="Different songs" value={data.counts.tracks} />
        <CountTile label="Artists" value={data.counts.artists} />
        <CountTile label="Albums" value={data.counts.albums} />
      </div>
      <div className="rounded-[16px] bg-panel p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[14px] font-medium text-ink-1">Daily listening</p>
          <p className="text-[13px] tabular-nums text-ink-2">
            {active} of {days.length} days with music
          </p>
        </div>
        <BarChart
          title="Listening per day"
          summary={`${active} of ${days.length} days with music.`}
          bars={bars}
          ticks={[]}
          columns={days.length}
        />
        {biggest && (
          <p className="text-[13px] text-ink-2">
            Biggest day:{" "}
            <span className="tabular-nums text-ink-1">
              {new Date(`${biggest.date}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>{" "}
            · {fmtHours(biggest.ms)}
          </p>
        )}
      </div>
      <div className="rounded-[16px] bg-panel p-5 space-y-4">
        <p className="text-[14px] font-medium text-ink-1">By hour of day</p>
        <BarChart
          title="Listening by hour"
          summary={`Peak hour ${peakHour(data.hours) ?? "none"}.`}
          bars={hourBars}
          ticks={[
            { at: 0, label: "0" },
            { at: 6, label: "6" },
            { at: 12, label: "12" },
            { at: 18, label: "18" },
          ]}
          columns={24}
        />
      </div>
    </section>
  );
}

function Body({
  data,
  period,
  today,
  tint,
  onShare,
}: {
  data: ReplayData;
  period: ReplayPeriod;
  today: Date;
  tint: string;
  onShare: () => void;
}) {
  return (
    <div className="space-y-10">
      <Hero
        minutes={fmtMinutes(data.totalMs)}
        plays={data.plays}
        activeDays={streaks(data.days).active}
        tint={tint}
        onShare={onShare}
      />
      <LinerNotes data={data} />
      <TopSongs data={data} />
      <TopArtists data={data} />
      <TopAlbums data={data} />
      <Pattern data={data} period={period} today={today} />
      <p className="text-[12px] text-ink-3">Counted by {APP_NAME} on this device — nothing estimated.</p>
    </div>
  );
}

export function ReplayView() {
  const [period, setPeriodState] = useState<ReplayPeriod>(rememberedPeriod);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const listeningNow = useListeningNow();
  const seenListening = useRef(listeningNow);
  const today = new Date();

  useEffect(() => {
    if (seenListening.current === listeningNow) return;
    seenListening.current = listeningNow;
    forgetReplayCache();
    setAttempt((count) => count + 1);
  }, [listeningNow]);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    loadReplay(period).then(
      (data) => {
        if (live) setLoad({ status: "ready", data });
      },
      () => {
        if (live) setLoad({ status: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [period, attempt]);

  const data = load.status === "ready" ? load.data : null;
  const tint = useArtTint(data?.tracks[0]?.thumb ?? "");
  const label = periodLabel(period, today, data?.months ?? []);
  const shareDays = data ? (period === "all" || period === "year" ? data.days : activityDays(period, data.days, today)) : [];
  const shareDayCount = streaks(shareDays).active;
  const shareStreak = streaks(shareDays).longest;

  const card = useMemo(
    () =>
      data
        ? buildReplayCard({ data, periodLabel: label, activeDays: shareDayCount, streak: shareStreak, tint })
        : null,
    [data, label, shareDayCount, shareStreak, tint],
  );

  const setPeriod = (next: ReplayPeriod) => {
    rememberedPeriod = next;
    setPeriodState(next);
  };

  return (
    <div className="space-y-10 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[44px] font-extrabold tracking-[-0.03em] text-ink-1">Replay</h1>
          <p className="mt-1 text-[14px] text-ink-2">{label}</p>
        </div>
        <PeriodSwitch value={period} onChange={setPeriod} />
      </header>

      {load.status === "loading" && (
        <div aria-busy="true" aria-label="Loading your Replay" className="h-[340px] rounded-[26px] bg-wash bt-skeleton" />
      )}

      {load.status === "error" && (
        <ErrorState
          title="Replay couldn't load"
          message="Your listening stats couldn't be read."
          action={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
        />
      )}

      {data && data.totalMs === 0 && (
        <EmptyState
          title="Nothing on this record yet"
          message={period === "week" ? WEEK_EMPTY : OTHER_EMPTY}
          icon={Clock01Icon}
        />
      )}

      {data && data.totalMs > 0 && (
        <Body data={data} period={period} today={today} tint={tint} onShare={() => setSharing(true)} />
      )}

      {sharing && card && <ReplayShareSheet card={card} onClose={() => setSharing(false)} />}
    </div>
  );
}
