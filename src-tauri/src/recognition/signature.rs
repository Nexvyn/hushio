use std::sync::LazyLock;

const SAMPLE_RATE: u32 = 16_000;
const FFT_SIZE: usize = 2048;
const FFT_OUTPUT: usize = 1025;
const HOP_SIZE: usize = 128;
const MAX_PEAKS: usize = 255;
const MAX_SECONDS: f64 = 12.0;
const RING_SIZE: usize = 256;
const SPREAD_MIN: f64 = 1.0 / 64.0;
const HEADER_SIZE: usize = 48;

const TIME_SPREAD_OFFSETS: [usize; 3] = [1, 3, 6];
const PEAK_NEIGHBOR_OFFSETS: [isize; 8] = [-10, -7, -4, -3, 1, 2, 5, 8];
const PEAK_SPREAD_OFFSETS: [isize; 14] = [
    -53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249,
];

const BAND_250_520: usize = 0;
const BAND_520_1450: usize = 1;
const BAND_1450_3500: usize = 2;
const BAND_3500_5500: usize = 3;
const BANDS: usize = 4;

static WINDOW: LazyLock<Vec<f64>> = LazyLock::new(|| {
    (0..FFT_SIZE)
        .map(|index| {
            0.5 * (1.0
                - (2.0 * std::f64::consts::PI * (index as f64 + 1.0) / (FFT_SIZE as f64 + 1.0)).cos())
        })
        .collect()
});

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Peak {
    pub band: usize,
    pub pass: u32,
    pub magnitude: u16,
    pub corrected_bin: u16,
}

fn fft(real: &mut [f64], imaginary: &mut [f64]) {
    let n = real.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            real.swap(i, j);
            imaginary.swap(i, j);
        }
    }
    let mut length = 2;
    while length <= n {
        let angle = -2.0 * std::f64::consts::PI / length as f64;
        let step_real = angle.cos();
        let step_imaginary = angle.sin();
        let mut i = 0;
        while i < n {
            let mut block_real = 1.0;
            let mut block_imaginary = 0.0;
            for k in 0..length / 2 {
                let upper_real = real[i + k];
                let upper_imaginary = imaginary[i + k];
                let lower_real = real[i + k + length / 2] * block_real
                    - imaginary[i + k + length / 2] * block_imaginary;
                let lower_imaginary = real[i + k + length / 2] * block_imaginary
                    + imaginary[i + k + length / 2] * block_real;
                real[i + k] = upper_real + lower_real;
                imaginary[i + k] = upper_imaginary + lower_imaginary;
                real[i + k + length / 2] = upper_real - lower_real;
                imaginary[i + k + length / 2] = upper_imaginary - lower_imaginary;
                let next_real = block_real * step_real - block_imaginary * step_imaginary;
                block_imaginary = block_real * step_imaginary + block_imaginary * step_real;
                block_real = next_real;
            }
            i += length;
        }
        length <<= 1;
    }
}

fn band_of(bin: usize) -> Option<usize> {
    let frequency = bin as f64 * SAMPLE_RATE as f64 / 2.0 / FFT_OUTPUT as f64;
    match frequency {
        f if f < 250.0 => None,
        f if f < 520.0 => Some(BAND_250_520),
        f if f < 1450.0 => Some(BAND_520_1450),
        f if f < 3500.0 => Some(BAND_1450_3500),
        f if f < 5500.0 => Some(BAND_3500_5500),
        _ => None,
    }
}

fn magnitudes(samples: &[i16]) -> Vec<f64> {
    let mut real = vec![0.0; FFT_SIZE];
    let mut imaginary = vec![0.0; FFT_SIZE];
    for (index, slot) in real.iter_mut().enumerate() {
        *slot = samples[index] as f64 / 32768.0 * WINDOW[index];
    }
    fft(&mut real, &mut imaginary);
    (0..FFT_OUTPUT)
        .map(|index| {
            let value = (real[index] * real[index] + imaginary[index] * imaginary[index]) / 131_072.0;
            value.max(1e-10)
        })
        .collect()
}

fn spread(values: &mut [f64]) {
    for position in 0..FFT_OUTPUT.saturating_sub(2) {
        let value = values[position].max(values[position + 1]).max(values[position + 2]);
        values[position] = value;
    }
}

fn is_peak(magnitudes: &[f64], spread: &[f64], bin: usize) -> bool {
    if bin < 10 || bin >= 1016 {
        return false;
    }
    let value = magnitudes[bin];
    if value < SPREAD_MIN || value < spread[bin] {
        return false;
    }
    for offset in PEAK_NEIGHBOR_OFFSETS {
        let other = bin as isize + offset;
        if other < 0 || other as usize >= FFT_OUTPUT {
            continue;
        }
        if magnitudes[other as usize] > value {
            return false;
        }
    }
    for offset in PEAK_SPREAD_OFFSETS {
        let other = bin as isize + offset;
        if other < 0 || other as usize >= FFT_OUTPUT {
            continue;
        }
        if spread[other as usize] > value {
            return false;
        }
    }
    true
}

