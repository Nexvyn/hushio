use std::f64::consts::TAU;
use std::io::Cursor;
use std::path::PathBuf;

use serde::Serialize;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{CODEC_TYPE_NULL, DecoderOptions};
use symphonia::core::errors::Error as DecodeError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::reveal::Folders;

pub const PROXY_PREFIX: &str = "http://127.0.0.1:";
const MAX_BYTES: usize = 150 * 1024 * 1024;
const MAX_CHANNELS: usize = 2;
const SOUND_THRESHOLD: f32 = 0.008;
const SILENCE_MARGIN_S: f64 = 0.04;
const MIN_RATE: u32 = 8000;
const SUB_BLOCK_S: f64 = 0.1;
const BLOCK_SUBS: usize = 4;
const ABSOLUTE_GATE_LUFS: f64 = -70.0;
const RELATIVE_GATE_LU: f64 = 10.0;
const LUFS_OFFSET: f64 = -0.691;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub head: f64,
    pub tail: f64,
    pub lufs: Option<f64>,
}

#[derive(Clone, Copy)]
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
    x: [f64; 2],
    y: [f64; 2],
}

impl Biquad {
    fn normalised(b: [f64; 3], a0: f64, a: [f64; 2]) -> Self {
        Self {
            b: b.map(|value| value / a0),
            a: a.map(|value| value / a0),
            x: [0.0; 2],
            y: [0.0; 2],
        }
    }

    fn run(&mut self, input: f64) -> f64 {
        let output = self.b[0] * input + self.b[1] * self.x[0] + self.b[2] * self.x[1]
            - self.a[0] * self.y[0]
            - self.a[1] * self.y[1];
        self.x = [input, self.x[0]];
        self.y = [output, self.y[0]];
        output
    }
}

fn high_shelf(rate: f64, hz: f64, gain_db: f64, q: f64) -> Biquad {
    let a = 10f64.powf(gain_db / 40.0);
    let (sin, cos) = (TAU * hz / rate).sin_cos();
    let alpha = sin / (2.0 * q);
    let root = 2.0 * a.sqrt() * alpha;
    Biquad::normalised(
        [
            a * ((a + 1.0) + (a - 1.0) * cos + root),
            -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
            a * ((a + 1.0) + (a - 1.0) * cos - root),
        ],
        (a + 1.0) - (a - 1.0) * cos + root,
        [
            2.0 * ((a - 1.0) - (a + 1.0) * cos),
            (a + 1.0) - (a - 1.0) * cos - root,
        ],
    )
}

fn high_pass(rate: f64, hz: f64, q: f64) -> Biquad {
    let (sin, cos) = (TAU * hz / rate).sin_cos();
    let alpha = sin / (2.0 * q);
    Biquad::normalised(
        [(1.0 + cos) / 2.0, -(1.0 + cos), (1.0 + cos) / 2.0],
        1.0 + alpha,
        [-2.0 * cos, 1.0 - alpha],
    )
}

fn power_from_lufs(lufs: f64) -> f64 {
    10f64.powf((lufs - LUFS_OFFSET) / 10.0)
}

struct Meter {
    rate: u32,
    frames: usize,
    filters: Vec<[Biquad; 2]>,
    sub_len: usize,
    sub_frames: usize,
    sub_energy: f64,
    subs: Vec<f64>,
    first_sound: Option<usize>,
    last_sound: Option<usize>,
}

impl Meter {
    fn new(rate: u32, channels: usize) -> Self {
        let hz = f64::from(rate);
        Self {
            rate,
            frames: 0,
            filters: (0..channels)
                .map(|_| {
                    [
                        high_shelf(hz, 1681.974450955533, 3.999843853973347, 0.7071752369554196),
                        high_pass(hz, 38.13547087602444, 0.5003270373238773),
                    ]
                })
                .collect(),
            sub_len: (hz * SUB_BLOCK_S).round() as usize,
            sub_frames: 0,
            sub_energy: 0.0,
            subs: Vec::new(),
            first_sound: None,
            last_sound: None,
        }
    }

