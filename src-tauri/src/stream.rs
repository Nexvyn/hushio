use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, Method, StatusCode, Uri, header};
use axum::response::Response;
use axum::routing::get;
use serde::Deserialize;
use tokio::sync::OnceCell;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::io::ReaderStream;

pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(20);
const SERVED_CAP: usize = 500;
const LOCAL_FILE_CAP: usize = 500;
const APP_ORIGINS: [&str; 3] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];
const HOST_NAMES: [&str; 3] = ["127.0.0.1", "localhost", "[::1]"];
const DEV_HOST_NAMES: [&str; 2] = ["127.0.0.1", "localhost"];

pub trait Upstream: Send + Sync + 'static {
    fn resolve(
        &self,
        id: &str,
        refresh: bool,
        max_kbps: Option<u32>,
    ) -> impl Future<Output = Option<String>> + Send;
}

#[derive(Clone, Default)]
pub struct Registry {
    urls: Arc<Mutex<HashMap<String, String>>>,
}

impl Registry {
    pub fn register(&self, id: &str, url: &str) -> Result<(), &'static str> {
        if id.is_empty() {
            return Err("missing id");
        }
        if !url.starts_with("https://") {
            return Err("stream url must be https");
        }
        self.urls
            .lock()
            .expect("registry lock")
            .insert(id.to_owned(), url.to_owned());
        Ok(())
    }
}

impl Upstream for Registry {
    fn resolve(
        &self,
        id: &str,
        _refresh: bool,
        _max_kbps: Option<u32>,
    ) -> impl Future<Output = Option<String>> + Send {
        let url = self.urls.lock().expect("registry lock").get(id).cloned();
        std::future::ready(url)
    }
}

pub struct StreamProxy<R> {
    upstream: Arc<R>,
    local_files: Arc<Mutex<LocalFiles>>,
    network: Arc<Mutex<Option<Arc<crate::network::Service>>>>,
    port: OnceCell<u16>,
}

impl<R: Upstream> StreamProxy<R> {
    pub fn new(upstream: R) -> Self {
        Self {
            upstream: Arc::new(upstream),
            local_files: Arc::new(Mutex::new(LocalFiles::default())),
            network: Arc::new(Mutex::new(None)),
            port: OnceCell::new(),
        }
    }

    pub fn set_network(&self, network: Arc<crate::network::Service>) {
        *self.network.lock().expect("network proxy lock") = Some(network);
    }

    pub fn register_local_file(&self, id: &str, path: &Path) -> Result<(), String> {
        if !is_local_id(id) {
            return Err("invalid local track id".to_owned());
        }
        let path = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
        if !path.is_file() {
            return Err("local track path is not a file".to_owned());
        }
        self.local_files
            .lock()
            .expect("local files lock")
            .set(id.to_owned(), path);
        Ok(())
    }

    pub async fn start(&self) -> io::Result<u16> {
        self.port
            .get_or_try_init(|| async {
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
                let port = listener.local_addr()?.port();
                let state = Arc::new(ProxyState {
                    upstream: Arc::clone(&self.upstream),
                    client: upstream_client()?,
                    served: Mutex::new(Served::default()),
                    local_files: Arc::clone(&self.local_files),
                    network: Arc::clone(&self.network),
                });
                tokio::spawn(async move {
                    if let Err(error) = axum::serve(listener, router(state)).await {
                        tracing::warn!(%error, "stream proxy stopped");
                    }
                });
                tracing::info!("stream proxy on 127.0.0.1:{port}");
                Ok(port)
            })
            .await
            .copied()
    }
}

struct ProxyState<R> {
    upstream: Arc<R>,
    client: reqwest::Client,
    served: Mutex<Served>,
    local_files: Arc<Mutex<LocalFiles>>,
    network: Arc<Mutex<Option<Arc<crate::network::Service>>>>,
}

#[derive(Default)]
struct LocalFiles {
    paths: HashMap<String, PathBuf>,
    order: VecDeque<String>,
}

impl LocalFiles {
    fn get(&self, id: &str) -> Option<&Path> {
        self.paths.get(id).map(PathBuf::as_path)
    }

