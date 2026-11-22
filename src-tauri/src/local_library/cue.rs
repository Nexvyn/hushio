use std::collections::HashSet;
use std::fs;
use std::path::Path;

const FRAMES_PER_SECOND: f64 = 75.0;
const FILE_TYPES: [&str; 6] = ["WAVE", "MP3", "AIFF", "BINARY", "MOTOROLA", "FLAC"];
const CP1252_HIGH: [char; 32] = [
    '\u{20AC}', '\u{81}', '\u{201A}', '\u{0192}', '\u{201E}', '\u{2026}', '\u{2020}', '\u{2021}', '\u{02C6}', '\u{2030}', '\u{0160}',
    '\u{2039}', '\u{0152}', '\u{8D}', '\u{017D}', '\u{8F}', '\u{90}', '\u{2018}', '\u{2019}', '\u{201C}', '\u{201D}', '\u{2022}',
    '\u{2013}', '\u{2014}', '\u{02DC}', '\u{2122}', '\u{0161}', '\u{203A}', '\u{0153}', '\u{9D}', '\u{017E}', '\u{0178}',
];

#[derive(Debug, Clone, PartialEq)]
pub struct CueTrack {
    pub number: u32,
    pub title: Option<String>,
    pub performer: Option<String>,
    pub start: f64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Sheet {
    pub file: String,
    pub title: Option<String>,
    pub performer: Option<String>,
    pub genre: Option<String>,
    pub date: Option<String>,
    pub tracks: Vec<CueTrack>,
}

#[derive(Default)]
struct Draft {
    number: u32,
    audio: bool,
    title: Option<String>,
    performer: Option<String>,
    start: Option<f64>,
}

pub fn is_cue_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".cue")
}

pub fn read_sheet(path: &Path) -> Option<Sheet> {
    let bytes = fs::read(path).ok()?;
    parse(&decode(&bytes))
}

pub fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => bytes.iter().map(|&byte| windows_1252(byte)).collect(),
    }
}

fn windows_1252(byte: u8) -> char {
    match byte {
        0x80..=0x9F => CP1252_HIGH[usize::from(byte - 0x80)],
        _ => char::from(byte),
    }
}

pub fn parse(text: &str) -> Option<Sheet> {
    let mut sheet = Sheet::default();
    let mut drafts: Vec<Draft> = Vec::new();
    let mut files = 0;
    for line in text.lines() {
        let (keyword, rest) = split_word(line.trim());
        match keyword.to_ascii_uppercase().as_str() {
            "FILE" => {
                files += 1;
                sheet.file = file_name(rest);
            }
            "TRACK" => {
                let mut parts = rest.split_whitespace();
                let number = parts.next()?.parse::<u32>().ok()?;
                let audio = parts.next().is_some_and(|kind| kind.eq_ignore_ascii_case("AUDIO"));
                drafts.push(Draft {
                    number,
                    audio,
                    ..Draft::default()
                });
            }
            "TITLE" => match drafts.last_mut() {
                Some(track) => track.title = text_value(rest),
                None => sheet.title = text_value(rest),
            },
            "PERFORMER" => match drafts.last_mut() {
                Some(track) => track.performer = text_value(rest),
                None => sheet.performer = text_value(rest),
            },
            "INDEX" => {
                let mut parts = rest.split_whitespace();
                if parts.next() == Some("01") {
                    if let Some(track) = drafts.last_mut() {
                        track.start = parse_time(parts.next());
                    }
                }
            }
            "REM" => {
                let (name, value) = split_word(rest);
                match name.to_ascii_uppercase().as_str() {
                    "GENRE" => sheet.genre = text_value(value),
                    "DATE" => sheet.date = text_value(value),
                    _ => {}
                }
            }
            _ => {}
        }
    }
    if files != 1 || sheet.file.is_empty() {
        return None;
    }

    let mut numbers = HashSet::new();
    let mut tracks = Vec::new();
    for draft in drafts.into_iter().filter(|draft| draft.audio) {
        let Some(start) = draft.start else {
            continue;
        };
        if !numbers.insert(draft.number) {
            return None;
        }
        tracks.push(CueTrack {
            number: draft.number,
            title: draft.title,
            performer: draft.performer,
            start,
        });
    }
    if tracks.len() < 2 || tracks.windows(2).any(|pair| pair[1].start <= pair[0].start) {
        return None;
    }
    sheet.tracks = tracks;
    Some(sheet)
}

fn split_word(line: &str) -> (&str, &str) {
    let end = line.find(char::is_whitespace).unwrap_or(line.len());
    (&line[..end], line[end..].trim())
}

fn text_value(rest: &str) -> Option<String> {
    let value = match rest.strip_prefix('"').and_then(|inner| inner.strip_suffix('"')) {
        Some(inner) => inner,
        None => rest,
    };
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn file_name(rest: &str) -> String {
    if let Some(inner) = rest.strip_prefix('"') {
        return inner.split('"').next().unwrap_or_default().to_string();
    }
    let trimmed = rest.trim_end();
    match trimmed.rsplit_once(char::is_whitespace) {
        Some((name, kind)) if FILE_TYPES.iter().any(|known| kind.eq_ignore_ascii_case(known)) => name.trim().to_string(),
        _ => trimmed.to_string(),
    }
}

fn parse_time(time: Option<&str>) -> Option<f64> {
    let mut parts = time?.split(':');
    let minutes = parts.next()?.parse::<u32>().ok()?;
    let seconds = parts.next()?.parse::<u32>().ok()?;
    let frames = parts.next()?.parse::<u32>().ok()?;
    if parts.next().is_some() || seconds >= 60 || frames >= 75 {
        return None;
    }
    Some(f64::from(minutes) * 60.0 + f64::from(seconds) + f64::from(frames) / FRAMES_PER_SECOND)
}

#[cfg(test)]
mod tests;
