use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub struct Entry {
    pub path: PathBuf,
    pub bytes: u64,
    pub modified: u64,
}

pub fn trim_plan(mut entries: Vec<Entry>, limit: u64) -> Vec<PathBuf> {
    let total: u64 = entries.iter().map(|entry| entry.bytes).sum();
    let mut excess = total.saturating_sub(limit);
    if excess == 0 {
        return Vec::new();
    }
    entries.sort_by(|a, b| a.modified.cmp(&b.modified).then_with(|| a.path.cmp(&b.path)));
    let mut plan = Vec::new();
    for entry in entries {
        if excess == 0 {
            break;
        }
        excess = excess.saturating_sub(entry.bytes);
        plan.push(entry.path);
    }
    plan
}

pub fn trim_dir(dir: &Path, limit: u64) -> io::Result<usize> {
    if !dir.is_dir() {
        return Ok(0);
    }
    let mut entries = Vec::new();
    for item in std::fs::read_dir(dir)? {
        let item = item?;
        let meta = item.metadata()?;
        if !meta.is_file() {
            continue;
        }
        let modified = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |time| time.as_secs());
        entries.push(Entry {
            path: item.path(),
            bytes: meta.len(),
            modified,
        });
    }
    let plan = trim_plan(entries, limit);
    let mut removed = 0;
    for path in &plan {
        if std::fs::remove_file(path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, bytes: u64, modified: u64) -> Entry {
        Entry {
            path: PathBuf::from(name),
            bytes,
            modified,
        }
    }

    #[test]
    fn nothing_is_removed_under_the_limit() {
        let plan = trim_plan(vec![entry("a", 40, 1), entry("b", 20, 2)], 60);
        assert!(plan.is_empty());
    }

    #[test]
    fn oldest_entries_go_first_until_under_the_limit() {
        let plan = trim_plan(
            vec![entry("new", 30, 9), entry("old", 40, 1), entry("mid", 30, 5)],
            70,
        );
        assert_eq!(plan, vec![PathBuf::from("old")]);
    }

    #[test]
    fn ties_break_by_path_so_the_plan_is_stable() {
        let plan = trim_plan(vec![entry("b", 10, 1), entry("a", 10, 1)], 10);
        assert_eq!(plan, vec![PathBuf::from("a")]);
    }

    #[test]
    fn the_image_cap_is_sixty_four_megabytes() {
        let cap = 64 * 1024 * 1024;
        let plan = trim_plan(
            vec![entry("x", cap, 1), entry("y", 1, 2)],
            cap,
        );
        assert_eq!(plan, vec![PathBuf::from("x")]);
    }

    #[test]
    fn trim_dir_removes_only_the_plan_and_keeps_newer_files() {
        let dir = std::env::temp_dir().join(format!("hushio-cache-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("old.bin"), vec![0u8; 600]).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        std::fs::write(dir.join("new.bin"), vec![0u8; 600]).unwrap();
        let removed = trim_dir(&dir, 700).unwrap();
        assert_eq!(removed, 1);
        assert!(!dir.join("old.bin").exists());
        assert!(dir.join("new.bin").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