    fn set(&mut self, id: String, path: PathBuf) {
        if self.paths.insert(id.clone(), path).is_none() {
            self.order.push_back(id);
        }
        while self.order.len() > LOCAL_FILE_CAP {
            if let Some(oldest) = self.order.pop_front() {
                self.paths.remove(&oldest);
            }
        }
    }
}

#[derive(Default)]
struct Served {
    identities: HashMap<String, String>,
    order: VecDeque<String>,
}

impl Served {
    fn get(&self, key: &str) -> Option<&str> {
        self.identities.get(key).map(String::as_str)
    }

    fn set(&mut self, key: String, identity: String) {
        if self.identities.insert(key.clone(), identity).is_none() {
            self.order.push_back(key);
        }
        while self.order.len() > SERVED_CAP {
            if let Some(oldest) = self.order.pop_front() {
                self.identities.remove(&oldest);
            }
        }
    }
}

#[derive(Deserialize)]
struct Params {
    id: Option<String>,
    kbps: Option<String>,
}

fn router<R: Upstream>(state: Arc<ProxyState<R>>) -> Router {
    Router::new().route("/", get(serve::<R>)).with_state(state)
}

fn upstream_client() -> io::Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(UPSTREAM_TIMEOUT)
        .read_timeout(UPSTREAM_TIMEOUT)
        .no_gzip()
        .build()
        .map_err(io::Error::other)
}

async fn serve<R: Upstream>(
    State(state): State<Arc<ProxyState<R>>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    Query(params): Query<Params>,
) -> Response {
    if !gate_allows(&headers) {
        return status_only(StatusCode::FORBIDDEN);
    }
    let Some(id) = params.id.filter(|id| !id.is_empty()) else {
        return text(StatusCode::BAD_REQUEST, "missing id");
    };
    if id.starts_with("net:") {
        let network = state.network.lock().expect("network proxy lock").clone();
        let Some(network) = network else { return status_only(StatusCode::NOT_FOUND) };
        let encoded: String = url::form_urlencoded::byte_serialize(id.as_bytes()).collect();
        let mut request = axum::http::Request::builder().method(method).uri(format!("/{encoded}"));
        if let Some(range) = headers.get(header::RANGE) { request = request.header(header::RANGE, range); }
        let Ok(request) = request.body(Vec::new()) else { return status_only(StatusCode::BAD_REQUEST) };
        let response = crate::network::serve_track(&network, &request).await;
        let (mut parts, bytes) = response.into_parts();
        parts.headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, axum::http::HeaderValue::from_static("*"));
        return Response::from_parts(parts, Body::from(bytes));
    }
    let max_kbps = params.kbps.as_deref().and_then(parse_kbps);
    let range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let local_path = state
        .local_files
        .lock()
        .expect("local files lock")
        .get(&id)
        .map(Path::to_path_buf);
    if let Some(path) = local_path {
        return serve_local_file(&path, &method, range.as_deref()).await;
    }
    if id.starts_with("local:") {
        return status_only(StatusCode::NOT_FOUND);
    }
    play(&state, &id, &uri.to_string(), range.as_deref(), max_kbps).await
}

