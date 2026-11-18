import { useId, useState, type ReactNode } from "react";
import { Cover, focusRing } from "./HomeShelves";
import { Artwork } from "./SearchRows";
import { CoverCardLabel, CoverPlay, coverCardClass } from "./CoverCard";
import { SectionHeader } from "./SectionHeader";
import type { MenuSource } from "./ContextMenu";
import { PhoneArt } from "./phone/PhoneArt";
import { PhoneSongRow } from "./phone/PhoneTrackRow";
import { PhoneSectionHeader, PhoneShelfArt, PhoneShelfCard, PhoneShelfRow, type ShelfVariant } from "./phone/PhoneShelf";
import type { FeaturedItem } from "./phone/PhoneFeatured";
import { thumbArtwork } from "../lib/artwork";
import { startPlaySource } from "../lib/playSource";
import type { CardRef, FeedSection, PlaylistRef, SectionItem, SectionKind, SideRef } from "../lib/feed";
import type { HomeItem } from "../lib/home";
import type { SearchSong } from "../lib/searchParse";
import { trackMenuItems } from "../lib/trackActions";
import { browseMenuItems } from "../lib/browseActions";
import { usePhone } from "../lib/usePhone";
import { currentTrack, playFromRow, usePlayer } from "../stores/player";
import { useNavigation } from "../stores/navigation";
import { useHomeEngagement } from "../stores/homeEngagement";
import type { Track } from "../types";

const SIDE_ART = 74;
const SONG_PREVIEW = 4;

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

const TILE = `${coverCardClass} ${focusRing}`;

function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, [role='button'], a") !== null;
}

function isTrack(item: SectionItem): item is Extract<SectionItem, { kind: "track" }> {
  return item.kind === "track";
}

type TileProps = {
  thumb: string | null;
  round?: boolean;
  title: string;
  subtitle?: string;
  tag?: string;
  fluid?: boolean;
  onActivate: () => void;
};

function Tile({ thumb, round = false, title, subtitle, tag, fluid = false, onActivate }: TileProps) {
  return (
    <button type="button" onClick={onActivate} className={`${TILE} ${fluid ? "w-full" : "w-[160px]"} ${round ? "text-center" : ""}`}>
      <span className="relative block">
        <Cover src={thumb} round={round} />
        {tag && (
          <span className="absolute left-2 top-2 rounded-[4px] bg-panel px-1.5 py-0.5 text-caption font-semibold tracking-[0.08em] text-ink-1">
            {tag}
          </span>
        )}
        {!round && <CoverPlay />}
      </span>
      <CoverCardLabel title={title} subtitle={subtitle} />
    </button>
  );
}

function SideTile({ side, onActivate }: { side: SideRef; onActivate: () => void }) {
  return (
    <button type="button" onClick={onActivate} className={`${TILE} w-full`}>
      <span className="block overflow-hidden rounded-art">
        <span className="grid aspect-square grid-cols-2 gap-px overflow-hidden rounded-art">
          {[0, 1, 2, 3].map((slot) => (
            <Cover key={slot} src={side.thumbs[slot] ?? null} />
          ))}
        </span>
      </span>
      <CoverCardLabel title={`Side ${side.letter}`} subtitle={side.caption} />
    </button>
  );
}

function CardTile({ card, fluid, onActivate }: { card: CardRef; fluid: boolean; onActivate: () => void }) {
  const radio = card.style === "radio";
  return (
    <Tile
      thumb={card.thumb}
      round={radio}
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
      className={`flex h-14 w-full min-w-0 items-center gap-3 rounded-[10px] pl-2 pr-2 text-left motion-safe:transition-colors hover:bg-wash active:bg-pressed ${focusRing}`}
    >
      <Artwork src={track.thumb} size="h-10 w-10" radius="rounded-[4px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink-1">{track.title}</span>
        <span className="block truncate text-meta text-ink-2">{note ?? track.artist}</span>
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
      <div className="no-scrollbar shelf-row flex gap-3 overflow-x-auto pb-2">
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
      <ol>
        {section.items.map((item, index) => {
          if (!isTrack(item)) return null;
          const queue = section.items.flatMap((entry) => (isTrack(entry) ? [entry.track] : []));
          const position = section.items.slice(0, index).filter(isTrack).length;
          return (
            <li key={`${item.track.id}-${index}`} className="relative after:absolute after:bottom-0 after:left-[60px] after:right-3 after:h-px after:bg-separator last:after:hidden">
              <ListRow track={item.track} note={item.note} onActivate={() => playFromRow(queue, position)} />
            </li>
          );
        })}
      </ol>
    );
  }
  const fluid = section.layout === "mixes";
  const items = section.shelf ? section.shelf.items.map(fromShelfItem) : section.items;
  const layout = fluid ? "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" : "no-scrollbar shelf-row flex items-start gap-3 overflow-x-auto pb-3";
  return (
    <div className={layout}>
      {items.map((item, index) => (
        <ItemView key={`${item.kind}-${index}`} item={item} items={items} index={index} fluid={fluid} navigate={navigate} />
      ))}
    </div>
  );
}

