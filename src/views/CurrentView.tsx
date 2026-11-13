import type { View } from "../stores/navigation";
import { AlbumView } from "./AlbumView";
import { ArtistView } from "./ArtistView";
import { ChartsView } from "./ChartsView";
import { DownloadsView } from "./DownloadsView";
import { ExploreView } from "./ExploreView";
import { FolderView } from "./FolderView";
import { HomeView } from "./HomeView";
import { LibraryView } from "./LibraryView";
import { LikedView } from "./LikedView";
import { ListenTogetherView } from "./ListenTogetherView";
import { LocalMusicView } from "./LocalMusicView";
import { MatchedPlaylistView } from "./MatchedPlaylistView";
import { MoodView } from "./MoodView";
import { NewReleasesView } from "./NewReleasesView";
import { PlaylistView } from "./PlaylistView";
import { PodcastsView } from "./PodcastsView";
import { PodcastView } from "./PodcastView";
import { RemotePlaylistView } from "./RemotePlaylistView";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { SmartPlaylistView } from "./SmartPlaylistView";
import { DuplicatesView } from "./DuplicatesView";

export function CurrentView({ view }: { view: View }) {
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "explore":
      return <ExploreView />;
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
    case "downloads":
      return <DownloadsView />;
    case "local":
      return <LocalMusicView />;
    case "listen":
      return <ListenTogetherView />;
    case "podcast":
      return view.param ? <PodcastView /> : null;
    case "podcasts":
      return <PodcastsView />;
    case "mood":
      return view.param ? <MoodView /> : null;
    case "smart":
      return <SmartPlaylistView />;
    case "duplicates":
      return <DuplicatesView />;
    case "settings":
      return <SettingsView />;
  }
}
