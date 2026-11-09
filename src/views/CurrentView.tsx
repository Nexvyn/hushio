import type { View } from "../stores/navigation";
import { AlbumView } from "./AlbumView";
import { ArtistView } from "./ArtistView";
import { DownloadsView } from "./DownloadsView";
import { ExploreView } from "./ExploreView";
import { FolderView } from "./FolderView";
import { HomeView } from "./HomeView";
import { LibraryView } from "./LibraryView";
import { LikedView } from "./LikedView";
import { LocalMusicView } from "./LocalMusicView";
import { MatchedPlaylistView } from "./MatchedPlaylistView";
import { MoodView } from "./MoodView";
import { PlaylistView } from "./PlaylistView";
import { PodcastsView } from "./PodcastsView";
import { PodcastView } from "./PodcastView";
import { RemotePlaylistView } from "./RemotePlaylistView";
import { ReplayView } from "./ReplayView";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";

export function CurrentView({ view }: { view: View }) {
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "explore":
      return <ExploreView />;
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
    case "downloads":
      return <DownloadsView />;
    case "local":
      return <LocalMusicView />;
    case "replay":
      return <ReplayView />;
    case "podcast":
      return view.param ? <PodcastView /> : null;
    case "podcasts":
      return <PodcastsView />;
    case "mood":
      return view.param ? <MoodView /> : null;
    case "settings":
      return <SettingsView />;
  }
}
