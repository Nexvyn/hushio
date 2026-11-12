use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::recognition::SAMPLE_RATE;

const TARGET_RATE: u32 = SAMPLE_RATE;

pub struct Capture {
    samples: Vec<i16>,
}

impl Capture {
    pub fn samples(&self) -> &[i16] {
        &self.samples
    }
}

fn resample(samples: &[i16], from: u32, to: u32) -> Vec<i16> {
    if from == to || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let count = (samples.len() as f64 / ratio) as usize;
    let mut out = Vec::with_capacity(count);
    for index in 0..count {
        let position = index as f64 * ratio;
        let whole = position.floor() as usize;
        let fraction = (position - whole as f64) as f32;
        if whole + 1 < samples.len() {
            let first = samples[whole] as f32;
            let second = samples[whole + 1] as f32;
            out.push((first + (second - first) * fraction) as i16);
        } else if whole < samples.len() {
            out.push(samples[whole]);
        }
    }
    out
}

/// Records from the default microphone and returns mono 16-bit samples at 16 kHz.
#[cfg(desktop)]
pub fn record(seconds: u64) -> Result<Capture, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone was found.".to_owned())?;
    let config = device
        .default_input_config()
        .map_err(|error| error.to_string())?;
    let from_rate = config.sample_rate();
    let channels = config.channels() as u16;

    let (sender, receiver) = mpsc::channel::<i16>();
    let sender = std::sync::Arc::new(std::sync::Mutex::new(sender));
    let error = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));

    let stream_error = std::sync::Arc::clone(&error);
    let stream_sender = std::sync::Arc::clone(&sender);
    let stream = match device.build_input_stream(
        config.config(),
        move |data: &[f32], _: &cpal::InputCallbackInfo| {            let mono: Vec<i16> = match channels {
                1 => data.iter().map(|sample| (*sample * 32768.0) as i16).collect(),
                _ => data
                    .chunks(channels as usize)
                    .map(|frame| {
                        let sum: f32 = frame.iter().sum();
                        (sum / frame.len() as f32 * 32768.0) as i16
                    })
                    .collect(),
            };
            let guard = match stream_sender.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            for sample in mono {
                if guard.send(sample).is_err() {
                    break;
                }
            }
        },
        move |error| {
            let mut guard = stream_error
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *guard = Some(error.to_string());
        },
        None,
    ) {
        Ok(stream) => stream,
        Err(error) => return Err(error.to_string()),
    };

    if let Err(error) = stream.play() {
        return Err(error.to_string());
    }

    let wanted = (from_rate as u64 * seconds) as usize;
    let deadline = Instant::now() + Duration::from_secs(seconds + 2);
    let mut collected: Vec<i16> = Vec::with_capacity(wanted as usize);
    while collected.len() < wanted && Instant::now() < deadline {
        let timeout = Duration::from_millis(200);
        match receiver.recv_timeout(timeout) {
            Ok(sample) => collected.push(sample),
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    drop(stream);

    if let Some(message) = error
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
    {
        return Err(message);
    }
    if collected.len() < (from_rate as usize / 2) {
        return Err("The microphone gave no sound.".to_owned());
    }
    Ok(Capture {
        samples: resample(&collected, from_rate, TARGET_RATE),
    })
}

#[cfg(not(desktop))]
pub fn record(_seconds: u64) -> Result<Capture, String> {
    Err("Song recognition is not available on this platform.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_resample_halves_the_sample_count() {
        let samples: Vec<i16> = (0..100).map(|value| value as i16).collect();
        let out = resample(&samples, 32_000, 16_000);
        assert_eq!(out.len(), 50);
    }

    #[test]
    fn a_resample_at_the_same_rate_changes_nothing() {
        let samples: Vec<i16> = (0..10).map(|value| value as i16).collect();
        assert_eq!(resample(&samples, 16_000, 16_000), samples);
    }
}
