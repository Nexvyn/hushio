mod analysis;
mod cloud_payload;
mod deletion_sync;
mod disconnect;
mod downloads;
mod drive_sync;
mod google_auth;
mod launch;
mod local_library;
mod lyrics;
mod media_controls;
mod persist;
mod reveal;
mod stats;
mod stream;
mod sync_merge;
mod sync_queue;
mod taskbar;
mod tray;
mod window;
mod yt_data_api;
mod yt_innertube_auth;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tracing::Subscriber;
use tracing_subscriber::fmt::format::Writer;
use tracing_subscriber::fmt::{FmtContext, FormatEvent, FormatFields};
use tracing_subscriber::registry::LookupSpan;

const APP_NAME: &str = "Hushio";
const APP_SLUG: &str = "hushio";
const DATA_DIR_ENV: &str = "HUSHIO_DATA_DIR";
const ALLOW_MULTI_ENV: &str = "HUSHIO_ALLOW_MULTI";

struct DataPaths {
    root: PathBuf,
}

struct LogPrefix;

impl<S, N> FormatEvent<S, N> for LogPrefix
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &tracing::Event<'_>,
    ) -> std::fmt::Result {
        write!(writer, "[{APP_SLUG}] ")?;
        ctx.format_fields(writer.by_ref(), event)?;
        writeln!(writer)
    }
}

fn data_root(app: &AppHandle) -> tauri::Result<PathBuf> {
    if let Some(dir) = std::env::var_os(DATA_DIR_ENV) {
        return Ok(PathBuf::from(dir));
    }
    #[cfg(target_os = "linux")]
    {
        return Ok(app.path().data_dir()?.join(APP_SLUG));
    }
    #[cfg(not(target_os = "linux"))]
    {
        app.path().app_data_dir()
    }
}

fn ensure_install_marker(root: &std::path::Path) -> bool {
    let marker = root.join(format!(".{APP_SLUG}-install"));
    if marker.exists() {
        return false;
    }
    match std::fs::write(&marker, b"") {
        Ok(()) => {
            tracing::info!(path = %marker.display(), "created install marker");
            true
        }
        Err(error) => {
            tracing::warn!(%error, path = %marker.display(), "could not create install marker");
            false
        }
    }
}

fn prepare_data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    let root = data_root(app)?;
    let data = root.join("data");
    if let Err(error) = std::fs::create_dir_all(&data) {
        tracing::warn!(%error, path = %data.display(), "could not create data folder");
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(error) = std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))
        {
            tracing::warn!(%error, path = %root.display(), "could not restrict data folder");
        }
    }
    ensure_install_marker(&root);
    tracing::info!(path = %root.display(), "app data folder ready");
    Ok(root)
}

#[tauri::command]
async fn persist_read(
    state: State<'_, DataPaths>,
    name: String,
    owner: Option<String>,
) -> Result<Option<serde_json::Value>, String> {
    Ok(persist::read(&state.root, owner.as_deref().unwrap_or("guest"), &name).await)
}

#[tauri::command]
async fn persist_write(
    state: State<'_, DataPaths>,
    drive: State<'_, Arc<drive_sync::Drive>>,
    name: String,
    data: serde_json::Value,
    owner: Option<String>,
) -> Result<bool, String> {
    persist::write(
        &state.root,
        owner.as_deref().unwrap_or("guest"),
        &name,
        &data,
    )
    .await?;
    drive.notify_write(&name);
    Ok(true)
}

#[tauri::command]
fn drive_sync_status(drive: State<'_, Arc<drive_sync::Drive>>) -> drive_sync::Status {
    drive.status()
}

#[tauri::command]
fn drive_sync_now(app: AppHandle, drive: State<'_, Arc<drive_sync::Drive>>) -> drive_sync::Status {
    spawn_drive_sync(&app);
    drive.status()
}

fn spawn_drive_sync(app: &AppHandle) {
    let drive = app.state::<Arc<drive_sync::Drive>>().inner().clone();
    tauri::async_runtime::spawn(async move {
        drive.sync_now().await;
    });
}

