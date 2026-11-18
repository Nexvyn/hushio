import type { View } from "../stores/navigation";
import { AlbumView } from "./AlbumView";
import { ArtistView } from "./ArtistView";
import { ChartsView } from "./ChartsView";
import { DaylistView } from "./DaylistView";
import { DiscographyView } from "./DiscographyView";
import { DownloadsView } from "./DownloadsView";
import { HistoryView } from "./HistoryView";
import { FolderView } from "./FolderView";
import { HomeView } from "./HomeView";
import { LibraryView } from "./LibraryView";
import { LikedView } from "./LikedView";
import { LocalMusicView } from "./LocalMusicView";
import { MatchedPlaylistView } from "./MatchedPlaylistView";
import { NewReleasesView } from "./NewReleasesView";
import { PlaylistView } from "./PlaylistView";
import { RemotePlaylistView } from "./RemotePlaylistView";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { ReplayView } from "./ReplayView";

export function CurrentView({ view }: { view: View }) {
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "charts":
      return <ChartsView />;
    case "newreleases":
      return <NewReleasesView />;
    case "search":
      return <SearchView />;
    case "library":
      return view.param === "liked" ? <LikedView /> : <LibraryView />;
    case "playlists":
      return <LibraryView />;
    case "playlist":
      return <PlaylistView />;
    case "folder":
      return <FolderView />;
    case "ytplaylist":
      return <RemotePlaylistView />;
    case "import":
      return <MatchedPlaylistView />;
    case "album":
      return <AlbumView />;
    case "artist":
      return <ArtistView />;
    case "discography":
      return <DiscographyView />;
    case "downloads":
      return <DownloadsView />;
    case "local":
      return <LocalMusicView />;
    case "daylist":
      return <DaylistView />;
    case "replay":
      return <ReplayView />;
    case "history":
      return <HistoryView />;
    case "settings":
      return <SettingsView />;
  }
}