    fn push(&mut self, frame: &[f32]) {
        if frame.iter().any(|sample| sample.abs() > SOUND_THRESHOLD) {
            self.first_sound.get_or_insert(self.frames);
            self.last_sound = Some(self.frames);
        }
        for (filters, &sample) in self.filters.iter_mut().zip(frame) {
            let shelved = filters[0].run(f64::from(sample));
            let weighted = filters[1].run(shelved);
            self.sub_energy += weighted * weighted;
        }
        self.frames += 1;
        self.sub_frames += 1;
        if self.sub_frames == self.sub_len {
            self.subs.push(self.sub_energy / self.sub_len as f64);
            self.sub_energy = 0.0;
            self.sub_frames = 0;
        }
    }

    fn finish(self) -> Analysis {
        let rate = f64::from(self.rate);
        let (head, tail) = match (self.first_sound, self.last_sound) {
            (Some(first), Some(last)) => {
                let margin = ((rate * SILENCE_MARGIN_S).floor() as usize).max(1);
                let head = first.saturating_sub(margin);
                let tail = self.frames - self.frames.min(last + margin + 1);
                (head as f64 / rate, tail as f64 / rate)
            }
            _ => (0.0, 0.0),
        };
        Analysis {
            head,
            tail,
            lufs: self.integrated(),
        }
    }

    fn integrated(&self) -> Option<f64> {
        if self.rate < MIN_RATE || self.frames < self.rate as usize {
            return None;
        }
        let absolute = power_from_lufs(ABSOLUTE_GATE_LUFS);
        let open: Vec<f64> = self
            .subs
            .windows(BLOCK_SUBS)
            .map(|block| block.iter().sum::<f64>() / BLOCK_SUBS as f64)
            .filter(|&power| power > absolute)
            .collect();
        if open.is_empty() {
            return None;
        }
        let open_mean = open.iter().sum::<f64>() / open.len() as f64;
        let relative = open_mean * 10f64.powf(-RELATIVE_GATE_LU / 10.0);
        let gated: Vec<f64> = open.into_iter().filter(|&power| power > relative).collect();
        let mean = gated.iter().sum::<f64>() / gated.len() as f64;
        Some(LUFS_OFFSET + 10.0 * mean.log10())
    }
}

pub fn analyse(source: Box<dyn MediaSource>, extension: Option<&str>) -> Result<Analysis, String> {
    let mut hint = Hint::new();
    if let Some(extension) = extension {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            MediaSourceStream::new(source, Default::default()),
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| error.to_string())?;
    let mut format = probed.format;
    let (track_id, params) = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .map(|track| (track.id, track.codec_params.clone()))
        .ok_or_else(|| "No audio track".to_owned())?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&params, &DecoderOptions::default())
        .map_err(|error| error.to_string())?;

    let mut meter: Option<Meter> = None;
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(DecodeError::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(error) => return Err(error.to_string()),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(DecodeError::DecodeError(_)) => continue,
            Err(error) => return Err(error.to_string()),
        };
        let spec = *decoded.spec();
        let total = spec.channels.count();
        if total == 0 {
            continue;
        }
        let used = total.min(MAX_CHANNELS);
        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        buffer.copy_interleaved_ref(decoded);
        let active = meter.get_or_insert_with(|| Meter::new(spec.rate, used));
        for frame in buffer.samples().chunks_exact(total) {
            active.push(&frame[..used]);
        }
    }
    meter
        .map(Meter::finish)
        .ok_or_else(|| "No decodable audio".to_owned())
}

async fn download(url: &str) -> Result<Vec<u8>, String> {
    let mut response = reqwest::Client::new()
        .get(url)
        .header(reqwest::header::RANGE, "bytes=0-")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Stream answered {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES as u64)
    {
        return Err("Stream is larger than 150 MiB".to_owned());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("Stream is larger than 150 MiB".to_owned());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub async fn analyse_source(source: String, folders: &Folders) -> Result<Analysis, String> {
    if source.starts_with(PROXY_PREFIX) {
        let bytes = download(&source).await?;
        return tauri::async_runtime::spawn_blocking(move || analyse(Box::new(Cursor::new(bytes)), None))
            .await
            .map_err(|error| error.to_string())?;
    }
    let path = PathBuf::from(&source);
    folders.check(&path)?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_owned);
    let file = std::fs::File::open(&path).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || analyse(Box::new(file), extension.as_deref()))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests;