#[tauri::command]
fn os_scroll_direction() -> Option<bool> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        let output = Command::new("reg")
            .args([
                "query",
                "HKCU\\Control Panel\\Desktop",
                "/v",
                "WheelScrollChars",
            ])
            .creation_flags(0x08000000)
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let line = text
            .lines()
            .find(|line| line.contains("WheelScrollChars"))?;
        let value = line
            .split("REG_SZ")
            .nth(1)?
            .trim()
            .split_whitespace()
            .next()?;
        let amount = value.parse::<i32>().ok()?;
        return Some(amount < 0);
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let output = Command::new("defaults")
            .args(["read", "-g", "com.apple.swipescrolldirection"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        return Some(text.trim() == "1");
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

#[tauri::command]
async fn stream_proxy_port(
    state: State<'_, stream::StreamProxy<stream::Registry>>,
) -> Result<u16, String> {
    state.start().await.map_err(|error| error.to_string())
}

#[tauri::command]
fn stream_register(
    state: State<'_, stream::Registry>,
    id: String,
    url: String,
) -> Result<(), String> {
    state.register(&id, &url).map_err(str::to_owned)
}

#[tauri::command]
async fn track_analysis(
    folders: State<'_, reveal::Folders>,
    source: String,
) -> Result<analysis::Analysis, String> {
    analysis::analyse_source(source, &folders).await
}

#[tauri::command]
async fn lyrics_get(
    state: State<'_, lyrics::Service>,
    meta: lyrics::LyricsMeta,
) -> Result<Option<lyrics::LyricsResult>, String> {
    Ok(state.get(meta).await)
}

fn allow_file(app: &AppHandle, path: &str) {
    if let Err(error) = app.asset_protocol_scope().allow_file(path) {
        tracing::warn!(%error, path, "could not allow file for playback");
    }
}

#[tauri::command]
async fn local_library_get(
    state: State<'_, local_library::Service>,
) -> Result<local_library::LocalLibrary, String> {
    Ok(state.library().await)
}

#[tauri::command]
async fn local_library_add_folders(
    state: State<'_, local_library::Service>,
    folders: State<'_, reveal::Folders>,
    paths: Vec<String>,
) -> Result<local_library::AddResult, String> {
    for path in &paths {
        folders.check(Path::new(path))?;
    }
    state.add_folders(paths).await
}

#[tauri::command]
async fn local_library_scan(
    state: State<'_, local_library::Service>,
    folders: State<'_, reveal::Folders>,
    filter_non_music: bool,
) -> Result<local_library::LocalLibrary, String> {
    state.scan(filter_non_music, &folders).await
}

#[tauri::command]
async fn local_library_remove_folder(
    state: State<'_, local_library::Service>,
    path: String,
) -> Result<local_library::LocalLibrary, String> {
    state.remove_folder(&path).await
}

#[tauri::command]
async fn local_library_rename_folder(
    state: State<'_, local_library::Service>,
    path: String,
    display_name: String,
) -> Result<local_library::LocalLibrary, String> {
    state.rename_folder(&path, &display_name).await
}

#[tauri::command]
async fn local_library_folder_statuses(
    state: State<'_, local_library::Service>,
) -> Result<Vec<local_library::FolderStatus>, String> {
    Ok(state.folder_statuses().await)
}

#[tauri::command]
async fn local_library_opened(
    state: State<'_, local_library::Service>,
) -> Result<Vec<local_library::LocalTrack>, String> {
    Ok(state.opened().await)
}

#[tauri::command]
async fn local_library_forget_opened(
    state: State<'_, local_library::Service>,
    id: String,
) -> Result<Vec<local_library::LocalTrack>, String> {
    state.forget_opened(&id).await
}

#[tauri::command]
async fn local_library_open_files(
    app: AppHandle,
    state: State<'_, local_library::Service>,
    folders: State<'_, reveal::Folders>,
    paths: Vec<String>,
) -> Result<local_library::OpenResult, String> {
    let result = state.open_files(paths).await?;
    for folder in &result.folders {
        reveal::approve_user_folder(&app, &folders, PathBuf::from(folder)).await?;
    }
    for track in &result.tracks {
        allow_file(&app, &track.path);
    }
    Ok(result)
}

#[tauri::command]
fn google_account_get(google: State<'_, Arc<google_auth::GoogleAuth>>) -> google_auth::GoogleAccount {
    google.account()
}

#[tauri::command]
async fn google_sign_in(
    app: AppHandle,
    google: State<'_, Arc<google_auth::GoogleAuth>>,
) -> Result<google_auth::GoogleAccount, String> {
    let account = google
        .sign_in(&google_auth::SystemBrowser(app.clone()))
        .await?;
    let _ = app.emit("google-auth-changed", &account);
    app.state::<Arc<drive_sync::Drive>>().resume();
    app.state::<Arc<YtEngine>>().resume();
    spawn_sync(&app, app.state::<Arc<YtEngine>>().inner().clone());
    spawn_drive_sync(&app);
    Ok(account)
}

type YtEngine = sync_queue::Engine<Arc<google_auth::GoogleAuth>>;

fn emit_sync(app: &AppHandle, event: sync_queue::Event) {
    match event {
        sync_queue::Event::Progress(status) => {
            let _ = app.emit("yt-sync-progress", status);
        }
        sync_queue::Event::Linked {
            local_playlist_id,
            yt_playlist_id,
        } => {
            let _ = app.emit(
                "yt-playlist-linked",
                serde_json::json!({ "localPlaylistId": local_playlist_id, "ytPlaylistId": yt_playlist_id }),
            );
        }
    }
}

fn spawn_sync(app: &AppHandle, engine: Arc<YtEngine>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let emit = move |event: sync_queue::Event| emit_sync(&app, event);
        engine.run(&emit).await;
    });
}

