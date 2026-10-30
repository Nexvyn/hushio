use super::*;

fn wav(rate: u32, channels: u16, samples: &[f32]) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + samples.len() * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * u32::from(channels) * 2).to_le_bytes());
    out.extend_from_slice(&(channels * 2).to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        let pcm = (sample.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        out.extend_from_slice(&pcm.to_le_bytes());
    }
    out
}

fn tone(rate: u32, seconds: f64, hz: f64, amplitude: f32) -> Vec<f32> {
    let frames = (f64::from(rate) * seconds) as usize;
    (0..frames)
        .map(|i| amplitude * (TAU * hz * i as f64 / f64::from(rate)).sin() as f32)
        .collect()
}

fn stereo(mono: &[f32]) -> Vec<f32> {
    mono.iter().flat_map(|&sample| [sample, sample]).collect()
}

fn measure(bytes: Vec<u8>) -> Result<Analysis, String> {
    analyse(Box::new(Cursor::new(bytes)), Some("wav"))
}

fn lufs(bytes: Vec<u8>) -> f64 {
    measure(bytes).unwrap().lufs.expect("loudness")
}

#[test]
fn a_second_stereo_channel_of_the_same_tone_adds_three_decibels() {
    let mono = tone(48_000, 4.0, 1000.0, 0.1);
    let one = lufs(wav(48_000, 1, &mono));
    let two = lufs(wav(48_000, 2, &stereo(&mono)));

    assert!((two - one - 3.0103).abs() < 0.05, "stereo {two} vs mono {one}");
}

#[test]
fn doubling_the_amplitude_adds_six_decibels() {
    let quiet = lufs(wav(48_000, 1, &tone(48_000, 4.0, 1000.0, 0.1)));
    let loud = lufs(wav(48_000, 1, &tone(48_000, 4.0, 1000.0, 0.2)));

    assert!((loud - quiet - 6.0206).abs() < 0.05, "loud {loud} vs quiet {quiet}");
}

#[test]
fn passages_below_the_absolute_gate_count_like_silence() {
    let loud = tone(48_000, 1.0, 1000.0, 0.1);
    let mut with_whisper = loud.clone();
    with_whisper.extend(tone(48_000, 4.0, 1000.0, 1e-4));
    let mut with_silence = loud;
    with_silence.extend(vec![0.0; 4 * 48_000]);

    let whisper = lufs(wav(48_000, 1, &with_whisper));
    let silence = lufs(wav(48_000, 1, &with_silence));

    assert!((whisper - silence).abs() < 0.01, "whisper {whisper} vs silence {silence}");
}

#[test]
fn a_passage_only_below_the_absolute_gate_has_no_loudness() {
    let result = measure(wav(48_000, 1, &tone(48_000, 4.0, 1000.0, 1e-4))).unwrap();

    assert_eq!(result.lufs, None);
}

#[test]
fn silence_edges_keep_a_40_ms_margin_around_the_sound() {
    let rate = 22_050;
    let mut samples = vec![0.0; rate as usize];
    samples.extend(tone(rate, 1.0, 1000.0, 0.5));
    samples.extend(vec![0.0; rate as usize]);

    let result = measure(wav(rate, 1, &samples)).unwrap();

    assert!((result.head - 0.9600).abs() < 0.002, "head {}", result.head);
    assert!((result.tail - 0.9600).abs() < 0.002, "tail {}", result.tail);
}

#[test]
fn pure_silence_has_no_edges_and_no_loudness() {
    let result = measure(wav(44_100, 1, &vec![0.0; 88_200])).unwrap();

    assert_eq!(result.head, 0.0);
    assert_eq!(result.tail, 0.0);
    assert_eq!(result.lufs, None);
}

#[test]
fn clips_shorter_than_one_second_have_no_loudness() {
    let result = measure(wav(48_000, 1, &tone(48_000, 0.5, 1000.0, 0.5))).unwrap();

    assert_eq!(result.lufs, None);
}

#[test]
fn rates_below_8_khz_have_no_loudness_but_keep_the_edges() {
    let mut samples = vec![0.0; 4000];
    samples.extend(tone(4000, 3.0, 440.0, 0.5));
    let result = measure(wav(4000, 1, &samples)).unwrap();

    assert_eq!(result.lufs, None);
    assert!((result.head - 0.96).abs() < 0.002, "head {}", result.head);
}

#[test]
fn bytes_that_are_not_audio_are_an_error() {
    let result = analyse(Box::new(Cursor::new(b"not audio at all".to_vec())), None);

    assert!(result.is_err());
}

#[tokio::test]
async fn files_outside_the_approved_folders_are_refused() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let folders = Folders::open(root.path(), root.path().join("downloads"), None).await;
    let inside_file = root.path().join("inside.wav");
    let outside_file = outside.path().join("outside.wav");
    let bytes = wav(48_000, 1, &tone(48_000, 2.0, 1000.0, 0.1));
    std::fs::write(&inside_file, &bytes).unwrap();
    std::fs::write(&outside_file, &bytes).unwrap();

    let refused = analyse_source(outside_file.display().to_string(), &folders).await;
    let allowed = analyse_source(inside_file.display().to_string(), &folders).await;

    assert!(refused.is_err());
    assert!(allowed.unwrap().lufs.is_some());
}
