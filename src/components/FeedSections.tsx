import { useId } from "react";
import { Cover, focusRing } from "./HomeShelves";
import { startPlaySource } from "../lib/playSource";
import { hash32 } from "../lib/queue";
import type { CardRef, FeedSection, PlaylistRef, SectionItem, SideRef } from "../lib/feed";
import type { HomeItem } from "../lib/home";
import { playFromRow } from "../stores/player";
import { useNavigation } from "../stores/navigation";
import { useHomeEngagement } from "../stores/homeEngagement";
import type { Track } from "../types";

function fromShelfItem(item: HomeItem): SectionItem {
  switch (item.kind) {
    case "track":
      return { kind: "track", track: item.track };
    case "album":
      return { kind: "album", album: { id: item.id, title: item.title, artist: item.artist, thumb: item.thumb, year: null } };
    case "artist":
      return { kind: "artist", artist: { id: item.id, name: item.name, thumb: item.thumb } };
    case "playlist":
      return { kind: "playlist", playlist: { id: item.id, title: item.title, subtitle: item.subtitle, thumb: item.thumb } };
  }
}

const CARD_PASTELS: readonly (readonly [string, string])[] = [
  ["#a7baf5", "#8ea7ef"],
  ["#c99bf2", "#b57fee"],
  ["#f2a98e", "#ec9377"],
  ["#a9e3c3", "#8fd7ae"],
  ["#d8e07c", "#cbd45f"],
  ["#f3b8cf", "#eda0bd"],
  ["#f0cf8e", "#e9bd6e"],
  ["#9fd8f0", "#7fc7e8"],
];

const TILE = `shrink-0 rounded-[11px] p-1 text-left motion-safe:transition-colors hover:bg-wash active:bg-pressed ${focusRing}`;

function pastelFor(id: string): string {
  return CARD_PASTELS[hash32(id) % CARD_PASTELS.length][0];
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, [role='button'], a") !== null;
}

function isTrack(item: SectionItem): item is Extract<SectionItem, { kind: "track" }> {
  return item.kind === "track";
}

type TileProps = {
  thumb: string | null;
  round?: boolean;
  band?: string;
  title: string;
  subtitle?: string;
  tag?: string;
  fluid?: boolean;
  onActivate: () => void;
};

function Tile({ thumb, round = false, band, title, subtitle, tag, fluid = false, onActivate }: TileProps) {
  return (
    <button type="button" onClick={onActivate} className={`${TILE} ${fluid ? "w-full" : "w-[160px]"} ${round ? "text-center" : ""}`}>
      <span className="relative block">
        {band ? (
          <span className="block rounded-[11px] p-2" style={{ backgroundColor: band }}>
            <Cover src={thumb} round={round} />
          </span>
        ) : (
          <Cover src={thumb} round={round} />
        )}
        {tag && (
          <span className="absolute left-2 top-2 rounded-[4px] bg-panel px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-ink-1">
            {tag}
          </span>
        )}
      </span>
      <span className="mt-2 block min-w-0 px-0.5">
        <span className="block truncate text-[13px] font-medium text-ink-1">{title}</span>
        {subtitle && <span className="block truncate text-[12px] text-ink-2">{subtitle}</span>}
      </span>
    </button>
  );
}

function SideTile({ side, onActivate }: { side: SideRef; onActivate: () => void }) {
  return (
    <button type="button" onClick={onActivate} className={`${TILE} w-full`}>
      <span className="block rounded-[11px] p-2" style={{ backgroundColor: pastelFor(side.id) }}>
        <span className="grid aspect-square grid-cols-2 gap-px overflow-hidden rounded-[9px]">
          {[0, 1, 2, 3].map((slot) => (
            <Cover key={slot} src={side.thumbs[slot] ?? null} />
          ))}
        </span>
      </span>
      <span className="mt-2 block min-w-0 px-0.5">
        <span className="block truncate text-[13px] font-medium text-ink-1">Side {side.letter}</span>
        <span className="block truncate text-[12px] text-ink-2">{side.caption}</span>
      </span>
    </button>
  );
}

function CardTile({ card, fluid, onActivate }: { card: CardRef; fluid: boolean; onActivate: () => void }) {
  const radio = card.style === "radio";
  return (
    <Tile
      thumb={card.thumb}
      round={radio}
      band={radio ? undefined : pastelFor(card.id)}
      tag={radio ? "RADIO" : undefined}
      title={card.name}
      subtitle={card.caption}
      fluid={fluid}
      onActivate={onActivate}
    />
  );
}