#[tauri::command]
async fn yt_sync_status(engine: State<'_, Arc<YtEngine>>) -> Result<sync_queue::Status, String> {
    Ok(engine.status().await)
}

#[tauri::command]
async fn yt_sync_now(
    app: AppHandle,
    engine: State<'_, Arc<YtEngine>>,
) -> Result<sync_queue::Status, String> {
    spawn_sync(&app, engine.inner().clone());
    Ok(engine.status().await)
}

#[tauri::command]
async fn yt_enqueue(
    app: AppHandle,
    engine: State<'_, Arc<YtEngine>>,
    jobs: Vec<sync_queue::JobInput>,
) -> Result<(), String> {
    engine.enqueue(jobs).await?;
    spawn_sync(&app, engine.inner().clone());
    Ok(())
}

#[tauri::command]
fn yt_tv_status(tv: State<'_, Arc<yt_innertube_auth::Innertube>>) -> yt_innertube_auth::TvStatus {
    tv.status()
}

#[tauri::command]
async fn yt_tv_connect(
    app: AppHandle,
    tv: State<'_, Arc<yt_innertube_auth::Innertube>>,
) -> Result<yt_innertube_auth::TvStatus, String> {
    let emit = |code: yt_innertube_auth::TvCode| {
        let _ = app.emit("yt-tv-code", code);
    };
    if tv.connect(&emit).await? {
        spawn_sync(&app, app.state::<Arc<YtEngine>>().inner().clone());
    }
    Ok(tv.status())
}

#[tauri::command]
fn yt_tv_cancel(tv: State<'_, Arc<yt_innertube_auth::Innertube>>) -> bool {
    tv.cancel()
}

#[tauri::command]
async fn yt_tv_disconnect(
    tv: State<'_, Arc<yt_innertube_auth::Innertube>>,
) -> Result<yt_innertube_auth::TvStatus, String> {
    tv.disconnect().await
}

#[tauri::command]
fn yt_tv_open(app: AppHandle) -> Result<(), String> {
    use google_auth::Browser;
    google_auth::SystemBrowser(app).open(yt_innertube_auth::VERIFICATION_URL)
}

#[tauri::command]
fn google_sign_in_cancel(google: State<'_, Arc<google_auth::GoogleAuth>>) -> bool {
    google.cancel_sign_in()
}

#[tauri::command]
async fn google_sign_out(
    google: State<'_, Arc<google_auth::GoogleAuth>>,
) -> Result<google_auth::GoogleAccount, String> {
    Ok(google.sign_out().await)
}

async fn keep_google_session(app: AppHandle, google: Arc<google_auth::GoogleAuth>) {
    loop {
        match google.resume().await {
            google_auth::Resume::Nothing => return,
            google_auth::Resume::Ready(account) => {
                let _ = app.emit("google-auth-changed", &account);
                spawn_sync(&app, app.state::<Arc<YtEngine>>().inner().clone());
                spawn_drive_sync(&app);
                return;
            }
            google_auth::Resume::SignedOut(account) => {
                let _ = app.emit("google-auth-changed", &account);
                return;
            }
            google_auth::Resume::Retry => tokio::time::sleep(google_auth::REFRESH_RETRY).await,
        }
    }
}

