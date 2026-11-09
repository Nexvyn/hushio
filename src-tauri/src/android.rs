#[cfg(target_os = "android")]
mod bridge {
    use std::sync::OnceLock;

    use serde::Deserialize;
    use serde::de::DeserializeOwned;
    use serde_json::{Value, json};
    use tauri::plugin::PluginHandle;
    use tauri::{AppHandle, Manager, Wry};
    use tauri_plugin_hushio_player::AndroidBridges;

    use crate::tree_library::TreeItem;

    static APP: OnceLock<AppHandle<Wry>> = OnceLock::new();
    const NOT_READY: &str = "Android services are not ready yet.";

    #[derive(Clone, Copy)]
    pub enum Bridge {
        Secure,
        Media,
        Auth,
        Permission,
        Audio,
        Sync,
    }

    #[derive(Deserialize)]
    struct PickedTree {
        uri: Option<String>,
    }

    #[derive(Deserialize)]
    struct TreeReply {
        items: Vec<TreeItem>,
    }

    #[derive(Deserialize)]
    struct SecretValue {
        value: Option<String>,
    }

    #[derive(Deserialize)]
    struct PublishedUri {
        uri: String,
    }

    #[derive(Deserialize)]
    struct RedirectUrl {
        url: String,
    }

    pub fn init(app: &AppHandle<Wry>) {
        let _ = APP.set(app.clone());
    }

    pub fn app() -> Option<&'static AppHandle<Wry>> {
        APP.get()
    }

    pub fn schedule_retry() -> Result<(), String> {
        call::<Value>(Bridge::Sync, "schedule", json!({})).map(drop)
    }

    fn plugins() -> Result<tauri::State<'static, AndroidBridges<Wry>>, String> {
        let app = APP.get().ok_or_else(|| NOT_READY.to_owned())?;
        Ok(app.state::<AndroidBridges<Wry>>())
    }

    fn pick<'a>(plugins: &'a AndroidBridges<Wry>, bridge: Bridge) -> &'a PluginHandle<Wry> {
        match bridge {
            Bridge::Secure => &plugins.secure,
            Bridge::Media => &plugins.media,
            Bridge::Auth => &plugins.auth,
            Bridge::Permission => &plugins.permission,
            Bridge::Audio => &plugins.audio,
            Bridge::Sync => &plugins.sync,
        }
    }

    pub fn call<T: DeserializeOwned>(bridge: Bridge, command: &str, payload: Value) -> Result<T, String> {
        let plugins = plugins()?;
        pick(&plugins, bridge)
            .run_mobile_plugin(command, payload)
            .map_err(|error| error.to_string())
    }

    pub async fn call_async<T: DeserializeOwned>(
        bridge: Bridge,
        command: &str,
        payload: Value,
    ) -> Result<T, String> {
        let plugins = plugins()?;
        pick(&plugins, bridge)
            .run_mobile_plugin_async(command, payload)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn pick_tree() -> Result<Option<String>, String> {
        let reply: PickedTree = call_async(Bridge::Audio, "pick_tree", json!({})).await?;
        Ok(reply.uri)
    }

    pub fn scan_tree(uri: &str) -> Result<Vec<TreeItem>, String> {
        let reply: TreeReply = call(Bridge::Audio, "scan_tree", json!({ "uri": uri }))?;
        Ok(reply.items)
    }

    pub fn media_delete(uri: &str) -> Result<(), String> {
        call::<Value>(Bridge::Media, "media_store_delete", json!({ "uri": uri })).map(drop)
    }

    pub fn secret_read(key: &str) -> Result<Option<String>, String> {
        let reply: SecretValue = call(Bridge::Secure, "secure_get", json!({ "key": key }))?;
        Ok(reply.value)
    }

    pub fn secret_write(key: &str, value: &str) -> Result<(), String> {
        call::<Value>(Bridge::Secure, "secure_set", json!({ "key": key, "value": value })).map(drop)
    }

    pub fn secret_clear(key: &str) -> Result<(), String> {
        call::<Value>(Bridge::Secure, "secure_clear", json!({ "key": key })).map(drop)
    }

    pub async fn publish_download(path: &str, display_name: &str) -> Result<String, String> {
        let reply: PublishedUri = call_async(
            Bridge::Media,
            "media_store_publish",
            json!({ "path": path, "displayName": display_name }),
        )
        .await?;
        Ok(reply.uri)
    }

    pub fn open_sign_in(url: &str) -> Result<(), String> {
        call::<Value>(Bridge::Auth, "auth_open", json!({ "url": url })).map(drop)
    }

    pub async fn await_sign_in_redirect() -> Result<String, String> {
        let reply: RedirectUrl = call_async(Bridge::Auth, "auth_await", json!({})).await?;
        Ok(reply.url)
    }
}

#[cfg(not(target_os = "android"))]
#[allow(dead_code)]
mod bridge {
    const NOT_ANDROID: &str = "Android services are only available on Android.";

    pub fn init(_app: &tauri::AppHandle<tauri::Wry>) {}

    pub fn schedule_retry() -> Result<(), String> {
        Ok(())
    }

    pub async fn pick_tree() -> Result<Option<String>, String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub fn scan_tree(_uri: &str) -> Result<Vec<crate::tree_library::TreeItem>, String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub fn media_delete(_uri: &str) -> Result<(), String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub fn secret_read(_key: &str) -> Result<Option<String>, String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub fn secret_write(_key: &str, _value: &str) -> Result<(), String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub fn secret_clear(_key: &str) -> Result<(), String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub async fn publish_download(_path: &str, _display_name: &str) -> Result<String, String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub fn open_sign_in(_url: &str) -> Result<(), String> {
        Err(NOT_ANDROID.to_owned())
    }

    pub async fn await_sign_in_redirect() -> Result<String, String> {
        Err(NOT_ANDROID.to_owned())
    }
}

pub use bridge::*;

#[derive(serde::Deserialize)]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct NotificationReply {
    state: String,
}

#[cfg(target_os = "android")]
pub fn notification_state() -> Result<String, String> {
    bridge::call::<NotificationReply>(bridge::Bridge::Permission, "notification_state", serde_json::json!({}))
        .map(|reply| reply.state)
}

#[cfg(target_os = "android")]
pub async fn notification_request() -> Result<String, String> {
    bridge::call_async::<NotificationReply>(bridge::Bridge::Permission, "notification_request", serde_json::json!({}))
        .await
        .map(|reply| reply.state)
}

#[cfg(target_os = "android")]
pub fn notification_settings() -> Result<(), String> {
    bridge::call::<serde_json::Value>(bridge::Bridge::Permission, "notification_settings", serde_json::json!({}))
        .map(drop)
}

#[cfg(not(target_os = "android"))]
pub fn notification_state() -> Result<String, String> {
    Ok("granted".to_owned())
}

#[cfg(not(target_os = "android"))]
pub async fn notification_request() -> Result<String, String> {
    Ok("granted".to_owned())
}

#[cfg(not(target_os = "android"))]
pub fn notification_settings() -> Result<(), String> {
    Ok(())
}
