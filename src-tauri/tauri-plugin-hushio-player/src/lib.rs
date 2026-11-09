use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
pub struct AndroidBridges<R: Runtime> {
    pub secure: tauri::plugin::PluginHandle<R>,
    pub media: tauri::plugin::PluginHandle<R>,
    pub auth: tauri::plugin::PluginHandle<R>,
    pub permission: tauri::plugin::PluginHandle<R>,
    pub audio: tauri::plugin::PluginHandle<R>,
    pub sync: tauri::plugin::PluginHandle<R>,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("hushio-player")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                _api.register_android_plugin("com.hushio.player", "PlayerPlugin")?;
                let bridges = AndroidBridges {
                    secure: _api.register_android_plugin("com.hushio.player", "SecurePlugin")?,
                    media: _api.register_android_plugin("com.hushio.player", "MediaStorePlugin")?,
                    auth: _api.register_android_plugin("com.hushio.player", "AuthPlugin")?,
                    permission: _api.register_android_plugin("com.hushio.player", "PermissionPlugin")?,
                    audio: _api.register_android_plugin("com.hushio.player", "LocalAudioPlugin")?,
                    sync: _api.register_android_plugin("com.hushio.player", "SyncPlugin")?,
                };
                _app.manage(bridges);
            }
            Ok(())
        })
        .build()
}
