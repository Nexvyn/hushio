pub mod tray {
    #[tauri::command]
    pub fn tray_set_playing() {}
}

pub mod window {
    #[tauri::command]
    pub fn window_intro_done() {}

    #[tauri::command]
    pub fn window_set_reduce_transparency() {}
}

pub mod pip {
    #[tauri::command]
    pub fn pip_toggle() -> Result<bool, String> {
        Ok(false)
    }

    #[tauri::command]
    pub fn pip_is_open() -> bool {
        false
    }

    #[tauri::command]
    pub fn pip_close() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn pip_minimize() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn pip_set_compact() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn pip_show_main() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn pip_ready() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn pip_send_state() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn pip_send_command() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn pip_session_erased() -> Result<(), String> {
        Ok(())
    }
}

pub mod updates {
    use tauri::AppHandle;

    #[tauri::command]
    pub fn updates_state(app: AppHandle) -> serde_json::Value {
        serde_json::json!({
            "status": "idle",
            "current": app.package_info().version.to_string(),
            "version": null,
            "percent": null,
            "error": null,
            "errorFrom": null,
            "route": "inApp",
        })
    }

    #[tauri::command]
    pub fn updates_check() {}

    #[tauri::command]
    pub fn updates_install() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn updates_restart() {}
}
