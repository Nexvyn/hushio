use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::APP_NAME;
use crate::google_auth::{
    Browser, Callback, RedirectFuture, SecretStore, StoreResult, bind_loopback, code_challenge, error_code,
    form_body, is_fresh, now_secs, random_state, random_verifier, redirect_uri, respond, wait_for_redirect,
};

pub const CLIENT_ID: &str = match option_env!("HUSHIO_SPOTIFY_CLIENT_ID") {
    Some(value) => value,
    None => "",
};

pub const TOKEN_SLOT: &str = "spotify-refresh-token";
pub const SCOPES: &str = "playlist-read-private playlist-read-collaborative user-library-read";

const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const ME_URL: &str = "https://api.spotify.com/v1/me";
const ANDROID_SCHEME: &str = "hushio-spotify";
const APP_REDIRECT_PATH: &str = ":/callback";
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

const MSG_DIDNT_COMPLETE: &str = "Spotify sign-in didn't complete.";
const MSG_TIMED_OUT: &str = "Spotify sign-in timed out. Please try again.";
const MSG_NO_BROWSER: &str = "Could not open the sign-in browser.";
const MSG_NETWORK: &str = "Couldn't connect right now. Check your connection and try again.";
const MSG_EXPIRED: &str = "Sign-in expired. Please try again.";
const MSG_NO_REFRESH: &str = "Spotify didn't return a long-term sign-in. Try again.";
const MSG_NOT_CONFIGURED: &str = "Spotify sign-in isn't set up in this build.";
const MSG_ALREADY_PENDING: &str = "Finish signing in with Spotify in your browser.";
const MSG_CANCELLED: &str = "Sign-in cancelled.";
const MSG_SIGNED_OUT: &str = "Connect your Spotify account first.";
const MSG_SAVE: &str = "Couldn't save your Spotify settings in secure storage.";

#[derive(Clone)]
pub struct OAuthConfig {
    pub client_id: String,
    pub auth_url: String,
    pub token_url: String,
    pub me_url: String,
    pub sign_in_timeout: Duration,
}

impl OAuthConfig {
    pub fn production() -> Self {
        Self {
            client_id: CLIENT_ID.to_owned(),
            auth_url: AUTH_URL.to_owned(),
            token_url: TOKEN_URL.to_owned(),
            me_url: ME_URL.to_owned(),
            sign_in_timeout: SIGN_IN_TIMEOUT,
        }
    }
}

pub struct SpotifyBrowser(pub AppHandle);

impl Browser for SpotifyBrowser {
    fn open(&self, url: &str) -> StoreResult<()> {
        if cfg!(target_os = "android") {
            return crate::android::open_sign_in(url);
        }
        self.0
            .opener()
            .open_url(url, None::<&str>)
            .map_err(|error| error.to_string())
    }

    fn redirect_scheme(&self) -> Option<String> {
        cfg!(target_os = "android").then(|| ANDROID_SCHEME.to_owned())
    }

