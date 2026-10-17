#[tauri::command]
fn os_scroll_direction() -> Option<bool> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        let output = Command::new("reg")
            .args(["query", "HKCU\\Control Panel\\Desktop", "/v", "WheelScrollChars"])
            .creation_flags(0x08000000)
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let line = text.lines().find(|line| line.contains("WheelScrollChars"))?;
        let value = line.split("REG_SZ").nth(1)?.trim().split_whitespace().next()?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![os_scroll_direction])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