#[tauri::command]
async fn local_library_track_path(
    state: State<'_, local_library::Service>,
    id: String,
) -> Result<Option<String>, String> {
    Ok(state.track_path(&id).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .event_format(LogPrefix)
        .with_max_level(tracing::Level::INFO)
        .init();
    media_controls::set_app_id();

    let mut builder = tauri::Builder::<tauri::Wry>::default();
    if std::env::var(ALLOW_MULTI_ENV).ok().as_deref() != Some("1") {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            launch::receive(app, &argv, std::path::Path::new(&cwd));
            window::show_main(app);
        }));
    }
    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(window::state_plugin())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .on_window_event(window::on_window_event)
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                window::on_navigation_started(webview.app_handle());
            }
        })
        .register_uri_scheme_protocol("localart", |context, request| {
            let art_dir = context.app_handle().state::<local_library::Service>().art_dir();
            local_library::serve_art(&art_dir, request.uri().path())
        })
        .setup(|app| {
            let root = prepare_data_dir(app.handle())?;
            let default_dir = app.path().download_dir()?.join(APP_NAME);
            let export_dir = app.path().audio_dir().ok().map(|dir| dir.join(APP_NAME));
            let folders = tauri::async_runtime::block_on(reveal::Folders::open(
                &root,
                default_dir.clone(),
                export_dir,
            ));
            folders.approve_library(tauri::async_runtime::block_on(local_library::stored_folder_paths(&root)));
            reveal::allow_picked(app.handle(), &folders)?;
            app.manage(folders);
            let local = tauri::async_runtime::block_on(local_library::Service::load(root.clone()));
            app.manage(local);
            let stats_root = root.clone();
            let sync_root = root.clone();
            let drive_root = root.clone();
            app.manage(DataPaths { root });
            app.manage(tray::Tray::default());
            app.manage(window::Glass::default());
            tray::setup(app.handle());
            taskbar::setup(app.handle());
            let controls = media_controls::Controls::default();
            controls.install(app.handle());
            app.manage(controls);
            app.manage(launch::Pending::default());
            launch::register_scheme(app.handle());
            let argv: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            launch::receive(app.handle(), &argv, &cwd);
            window::restore_main(app.handle());
            window::apply_glass(app.handle());
            let registry = stream::Registry::default();
            app.manage(registry.clone());
            let proxy = stream::StreamProxy::new(registry);
            tauri::async_runtime::block_on(proxy.start())?;
            app.manage(proxy);
            app.manage(lyrics::Service::new()?);
            app.manage(downloads::Downloads::new(app.handle().clone(), default_dir));
            let stats = Arc::new(tauri::async_runtime::block_on(stats::Service::load(stats_root)));
            tauri::async_runtime::spawn(stats.clone().run_flush());
            app.manage(stats);
            let google = Arc::new(google_auth::GoogleAuth::new(
                google_auth::OAuthConfig::production(),
                Arc::new(google_auth::KeyringStore),
            ));
            app.manage(google.clone());
            let tv = Arc::new(yt_innertube_auth::Innertube::new(
                yt_innertube_auth::TvConfig::production(),
                Arc::new(google_auth::KeyringSlot(yt_innertube_auth::TV_TOKEN_SLOT)),
            ));
            app.manage(tv.clone());
            let engine = tauri::async_runtime::block_on(sync_queue::Engine::load(
                sync_root,
                yt_data_api::API_BASE,
                google.clone(),
                tv,
            ));
            app.manage(Arc::new(engine));
            let status_app = app.handle().clone();
            let drive = Arc::new(drive_sync::DriveSync::new(
                drive_root,
                drive_sync::DRIVE_BASE,
                google.clone(),
                drive_sync::http_client(),
                Box::new(move |status: &drive_sync::Status| {
                    let _ = status_app.emit("drive-sync-progress", status);
                }),
            ));
            app.manage(drive.clone());
            tauri::async_runtime::spawn(drive.run());
            tauri::async_runtime::spawn(keep_google_session(app.handle().clone(), google));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            os_scroll_direction,
            persist_read,
            persist_write,
            stream_proxy_port,
            stream_register,
            lyrics_get,
            track_analysis,
            download_start,
            download_cancel,
            download_queue,
            reveal::folder_pick,
            reveal::path_exists,
            reveal::reveal_path,
            reveal::open_folder,
            local_library_get,
            local_library_add_folders,
            local_library_scan,
            local_library_remove_folder,
            local_library_rename_folder,
            local_library_folder_statuses,
            local_library_opened,
            local_library_forget_opened,
            local_library_open_files,
            local_library_track_path,
            playback_event,
            replay_summary,
            replay_journal,
            replay_export,
            replay_import,
            google_account_get,
            google_sign_in,
            google_sign_in_cancel,
            google_sign_out,
            yt_sync_status,
            yt_sync_now,
            yt_enqueue,
            yt_tv_status,
            yt_tv_connect,
            yt_tv_cancel,
            yt_tv_disconnect,
            yt_tv_open,
            drive_sync_status,
            drive_sync_now,
            disconnect::erase_stop_sync,
            disconnect::erase_resume_sync,
            disconnect::erase_drive_files,
            disconnect::erase_youtube_playlists,
            disconnect::erase_revoke,
            disconnect::erase_keyring,
            disconnect::erase_local_data,
            tray::tray_set_playing,
            media_controls::media_set_track,
            media_controls::media_set_playing,
            media_controls::media_set_position,
            media_controls::media_clear,
            window::window_intro_done,
            window::window_set_reduce_transparency,
            launch::launch_take
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { .. } = event {
            app.state::<downloads::Downloads<AppHandle>>().abandon();
            let drive = app.state::<Arc<drive_sync::Drive>>();
            let _ = tauri::async_runtime::block_on(tokio::time::timeout(drive_sync::QUIT_FLUSH, drive.flush()));
            tauri::async_runtime::block_on(app.state::<Arc<stats::Service>>().flush());
        }
    });
}

