use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("hushio-player")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                _api.register_android_plugin("com.hushio.player", "PlayerPlugin")?;
            }
            Ok(())
        })
        .build()
}
