#[cfg(target_os = "android")]
use std::sync::OnceLock;

use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};
#[cfg(target_os = "android")]
use tauri::{Manager, plugin::PluginHandle};

#[cfg(target_os = "android")]
const PACKAGE: &str = "com.hushio.player";

#[cfg(target_os = "android")]
pub struct AndroidBridges<R: Runtime> {
    pub secure: OnceLock<PluginHandle<R>>,
    pub media: OnceLock<PluginHandle<R>>,
    pub auth: OnceLock<PluginHandle<R>>,
    pub permission: OnceLock<PluginHandle<R>>,
    pub audio: OnceLock<PluginHandle<R>>,
    pub sync: OnceLock<PluginHandle<R>>,
    pub update: OnceLock<PluginHandle<R>>,
}

#[cfg(target_os = "android")]
impl<R: Runtime> Default for AndroidBridges<R> {
    fn default() -> Self {
        Self {
            secure: OnceLock::new(),
            media: OnceLock::new(),
            auth: OnceLock::new(),
            permission: OnceLock::new(),
            audio: OnceLock::new(),
            sync: OnceLock::new(),
            update: OnceLock::new(),
        }
    }
}

#[cfg(target_os = "android")]
macro_rules! bridge_plugin {
    ($name:literal, $class:literal, $field:ident) => {
        Builder::new($name)
            .setup(|app, api| {
                let handle = api.register_android_plugin(PACKAGE, $class)?;
                app.manage(AndroidBridges::<R>::default());
                let _ = app.state::<AndroidBridges<R>>().$field.set(handle);
                Ok(())
            })
            .build()
    };
}

#[cfg(target_os = "android")]
pub fn plugins<R: Runtime>() -> Vec<TauriPlugin<R>> {
    vec![
        Builder::new("hushio-player")
            .setup(|_app, api| {
                api.register_android_plugin(PACKAGE, "PlayerPlugin")?;
                Ok(())
            })
            .build(),
        bridge_plugin!("hushio-secure", "SecurePlugin", secure),
        bridge_plugin!("hushio-media", "MediaStorePlugin", media),
        bridge_plugin!("hushio-auth", "AuthPlugin", auth),
        bridge_plugin!("hushio-permission", "PermissionPlugin", permission),
        bridge_plugin!("hushio-audio", "LocalAudioPlugin", audio),
        bridge_plugin!("hushio-sync", "SyncPlugin", sync),
        bridge_plugin!("hushio-update", "UpdatePlugin", update),
    ]
}

#[cfg(not(target_os = "android"))]
pub fn plugins<R: Runtime>() -> Vec<TauriPlugin<R>> {
    vec![Builder::new("hushio-player").build()]
}
