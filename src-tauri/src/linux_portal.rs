#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::path::PathBuf;

use serde::Serialize;

pub const APPEARANCE_EVENT: &str = "linux:appearance";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub color_scheme: &'static str,
    pub reduce_motion: bool,
}

pub const NO_PREFERENCE: Appearance = Appearance {
    color_scheme: "none",
    reduce_motion: false,
};

pub fn xdg_dir(xdg: Option<&str>, home: Option<&str>, fallback: &str) -> Option<PathBuf> {
    match xdg.filter(|value| !value.is_empty()) {
        Some(dir) => Some(PathBuf::from(dir)),
        None => Some(PathBuf::from(home.filter(|value| !value.is_empty())?).join(fallback)),
    }
}

pub fn scheme_label(preference: u32) -> &'static str {
    match preference {
        1 => "dark",
        2 => "light",
        _ => "none",
    }
}

pub fn gsettings_reduces(output: &str) -> bool {
    output.trim() == "false"
}

pub fn kdeglobals_reduces(text: &str) -> bool {
    let mut in_kde_group = false;
    for line in text.lines().map(str::trim) {
        if let Some(group) = line.strip_prefix('[').and_then(|rest| rest.strip_suffix(']')) {
            in_kde_group = group == "KDE";
            continue;
        }
        if !in_kde_group {
            continue;
        }
        if let Some(value) = line.strip_prefix("AnimationDurationFactor=") {
            return value.trim().parse::<f64>().is_ok_and(|factor| factor == 0.0);
        }
    }
    false
}

#[cfg(target_os = "linux")]
mod platform {
    use std::process::Command;

    use ashpd::desktop::settings::{ColorScheme, Settings};
    use futures_util::StreamExt;
    use tauri::{AppHandle, Emitter};

    use super::{gsettings_reduces, kdeglobals_reduces, scheme_label, xdg_dir, Appearance, APPEARANCE_EVENT, NO_PREFERENCE};

    fn scheme_number(value: ColorScheme) -> u32 {
        match value {
            ColorScheme::PreferDark => 1,
            ColorScheme::PreferLight => 2,
            _ => 0,
        }
    }

    fn reduce_motion_now() -> bool {
        let gnome = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "enable-animations"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .is_some_and(|output| gsettings_reduces(&String::from_utf8_lossy(&output.stdout)));
        let kde = xdg_dir(
            std::env::var("XDG_CONFIG_HOME").ok().as_deref(),
            std::env::var("HOME").ok().as_deref(),
            ".config",
        )
        .map(|dir| dir.join("kdeglobals"))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .is_some_and(|text| kdeglobals_reduces(&text));
        gnome || kde
    }

    async fn reduce_motion() -> bool {
        tokio::task::spawn_blocking(reduce_motion_now).await.unwrap_or(false)
    }

    pub async fn read() -> Appearance {
        let scheme = match Settings::new().await {
            Ok(settings) => match settings.color_scheme().await {
                Ok(value) => scheme_label(scheme_number(value)),
                Err(_) => NO_PREFERENCE.color_scheme,
            },
            Err(_) => NO_PREFERENCE.color_scheme,
        };
        Appearance {
            color_scheme: scheme,
            reduce_motion: reduce_motion().await,
        }
    }

    #[cfg(test)]
    mod tests {
        use super::{scheme_number, ColorScheme};

        #[test]
        fn every_portal_color_scheme_maps_to_its_number() {
            assert_eq!(scheme_number(ColorScheme::NoPreference), 0);
            assert_eq!(scheme_number(ColorScheme::PreferDark), 1);
            assert_eq!(scheme_number(ColorScheme::PreferLight), 2);
        }
    }

    pub fn start(app: &AppHandle) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let Ok(settings) = Settings::new().await else {
                tracing::info!("desktop appearance unavailable: no settings portal");
                return;
            };
            let Ok(changes) = settings.receive_color_scheme_changed().await else {
                return;
            };
            let mut changes = Box::pin(changes);
            while let Some(value) = changes.next().await {
                let appearance = Appearance {
                    color_scheme: scheme_label(scheme_number(value)),
                    reduce_motion: reduce_motion().await,
                };
                let _ = app.emit(APPEARANCE_EVENT, appearance);
            }
        });
    }
}

#[cfg(not(target_os = "linux"))]
mod platform {
    use tauri::AppHandle;

    use super::{Appearance, NO_PREFERENCE};

    pub async fn read() -> Appearance {
        NO_PREFERENCE
    }

    pub fn start(_app: &AppHandle) {}
}

pub fn start(app: &tauri::AppHandle) {
    platform::start(app);
}

#[tauri::command]
pub async fn linux_appearance_read() -> Appearance {
    platform::read().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn color_scheme_numbers_map_to_labels() {
        assert_eq!(scheme_label(1), "dark");
        assert_eq!(scheme_label(2), "light");
        assert_eq!(scheme_label(0), "none");
        assert_eq!(scheme_label(9), "none");
    }

    #[test]
    fn gsettings_animations_off_means_reduce_motion() {
        assert!(gsettings_reduces("false\n"));
        assert!(!gsettings_reduces("true\n"));
        assert!(!gsettings_reduces(""));
    }

    #[test]
    fn kde_zero_animation_factor_means_reduce_motion() {
        let off = "[General]\nName=Breeze\n\n[KDE]\nAnimationDurationFactor=0\n";
        let on = "[KDE]\nAnimationDurationFactor=1\n";
        assert!(kdeglobals_reduces(off));
        assert!(!kdeglobals_reduces(on));
    }

    #[test]
    fn kde_factor_outside_the_kde_group_is_ignored() {
        let other = "[General]\nAnimationDurationFactor=0\n[KDE]\nSingleClick=false\n";
        assert!(!kdeglobals_reduces(other));
        assert!(!kdeglobals_reduces(""));
    }

    #[test]
    fn kde_factor_accepts_zero_forms_and_ignores_garbage() {
        assert!(kdeglobals_reduces("[KDE]\nAnimationDurationFactor=0.0\n"));
        assert!(kdeglobals_reduces("[KDE]\nAnimationDurationFactor= 0 \n"));
        assert!(!kdeglobals_reduces("[KDE]\nAnimationDurationFactor=abc\n"));
        assert!(!kdeglobals_reduces("[KDE]\nAnimationDurationFactor=\n"));
    }

    #[test]
    fn kde_first_factor_wins_over_a_duplicate_key() {
        let text = "[KDE]\nAnimationDurationFactor=1\n[KDE]\nAnimationDurationFactor=0\n";
        assert!(!kdeglobals_reduces(text));
    }

    #[test]
    fn xdg_folders_fall_back_to_home() {
        assert_eq!(xdg_dir(Some("/cfg"), Some("/home/u"), ".config"), Some(PathBuf::from("/cfg")));
        assert_eq!(
            xdg_dir(Some(""), Some("/home/u"), ".config"),
            Some(PathBuf::from("/home/u").join(".config"))
        );
        assert_eq!(xdg_dir(None, None, ".config"), None);
    }

    #[test]
    fn appearance_serialises_with_camel_case_keys() {
        let value = serde_json::to_value(Appearance {
            color_scheme: "dark",
            reduce_motion: true,
        })
        .unwrap();
        assert_eq!(value, serde_json::json!({ "colorScheme": "dark", "reduceMotion": true }));
    }
}