#[tauri::command]
fn playback_event(stats: State<'_, Arc<stats::Service>>, event: stats::PlaybackEvent) -> Result<(), String> {
    stats.playback(&event, chrono::Local::now())
}

#[tauri::command]
fn replay_summary(stats: State<'_, Arc<stats::Service>>, period: String) -> serde_json::Value {
    stats.replay_summary(&period, chrono::Local::now())
}

#[tauri::command]
fn replay_journal(stats: State<'_, Arc<stats::Service>>) -> Vec<stats::JournalEntry> {
    stats.journal()
}

#[tauri::command]
fn replay_export(stats: State<'_, Arc<stats::Service>>) -> Vec<serde_json::Value> {
    stats.export()
}

#[tauri::command]
async fn replay_import(stats: State<'_, Arc<stats::Service>>, buckets: Vec<serde_json::Value>) -> Result<(), String> {
    stats.import(&buckets).await
}

#[tauri::command]
fn download_start(
    state: State<'_, downloads::Downloads<AppHandle>>,
    folders: State<'_, reveal::Folders>,
    track: downloads::TrackInfo,
    url: String,
    dir: Option<String>,
    export_compat: Option<bool>,
) -> Result<(), String> {
    downloads::require_https(&url)?;
    let dir = reveal::target_dir(&folders, export_compat == Some(true), dir.map(PathBuf::from))?;
    state.enqueue(track, url, dir)
}

#[tauri::command]
fn download_cancel(state: State<'_, downloads::Downloads<AppHandle>>, id: String) -> bool {
    state.cancel(&id)
}

#[tauri::command]
fn download_queue(state: State<'_, downloads::Downloads<AppHandle>>) -> Vec<downloads::QueueRow> {
    state.queue()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct Buffer(Arc<Mutex<Vec<u8>>>);

    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().expect("lock").extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn log_lines_start_with_slug_prefix() {
        let buffer = Buffer::default();
        let writer = buffer.clone();
        let subscriber = tracing_subscriber::fmt()
            .event_format(LogPrefix)
            .with_writer(move || writer.clone())
            .finish();
        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("app data folder ready");
        });
        let output = String::from_utf8(buffer.0.lock().expect("lock").clone()).expect("utf8");
        assert!(output.starts_with("[hushio] "), "{output}");
    }

    #[test]
    fn install_marker_is_created_once() {
        let root = tempfile::tempdir().expect("temp dir");
        assert!(ensure_install_marker(root.path()));
        assert!(root.path().join(".hushio-install").exists());
        assert!(!ensure_install_marker(root.path()));
    }
}