fn interpolate(magnitudes: &[f64], bin: usize) -> u16 {
    let peak = magnitudes[bin].max(SPREAD_MIN).ln() * 1477.3 + 6144.0;
    let before = magnitudes[bin - 1].max(SPREAD_MIN).ln() * 1477.3 + 6144.0;
    let after = magnitudes[bin + 1].max(SPREAD_MIN).ln() * 1477.3 + 6144.0;
    let variation_one = 2.0 * peak - before - after;
    let variation_two = if variation_one.abs() < 1e-9 {
        0.0
    } else {
        (after - before) * 32.0 / variation_one
    };
    let corrected = bin as f64 * 64.0 + variation_two;
    corrected.round().clamp(0.0, u16::MAX as f64) as u16
}

fn magnitude_of(value: f64) -> u16 {
    (value.max(SPREAD_MIN).ln() * 1477.3 + 6144.0)
        .round()
        .clamp(0.0, u16::MAX as f64) as u16
}

/// Builds the peak list the Shazam endpoint takes from mono 16-bit samples at 16 kHz.
pub fn peaks_from(samples: &[i16]) -> Vec<Peak> {
    let mut peaks: Vec<Peak> = Vec::new();
    let mut samples_ring = vec![0i16; FFT_SIZE];
    let mut ring_pos = 0usize;
    let mut hop = 0usize;
    let mut fft_ring: Vec<Option<Vec<f64>>> = vec![None; RING_SIZE];
    let mut spread_ring: Vec<Option<Vec<f64>>> = vec![None; RING_SIZE];
    let mut written = 0usize;
    let mut elapsed = 0.0f64;

    for sample in samples {
        samples_ring[ring_pos] = *sample;
        ring_pos = (ring_pos + 1) % FFT_SIZE;
        hop += 1;
        if hop < HOP_SIZE {
            continue;
        }
        hop = 0;
        elapsed += HOP_SIZE as f64 / SAMPLE_RATE as f64;
        if elapsed >= MAX_SECONDS && peaks.len() >= MAX_PEAKS {
            break;
        }

        let mut window = vec![0i16; FFT_SIZE];
        let mut index = ring_pos;
        for slot in window.iter_mut() {
            *slot = samples_ring[index];
            index = (index + 1) % FFT_SIZE;
        }
        let mut magnitudes = magnitudes(&window);
        spread(&mut magnitudes);

        let slot = written % RING_SIZE;
        if let Some(older) = spread_ring[slot].as_mut() {
            for (target, source) in older.iter_mut().zip(magnitudes.iter()) {
                if *source > *target {
                    *target = *source;
                }
            }
        }
        for offset in TIME_SPREAD_OFFSETS {
            let older_slot = (written + RING_SIZE - offset) % RING_SIZE;
            if let Some(older) = spread_ring[older_slot].as_mut() {
                for (target, source) in older.iter_mut().zip(magnitudes.iter()) {
                    if *source > *target {
                        *target = *source;
                    }
                }
            }
        }
        spread_ring[slot] = Some(magnitudes.clone());
        fft_ring[slot] = Some(magnitudes);
        written += 1;

        if written < 50 {
            continue;
        }
        let fft_slot = (written + RING_SIZE - 47) % RING_SIZE;
        let spread_slot = (written + RING_SIZE - 50) % RING_SIZE;
        let (Some(fft_frame), Some(spread_frame)) = (
            fft_ring[fft_slot].clone(),
            spread_ring[spread_slot].clone(),
        ) else {
            continue;
        };
        let pass = (written - 47) as u32;
        for bin in 10..1016 {
            if !is_peak(&fft_frame, &spread_frame, bin) {
                continue;
            }
            let Some(band) = band_of(bin) else {
                continue;
            };
            peaks.push(Peak {
                band,
                pass,
                magnitude: magnitude_of(fft_frame[bin]),
                corrected_bin: interpolate(&fft_frame, bin),
            });
            if peaks.len() >= MAX_PEAKS {
                break;
            }
        }
    }

    peaks
}

fn write_u32(buffer: &mut Vec<u8>, value: u32) {
    buffer.extend_from_slice(&value.to_le_bytes());
}

fn write_u16(buffer: &mut Vec<u8>, value: u16) {
    buffer.extend_from_slice(&value.to_le_bytes());
}

fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for (index, slot) in table.iter_mut().enumerate() {
        let mut value = index as u32;
        for _ in 0..8 {
            value = if value & 1 != 0 {
                0xEDB8_8320 ^ (value >> 1)
            } else {
                value >> 1
            };
        }
        *slot = value;
    }
    let mut crc = 0xFFFF_FFFFu32;
    for byte in data {
        crc = table[((crc ^ *byte as u32) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc ^ 0xFFFF_FFFF
}

/// Packs the peaks into the binary format the Shazam endpoint takes.
pub fn encode_signature(peaks: &[Peak], sample_count: usize) -> Vec<u8> {
    let mut contents: Vec<u8> = Vec::new();
    for band in 0..BANDS {
        let in_band: Vec<&Peak> = peaks.iter().filter(|peak| peak.band == band).collect();
        if in_band.is_empty() {
            continue;
        }
        let mut band_bytes: Vec<u8> = Vec::new();
        let mut previous_pass: i64 = -1;
        for peak in in_band {
            let delta = peak.pass as i64 - previous_pass;
            previous_pass = peak.pass as i64;
            if delta >= 255 {
                band_bytes.push(0xFF);
                write_u32(&mut band_bytes, peak.pass);
            } else {
                band_bytes.push(delta as u8);
            }
            write_u16(&mut band_bytes, peak.magnitude);
            write_u16(&mut band_bytes, peak.corrected_bin);
        }
        write_u32(&mut contents, 0x6003_0040 + band as u32);
        write_u32(&mut contents, band_bytes.len() as u32);
        contents.extend_from_slice(&band_bytes);
        while contents.len() % 4 != 0 {
            contents.push(0);
        }
    }

    let mut out: Vec<u8> = Vec::with_capacity(HEADER_SIZE + contents.len() + 8);
    write_u32(&mut out, 0xcafe_2580);
    write_u32(&mut out, 0);
    write_u32(&mut out, (contents.len() + 8) as u32);
    write_u32(&mut out, 0x9411_9c00);
    out.extend_from_slice(&[0, 0, 0]);
    write_u32(&mut out, 3 << 27);
    out.extend_from_slice(&[0, 0]);
    write_u32(&mut out, (sample_count + SAMPLE_RATE as usize * 24 / 100) as u32);
    write_u32(&mut out, (15 << 19) + 0x40000);
    while out.len() < HEADER_SIZE {
        out.push(0);
    }
    write_u32(&mut out, 0x4000_0000);
    write_u32(&mut out, (contents.len() + 8) as u32);
    out.extend_from_slice(&contents);
    let checksum = crc32(&out[8..]);
    out[4..8].copy_from_slice(&checksum.to_le_bytes());
    out
}

pub fn signature_of(samples: &[i16]) -> Vec<u8> {
    let peaks = peaks_from(samples);
    encode_signature(&peaks, samples.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(frequency: f64, count: usize) -> Vec<i16> {
        (0..count)
            .map(|index| {
                let value =
                    (2.0 * std::f64::consts::PI * frequency * index as f64 / SAMPLE_RATE as f64).sin();
                (value * 20_000.0) as i16
            })
            .collect()
    }

    #[test]
    fn a_tone_gives_peaks_in_the_middle_bands() {
        let peaks = peaks_from(&tone(1000.0, SAMPLE_RATE as usize * 3));
        assert!(!peaks.is_empty());
        assert!(peaks.iter().all(|peak| peak.band == BAND_520_1450));
    }

    #[test]
    fn a_silent_sample_gives_no_peaks() {
        assert!(peaks_from(&vec![0i16; 16_000]).is_empty());
    }

    #[test]
    fn the_peaks_come_out_in_order_and_with_a_growing_pass() {
        let peaks = peaks_from(&tone(1000.0, SAMPLE_RATE as usize * 3));
        let passes = peaks.iter().map(|peak| peak.pass).collect::<Vec<_>>();
        let mut sorted = passes.clone();
        sorted.sort_unstable();
        assert_eq!(passes, sorted);
        assert!(passes.first().is_some_and(|first| *first > 0));
    }

    #[test]
    fn the_signature_starts_with_the_shazam_magic_numbers() {
        let signature = signature_of(&tone(1000.0, SAMPLE_RATE as usize));
        assert_eq!(&signature[0..4], &[0x80, 0x25, 0xfe, 0xca]);
        assert_eq!(&signature[12..16], &[0x00, 0x9c, 0x11, 0x94]);
    }

    #[test]
    fn the_signature_carries_the_checksum_over_the_body() {
        let signature = signature_of(&tone(1000.0, SAMPLE_RATE as usize));
        let expected = crc32(&signature[8..]);
        assert_eq!(&signature[4..8], &expected.to_le_bytes());
    }

    #[test]
    fn the_bands_are_written_in_order_with_a_length() {
        let peaks = vec![
            Peak {
                band: BAND_250_520,
                pass: 3,
                magnitude: 100,
                corrected_bin: 200,
            },
            Peak {
                band: BAND_3500_5500,
                pass: 4,
                magnitude: 110,
                corrected_bin: 210,
            },
        ];
        let bytes = encode_signature(&peaks, 16_000);
        let start = HEADER_SIZE + 8;
        let tag = u32::from_le_bytes([bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]]);
        assert_eq!(tag, 0x6003_0040);
        let length = u32::from_le_bytes([
            bytes[start + 4],
            bytes[start + 5],
            bytes[start + 6],
            bytes[start + 7],
        ]);
        assert_eq!(length, 5);
    }

    #[test]
    fn a_frequency_under_250_hertz_is_left_out() {
        assert!(band_of(1).is_none());
        assert_eq!(band_of(40), Some(BAND_250_520));
        assert_eq!(band_of(120), Some(BAND_520_1450));
        assert_eq!(band_of(300), Some(BAND_1450_3500));
        assert_eq!(band_of(600), Some(BAND_3500_5500));
        assert!(band_of(1024).is_none());
    }
}