fn is_local_id(id: &str) -> bool {
    id.strip_prefix("local:").is_some_and(|hash| {
        hash.len() == 16 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn parse_byte_range(value: &str, len: u64) -> Option<(u64, u64)> {
    let range = value.strip_prefix("bytes=")?;
    if range.contains(',') || len == 0 {
        return None;
    }
    let (start, end) = range.split_once('-')?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().ok()?;
        if suffix == 0 {
            return None;
        }
        return Some((len.saturating_sub(suffix), len - 1));
    }
    let start = start.parse::<u64>().ok()?;
    if start >= len {
        return None;
    }
    let end = if end.is_empty() {
        len - 1
    } else {
        end.parse::<u64>().ok()?.min(len - 1)
    };
    (end >= start).then_some((start, end))
}

async fn serve_local_file(path: &Path, method: &Method, range: Option<&str>) -> Response {
    let mut file = match tokio::fs::File::open(path).await {
        Ok(file) => file,
        Err(_) => return status_only(StatusCode::NOT_FOUND),
    };
    let len = match file.metadata().await {
        Ok(metadata) => metadata.len(),
        Err(_) => return status_only(StatusCode::NOT_FOUND),
    };
    let content_type = mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_owned();
    let mut response = Response::builder()
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_TYPE, content_type);

    if let Some(range) = range {
        let Some((start, end)) = parse_byte_range(range, len) else {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(header::CONTENT_RANGE, format!("bytes */{len}"))
                .header(header::CONTENT_LENGTH, "0")
                .body(Body::empty())
                .expect("static response parts are valid");
        };
        let bytes = end - start + 1;
        if file.seek(SeekFrom::Start(start)).await.is_err() {
            return status_only(StatusCode::INTERNAL_SERVER_ERROR);
        }
        response = response
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(header::CONTENT_LENGTH, bytes);
        let body = if *method == Method::HEAD {
            Body::empty()
        } else {
            Body::from_stream(ReaderStream::new(file.take(bytes)))
        };
        return response.body(body).unwrap_or_else(|_| status_only(StatusCode::INTERNAL_SERVER_ERROR));
    }

    response = response.header(header::CONTENT_LENGTH, len);
    let body = if *method == Method::HEAD {
        Body::empty()
    } else {
        Body::from_stream(ReaderStream::new(file))
    };
    response.body(body).unwrap_or_else(|_| status_only(StatusCode::INTERNAL_SERVER_ERROR))
}

async fn play<R: Upstream>(
    state: &ProxyState<R>,
    id: &str,
    key: &str,
    range: Option<&str>,
    max_kbps: Option<u32>,
) -> Response {
    let Some((url, upstream)) = open_upstream(state, id, max_kbps, range).await else {
        return text(StatusCode::BAD_GATEWAY, "proxy error");
    };
    let status = upstream.status();
    if !status.is_success() {
        tracing::warn!("proxy upstream HTTP {status} for {id}");
        let status = if status == StatusCode::FORBIDDEN {
            StatusCode::NOT_FOUND
        } else {
            status
        };
        return status_only(status);
    }

    let identity = format!(
        "{}:{}",
        itag(&url).unwrap_or("?"),
        rendition_length(&upstream).unwrap_or("?")
    );
    let mismatch = range.is_some_and(|range| !range.starts_with("bytes=0-"))
        && state
            .served
            .lock()
            .expect("served map lock")
            .get(key)
            .is_some_and(|previous| previous != identity);
    if mismatch {
        tracing::warn!("rendition changed mid-song for {id}, refusing the range");
        return with_cors(StatusCode::CONFLICT, Body::empty());
    }
    state
        .served
        .lock()
        .expect("served map lock")
        .set(key.to_owned(), identity);

    let mut response = Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store");
    for name in [
        header::CONTENT_TYPE,
        header::CONTENT_LENGTH,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
    ] {
        if let Some(value) = upstream.headers().get(&name) {
            response = response.header(name, value.clone());
        }
    }
    response
        .body(Body::from_stream(upstream.bytes_stream()))
        .unwrap_or_else(|_| text(StatusCode::BAD_GATEWAY, "proxy error"))
}

async fn open_upstream<R: Upstream>(
    state: &ProxyState<R>,
    id: &str,
    max_kbps: Option<u32>,
    range: Option<&str>,
) -> Option<(String, reqwest::Response)> {
    let url = state.upstream.resolve(id, false, max_kbps).await?;
    let response = fetch(&state.client, &url, range).await?;
    if response.status() != StatusCode::FORBIDDEN {
        return Some((url, response));
    }
    tracing::warn!("proxy upstream 403 for {id}, re-resolving");
    let url = state.upstream.resolve(id, true, max_kbps).await?;
    let response = fetch(&state.client, &url, range).await?;
    Some((url, response))
}

async fn fetch(
    client: &reqwest::Client,
    url: &str,
    range: Option<&str>,
) -> Option<reqwest::Response> {
    let mut request = client.get(url);
    if let Some(range) = range {
        request = request.header(header::RANGE, range);
    }
    match request.send().await {
        Ok(response) => Some(response),
        Err(error) => {
            tracing::warn!(error = %error.without_url(), "proxy upstream request failed");
            None
        }
    }
}

fn gate_allows(headers: &HeaderMap) -> bool {
    let host_ok = headers.get(header::HOST).is_none_or(|host| {
        host.to_str()
            .is_ok_and(|host| loopback_authority(host, &HOST_NAMES))
    });
    let origin_ok = headers
        .get(header::ORIGIN)
        .is_none_or(|origin| origin.to_str().is_ok_and(origin_allowed));
    host_ok && origin_ok
}

fn origin_allowed(origin: &str) -> bool {
    origin == "null"
        || APP_ORIGINS.contains(&origin)
        || origin
            .strip_prefix("https://")
            .or_else(|| origin.strip_prefix("http://"))
            .is_some_and(|authority| loopback_authority(authority, &DEV_HOST_NAMES))
}

fn loopback_authority(value: &str, names: &[&str]) -> bool {
    let (host, port) = if value.starts_with('[') {
        match value.find(']') {
            Some(end) => value.split_at(end + 1),
            None => return false,
        }
    } else {
        match value.rfind(':') {
            Some(index) => value.split_at(index),
            None => (value, ""),
        }
    };
    let port_ok = port.is_empty()
        || port
            .strip_prefix(':')
            .is_some_and(|digits| !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()));
    port_ok && names.iter().any(|name| host.eq_ignore_ascii_case(name))
}