function ListRow({ track, note, onActivate }: { track: Track; note?: string; onActivate: () => void }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`flex w-full min-w-0 items-center gap-3 rounded-[10px] p-2 text-left motion-safe:transition-colors hover:bg-wash active:bg-pressed ${focusRing}`}
    >
      <span className="h-11 w-11 shrink-0">
        <Cover src={track.thumb} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink-1">{track.title}</span>
        <span className="block truncate text-[12px] text-ink-2">{note ?? track.artist}</span>
      </span>
    </button>
  );
}

type Navigate = (view: { name: "album" | "artist" | "ytplaylist"; param: string }) => void;

function ItemView({
  item,
  items,
  index,
  fluid,
  navigate,
}: {
  item: SectionItem;
  items: readonly SectionItem[];
  index: number;
  fluid: boolean;
  navigate: Navigate;
}) {
  switch (item.kind) {
    case "track": {
      const queue = items.flatMap((entry) => (isTrack(entry) ? [entry.track] : []));
      const position = items.slice(0, index).filter(isTrack).length;
      return (
        <Tile
          thumb={item.track.thumb}
          title={item.track.title}
          subtitle={item.track.artist}
          fluid={fluid}
          onActivate={() => playFromRow(queue, position)}
        />
      );
    }
    case "album":
      return (
        <Tile
          thumb={item.album.thumb}
          title={item.album.title}
          subtitle={item.album.artist}
          fluid={fluid}
          onActivate={() => navigate({ name: "album", param: item.album.id })}
        />
      );
    case "artist":
      return (
        <Tile
          thumb={item.artist.thumb}
          round
          title={item.artist.name}
          fluid={fluid}
          onActivate={() => navigate({ name: "artist", param: item.artist.id })}
        />
      );
    case "playlist":
      return (
        <Tile
          thumb={item.playlist.thumb}
          title={item.playlist.title}
          subtitle={item.playlist.subtitle}
          fluid={fluid}
          onActivate={() => navigate({ name: "ytplaylist", param: item.playlist.id })}
        />
      );
    case "card":
      return <CardTile card={item.card} fluid={fluid} onActivate={() => void startPlaySource(item.card.source)} />;
    case "side":
      return <SideTile side={item.side} onActivate={() => void startPlaySource(item.side.source)} />;
  }
}

function PlaylistTile({ playlist, onActivate }: { playlist: PlaylistRef; onActivate: () => void }) {
  return <Tile thumb={playlist.thumb} title={playlist.title} subtitle={playlist.subtitle} onActivate={onActivate} />;
}

function Body({ section }: { section: FeedSection }) {
  const navigate = useNavigation((state) => state.navigate);
  if (section.layout === "crate" && section.playlists) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {section.playlists.map((playlist) => (
          <PlaylistTile
            key={playlist.id}
            playlist={playlist}
            onActivate={() => navigate({ name: "ytplaylist", param: playlist.id })}
          />
        ))}
      </div>
    );
  }
  if (section.layout === "list") {
    return (
      <ol className="space-y-1">
        {section.items.map((item, index) => {
          if (!isTrack(item)) return null;
          const queue = section.items.flatMap((entry) => (isTrack(entry) ? [entry.track] : []));
          const position = section.items.slice(0, index).filter(isTrack).length;
          return (
            <li key={`${item.track.id}-${index}`}>
              <ListRow track={item.track} note={item.note} onActivate={() => playFromRow(queue, position)} />
            </li>
          );
        })}
      </ol>
    );
  }
  const fluid = section.layout === "mixes";
  const items = section.shelf ? section.shelf.items.map(fromShelfItem) : section.items;
  const layout = fluid ? "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" : "flex gap-3 overflow-x-auto pb-2";
  return (
    <div className={layout}>
      {items.map((item, index) => (
        <ItemView key={`${item.kind}-${index}`} item={item} items={items} index={index} fluid={fluid} navigate={navigate} />
      ))}
    </div>
  );
}

export function FeedSectionView({ section }: { section: FeedSection }) {
  const titleId = useId();
  const tap = useHomeEngagement((state) => state.tap);
  return (
    <section
      aria-labelledby={titleId}
      onClickCapture={(event) => {
        if (isControl(event.target)) tap(section.kind);
      }}
    >
      {section.eyebrow && <p className="mb-1 text-[12px] font-medium text-ink-2">{section.eyebrow.label}</p>}
      <h2 id={titleId} className="mb-1 text-[20px] font-bold tracking-[-0.01em] text-ink-1">
        {section.title}
      </h2>
      {section.subtitle && <p className="mb-3 text-[13px] text-ink-2">{section.subtitle}</p>}
      <Body section={section} />
    </section>
  );
}
