use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

use crate::persist;

const APPROVED_STORE: &str = "approved-dirs";
const DEVICE_OWNER: &str = "guest";
const OUTSIDE: &str = "Path is not in an approved folder";

pub struct Folders {
    root: PathBuf,
    default_dir: PathBuf,
    export_dir: Option<PathBuf>,
    picked: Mutex<Vec<PathBuf>>,
    library: Mutex<Vec<PathBuf>>,
}

impl Folders {
    pub async fn open(root: &Path, default_dir: PathBuf, export_dir: Option<PathBuf>) -> Self {
        let picked = read_picked(root).await;
        Self {
            root: root.to_path_buf(),
            default_dir,
            export_dir,
            picked: Mutex::new(picked),
            library: Mutex::new(Vec::new()),
        }
    }

    pub fn default_dir(&self) -> &Path {
        &self.default_dir
    }

    pub fn export_dir(&self) -> Option<&Path> {
        self.export_dir.as_deref()
    }

    pub fn picked(&self) -> Vec<PathBuf> {
        lock(&self.picked).clone()
    }

    pub fn approve_library(&self, paths: Vec<PathBuf>) {
        *lock(&self.library) = paths;
    }

    pub fn user_dirs(&self) -> Vec<PathBuf> {
        let mut dirs = self.picked();
        dirs.extend(lock(&self.library).iter().cloned());
        dirs
    }

    pub async fn remember(&self, path: PathBuf) -> Result<(), String> {
        resolve(&path)?;
        let mut next = self.picked();
        if !next.contains(&path) {
            next.push(path);
        }
        let data = serde_json::to_value(&next).map_err(|error| error.to_string())?;
        persist::write(&self.root, DEVICE_OWNER, APPROVED_STORE, &data).await?;
        *lock(&self.picked) = next;
        Ok(())
    }

    #[cfg(not(desktop))]
    pub async fn approve_tree(&self, uri: String) -> Result<(), String> {
        if !crate::tree_library::is_tree_uri(&uri) {
            return Err(OUTSIDE.to_owned());
        }
        let path = PathBuf::from(&uri);
        let mut next = self.picked();
        if !next.contains(&path) {
            next.push(path);
        }
        let data = serde_json::to_value(&next).map_err(|error| error.to_string())?;
        persist::write(&self.root, DEVICE_OWNER, APPROVED_STORE, &data).await?;
        *lock(&self.picked) = next;
        Ok(())
    }

    pub fn check(&self, path: &Path) -> Result<(), String> {
        if crate::tree_library::is_tree_uri(&path.to_string_lossy()) {
            return if self.picked().iter().any(|item| item.as_path() == path) {
                Ok(())
            } else {
                Err(OUTSIDE.to_owned())
            };
        }
        let target = resolve(path)?;
        let inside = self
            .roots()
            .iter()
            .filter_map(|root| resolve(root).ok())
            .any(|root| target.starts_with(root));
        if inside {
            Ok(())
        } else {
            Err(OUTSIDE.to_owned())
        }
    }

    fn roots(&self) -> Vec<PathBuf> {
        let mut roots = vec![self.root.clone(), self.default_dir.clone()];
        roots.extend(self.export_dir.clone());
        roots.extend(self.user_dirs());
        roots
    }
}

