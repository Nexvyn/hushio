use std::path::{Path, PathBuf};

const MARKER: &str = ".hushio-installed";

pub fn claim_marker(dir: &Path) -> std::io::Result<bool> {
    let path = dir.join(MARKER);
    if path.exists() {
        return Ok(false);
    }
    std::fs::write(&path, "")?;
    Ok(true)
}

fn install_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
}

#[tauri::command]
pub fn guest_detect_marker() -> bool {
    install_dir().is_some_and(|dir| claim_marker(&dir).unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_launch_claims_the_marker_and_later_launches_do_not() {
        let base = tempfile::tempdir().expect("temp dir");
        assert!(claim_marker(base.path()).expect("first claim"));
        assert!(base.path().join(MARKER).exists());
        assert!(!claim_marker(base.path()).expect("second claim"));
    }

    #[test]
    fn a_missing_install_folder_is_an_error_not_a_fresh_install() {
        let base = tempfile::tempdir().expect("temp dir");
        let missing = base.path().join("gone");
        assert!(claim_marker(&missing).is_err());
    }
}