    fn await_redirect(&self) -> RedirectFuture<'_> {
        Box::pin(async {
            crate::android::await_sign_in_redirect()
                .await
                .map_err(|_| MSG_CANCELLED.to_owned())
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyAccount {
    pub configured: bool,
    pub own_client_id: Option<String>,
    pub redirect_uri: String,
    pub expired: bool,
    pub reconnect: bool,
    pub signed_in: bool,
    pub name: Option<String>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct StoredAccount {
    own_client_id: Option<String>,
    session: Option<Session>,
    #[serde(default)]
    expired: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct AccessToken {
    value: String,
    expires_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
struct Session {
    client_id: String,
    name: Option<String>,
    access: AccessToken,
    refresh_token: String,
}

#[derive(Default)]
struct Inner {
    account: StoredAccount,
    loaded: bool,
    unreadable: bool,
    pending: bool,
    generation: u64,
}

const MSG_SIGN_IN_AGAIN: &str = "Spotify signed you out. Sign in again.";

fn valid_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn api_error(status: u16, body: &str, profile: bool) -> &'static str {
    let reason = body.to_ascii_lowercase();
    match status {
        403 if reason.contains("premium") => "Spotify Premium is needed for this.",
        403 if profile
            || ["registered", "registration", "not added", "allowlist"]
                .iter()
                .any(|hint| reason.contains(*hint)) =>
        {
            "This Spotify app hasn't added your account. Ask its owner to add you, or use your own Spotify app."
        }
        403 => "Spotify didn't allow access to this library item.",
        429 if reason.contains("quota_exceeded") => {
            "Spotify's limit for this app is used up for now. Try later or use your own Spotify app."
        }
        429 => "Spotify is busy right now. Try again later.",
        _ => "Couldn't read your Spotify library. Try again.",
    }
}

pub struct SpotifyAuth {
    config: OAuthConfig,
    store: Arc<dyn SecretStore>,
    http: reqwest::Client,
    inner: Mutex<Inner>,
    refreshing: tokio::sync::Mutex<()>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct Profile {
    id: String,
    display_name: Option<String>,
}

enum Refresh {
    Ok {
        access: AccessToken,
        rotated: Option<String>,
    },
    Retry,
    Rejected,
}

struct Reply {
    status: u16,
    ok: bool,
    body: String,
}

struct PendingGuard<'a>(&'a SpotifyAuth);

impl Drop for PendingGuard<'_> {
    fn drop(&mut self) {
        self.0.lock().pending = false;
    }
}

impl SpotifyAuth {
    pub fn new(config: OAuthConfig, store: Arc<dyn SecretStore>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(crate::stream::USER_AGENT)
            .timeout(HTTP_TIMEOUT)
            .build()
            .unwrap_or_default();
        Self {
            config,
            store,
            http,
            inner: Mutex::new(Inner::default()),
            refreshing: tokio::sync::Mutex::new(()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn selected<'a>(&'a self, account: &'a StoredAccount) -> &'a str {
        account
            .own_client_id
            .as_deref()
            .unwrap_or(self.config.client_id.trim())
    }

    fn loaded(&self) -> Result<MutexGuard<'_, Inner>, String> {
        let mut inner = self.lock();
        if inner.loaded {
            return Ok(inner);
        }
        let Ok(raw) = self.store.read() else {
            inner.unreadable = true;
            return Ok(inner);
        };
        if let Some(raw) = raw {
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
                inner.unreadable = true;
                return Ok(inner);
            };
            let legacy = value.get("refresh_token").is_some();
            let Ok(mut account) = serde_json::from_value::<StoredAccount>(value) else {
                inner.unreadable = true;
                return Ok(inner);
            };
            if legacy
                || account
                    .session
                    .as_ref()
                    .is_some_and(|s| s.client_id != self.selected(&account))
            {
                account.session = None;
                account.expired = true;
                self.write(&account)?;
            }
            inner.account = account;
        }
        inner.unreadable = false;
        inner.loaded = true;
        Ok(inner)
    }

    fn write(&self, account: &StoredAccount) -> Result<(), String> {
        if account.session.is_none() && account.own_client_id.is_none() && !account.expired {
            return self.store.clear().map_err(|_| MSG_SAVE.to_owned());
        }
        let raw = serde_json::to_string(account).map_err(|_| MSG_SAVE)?;
        self.store.write(&raw).map_err(|_| MSG_SAVE.to_owned())
    }

    fn status(&self, account: &StoredAccount, reconnect: bool) -> SpotifyAccount {
        SpotifyAccount {
            configured: valid_id(self.selected(account)),
            own_client_id: account.own_client_id.clone(),
            redirect_uri: if cfg!(target_os = "android") {
                format!("{ANDROID_SCHEME}{APP_REDIRECT_PATH}")
            } else {
                "http://127.0.0.1/callback".to_owned()
            },
            expired: account.expired,
            reconnect,
            signed_in: account.session.is_some(),
            name: account.session.as_ref().and_then(|s| s.name.clone()),
        }
    }

    pub fn account(&self) -> Result<SpotifyAccount, String> {
        let inner = self.loaded()?;
        Ok(self.status(&inner.account, inner.unreadable))
    }

    fn commit(&self, inner: &mut Inner, next: StoredAccount) -> Result<SpotifyAccount, String> {
        self.write(&next)?;
        inner.account = next;
        inner.generation += 1;
        inner.loaded = true;
        inner.unreadable = false;
        Ok(self.status(&inner.account, false))
    }

    pub fn set_client_id(&self, value: String) -> Result<SpotifyAccount, String> {
        let value = value.trim().to_ascii_lowercase();
        if !value.is_empty() && !valid_id(&value) {
            return Err("Enter a 32-character hexadecimal Client ID.".to_owned());
        }
        let mut inner = self.loaded()?;
        let mut next = inner.account.clone();
        next.own_client_id = (!value.is_empty()).then_some(value);
        if next.own_client_id == inner.account.own_client_id {
            return Ok(self.status(&inner.account, inner.unreadable));
        }
        if self.selected(&next) != self.selected(&inner.account) {
            next.session = None;
            next.expired = false;
        }
        self.commit(&mut inner, next)
    }

    pub async fn sign_in(&self, browser: &dyn Browser) -> Result<SpotifyAccount, String> {
        let (client_id, generation) = {
            let mut inner = self.loaded()?;
            let client_id = self.selected(&inner.account).to_owned();
            if !valid_id(&client_id) {
                return Err(MSG_NOT_CONFIGURED.to_owned());
            }
            if inner.pending {
                return Err(MSG_ALREADY_PENDING.to_owned());
            }
            inner.pending = true;
            (client_id, inner.generation)
        };
        let _pending = PendingGuard(self);

        let verifier = random_verifier();
        let state = random_state();
        let (listener, redirect) = match browser.redirect_scheme() {
            Some(scheme) => (None, format!("{scheme}{APP_REDIRECT_PATH}")),
            None => {
                let (listener, port) = bind_loopback().await.map_err(|_| MSG_DIDNT_COMPLETE.to_owned())?;
                (Some(listener), redirect_uri(port))
            }
        };
        let url = authorization_url(
            &self.config,
            &client_id,
            &redirect,
            &code_challenge(&verifier),
            &state,
        );
        browser.open(&url).map_err(|_| MSG_NO_BROWSER.to_owned())?;

        let callback = tokio::time::timeout(
            self.config.sign_in_timeout,
            wait_for_redirect(listener.as_ref(), browser, &state),
        )
        .await
        .map_err(|_| MSG_TIMED_OUT.to_owned())??;

        let Callback { code, stream } = callback;
        let outcome = self
            .complete(&client_id, generation, &code, &verifier, &redirect)
            .await;
        if let Some(mut stream) = stream {
            let page = if outcome.is_ok() {
                success_page()
            } else {
                error_page()
            };
            respond(&mut stream, "200 OK", &page).await;
        }
        outcome
    }

    async fn complete(
        &self,
        client_id: &str,
        generation: u64,
        code: &str,
        verifier: &str,
        redirect: &str,
    ) -> Result<SpotifyAccount, String> {
        let token = self.exchange(client_id, code, verifier, redirect).await?;
        let refresh_token = token
            .refresh_token
            .clone()
            .ok_or_else(|| MSG_NO_REFRESH.to_owned())?;
        let profile = self.profile(&token.access_token).await?;
        let session = Session {
            client_id: client_id.to_owned(),
            name: profile
                .display_name
                .filter(|name| !name.is_empty())
                .or(Some(profile.id)),
            access: AccessToken {
                value: token.access_token,
                expires_at: now_secs() + token.expires_in,
            },
            refresh_token,
        };
        let mut inner = self.loaded()?;
        if inner.generation != generation {
            return Err(MSG_CANCELLED.to_owned());
        }
        let mut next = inner.account.clone();
        next.session = Some(session);
        next.expired = false;
        self.commit(&mut inner, next)
    }

    async fn access_token(&self, rejected: Option<&str>) -> Result<String, String> {
        let _refresh = self.refreshing.lock().await;
        let (mut session, generation) = {
            let inner = self.loaded()?;
            let session = inner.account.session.as_ref().ok_or(if inner.account.expired {
                MSG_SIGN_IN_AGAIN
            } else {
                MSG_SIGNED_OUT
            })?;
            if Some(session.access.value.as_str()) != rejected
                && is_fresh(session.access.expires_at, now_secs())
            {
                return Ok(session.access.value.clone());
            }
            (session.clone(), inner.generation)
        };
        let result = self.refresh(&session.client_id, &session.refresh_token).await;
        let mut inner = self.loaded()?;
        if inner.generation != generation {
            return Err(MSG_CANCELLED.to_owned());
        }
        let mut next = inner.account.clone();
        match result {
            Refresh::Ok { access, rotated } => {
                let value = access.value.clone();
                session.access = access;
                if let Some(token) = rotated {
                    session.refresh_token = token;
                }
                next.session = Some(session);
                self.commit(&mut inner, next)?;
                Ok(value)
            }
            Refresh::Retry | Refresh::Rejected => {
                next.session = None;
                next.expired = true;
                self.commit(&mut inner, next)?;
                Err(MSG_SIGN_IN_AGAIN.to_owned())
            }
        }
    }

    pub async fn library_page(&self, url: String) -> Result<serde_json::Value, String> {
        if !url.starts_with("https://api.spotify.com/v1/") {
            return Err("Invalid Spotify library URL.".to_owned());
        }
        let token = self.access_token(None).await?;
        let get = |token: &str| self.http.get(&url).bearer_auth(token).send();
        let mut response = get(&token).await.map_err(|_| MSG_NETWORK)?;
        if response.status().as_u16() == 401 {
            let renewed = self.access_token(Some(&token)).await?;
            response = get(&renewed).await.map_err(|_| MSG_NETWORK)?;
            if response.status().as_u16() == 401 {
                let mut inner = self.loaded()?;
                if inner
                    .account
                    .session
                    .as_ref()
                    .is_some_and(|session| session.access.value == renewed)
                {
                    let next = StoredAccount {
                        own_client_id: inner.account.own_client_id.clone(),
                        session: None,
                        expired: true,
                    };
                    self.commit(&mut inner, next)?;
                }
                return Err(MSG_SIGN_IN_AGAIN.to_owned());
            }
        }
        let status = response.status();
        if !status.is_success() {
            return Err(
                api_error(status.as_u16(), &response.text().await.unwrap_or_default(), false).to_owned(),
            );
        }
        response.json().await.map_err(|_| MSG_DIDNT_COMPLETE.to_owned())
    }

    async fn refresh(&self, client_id: &str, refresh_token: &str) -> Refresh {
        let Some(reply) = self
            .post_form(
                &self.config.token_url,
                &[
                    ("grant_type", "refresh_token"),
                    ("refresh_token", refresh_token),
                    ("client_id", client_id),
                ],
            )
            .await
        else {
            return Refresh::Retry;
        };
        if reply.status == 400 || reply.status == 401 {
            return Refresh::Rejected;
        }
        if !reply.ok {
            return Refresh::Retry;
        }
        match serde_json::from_str::<TokenResponse>(&reply.body) {
            Ok(token) => Refresh::Ok {
                access: AccessToken {
                    value: token.access_token,
                    expires_at: now_secs() + token.expires_in,
                },
                rotated: token.refresh_token,
            },
            Err(_) => Refresh::Retry,
        }
    }

    async fn exchange(
        &self,
        client_id: &str,
        code: &str,
        verifier: &str,
        redirect: &str,
    ) -> Result<TokenResponse, String> {
        let reply = self
            .post_form(
                &self.config.token_url,
                &[
                    ("grant_type", "authorization_code"),
                    ("code", code),
                    ("redirect_uri", redirect),
                    ("client_id", client_id),
                    ("code_verifier", verifier),
                ],
            )
            .await
            .ok_or_else(|| MSG_NETWORK.to_owned())?;
        if reply.ok {
            return serde_json::from_str::<TokenResponse>(&reply.body)
                .map_err(|_| MSG_DIDNT_COMPLETE.to_owned());
        }
        if matches!(reply.status, 403 | 429) {
            return Err(api_error(reply.status, &reply.body, true).to_owned());
        }
        if error_code(&reply.body).as_deref() == Some("invalid_grant") {
            Err(MSG_EXPIRED.to_owned())
        } else {
            Err(MSG_DIDNT_COMPLETE.to_owned())
        }
    }

    async fn profile(&self, access_token: &str) -> Result<Profile, String> {
        let response = self
            .http
            .get(&self.config.me_url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|_| MSG_NETWORK)?;
        let status = response.status();
        if !status.is_success() {
            return Err(
                api_error(status.as_u16(), &response.text().await.unwrap_or_default(), true).to_owned(),
            );
        }
        response.json().await.map_err(|_| MSG_DIDNT_COMPLETE.to_owned())
    }

    async fn post_form(&self, url: &str, fields: &[(&str, &str)]) -> Option<Reply> {
        let response = self
            .http
            .post(url)
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(form_body(fields))
            .send()
            .await
            .ok()?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Some(Reply {
            status: status.as_u16(),
            ok: status.is_success(),
            body,
        })
    }

    pub fn sign_out(&self) -> Result<SpotifyAccount, String> {
        let mut inner = self.loaded()?;
        let next = StoredAccount {
            own_client_id: inner.account.own_client_id.clone(),
            ..Default::default()
        };
        self.commit(&mut inner, next)
    }
}

fn authorization_url(
    config: &OAuthConfig,
    client_id: &str,
    redirect: &str,
    challenge: &str,
    state: &str,
) -> String {
    let query = form_body(&[
        ("client_id", client_id),
        ("response_type", "code"),
        ("redirect_uri", redirect),
        ("scope", SCOPES),
        ("code_challenge_method", "S256"),
        ("code_challenge", challenge),
        ("state", state),
    ]);
    format!("{}?{query}", config.auth_url)
}

fn success_page() -> String {
    format!("Spotify is connected to {APP_NAME}. You can close this tab.")
}

fn error_page() -> String {
    format!("Spotify sign-in didn't complete. You can close this tab and try again in {APP_NAME}.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use url::Url;

    #[derive(Default)]
    struct MemoryStore(Mutex<Option<String>>);

    impl MemoryStore {
        fn with(raw: &str) -> Self {
            Self(Mutex::new(Some(raw.to_owned())))
        }

        fn saved(&self) -> Option<String> {
            self.0.lock().unwrap().clone()
        }
    }

    impl SecretStore for MemoryStore {
        fn read(&self) -> StoreResult<Option<String>> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn write(&self, value: &str) -> StoreResult<()> {
            *self.0.lock().unwrap() = Some(value.to_owned());
            Ok(())
        }

        fn clear(&self) -> StoreResult<()> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    struct NoBrowser;

    impl Browser for NoBrowser {
        fn open(&self, _: &str) -> StoreResult<()> {
            panic!("the browser must not open");
        }
    }

    fn config() -> OAuthConfig {
        OAuthConfig {
            client_id: "a".repeat(32),
            auth_url: "https://accounts.test/authorize".to_owned(),
            token_url: "https://accounts.test/api/token".to_owned(),
            me_url: "https://api.test/v1/me".to_owned(),
            sign_in_timeout: Duration::from_secs(5),
        }
    }

    #[test]
    fn rfc7636_challenge_vector() {
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn verifier_meets_the_pkce_length_and_charset() {
        let verifier = random_verifier();
        assert!((43..=128).contains(&verifier.len()));
        assert!(
            verifier
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-._~".contains(&byte))
        );
        assert_ne!(verifier, random_verifier());
    }

    #[test]
    fn authorization_url_carries_pkce_and_only_the_library_scopes() {
        let url = authorization_url(
            &config(),
            &config().client_id,
            "hushio-spotify:/callback",
            "chal",
            "st",
        );
        let parsed = Url::parse(&url).unwrap();
        assert_eq!(parsed.origin().ascii_serialization(), "https://accounts.test");
        assert_eq!(parsed.path(), "/authorize");
        let query: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
        assert_eq!(query["client_id"], "a".repeat(32));
        assert_eq!(query["response_type"], "code");
        assert_eq!(query["redirect_uri"], "hushio-spotify:/callback");
        assert_eq!(query["code_challenge"], "chal");
        assert_eq!(query["code_challenge_method"], "S256");
        assert_eq!(query["state"], "st");
        assert_eq!(
            query["scope"],
            "playlist-read-private playlist-read-collaborative user-library-read"
        );
        assert_eq!(query.len(), 7);
        assert!(!query.contains_key("client_secret"));
    }

    #[test]
    fn scopes_are_exactly_the_three_library_scopes() {
        assert_eq!(SCOPES.split_whitespace().count(), 3);
        assert!(SCOPES.contains("playlist-read-private"));
        assert!(SCOPES.contains("playlist-read-collaborative"));
        assert!(SCOPES.contains("user-library-read"));
    }

    #[test]
    fn android_redirect_is_the_manifest_scheme_and_path() {
        assert_eq!(
            format!("{ANDROID_SCHEME}{APP_REDIRECT_PATH}"),
            "hushio-spotify:/callback"
        );
    }

    #[tokio::test]
    async fn sign_in_without_client_id_never_opens_the_browser() {
        let mut settings = config();
        settings.client_id = String::new();
        let auth = SpotifyAuth::new(settings, Arc::new(MemoryStore::default()));
        assert_eq!(auth.sign_in(&NoBrowser).await, Err(MSG_NOT_CONFIGURED.to_owned()));
        assert!(!auth.account().unwrap().configured);
    }

    #[test]
    fn validates_and_selects_the_session_client() {
        let store = Arc::new(MemoryStore::default());
        let auth = SpotifyAuth::new(config(), store.clone());
        assert!(auth.set_client_id("g".repeat(32)).is_err());
        assert!(auth.set_client_id("a".repeat(31)).is_err());
        assert!(auth.set_client_id("B".repeat(32)).is_ok());
        let fresh = SpotifyAuth::new(config(), store);
        assert_eq!(fresh.selected(&fresh.loaded().unwrap().account), "b".repeat(32));
        fresh.set_client_id(String::new()).unwrap();
        assert_eq!(
            fresh.selected(&fresh.loaded().unwrap().account),
            config().client_id
        );
    }

    #[test]
    fn legacy_sessions_require_sign_in_and_disconnect_clears_the_slot() {
        let store = Arc::new(MemoryStore::with(r#"{"refresh_token":"fixture","name":"Ada"}"#));
        let auth = SpotifyAuth::new(config(), store.clone());
        assert!(auth.account().unwrap().expired);
        assert!(!auth.account().unwrap().signed_in);
        assert!(!auth.sign_out().unwrap().signed_in);
        assert!(store.saved().is_none());
    }

    fn expired_account(client_id: &str) -> StoredAccount {
        StoredAccount {
            own_client_id: Some(client_id.to_owned()),
            session: Some(Session {
                client_id: client_id.to_owned(),
                name: Some("Ada".to_owned()),
                access: AccessToken {
                    value: random_state(),
                    expires_at: 0,
                },
                refresh_token: random_state(),
            }),
            expired: false,
        }
    }

    #[tokio::test]
    async fn refresh_uses_the_session_id_and_persists_both_rotated_tokens() {
        use axum::{Json, Router, routing::post};
        let own = "b".repeat(32);
        let original = expired_account(&own);
        let expected_refresh = original.session.as_ref().unwrap().refresh_token.clone();
        let access = random_state();
        let refresh = random_state();
        let reply = serde_json::json!({
            "access_token": access, "refresh_token": refresh, "expires_in": 3600
        });
        let handler = move |body: String| async move {
            let fields: HashMap<_, _> = url::form_urlencoded::parse(body.as_bytes())
                .into_owned()
                .collect();
            assert_eq!(fields["client_id"], own);
            assert_eq!(fields["refresh_token"], expected_refresh);
            assert_eq!(fields["grant_type"], "refresh_token");
            Json(reply)
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut cfg = config();
        cfg.token_url = format!("http://{}/token", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, Router::new().route("/token", post(handler)))
                .await
                .unwrap();
        });
        let store = Arc::new(MemoryStore::with(&serde_json::to_string(&original).unwrap()));
        let auth = SpotifyAuth::new(cfg, store.clone());
        assert_eq!(auth.access_token(None).await.unwrap(), access);
        server.abort();
        let saved: StoredAccount = serde_json::from_str(&store.saved().unwrap()).unwrap();
        assert_eq!(saved.session.unwrap().refresh_token, refresh);
        let restarted = SpotifyAuth::new(config(), store.clone());
        assert_eq!(restarted.access_token(None).await.unwrap(), access);
        assert!(!restarted.set_client_id(String::new()).unwrap().signed_in);
        assert!(!SpotifyAuth::new(config(), store).account().unwrap().signed_in);
    }

    #[tokio::test]
    async fn rejected_refresh_expires_session_and_keeps_the_personal_app() {
        use axum::{Router, http::StatusCode, routing::post};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut cfg = config();
        cfg.token_url = format!("http://{}/token", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let app = Router::new().route("/token", post(|| async { StatusCode::BAD_REQUEST }));
            axum::serve(listener, app).await.unwrap();
        });
        let original = expired_account(&"b".repeat(32));
        let store = Arc::new(MemoryStore::with(&serde_json::to_string(&original).unwrap()));
        let auth = SpotifyAuth::new(cfg, store.clone());
        assert_eq!(auth.access_token(None).await.unwrap_err(), MSG_SIGN_IN_AGAIN);
        server.abort();
        let account = SpotifyAuth::new(config(), store).account().unwrap();
        assert!(account.expired);
        assert!(!account.signed_in);
        assert_eq!(account.own_client_id, original.own_client_id);
    }

    struct FlakyStore {
        reads: Mutex<u32>,
        saved: String,
    }

    impl SecretStore for FlakyStore {
        fn read(&self) -> StoreResult<Option<String>> {
            let mut reads = self.reads.lock().unwrap();
            *reads += 1;
            if *reads == 1 {
                return Err("key store busy".to_owned());
            }
            Ok(Some(self.saved.clone()))
        }

        fn write(&self, _: &str) -> StoreResult<()> {
            Ok(())
        }

        fn clear(&self) -> StoreResult<()> {
            Ok(())
        }
    }

    #[test]
    fn a_failed_read_shows_reconnect_and_is_retried_on_the_next_call() {
        let store = Arc::new(FlakyStore {
            reads: Mutex::new(0),
            saved: r#"{"refresh_token":"r-1","name":"Ada"}"#.to_owned(),
        });
        let auth = SpotifyAuth::new(config(), store);
        let first = auth.account().unwrap();
        assert!(first.reconnect);
        assert!(!first.signed_in);
        let second = auth.account().unwrap();
        assert!(!second.reconnect);
        assert!(second.expired);
    }

    #[test]
    fn an_unparseable_stored_account_asks_to_reconnect() {
        let auth = SpotifyAuth::new(config(), Arc::new(MemoryStore::with("not json")));
        let account = auth.account().unwrap();
        assert!(account.reconnect);
        assert!(!account.signed_in);
        assert!(!account.expired);
    }

    #[test]
    fn a_missing_entry_is_a_plain_disconnect() {
        let auth = SpotifyAuth::new(config(), Arc::new(MemoryStore::default()));
        let account = auth.account().unwrap();
        assert!(!account.reconnect);
        assert!(!account.signed_in);
        assert!(!account.expired);
    }

    #[test]
    fn sign_in_error_messages_match_the_spotify_responses() {
        assert_eq!(
            api_error(403, "USER_NOT_REGISTERED", false),
            "This Spotify app hasn't added your account. Ask its owner to add you, or use your own Spotify app."
        );
        assert_eq!(
            api_error(403, "Check settings on developer.spotify.com/dashboard, the user may not be registered.", false),
            "This Spotify app hasn't added your account. Ask its owner to add you, or use your own Spotify app."
        );
        assert_eq!(
            api_error(403, "", true),
            "This Spotify app hasn't added your account. Ask its owner to add you, or use your own Spotify app."
        );
        assert_eq!(api_error(403, "PREMIUM_REQUIRED", false), "Spotify Premium is needed for this.");
        assert_eq!(
            api_error(429, "{\"error\":{\"reason\":\"QUOTA_EXCEEDED\"}}", false),
            "Spotify's limit for this app is used up for now. Try later or use your own Spotify app."
        );
        assert_eq!(api_error(429, "", false), "Spotify is busy right now. Try again later.");
        assert_eq!(api_error(403, "", false), "Spotify didn't allow access to this library item.");
        assert_eq!(api_error(500, "", false), "Couldn't read your Spotify library. Try again.");
        assert_eq!(MSG_SIGN_IN_AGAIN, "Spotify signed you out. Sign in again.");
    }
}