export type PhoneSectionStyle = ShelfVariant | "songs";

const STYLE_BY_KIND: Partial<Record<SectionKind, PhoneSectionStyle>> = {
  "jump-back-in": "tile",
  "playlists-for-you": "large",
  "your-mixes": "large",
  stations: "large",
  "albums-for-you": "compact",
  "new-from-your-artists": "compact",
  "favorite-artists": "round",
  "heavy-rotation": "songs",
  "dust-off": "songs",
};

export function phoneSectionStyle(section: Pick<FeedSection, "kind" | "layout" | "title">): PhoneSectionStyle {
  const byKind = STYLE_BY_KIND[section.kind];
  if (byKind) return byKind;
  if (section.layout === "list") return "songs";
  if (section.layout === "circles") return "round";
  if (section.layout === "crate" || section.layout === "mixes" || section.layout === "radios") return "large";
  if (section.layout === "tiles") return "tile";
  if (/new releases/i.test(section.title)) return "compact";
  return "default";
}

export function featuredFrom(sections: readonly FeedSection[]): FeaturedItem | null {
  for (const section of sections) {
    if (section.layout === "crate" && section.playlists && section.playlists.length > 0) {
      const playlist = section.playlists[0];
      return {
        label: section.title,
        title: playlist.title,
        subtitle: playlist.subtitle,
        thumb: playlist.thumb,
        source: { type: "yt-playlist", playlistId: playlist.id, name: playlist.title },
        target: { name: "ytplaylist", param: playlist.id },
      };
    }
    const items = section.shelf ? section.shelf.items.map(fromShelfItem) : section.items;
    const first = items[0];
    if (first?.kind === "album") {
      return {
        label: section.title,
        title: first.album.title,
        subtitle: first.album.artist,
        thumb: first.album.thumb,
        source: { type: "album", albumId: first.album.id, name: first.album.title },
        target: { name: "album", param: first.album.id },
      };
    }
    if (first?.kind === "playlist") {
      return {
        label: section.title,
        title: first.playlist.title,
        subtitle: first.playlist.subtitle,
        thumb: first.playlist.thumb,
        source: { type: "yt-playlist", playlistId: first.playlist.id, name: first.playlist.title },
        target: { name: "ytplaylist", param: first.playlist.id },
      };
    }
  }
  return null;
}

type PhoneCard = {
  key: string;
  art: ReactNode;
  round?: boolean;
  tag?: string;
  title: string;
  subtitle?: string;
  menu?: MenuSource;
  onActivate: () => void;
};

function phoneCardOf(item: SectionItem, items: readonly SectionItem[], index: number, navigate: Navigate, variant: ShelfVariant): PhoneCard {
  const key = `${item.kind}-${index}`;
  switch (item.kind) {
    case "track": {
      const queue = items.flatMap((entry) => (isTrack(entry) ? [entry.track] : []));
      const position = items.slice(0, index).filter(isTrack).length;
      return {
        key,
        art: <PhoneShelfArt src={item.track.thumb} variant={variant} />,
        title: item.track.title,
        subtitle: item.track.artist,
        menu: () => trackMenuItems(songOf(item.track)),
        onActivate: () => playFromRow(queue, position),
      };
    }
    case "album":
      return {
        key,
        art: <PhoneShelfArt src={item.album.thumb} variant={variant} />,
        title: item.album.title,
        subtitle: item.album.artist,
        menu: () => browseMenuItems({ type: "album", browseId: item.album.id, title: item.album.title, subtitle: item.album.artist, thumb: item.album.thumb }),
        onActivate: () => navigate({ name: "album", param: item.album.id }),
      };
    case "artist":
      return {
        key,
        art: <PhoneShelfArt src={item.artist.thumb} variant={variant} round />,
        round: true,
        title: item.artist.name,
        menu: () => browseMenuItems({ type: "artist", browseId: item.artist.id, title: item.artist.name, subtitle: "", thumb: item.artist.thumb }),
        onActivate: () => navigate({ name: "artist", param: item.artist.id }),
      };
    case "playlist":
      return {
        key,
        art: <PhoneShelfArt src={item.playlist.thumb} variant={variant} />,
        title: item.playlist.title,
        subtitle: item.playlist.subtitle,
        menu: () => browseMenuItems({ type: "playlist", browseId: item.playlist.id, title: item.playlist.title, subtitle: item.playlist.subtitle, thumb: item.playlist.thumb }),
        onActivate: () => navigate({ name: "ytplaylist", param: item.playlist.id }),
      };
    case "card": {
      const radio = item.card.style === "radio";
      return {
        key,
        art: <PhoneShelfArt src={item.card.thumb} variant={variant} round={radio} />,
        round: radio,
        tag: radio ? "RADIO" : undefined,
        title: item.card.name,
        subtitle: item.card.caption,
        onActivate: () => void startPlaySource(item.card.source),
      };
    }
    case "side":
      return {
        key,
        art: (
          <span className="grid aspect-square w-full grid-cols-2 gap-px overflow-hidden rounded-[10px] [corner-shape:squircle]">
            {[0, 1, 2, 3].map((slot) => (
              <PhoneArt key={slot} src={thumbArtwork(item.side.thumbs[slot] ?? null, SIDE_ART) || null} radius="rounded-none" className="block aspect-square w-full" />
            ))}
          </span>
        ),
        title: `Side ${item.side.letter}`,
        subtitle: item.side.caption,
        onActivate: () => void startPlaySource(item.side.source),
      };
  }
}

