# Hushio

A free music player for Windows, macOS and Android, with Linux builds from source. No ads, no account needed, and no servers of its own: your library, playlists and settings live on your device.

## Features

### Listening
- Search songs, albums, artists, playlists and videos, with suggestions as you type and recent searches.
- Search online, in your own music on the device, or in add-on sources.
- A queue with drag to reorder, swipe to remove, play next, shuffle, repeat and endless Autoplay of similar songs.
- Start a radio from any song.
- Crossfade on desktop, playback speed and a sleep timer that can stop at the end of a song.
- Streaming quality you can set separately for Wi-Fi and mobile data, plus a data saver.

### Discover
- Home with quick picks, a featured playlist, recent plays and shelves made for you.
- Charts (Hotlist on the phone), New releases and a Daylist that changes through the day.
- Artist pages with top songs, albums, singles and an About card.
- Replay, a yearly and monthly recap of what you listened to.
- Listening History, grouped by day, with remove from history.

### Library
- Liked Songs, playlists and followed artists, shown as a grid or a list.
- Create, rename, reorder and pin playlists. Filter long playlists and albums by title or artist.
- Import from a text list, CSV, a playlist link, Apple Music or Spotify (matched to Hushio's own catalogue). Export a playlist as M3U8 or JSON.
- Downloads for offline listening, with Wi-Fi only downloads and downloaded playlists kept up to date.
- Your own music folders, and music on network shares.

### Lyrics
- Synced lyrics from several sources, with word-by-word highlighting.
- Translations when the lyrics include them, and romanised text for other scripts.
- Lyrics timing adjustment per song.

### Now Playing
- Swipe the cover to skip, double-tap to like, swipe up for lyrics and swipe down to close.
- Animated covers when available.
- Song info, Share, Add to playlist and Download from the song menu.
- Cast to Chromecast and Google TV devices.

### Sound
- Equaliser with presets, loudness levelling and skip silence.

### Desktop
- Spotify-style layout with a library sidebar, a right panel with the current song and the queue, and a player bar.
- Media keys, a mini player, a tray icon and keyboard shortcuts.
- Discord status (optional).

### Android
- Background playback with notification and lock-screen controls (play, pause, next, previous, like).
- Home-screen widgets in three sizes.
- Android Auto.
- Gestures throughout: long-press for menus, swipe rows to queue or like, pull to refresh, edge swipe back.
- Built-in update check.

### Accounts and sync (all optional)
- Google sign-in to sync playlists and back up your library to your own Google Drive.
- Scrobbling to Last.fm and ListenBrainz.
- Backup export and import.

### Look and feel
- Light, dark or system theme, with a calm white design and one accent colour.
- Every animation respects the system Reduce Motion setting.

## Install

Download the latest build from the Releases page:

| Platform | File |
|---|---|
| Windows 10 and 11 | `Hushio_<version>_x64-setup.exe` |
| macOS | `Hushio_<version>_aarch64.dmg` |
| Android 8 and later | `app-universal-release.apk` |

Linux has no ready-made download yet; build it from source.

On Android, allow "Install unknown apps" for your browser or file manager when asked.

## Build from source

You need Node.js 22, pnpm 10, Rust (stable) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your system. Android builds also need Android Studio's SDK and NDK, and Java 17.

```sh
pnpm install
pnpm dev            # run the desktop app
pnpm test           # frontend tests
pnpm tauri build    # desktop installer
pnpm android:apk    # Android APKs
```

Rust tests: `cargo test` inside `src-tauri`.

## Privacy

Hushio has no analytics and no servers. Settings, library and listening stats are stored in the app's data folder. If you sign in with Google, the app talks to Google directly with your own account, and you can disconnect and erase everything from Settings.

## License

GPL-3.0. See [LICENSE](LICENSE).