fn parse_kbps(value: &str) -> Option<u32> {
    let kbps = value.parse::<f64>().ok()?;
    (kbps.is_finite() && kbps > 0.0).then(|| kbps.floor() as u32)
}

fn itag(url: &str) -> Option<&str> {
    url.split(['?', '&'])
        .find_map(|pair| pair.strip_prefix("itag="))
}

fn header_text(response: &reqwest::Response, name: header::HeaderName) -> Option<&str> {
    response.headers().get(name)?.to_str().ok()
}

fn rendition_length(response: &reqwest::Response) -> Option<&str> {
    if response.status() == StatusCode::PARTIAL_CONTENT {
        header_text(response, header::CONTENT_RANGE)
            .and_then(|range| range.rsplit_once('/'))
            .map(|(_, total)| total)
            .filter(|total| !total.is_empty() && total.bytes().all(|b| b.is_ascii_digit()))
    } else {
        header_text(response, header::CONTENT_LENGTH)
    }
}

fn status_only(status: StatusCode) -> Response {
    with_cors(status, Body::empty())
}

fn text(status: StatusCode, message: &'static str) -> Response {
    with_cors(status, Body::from(message))
}

fn with_cors(status: StatusCode, body: Body) -> Response {
    Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .body(body)
        .expect("static response parts are valid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;
    use std::net::SocketAddr;

    const MEDIA_LEN: usize = 1000;

    struct Fixed {
        url: String,
        fresh: Option<String>,
    }

    impl Fixed {
        fn new(url: &str) -> Self {
            Self {
                url: url.to_owned(),
                fresh: None,
            }
        }

        fn with_refresh(url: &str, fresh: &str) -> Self {
            Self {
                url: url.to_owned(),
                fresh: Some(fresh.to_owned()),
            }
        }
    }

    impl Upstream for Fixed {
        fn resolve(
            &self,
            _id: &str,
            refresh: bool,
            _max_kbps: Option<u32>,
        ) -> impl Future<Output = Option<String>> + Send {
            let answer = match (refresh, &self.fresh) {
                (true, Some(fresh)) => fresh.clone(),
                _ => self.url.clone(),
            };
            std::future::ready(Some(answer))
        }
    }

    async fn media(uri: Uri, headers: HeaderMap) -> Response {
        if uri.query().is_some_and(|query| query.contains("expired")) {
            return status_only(StatusCode::FORBIDDEN);
        }
        if headers
            .get(header::RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(|range| range.strip_prefix("bytes="))
            .and_then(|range| range.split('-').next())
            .and_then(|start| start.parse::<usize>().ok())
            .is_some_and(|start| start >= MEDIA_LEN)
        {
            return status_only(StatusCode::RANGE_NOT_SATISFIABLE);
        }
        let (start, end) = headers
            .get(header::RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(|range| range.strip_prefix("bytes="))
            .and_then(|range| range.split_once('-'))
            .map(|(start, end)| {
                (
                    start.parse::<usize>().unwrap_or(0),
                    end.parse::<usize>()
                        .unwrap_or(MEDIA_LEN - 1)
                        .min(MEDIA_LEN - 1),
                )
            })
            .unwrap_or((0, MEDIA_LEN - 1));
        let ranged = headers.contains_key(header::RANGE);
        let body = vec![7u8; end - start + 1];
        let mut response = Response::builder().header(header::ACCEPT_RANGES, "bytes");
        response = if ranged {
            response.status(StatusCode::PARTIAL_CONTENT).header(
                header::CONTENT_RANGE,
                format!("bytes {start}-{end}/{MEDIA_LEN}"),
            )
        } else {
            response.status(StatusCode::OK)
        };
        response
            .header(header::CONTENT_TYPE, "audio/webm")
            .body(Body::from(body))
            .unwrap()
    }

    async fn spawn_upstream() -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, Router::new().route("/media", get(media)))
                .await
                .unwrap();
        });
        format!("http://{addr}/media")
    }

    async fn start_proxy<R: Upstream>(upstream: R) -> SocketAddr {
        let port = StreamProxy::new(upstream).start().await.unwrap();
        SocketAddr::from(([127, 0, 0, 1], port))
    }

    fn client() -> reqwest::Client {
        reqwest::Client::builder().no_gzip().build().unwrap()
    }

    #[tokio::test]
    async fn range_request_passes_through_as_206() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::RANGE, "bytes=0-100")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            response.headers().get(header::CONTENT_RANGE).unwrap(),
            "bytes 0-100/1000"
        );
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "*"
        );
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        assert_eq!(response.bytes().await.unwrap().len(), 101);
    }

    #[tokio::test]
    async fn seek_range_returns_the_requested_slice() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::RANGE, "bytes=500-")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            response.headers().get(header::CONTENT_RANGE).unwrap(),
            "bytes 500-999/1000"
        );
        assert_eq!(response.bytes().await.unwrap().len(), 500);
    }

    #[tokio::test]
    async fn sequential_seek_ranges_keep_the_same_rendition_identity() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;
        let client = client();
        let url = format!("http://{proxy}/?id=abc");
        for (range, length) in [("bytes=0-99", 100), ("bytes=500-", 500), ("bytes=200-299", 100)] {
            let response = client.get(&url).header(header::RANGE, range).send().await.unwrap();
            assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
            assert_eq!(response.bytes().await.unwrap().len(), length);
        }
    }

    #[tokio::test]
    async fn range_past_the_end_is_passed_through_as_416() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::RANGE, "bytes=1000-")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    }

    #[tokio::test]
    async fn full_request_without_range_returns_200() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.bytes().await.unwrap().len(), MEDIA_LEN);
    }

    #[tokio::test]
    async fn missing_id_is_a_bad_request() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?retry=1"))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(response.text().await.unwrap(), "missing id");
    }

    #[tokio::test]
    async fn non_loopback_host_is_refused() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::HOST, "evil.example")
            .header(header::RANGE, "bytes=0-100")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(response.bytes().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn foreign_origin_is_refused_with_empty_body() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::ORIGIN, "https://evil.example")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(response.bytes().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn app_origin_is_served() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::ORIGIN, "tauri://localhost")
            .header(header::RANGE, "bytes=0-9")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    }

    #[tokio::test]
    async fn upstream_403_re_resolves_once_and_serves_the_fresh_url() {
        let upstream = spawn_upstream().await;
        let resolver = Fixed::with_refresh(
            &format!("{upstream}?expired=1&itag=251"),
            &format!("{upstream}?itag=251"),
        );
        let proxy = start_proxy(resolver).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::RANGE, "bytes=0-9")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    }

    #[tokio::test]
    async fn upstream_403_after_refresh_becomes_404() {
        let upstream = spawn_upstream().await;
        let proxy = start_proxy(Fixed::new(&format!("{upstream}?expired=1&itag=251"))).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn range_for_a_different_rendition_is_refused_with_409() {
        let upstream = spawn_upstream().await;
        let state = ProxyState {
            upstream: Arc::new(Fixed::new(&format!("{upstream}?itag=140"))),
            client: upstream_client().unwrap(),
            served: Mutex::new(Served::default()),
            local_files: Arc::new(Mutex::new(LocalFiles::default())),
            network: Arc::new(Mutex::new(None)),
        };
        let key = "/?id=abc";
        state
            .served
            .lock()
            .unwrap()
            .set(key.to_owned(), "251:1000".to_owned());

        let refused = play(&state, "abc", key, Some("bytes=100-"), None).await;
        assert_eq!(refused.status(), StatusCode::CONFLICT);
        assert_eq!(state.served.lock().unwrap().get(key), Some("251:1000"));

        let restart = play(&state, "abc", key, Some("bytes=0-9"), None).await;
        assert_eq!(restart.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(state.served.lock().unwrap().get(key), Some("140:1000"));
    }

    #[tokio::test]
    async fn unresolvable_track_is_a_bad_gateway() {
        let proxy = start_proxy(Registry::default()).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(response.text().await.unwrap(), "proxy error");
    }

    #[tokio::test]
    async fn registered_stream_plays_through_the_proxy() {
        let upstream = spawn_upstream().await;
        let registry = Registry::default();
        registry
            .urls
            .lock()
            .unwrap()
            .insert("abc".to_owned(), format!("{upstream}?itag=251"));
        let proxy = start_proxy(registry).await;

        let response = client()
            .get(format!("http://{proxy}/?id=abc"))
            .header(header::RANGE, "bytes=0-100")
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.bytes().await.unwrap().len(), 101);
    }

    #[tokio::test]
    async fn registered_local_audio_serves_full_and_range_requests() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("song.mp3");
        tokio::fs::write(&path, b"0123456789").await.unwrap();
        let proxy = StreamProxy::new(Registry::default());
        proxy
            .register_local_file("local:0123456789abcdef", &path)
            .unwrap();
        let address = SocketAddr::from(([127, 0, 0, 1], proxy.start().await.unwrap()));
        let url = format!("http://{address}/?id=local:0123456789abcdef");

        let full = client().get(&url).send().await.unwrap();
        assert_eq!(full.status(), StatusCode::OK);
        assert_eq!(full.headers()[header::CONTENT_TYPE], "audio/mpeg");
        assert_eq!(full.bytes().await.unwrap().as_ref(), b"0123456789");

        let range = client()
            .get(&url)
            .header(header::RANGE, "bytes=3-6")
            .send()
            .await
            .unwrap();
        assert_eq!(range.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(range.headers()[header::CONTENT_RANGE], "bytes 3-6/10");
        assert_eq!(range.bytes().await.unwrap().as_ref(), b"3456");
    }

    #[tokio::test]
    async fn local_proxy_refuses_unregistered_local_ids() {
        let address = start_proxy(Registry::default()).await;

        let response = client()
            .get(format!("http://{address}/?id=local:unknown"))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn registry_resolves_only_registered_ids() {
        let registry = Registry::default();
        registry.register("abc", "https://media.example/a").unwrap();
        registry.register("abc", "https://media.example/b").unwrap();

        assert_eq!(
            registry.resolve("abc", false, None).await.as_deref(),
            Some("https://media.example/b")
        );
        assert_eq!(registry.resolve("other", false, None).await, None);
    }

    #[test]
    fn registry_rejects_empty_ids_and_non_https_urls() {
        let registry = Registry::default();

        assert_eq!(registry.register("", "https://media.example/a"), Err("missing id"));
        assert_eq!(
            registry.register("abc", "http://media.example/a"),
            Err("stream url must be https")
        );
        assert_eq!(
            registry.register("abc", "file:///etc/passwd"),
            Err("stream url must be https")
        );
    }

    #[tokio::test]
    async fn start_is_idempotent_and_binds_loopback() {
        let proxy = StreamProxy::new(Registry::default());
        let first = proxy.start().await.unwrap();
        let second = proxy.start().await.unwrap();

        assert_eq!(first, second);
        assert_ne!(first, 0);
        tokio::net::TcpStream::connect(("127.0.0.1", first))
            .await
            .expect("loopback connect");
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn macos_proxies_take_separate_ephemeral_loopback_ports() {
        let first = StreamProxy::new(Registry::default()).start().await.unwrap();
        let second = StreamProxy::new(Registry::default()).start().await.unwrap();

        assert_ne!(first, 0);
        assert_ne!(first, second);
        for port in [first, second] {
            tokio::net::TcpStream::connect(("127.0.0.1", port))
                .await
                .expect("loopback connect");
        }
    }

    #[test]
    fn served_map_evicts_oldest_past_the_cap() {
        let mut served = Served::default();
        for index in 0..=SERVED_CAP {
            served.set(format!("/?id=track{index}"), "251:1".to_owned());
        }

        assert_eq!(served.identities.len(), SERVED_CAP);
        assert_eq!(served.get("/?id=track0"), None);
        assert_eq!(served.get("/?id=track1"), Some("251:1"));
        assert_eq!(
            served.get(&format!("/?id=track{SERVED_CAP}")),
            Some("251:1")
        );
    }

    #[test]
    fn served_map_keeps_every_key_at_the_cap() {
        let mut served = Served::default();
        for index in 0..SERVED_CAP {
            served.set(format!("/?id=track{index}"), "251:1".to_owned());
        }

        assert_eq!(served.identities.len(), SERVED_CAP);
        assert_eq!(served.get("/?id=track0"), Some("251:1"));
    }

    #[test]
    fn served_map_keeps_the_first_identity_for_a_key() {
        let mut served = Served::default();
        served.set("k".to_owned(), "251:1".to_owned());
        served.set("k".to_owned(), "140:2".to_owned());

        assert_eq!(served.get("k"), Some("140:2"));
        assert_eq!(served.order.len(), 1);
    }

    #[test]
    fn host_must_be_loopback_with_optional_port() {
        for accepted in [
            "127.0.0.1",
            "127.0.0.1:5173",
            "localhost",
            "LOCALHOST:0",
            "[::1]",
            "[::1]:8080",
        ] {
            assert!(loopback_authority(accepted, &HOST_NAMES), "{accepted}");
        }
        for refused in [
            "evil.example",
            "127.0.0.1.evil.example",
            "localhost.evil.example",
            "127.0.0.1:",
            "127.0.0.1:port",
            "127.0.0.2",
            "[::2]",
            "[::1",
            "",
        ] {
            assert!(!loopback_authority(refused, &HOST_NAMES), "{refused}");
        }
    }

    #[test]
    fn origin_gate_allows_app_origins_and_dev_renderer_only() {
        for allowed in [
            "null",
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "https://localhost",
        ] {
            assert!(origin_allowed(allowed), "{allowed}");
        }
        for refused in [
            "https://evil.example",
            "http://localhost.evil.example",
            "http://evil.localhost",
            "tauri://evil",
            "http://127.0.0.1:5173/path",
            "file://",
        ] {
            assert!(!origin_allowed(refused), "{refused}");
        }
    }

    #[test]
    fn gate_checks_host_and_origin_headers() {
        let mut headers = HeaderMap::new();
        assert!(gate_allows(&headers));

        headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:1234"));
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("tauri://localhost"),
        );
        assert!(gate_allows(&headers));

        headers.insert(header::HOST, HeaderValue::from_static("rebind.example"));
        assert!(!gate_allows(&headers));

        headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1"));
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://evil.example"),
        );
        assert!(!gate_allows(&headers));
    }

    #[test]
    fn gate_refuses_non_ascii_host_and_origin_headers() {
        let mut host = HeaderMap::new();
        host.insert(
            header::HOST,
            HeaderValue::from_bytes(b"127.0.0.1\xff").unwrap(),
        );
        assert!(!gate_allows(&host));

        let mut origin = HeaderMap::new();
        origin.insert(
            header::ORIGIN,
            HeaderValue::from_bytes(b"tauri://localhost\xff").unwrap(),
        );
        assert!(!gate_allows(&origin));
    }

    #[test]
    fn kbps_is_floored_and_only_positive_finite_values_count() {
        assert_eq!(parse_kbps("128.9"), Some(128));
        assert_eq!(parse_kbps("64"), Some(64));
        assert_eq!(parse_kbps("0"), None);
        assert_eq!(parse_kbps("-5"), None);
        assert_eq!(parse_kbps("inf"), None);
        assert_eq!(parse_kbps("abc"), None);
        assert_eq!(parse_kbps(""), None);
    }

    #[test]
    fn itag_is_read_from_the_upstream_url() {
        assert_eq!(
            itag("https://host/videoplayback?expire=1&itag=251&mime=x"),
            Some("251")
        );
        assert_eq!(itag("https://host/videoplayback?expire=1"), None);
    }

    #[test]
    fn itag_ignores_params_that_only_end_in_itag() {
        assert_eq!(
            itag("https://host/videoplayback?xitag=251&itag=140"),
            Some("140")
        );
        assert_eq!(itag("https://host/videoplayback?xitag=251"), None);
    }
}
