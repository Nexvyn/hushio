# Hushio

A free music player for Windows, macOS and Android, with Linux builds from source. No ads, no account needed, and no servers of its own: your library, playlists and settings live on your device.

## What it does

- Search songs, albums, artists and playlists, and play them with a queue, shuffle, repeat and endless AutoPlay.
- Liked songs, playlists and folders. Import from a text list, CSV, a playlist link or Apple Music. Export a playlist as M3U8 or JSON.
- Synced lyrics from several sources, with a full-screen view.
- Crossfade, equaliser, loudness levelling, skip silence, playback speed and a sleep timer.
- Downloads for offline listening, and your own music folders.
- Optional Google sign-in to sync playlists and back up your library to your own Google Drive.
- Media keys, a mini player and a tray icon on desktop. Lock-screen controls and background playback on Android.

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
