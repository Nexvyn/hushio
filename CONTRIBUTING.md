# Contributing to Hushio

Thanks for helping. This guide covers setting up the project, the checks a change must pass, and how pull requests get merged.

## Ways to help

- Report a bug with the [bug form](https://github.com/Nexvyn/hushio/issues/new?template=bug_report.yml). Include your Hushio version, your platform and the steps that cause it.
- Suggest a feature with the [feature form](https://github.com/Nexvyn/hushio/issues/new?template=feature_request.yml).
- Fix an open [issue](https://github.com/Nexvyn/hushio/issues). Comment on it first so two people don't work on the same thing.
- For a large change, such as a new screen or a new music source, open an issue to agree on the approach before you write the code.

## Set up

You need:

- Node.js 22 and pnpm 10. Use pnpm only. Don't commit a `package-lock.json`.
- Rust (stable) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your system.
- For Android: Android Studio with the SDK and NDK, Java 17, and the Rust targets `aarch64-linux-android`, `armv7-linux-androideabi` and `x86_64-linux-android`.

```sh
git clone https://github.com/Nexvyn/hushio.git
cd hushio
pnpm install
pnpm dev                 # desktop app with hot reload
pnpm tauri android dev   # Android, on a connected phone or emulator
```

## Project layout

| Folder | What is in it |
|---|---|
| `src/` | The React app shared by desktop and Android: `views/` for screens, `components/` for shared parts, `stores/` for Zustand state, `lib/` for logic such as search, playback and lyrics |
| `src/components/phone/` | The phone layout |
| `src-tauri/src/` | The Rust side: streaming, downloads, lyrics, local music, sync, updates and desktop integration |
| `src-tauri/tauri-plugin-hushio-player/` | The Kotlin plugin that plays audio on Android with Media3 |
| `src-tauri/gen/android/` | The Android project |
| `.github/workflows/` | `ci.yml` checks every push and pull request. `release.yml` builds the downloads |

## Checks

Run these before you open a pull request. CI runs the same checks on every pull request.

```sh
pnpm typecheck
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

If you change a screen, try it in the desktop app and in the phone layout, in both light and dark themes.

## Translating Hushio

The text lives in `src/lib/i18n/`. `en.ts` is the source of truth; every key you use must exist there.

1. Copy `src/lib/i18n/en.ts` to `src/lib/i18n/<code>.ts`, for example `fr.ts`, and type it as `Partial<Catalog>`.
2. Translate the values only. Keep the keys, the `{name}` placeholders and the `.one` and `.other` plural pairs.
3. Add the language to `LANGUAGES` and to `CATALOGS` in `src/lib/i18n/index.ts`.
4. Keep brand names and common app words in English where people use them that way, such as Playlist or Download. Never translate Hushio.
5. Run `pnpm typecheck` and `pnpm test`. The catalog tests fail on keys that do not exist in `en.ts`, and print the keys that are still in English.

## Code style

- TypeScript and React function components. Shared state lives in Zustand stores in `src/stores/`.
- Style with Tailwind classes.
- Write a comment only when the code can't explain itself, such as a workaround or a hidden constraint. Say why, not what.
- Icons come from `@phosphor-icons/react`. Desktop icons are 20 px with the `regular` weight. Phone icons are 24 px and go through `src/components/phone/PhoneIcon.tsx`. Use the `fill` weight only for active or selected states.
- Every animation must respect the system Reduce Motion setting.
- Every control needs a visible focus ring.
- Add or update tests next to the code you change (`*.test.ts` or `*.test.tsx` for the app, `tests.rs` modules for Rust).

## Commits and pull requests

- Write one-line commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) style, for example `fix(lyrics): keep the active line in view after a seek` or `feat(android): add a widget for the queue`.
- Keep a pull request to one topic. Small pull requests get reviewed faster.
- Describe what changed and how you tested it. Add screenshots or a short video for anything you can see.
- Link the issue it fixes, for example `Fixes #12`.

## Optional API keys

Some features need keys that are not in the repository:

| Feature | Where the key goes |
|---|---|
| Google sign-in and Drive backup | `HUSHIO_GOOGLE_CLIENT_ID` environment variable when you build |
| Connecting a Spotify account | `HUSHIO_SPOTIFY_CLIENT_ID` environment variable when you build |
| Last.fm scrobbling | `LASTFM_API_KEY` and `LASTFM_API_SECRET` in `src-tauri/src/scrobble/lastfm.rs` |
| Discord status | `DISCORD_CLIENT_ID` in `src-tauri/src/discord.rs` |

Use your own keys for local builds and never commit them. Without keys, these features don't work, and the rest of the app does.

## Building the Flatpak

The Flatpak repackages the released Linux `.deb`, so build it after the GitHub release exists. Install `flatpak`, `flatpak-builder` and `appstream` from your distribution, then run:

```sh
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y flathub org.gnome.Platform//48 org.gnome.Sdk//48
flatpak-builder --user --install --force-clean build-dir packaging/flatpak/dev.nexvyn.Hushio.yml
flatpak run dev.nexvyn.Hushio
appstreamcli validate --pedantic packaging/flatpak/dev.nexvyn.Hushio.metainfo.xml
```

For a new release, update the `url` and `sha256` of the `.deb` in the manifest and add the release to the `releases` list in the metainfo file. Submitting to Flathub is a separate step that is not done yet.

## Releases

Maintainers make releases. They bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, push to `main`, and run the release workflow with the new tag. The workflow builds every platform in parallel into a draft release and publishes it only when all builds and tests pass.

## License

Hushio is licensed under GPL-3.0. By contributing, you agree that your contribution is licensed under the same terms.