async fn read_picked(root: &Path) -> Vec<PathBuf> {
    let Some(value) = persist::read(root, DEVICE_OWNER, APPROVED_STORE).await else {
        return Vec::new();
    };
    match serde_json::from_value(value) {
        Ok(paths) => paths,
        Err(error) => {
            tracing::warn!(%error, "approved folders store is not a list of paths");
            Vec::new()
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().expect("approved folders lock")
}

fn resolve(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Path must be absolute".to_owned());
    }
    if path.components().any(|part| matches!(part, Component::ParentDir)) {
        return Err("Path must not contain \"..\"".to_owned());
    }
    let mut tail = Vec::new();
    let mut current = path;
    loop {
        match std::fs::canonicalize(current) {
            Ok(base) => return Ok(tail.iter().rev().fold(base, |acc, name| acc.join(name))),
            Err(error) if std::fs::symlink_metadata(current).is_ok() => {
                return Err(format!("Path is a broken link: {error}"));
            }
            Err(_) => {
                let (Some(parent), Some(name)) = (current.parent(), current.file_name()) else {
                    return Err(OUTSIDE.to_owned());
                };
                tail.push(name);
                current = parent;
            }
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct Invocation {
    pub program: &'static str,
    pub args: Vec<OsString>,
}

fn quoted(path: &Path) -> OsString {
    OsString::from(format!("\"{}\"", path.display()))
}

fn xdg_open(path: &Path) -> Invocation {
    Invocation {
        program: "xdg-open",
        args: vec![path.as_os_str().to_owned()],
    }
}

pub fn reveal_invocation(os: &str, path: &Path) -> Option<Invocation> {
    match os {
        "windows" => {
            let mut arg = OsString::from("/select,");
            arg.push(quoted(path));
            Some(Invocation {
                program: "explorer",
                args: vec![arg],
            })
        }
        "linux" => Some(xdg_open(path.parent()?)),
        "macos" => Some(Invocation {
            program: "open",
            args: vec![OsString::from("-R"), path.as_os_str().to_owned()],
        }),
        _ => None,
    }
}

pub fn open_invocation(os: &str, dir: &Path) -> Option<Invocation> {
    match os {
        "windows" => Some(Invocation {
            program: "explorer",
            args: vec![quoted(dir)],
        }),
        "linux" => Some(xdg_open(dir)),
        "macos" => Some(Invocation {
            program: "open",
            args: vec![dir.as_os_str().to_owned()],
        }),
        _ => None,
    }
}

#[cfg(windows)]
fn run(invocation: Invocation) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    let mut command = Command::new(invocation.program);
    for arg in &invocation.args {
        command.raw_arg(arg);
    }
    command.spawn().map(drop).map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn run(invocation: Invocation) -> Result<(), String> {
    Command::new(invocation.program)
        .args(&invocation.args)
        .spawn()
        .map(drop)
        .map_err(|error| error.to_string())
}

pub fn allow_asset(app: &AppHandle, path: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(path, true)
        .map_err(|error| error.to_string())
}

pub fn allow_picked(app: &AppHandle, folders: &Folders) -> Result<(), String> {
    folders
        .user_dirs()
        .iter()
        .try_for_each(|dir| allow_asset(app, dir))
}

pub async fn approve_user_folder(app: &AppHandle, folders: &Folders, path: PathBuf) -> Result<(), String> {
    folders.remember(path.clone()).await?;
    allow_asset(app, &path)
}

pub fn remove_download(folders: &Folders, path: &str) -> Result<(), String> {
    let path = PathBuf::from(path);
    folders.check(&path)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn approved_path(folders: &Folders, path: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    folders.check(&path)?;
    Ok(path)
}

pub fn target_dir(
    folders: &Folders,
    export: bool,
    dir: Option<PathBuf>,
) -> Result<Option<PathBuf>, String> {
    if export {
        return folders
            .export_dir()
            .map(|dir| Some(dir.to_path_buf()))
            .ok_or_else(|| "Music folder is not available".to_owned());
    }
    match dir {
        Some(dir) => {
            folders.check(&dir)?;
            Ok(Some(dir))
        }
        None => Ok(None),
    }
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn folder_pick(
    _app: AppHandle,
    folders: State<'_, Folders>,
    _title: Option<String>,
) -> Result<Option<String>, String> {
    let Some(uri) = crate::android::pick_tree().await? else {
        return Ok(None);
    };
    folders.approve_tree(uri.clone()).await?;
    Ok(Some(uri))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn folder_pick(
    app: AppHandle,
    folders: State<'_, Folders>,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(title.as_deref().unwrap_or("Choose download folder"))
        .pick_folder(move |picked| {
            let _ = sender.send(picked);
        });
    let Some(picked) = receiver.await.map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    approve_user_folder(&app, &folders, path.clone()).await?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
pub fn path_exists(folders: State<'_, Folders>, path: String) -> Result<bool, String> {
    let path = approved_path(&folders, path)?;
    Ok(path.is_file())
}

#[tauri::command]
pub fn reveal_path(folders: State<'_, Folders>, path: String) -> Result<(), String> {
    let path = approved_path(&folders, path)?;
    let invocation = reveal_invocation(std::env::consts::OS, &path)
        .ok_or_else(|| "Showing files is not supported on this system".to_owned())?;
    run(invocation)
}

#[tauri::command]
pub fn open_folder(folders: State<'_, Folders>, path: Option<String>) -> Result<(), String> {
    let dir = match path {
        Some(path) => approved_path(&folders, path)?,
        None => folders.default_dir().to_path_buf(),
    };
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let invocation = open_invocation(std::env::consts::OS, &dir)
        .ok_or_else(|| "Opening folders is not supported on this system".to_owned())?;
    run(invocation)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn data_root(base: &Path) -> PathBuf {
        base.join("data")
    }

    fn download_dir(base: &Path) -> PathBuf {
        base.join("Downloads").join("Hushio")
    }

    fn music_dir(base: &Path) -> PathBuf {
        base.join("Music").join("Hushio")
    }

    async fn folders_in(base: &Path) -> Folders {
        Folders::open(&data_root(base), download_dir(base), Some(music_dir(base))).await
    }

    fn link_dir(target: &Path, link: &Path) -> std::io::Result<()> {
        #[cfg(windows)]
        {
            std::os::windows::fs::symlink_dir(target, link).or_else(|_| {
                let status = Command::new("cmd")
                    .arg("/C")
                    .arg("mklink")
                    .arg("/J")
                    .arg(link)
                    .arg(target)
                    .status()?;
                if status.success() {
                    Ok(())
                } else {
                    Err(std::io::Error::other("mklink /J failed"))
                }
            })
        }
        #[cfg(not(windows))]
        {
            std::os::unix::fs::symlink(target, link)
        }
    }

    #[test]
    fn reveal_on_windows_selects_the_file_in_explorer() {
        let invocation = reveal_invocation("windows", Path::new(r"C:\Music Downloads\Artist - Title.m4a"));
        assert_eq!(
            invocation,
            Some(Invocation {
                program: "explorer",
                args: vec![OsString::from(r#"/select,"C:\Music Downloads\Artist - Title.m4a""#)],
            })
        );
    }

    #[test]
    fn reveal_on_linux_opens_the_parent_folder() {
        let invocation = reveal_invocation("linux", Path::new("/home/me/Music/Hushio/Artist - Title.m4a"));
        assert_eq!(
            invocation,
            Some(Invocation {
                program: "xdg-open",
                args: vec![OsString::from("/home/me/Music/Hushio")],
            })
        );
    }

    #[test]
    fn open_folder_passes_the_directory_itself() {
        assert_eq!(
            open_invocation("windows", Path::new(r"C:\Downloads\Hushio")),
            Some(Invocation {
                program: "explorer",
                args: vec![OsString::from(r#""C:\Downloads\Hushio""#)],
            })
        );
        assert_eq!(
            open_invocation("linux", Path::new("/srv/Hushio")),
            Some(Invocation {
                program: "xdg-open",
                args: vec![OsString::from("/srv/Hushio")],
            })
        );
    }

    #[test]
    fn macos_reveals_the_file_and_opens_the_folder_with_open() {
        assert_eq!(
            reveal_invocation("macos", Path::new("/a/b.m4a")),
            Some(Invocation {
                program: "open",
                args: vec![OsString::from("-R"), OsString::from("/a/b.m4a")],
            })
        );
        assert_eq!(
            open_invocation("macos", Path::new("/a")),
            Some(Invocation {
                program: "open",
                args: vec![OsString::from("/a")],
            })
        );
    }

    #[test]
    fn unsupported_platforms_build_no_command() {
        assert_eq!(reveal_invocation("freebsd", Path::new("/a/b.m4a")), None);
        assert_eq!(open_invocation("freebsd", Path::new("/a")), None);
    }

    #[tokio::test]
    async fn remove_download_deletes_a_file_inside_an_approved_folder_only() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        let inside = download_dir(base.path()).join("Artist - Title.m4a");
        std::fs::create_dir_all(download_dir(base.path())).expect("dir");
        std::fs::write(&inside, b"audio").expect("file");
        let outside = base.path().join("elsewhere.m4a");
        std::fs::write(&outside, b"audio").expect("file");
        assert!(remove_download(&folders, &outside.to_string_lossy()).is_err());
        assert!(outside.exists());
        remove_download(&folders, &inside.to_string_lossy()).expect("removed");
        assert!(!inside.exists());
    }

    #[tokio::test]
    async fn approved_folder_and_its_contents_are_allowed() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        let dir = download_dir(base.path());
        assert!(folders.check(&dir).is_ok());
        assert!(folders.check(&dir.join("Artist - Title.m4a")).is_ok());
        assert!(folders.check(&music_dir(base.path()).join("a.m4a")).is_ok());
        assert!(folders.check(&data_root(base.path()).join("settings.json")).is_ok());
    }

    #[tokio::test]
    async fn sibling_and_parent_folders_are_refused() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        let sibling = base.path().join("Downloads").join("Hushio2").join("a.m4a");
        let parent = base.path().join("Downloads").join("a.m4a");
        assert_eq!(folders.check(&sibling), Err(OUTSIDE.to_owned()));
        assert_eq!(folders.check(&parent), Err(OUTSIDE.to_owned()));
    }

    #[tokio::test]
    async fn dot_dot_escape_is_refused() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        let escape = download_dir(base.path()).join("..").join("secret.m4a");
        assert_eq!(
            folders.check(&escape),
            Err("Path must not contain \"..\"".to_owned())
        );
    }

    #[tokio::test]
    async fn relative_paths_are_refused() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        assert_eq!(
            folders.check(Path::new("Hushio/a.m4a")),
            Err("Path must be absolute".to_owned())
        );
    }

    #[tokio::test]
    async fn symlink_escape_is_refused() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        let outside = base.path().join("Outside");
        std::fs::create_dir_all(&outside).expect("outside dir");
        std::fs::write(outside.join("secret.m4a"), b"audio").expect("outside file");
        let link = download_dir(base.path()).join("link");
        std::fs::create_dir_all(download_dir(base.path())).expect("download dir");
        let Ok(()) = link_dir(&outside, &link) else {
            eprintln!("symlinks unavailable on this machine, skipping symlink escape test");
            return;
        };
        assert_eq!(folders.check(&link), Err(OUTSIDE.to_owned()));
        assert_eq!(folders.check(&link.join("secret.m4a")), Err(OUTSIDE.to_owned()));
        assert!(folders.check(&download_dir(base.path()).join("own.m4a")).is_ok());
    }

    #[tokio::test]
    async fn persisted_picks_are_approved_at_startup() {
        let base = tempfile::tempdir().expect("temp dir");
        let chosen = base.path().join("Chosen");
        persist::write(
            &data_root(base.path()),
            DEVICE_OWNER,
            APPROVED_STORE,
            &json!([chosen.display().to_string()]),
        )
        .await
        .expect("seed store");
        let folders = folders_in(base.path()).await;
        assert!(folders.check(&chosen.join("a.m4a")).is_ok());
        assert_eq!(folders.picked(), vec![chosen]);
    }

    #[tokio::test]
    async fn picked_folder_is_persisted_and_survives_restart() {
        let base = tempfile::tempdir().expect("temp dir");
        let chosen = base.path().join("Chosen");
        let folders = folders_in(base.path()).await;
        assert!(folders.check(&chosen.join("a.m4a")).is_err());

        folders.remember(chosen.clone()).await.expect("remember");
        assert!(folders.check(&chosen.join("a.m4a")).is_ok());

        let stored = persist::read(&data_root(base.path()), DEVICE_OWNER, APPROVED_STORE).await;
        assert_eq!(stored, Some(json!([chosen.display().to_string()])));

        let restarted = folders_in(base.path()).await;
        assert!(restarted.check(&chosen.join("a.m4a")).is_ok());
    }

    #[tokio::test]
    async fn remember_rejects_relative_and_dot_dot_paths() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        assert!(folders.remember(PathBuf::from("relative")).await.is_err());
        assert!(folders
            .remember(base.path().join("Chosen").join("..").join("escape"))
            .await
            .is_err());
        assert!(folders.picked().is_empty());
    }

    #[tokio::test]
    async fn export_uses_the_music_folder_and_ignores_the_custom_dir() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        let other = base.path().join("Other");
        assert_eq!(
            target_dir(&folders, true, Some(other)),
            Ok(Some(music_dir(base.path())))
        );
    }

    #[tokio::test]
    async fn unset_dir_keeps_the_default_download_folder() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        assert_eq!(target_dir(&folders, false, None), Ok(None));
    }

    #[tokio::test]
    async fn custom_dir_must_be_approved() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = folders_in(base.path()).await;
        assert_eq!(
            target_dir(&folders, false, Some(base.path().join("Unknown"))),
            Err(OUTSIDE.to_owned())
        );
        assert_eq!(
            target_dir(&folders, false, Some(PathBuf::from("relative"))),
            Err("Path must be absolute".to_owned())
        );
        let approved = download_dir(base.path()).join("Sub");
        assert_eq!(target_dir(&folders, false, Some(approved.clone())), Ok(Some(approved)));
    }

    #[tokio::test]
    async fn export_without_a_music_folder_is_an_error() {
        let base = tempfile::tempdir().expect("temp dir");
        let folders = Folders::open(&data_root(base.path()), download_dir(base.path()), None).await;
        assert!(target_dir(&folders, true, None).is_err());
    }
}