function PhoneBody({ section, variant }: { section: FeedSection; variant: ShelfVariant }) {
  const navigate = useNavigation((state) => state.navigate);
  const cards: PhoneCard[] =
    section.layout === "crate" && section.playlists
      ? section.playlists.map((playlist) => ({
          key: playlist.id,
          art: <PhoneShelfArt src={playlist.thumb} variant={variant} />,
          title: playlist.title,
          subtitle: playlist.subtitle,
          onActivate: () => navigate({ name: "ytplaylist", param: playlist.id }),
        }))
      : (() => {
          const items = section.shelf ? section.shelf.items.map(fromShelfItem) : section.items;
          return items.map((item, index) => phoneCardOf(item, items, index, navigate, variant));
        })();
  return (
    <PhoneShelfRow variant={variant}>
      {cards.map((card) => (
        <PhoneShelfCard
          key={card.key}
          art={card.art}
          round={card.round}
          tag={card.tag}
          title={card.title}
          subtitle={card.subtitle}
          variant={variant}
          menu={card.menu}
          onActivate={card.onActivate}
        />
      ))}
    </PhoneShelfRow>
  );
}

function songOf(track: Track, note?: string): SearchSong {
  return {
    ...track,
    artist: note ?? track.artist,
    artistId: null,
    albumId: null,
    album: track.album ?? null,
    duration: 0,
    explicit: false,
    isVideo: false,
  };
}

function PhoneSongList({ section }: { section: FeedSection }) {
  const [expanded, setExpanded] = useState(false);
  const current = usePlayer((state) => currentTrack(state)?.id);
  const playing = usePlayer((state) => state.playing);
  const tracks = section.items.flatMap((item) => (isTrack(item) ? [item] : []));
  const queue = tracks.map((item) => item.track);
  const shown = expanded ? tracks : tracks.slice(0, SONG_PREVIEW);
  return (
    <>
      <ol>
        {shown.map((item, index) => {
          const song = songOf(item.track, item.note);
          return (
            <PhoneSongRow
              key={`${item.track.id}-${index}`}
              index={index}
              song={song}
              current={current === item.track.id}
              playing={playing}
              menu={() => trackMenuItems(song)}
              onPlay={() => playFromRow(queue, index)}
            />
          );
        })}
      </ol>
      {tracks.length > SONG_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`mt-1 flex h-11 items-center rounded-[10px] px-0 text-body font-medium text-ink-2 motion-safe:transition-colors hover:text-ink-1 ${focusRing}`}
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
    </>
  );
}

function PhoneSection({ section }: { section: FeedSection }) {
  const style = phoneSectionStyle(section);
  if (style === "songs") return <PhoneSongList section={section} />;
  return <PhoneBody section={section} variant={style} />;
}

export function FeedSectionView({ section }: { section: FeedSection }) {
  const titleId = useId();
  const tap = useHomeEngagement((state) => state.tap);
  const phone = usePhone();
  return (
    <section
      aria-labelledby={titleId}
      onClickCapture={(event) => {
        if (isControl(event.target)) tap(section.kind);
      }}
    >
      {section.eyebrow && <p className="mb-1 text-meta font-medium text-ink-2">{section.eyebrow.label}</p>}
      {phone ? <PhoneSectionHeader id={titleId} title={section.title} /> : <SectionHeader id={titleId} title={section.title} />}
      {section.subtitle && (
        <p className={phone ? "mb-3 text-meta leading-[17px] text-ink-2" : "-mt-1.5 mb-3 text-meta text-ink-2"}>
          {section.subtitle}
        </p>
      )}
      {phone ? <PhoneSection section={section} /> : <Body section={section} />}
    </section>
  );
}
