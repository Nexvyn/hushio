use std::collections::HashMap;
use std::sync::LazyLock;

use regex::{Captures, Regex};
use serde_json::Value;

use super::{LyricBg, LyricsResult, SyncedLyricLine, SyncedLyricWord};

const WORD_DURATION_FALLBACK: f64 = 0.8;

static CREDIT_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[^:：]{1,40}[:：]\s*\S").expect("credit regex"));
static TAG_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\[[A-Za-z_]+\s*:.*\]\s*$").expect("tag regex"));
static KARAOKE_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\[(\d{1,8}),(\d{1,8})\](.*)$").expect("karaoke line regex"));
static KARAOKE_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\((\d{1,8}),(\d{1,8})(?:,\d{1,8})?\)([^()]*)").expect("karaoke prefix regex")
});
static KARAOKE_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([^()]*)\((\d{1,8}),(\d{1,8})(?:,\d{1,8})?\)").expect("karaoke suffix regex")
});
static LRC_STAMP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]").expect("lrc stamp regex"));
static LRC_OFFSET: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^\[offset\s*:([^\]]*)\]$").expect("lrc offset regex"));
static WORD_STAMP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)").expect("word stamp regex")
});

pub enum Parsed {
    Timed(Vec<SyncedLyricLine>),
    Plain(String),
}

#[derive(Clone, Copy, PartialEq)]
enum Role {
    Main,
    Background,
    Roman,
    Translation,
}

struct Word {
    role: Role,
    start: Option<f64>,
    end: Option<f64>,
    text: String,
    space_before: bool,
}

struct Span {
    role: Role,
    begin: Option<f64>,
    end: Option<f64>,
    text: String,
    has_child: bool,
}

struct Paragraph {
    begin: Option<f64>,
    end: Option<f64>,
    key: Option<String>,
    words: Vec<Word>,
    space: bool,
}

enum Token {
    Open {
        name: String,
        attrs: Vec<(String, String)>,
        empty: bool,
    },
    Close(String),
    Text(String),
}

#[derive(Default)]
struct Walker {
    finished: Vec<Paragraph>,
    paragraph: Option<Paragraph>,
    spans: Vec<Span>,
    in_translit: bool,
    translit_entry: Option<(String, String)>,
    translit: HashMap<String, String>,
}

pub fn parse_ttml(xml: &str) -> Vec<SyncedLyricLine> {
    let mut walker = Walker::default();
    for token in tokenize(xml) {
        match token {
            Token::Open { name, attrs, empty } => walker.open(&name, &attrs, empty),
            Token::Close(name) => walker.close(&name),
            Token::Text(text) => walker.text(&text),
        }
    }
    walker.finish()
}

fn tokenize(input: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut rest = input;
    while let Some(start) = rest.find('<') {
        if start > 0 {
            tokens.push(Token::Text(decode(&rest[..start])));
        }
        rest = &rest[start..];
        if let Some(body) = rest.strip_prefix("<!--") {
            rest = body.find("-->").map_or("", |end| &body[end + 3..]);
            continue;
        }
        let Some(end) = rest.find('>') else {
            break;
        };
        let inner = &rest[1..end];
        rest = &rest[end + 1..];
        if inner.starts_with(['?', '!']) {
            continue;
        }
        if let Some(name) = inner.strip_prefix('/') {
            tokens.push(Token::Close(name.trim().to_owned()));
            continue;
        }
        let empty = inner.ends_with('/');
        let inner = inner.trim_end_matches('/');
        let (name, attrs_src) = match inner.find(char::is_whitespace) {
            Some(index) => (&inner[..index], &inner[index..]),
            None => (inner, ""),
        };
        tokens.push(Token::Open {
            name: name.to_owned(),
            attrs: parse_attrs(attrs_src),
            empty,
        });
    }
    if !rest.is_empty() {
        tokens.push(Token::Text(decode(rest)));
    }
    tokens
}

fn parse_attrs(mut src: &str) -> Vec<(String, String)> {
    let mut attrs = Vec::new();
    loop {
        src = src.trim_start();
        let Some(eq) = src.find('=') else {
            break;
        };
        let name = src[..eq].trim().to_owned();
        src = src[eq + 1..].trim_start();
        let Some(quote) = src.chars().next().filter(|c| *c == '"' || *c == '\'') else {
            break;
        };
        let body = &src[1..];
        let Some(close) = body.find(quote) else {
            break;
        };
        attrs.push((name, decode(&body[..close])));
        src = &body[close + 1..];
    }
    attrs
}

fn decode(text: &str) -> String {
    if !text.contains('&') {
        return text.to_owned();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        let tail = &rest[at..];
        let Some(end) = tail.find(';').filter(|end| *end <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..end];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => entity.strip_prefix('#').and_then(|number| {
                match number.strip_prefix(['x', 'X']) {
                    Some(hex) => u32::from_str_radix(hex, 16).ok(),
                    None => number.parse::<u32>().ok(),
                }
                .and_then(char::from_u32)
            }),
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &tail[end + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn attr<'a>(attrs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    attrs
        .iter()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.as_str())
}

pub fn parse_ttml_time(text: &str) -> Option<f64> {
    let text = text.trim();
    let seconds = if text.contains(':') {
        text.replace(',', ".")
            .split(':')
            .try_fold(0.0, |total, part| part.parse::<f64>().ok().map(|value| total * 60.0 + value))?
    } else if let Some(ms) = text.strip_suffix("ms") {
        ms.parse::<f64>().ok()? / 1000.0
    } else if let Some(minutes) = text.strip_suffix('m') {
        minutes.parse::<f64>().ok()? * 60.0
    } else if let Some(hours) = text.strip_suffix('h') {
        hours.parse::<f64>().ok()? * 3600.0
    } else {
        text.trim_end_matches('s').replace(',', ".").parse::<f64>().ok()?
    };
    seconds.is_finite().then_some(seconds)
}

impl Walker {
    fn open(&mut self, name: &str, attrs: &[(String, String)], empty: bool) {
        match name {
            "p" => {
                self.paragraph = Some(Paragraph {
                    begin: attr(attrs, "begin").and_then(parse_ttml_time),
                    end: attr(attrs, "end").and_then(parse_ttml_time),
                    key: attr(attrs, "itunes:key").map(str::to_owned),
                    words: Vec::new(),
                    space: false,
                });
                self.spans.clear();
                if empty {
                    self.close_paragraph();
                }
            }
            "transliteration" => self.in_translit = true,
            "text" if self.in_translit => {
                let key = attr(attrs, "for").unwrap_or_default().to_owned();
                self.translit_entry = Some((key, String::new()));
            }
            "span" if self.paragraph.is_some() => {
                let parent = self.spans.last().map(|span| span.role);
                let role = match attr(attrs, "ttm:role") {
                    Some("x-bg") => Role::Background,
                    Some("x-roman") => Role::Roman,
                    Some("x-translation") => Role::Translation,
                    _ => parent.unwrap_or(Role::Main),
                };
                if let Some(parent) = self.spans.last_mut() {
                    parent.has_child = true;
                }
                self.spans.push(Span {
                    role,
                    begin: attr(attrs, "begin").and_then(parse_ttml_time),
                    end: attr(attrs, "end").and_then(parse_ttml_time),
                    text: String::new(),
                    has_child: false,
                });
                if empty {
                    self.close_span();
                }
            }
            _ => {}
        }
    }

    fn close(&mut self, name: &str) {
        match name {
            "p" => self.close_paragraph(),
            "span" => self.close_span(),
            "transliteration" => self.in_translit = false,
            "text" => {
                if let Some((key, text)) = self.translit_entry.take() {
                    self.translit.insert(key, text.split_whitespace().collect::<Vec<_>>().join(" "));
                }
            }
            _ => {}
        }
    }

    fn text(&mut self, text: &str) {
        if let Some((_, buffer)) = self.translit_entry.as_mut() {
            buffer.push_str(text);
            return;
        }
        let Some(paragraph) = self.paragraph.as_mut() else {
            return;
        };
        if let Some(span) = self.spans.last_mut() {
            span.text.push_str(text);
            return;
        }
        if text.trim().is_empty() {
            if !text.is_empty() {
                paragraph.space = true;
            }
            return;
        }
        paragraph.words.push(Word {
            role: Role::Main,
            start: None,
            end: None,
            text: text.trim().to_owned(),
            space_before: paragraph.space || text.starts_with(char::is_whitespace),
        });
        paragraph.space = text.ends_with(char::is_whitespace);
    }

    fn close_span(&mut self) {
        let Some(span) = self.spans.pop() else {
            return;
        };
        if span.has_child {
            return;
        }
        let Some(paragraph) = self.paragraph.as_mut() else {
            return;
        };
        let trimmed = span.text.trim();
        if trimmed.is_empty() {
            if !span.text.is_empty() {
                paragraph.space = true;
            }
            return;
        }
        paragraph.words.push(Word {
            role: span.role,
            start: span.begin,
            end: span.end,
            text: trimmed.to_owned(),
            space_before: paragraph.space || span.text.starts_with(char::is_whitespace),
        });
        paragraph.space = span.text.ends_with(char::is_whitespace);
    }

    fn close_paragraph(&mut self) {
        self.spans.clear();
        if let Some(paragraph) = self.paragraph.take() {
            self.finished.push(paragraph);
        }
    }

    fn finish(mut self) -> Vec<SyncedLyricLine> {
        self.close_paragraph();
        let mut lines: Vec<SyncedLyricLine> = self
            .finished
            .into_iter()
            .filter_map(|paragraph| line_from(paragraph, &self.translit))
            .collect();
        lines.sort_by(|a, b| a.time.total_cmp(&b.time));
        lines
    }
}

fn join(words: &[&Word]) -> String {
    let mut out = String::new();
    for (index, word) in words.iter().enumerate() {
        if index > 0 && word.space_before {
            out.push(' ');
        }
        out.push_str(&word.text);
    }
    collapse(&out)
}

fn timed_words(words: &[&Word], paragraph_end: Option<f64>) -> Option<Vec<SyncedLyricWord>> {
    if words.is_empty() {
        return None;
    }
    let mut timed = Vec::with_capacity(words.len());
    for (index, word) in words.iter().enumerate() {
        let start = word.start?;
        let next = words
            .get(index + 1)
            .and_then(|next| next.start)
            .or(paragraph_end);
        let end = word
            .end
            .or(next)
            .unwrap_or(start + WORD_DURATION_FALLBACK);
        timed.push(SyncedLyricWord {
            start,
            end,
            text: word.text.clone(),
        });
    }
    Some(timed)
}

fn line_from(paragraph: Paragraph, translit: &HashMap<String, String>) -> Option<SyncedLyricLine> {
    let roman: Vec<&Word> = paragraph.words.iter().filter(|w| w.role == Role::Roman).collect();
    let main: Vec<&Word> = paragraph.words.iter().filter(|w| w.role == Role::Main).collect();
    let background: Vec<&Word> = paragraph
        .words
        .iter()
        .filter(|w| w.role == Role::Background)
        .collect();
    let (primary, secondary) = if main.is_empty() {
        (background, Vec::new())
    } else {
        (main, background)
    };
    if primary.is_empty() {
        return None;
    }
    let text = join(&primary);
    if text.is_empty() {
        return None;
    }
    let time = paragraph
        .begin
        .or_else(|| primary.iter().find_map(|word| word.start))?;
    let end = paragraph
        .end
        .or_else(|| primary.last().and_then(|word| word.end));
    let words = timed_words(&primary, paragraph.end);
    let bg = (!secondary.is_empty()).then(|| LyricBg {
        text: join(&secondary),
        words: timed_words(&secondary, paragraph.end),
    });
    let roman_text = if roman.is_empty() {
        paragraph.key.as_ref().and_then(|key| translit.get(key).cloned())
    } else {
        Some(join(&roman))
    };
    let translation: Vec<&Word> = paragraph.words.iter().filter(|w| w.role == Role::Translation).collect();
    let translation = (!translation.is_empty()).then(|| join(&translation));
    Some(SyncedLyricLine {
        time,
        text,
        end,
        words,
        bg,
        roman: roman_text,
        translation,
    })
}

fn ms(caps: &Captures<'_>, index: usize) -> f64 {
    caps[index].parse::<f64>().expect("digits from regex") / 1000.0
}

fn karaoke_words(rest: &str, prefix: bool) -> Vec<(f64, f64, String)> {
    if prefix {
        KARAOKE_PREFIX
            .captures_iter(rest)
            .map(|caps| (ms(&caps, 1), ms(&caps, 2), caps[3].to_owned()))
            .collect()
    } else {
        KARAOKE_SUFFIX
            .captures_iter(rest)
            .map(|caps| (ms(&caps, 2), ms(&caps, 3), caps[1].to_owned()))
            .collect()
    }
}

pub fn parse_karaoke(text: &str) -> Vec<SyncedLyricLine> {
    let headers: Vec<(f64, f64, &str)> = text
        .lines()
        .filter_map(|line| KARAOKE_LINE.captures(line))
        .map(|caps| (ms(&caps, 1), ms(&caps, 2), caps.get(3).map_or("", |m| m.as_str())))
        .collect();
    let text_length = |prefix: bool| -> usize {
        headers
            .iter()
            .flat_map(|(_, _, rest)| karaoke_words(rest, prefix))
            .map(|(_, _, word)| word.chars().count())
            .sum()
    };
    let prefix = text_length(true) >= text_length(false);
    headers
        .into_iter()
        .filter_map(|(start, duration, rest)| {
            let words: Vec<(f64, f64, String)> = karaoke_words(rest, prefix)
                .into_iter()
                .filter(|(_, _, word)| !word.trim().is_empty())
                .collect();
            if words.is_empty() {
                return None;
            }
            let line_text: String = words.iter().map(|(_, _, word)| word.as_str()).collect();
            Some(SyncedLyricLine {
                time: start,
                text: collapse(&line_text),
                end: Some(start + duration),
                words: Some(
                    words
                        .into_iter()
                        .map(|(word_start, word_duration, word)| SyncedLyricWord {
                            start: word_start,
                            end: word_start + word_duration,
                            text: word.trim().to_owned(),
                        })
                        .collect(),
                ),
                bg: None,
                roman: None,
                translation: None,
            })
        })
        .collect()
}

fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn stamp(caps: &Captures<'_>) -> f64 {
    let minutes: f64 = caps[1].parse().expect("digits from regex");
    let seconds: f64 = caps[2].parse().expect("digits from regex");
    let fraction = caps.get(3).map_or(0.0, |digits| {
        let digits = digits.as_str();
        digits.parse::<f64>().expect("digits from regex") / 10f64.powi(digits.len() as i32)
    });
    minutes * 60.0 + seconds + fraction
}

fn lrc_offset_seconds(text: &str) -> f64 {
    text.lines()
        .find_map(|line| LRC_OFFSET.captures(line.trim()))
        .and_then(|caps| caps[1].trim().parse::<i64>().ok())
        .map_or(0.0, |ms| ms as f64 / 1000.0)
}

fn shift_lines(lines: &mut [SyncedLyricLine], seconds: f64) {
    for line in lines.iter_mut() {
        line.time = (line.time - seconds).max(0.0);
        for word in line.words.iter_mut().flatten() {
            word.start = (word.start - seconds).max(0.0);
            word.end = (word.end - seconds).max(0.0);
        }
    }
}

pub fn parse_lrc(text: &str) -> Vec<SyncedLyricLine> {
    let offset = lrc_offset_seconds(text);
    let mut lines = Vec::new();
    for raw in text.lines() {
        let mut rest = raw.trim_start();
        let mut times = Vec::new();
        while let Some(caps) = LRC_STAMP.captures(rest) {
            times.push(stamp(&caps));
            rest = &rest[caps.get(0).expect("whole match").end()..];
        }
        if times.is_empty() {
            continue;
        }
        let body = rest;
        let (line_text, words) = if WORD_STAMP.is_match(body) {
            let parsed: Vec<(f64, String)> = WORD_STAMP
                .captures_iter(body)
                .map(|caps| (stamp(&caps), caps[4].to_owned()))
                .filter(|(_, word)| !word.trim().is_empty())
                .collect();
            let timed: Vec<SyncedLyricWord> = parsed
                .iter()
                .enumerate()
                .map(|(index, (start, word))| SyncedLyricWord {
                    start: *start,
                    end: parsed
                        .get(index + 1)
                        .map_or(start + WORD_DURATION_FALLBACK, |(next, _)| *next),
                    text: word.trim().to_owned(),
                })
                .collect();
            let line_text: String = parsed.iter().map(|(_, word)| word.as_str()).collect();
            (collapse(&line_text), (!timed.is_empty()).then_some(timed))
        } else {
            (body.trim().to_owned(), None)
        };
        for time in times {
            lines.push(SyncedLyricLine {
                time,
                text: line_text.clone(),
                end: None,
                words: words.clone(),
                bg: None,
                roman: None,
                translation: None,
            });
        }
    }
    shift_lines(&mut lines, offset);
    lines.sort_by(|a, b| a.time.total_cmp(&b.time));
    lines
}

fn strip_fence(text: &str) -> &str {
    let Some(rest) = text.strip_prefix("```") else {
        return text;
    };
    let body = rest.split_once('\n').map_or("", |(_, body)| body);
    body.trim_end().strip_suffix("```").unwrap_or(body).trim()
}

pub fn parse_provider_any(raw: &str) -> Option<Parsed> {
    let text = strip_fence(raw.trim_start_matches('\u{feff}').trim());
    if let Ok(value) = serde_json::from_str::<Value>(text) {
        return match value {
            Value::String(inner) => parse_provider_any(&inner),
            _ => None,
        };
    }
    if text.to_ascii_lowercase().contains("<tt") {
        let lines = parse_ttml(text);
        if !lines.is_empty() {
            return Some(Parsed::Timed(lines));
        }
    }
    let karaoke = parse_karaoke(text);
    if !karaoke.is_empty() {
        return Some(Parsed::Timed(karaoke));
    }
    let lrc = parse_lrc(text);
    if !lrc.is_empty() {
        return Some(Parsed::Timed(lrc));
    }
    let lowered = text.to_ascii_lowercase();
    if matches!(lowered.trim(), "lyrics not found" | "unavailable" | "error") {
        return None;
    }
    let plain: Vec<&str> = text
        .lines()
        .filter(|line| !TAG_LINE.is_match(line.trim()))
        .collect();
    let plain = plain.join("\n").trim().to_owned();
    (!plain.is_empty()).then_some(Parsed::Plain(plain))
}

pub fn without_opening(mut lines: Vec<SyncedLyricLine>) -> Vec<SyncedLyricLine> {
    let head = lines
        .iter()
        .take_while(|line| CREDIT_LINE.is_match(&line.text))
        .count();
    lines.drain(..head);
    let tail = lines
        .iter()
        .rev()
        .take_while(|line| CREDIT_LINE.is_match(&line.text))
        .count();
    let keep = lines.len() - tail;
    lines.truncate(keep);
    lines
}

fn line_end(line: &SyncedLyricLine, next: Option<f64>) -> f64 {
    line.end
        .or_else(|| line.words.as_ref().and_then(|words| words.last()).map(|word| word.end))
        .unwrap_or_else(|| line.time + (next.unwrap_or(line.time) - line.time).clamp(2.0, 8.0))
}

pub fn timed_result(source: &str, mut lines: Vec<SyncedLyricLine>) -> Option<LyricsResult> {
    if lines.is_empty() {
        return None;
    }
    lines.sort_by(|a, b| a.time.total_cmp(&b.time));
    let ends: Vec<f64> = lines
        .iter()
        .enumerate()
        .map(|(index, line)| line_end(line, lines.get(index + 1).map(|next| next.time)))
        .collect();
    for (line, end) in lines.iter_mut().zip(ends) {
        line.end = Some(end);
    }
    let word_synced = lines.iter().any(|line| line.words.is_some());
    Some(LyricsResult {
        synced: Some(lines),
        plain: None,
        source: source.to_owned(),
        word_synced,
        custom: false,
    })
}

pub fn plain_result(source: &str, text: String) -> LyricsResult {
    LyricsResult {
        synced: None,
        plain: Some(text),
        source: source.to_owned(),
        word_synced: false,
        custom: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn timed(parsed: Option<Parsed>) -> Vec<SyncedLyricLine> {
        match parsed {
            Some(Parsed::Timed(lines)) => lines,
            _ => panic!("expected timed lyrics"),
        }
    }

    #[test]
    fn ttml_word_spans_become_word_timing() {
        let xml = r#"<tt><body><div><p begin="00:01.000" end="00:03.000" itunes:key="L1"><span begin="00:01.000" end="00:01.500">Hel</span><span begin="00:01.500" end="00:02.000">lo</span> <span begin="00:02.000" end="00:03.000">world</span></p></div></body></tt>"#;
        let lines = parse_ttml(xml);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Hello world");
        assert_eq!(lines[0].time, 1.0);
        let words = lines[0].words.as_ref().expect("word sync");
        assert_eq!(words.len(), 3);
        assert_eq!(words[2].start, 2.0);
        assert_eq!(words[2].end, 3.0);
    }

    #[test]
    fn ttml_background_vocals_are_kept_apart() {
        let xml = r#"<tt><body><p begin="5s" end="8s"><span begin="5s" end="6s">Main</span><span ttm:role="x-bg"><span begin="6s" end="7s">(bg)</span></span></p></body></tt>"#;
        let lines = parse_ttml(xml);
        assert_eq!(lines[0].text, "Main");
        let bg = lines[0].bg.as_ref().expect("background");
        assert_eq!(bg.text, "(bg)");
        assert_eq!(bg.words.as_ref().expect("bg words")[0].start, 6.0);
    }

    #[test]
    fn ttml_translation_spans_are_kept_on_their_line_and_roman_comes_from_head() {
        let xml = r#"<tt><head><metadata><transliterations><transliteration><text for="L1"><span begin="1s" end="2s">annyeong</span></text></transliteration></transliterations></metadata></head><body><p begin="1s" end="2s" itunes:key="L1"><span begin="1s" end="2s">안녕</span><span ttm:role="x-translation" begin="1s" end="2s">hello</span></p></body></tt>"#;
        let lines = parse_ttml(xml);
        assert_eq!(lines[0].text, "안녕");
        assert_eq!(lines[0].roman.as_deref(), Some("annyeong"));
        assert_eq!(lines[0].translation.as_deref(), Some("hello"));
    }

    #[test]
    fn ttml_line_without_translation_has_none() {
        let xml = r#"<tt><body><p begin="1s" end="2s"><span begin="1s" end="2s">plain</span></p></body></tt>"#;
        assert!(parse_ttml(xml)[0].translation.is_none());
    }

    #[test]
    fn ttml_pure_background_line_is_shown_as_the_line() {
        let xml = r#"<tt><body><p begin="2s" end="4s"><span ttm:role="x-bg"><span begin="2s" end="4s">ooh</span></span></p></body></tt>"#;
        let lines = parse_ttml(xml);
        assert_eq!(lines[0].text, "ooh");
        assert!(lines[0].bg.is_none());
    }

    #[test]
    fn ttml_untimed_line_keeps_paragraph_time() {
        let xml = r#"<tt><body><p begin="3s" end="6s">plain words</p></body></tt>"#;
        let lines = parse_ttml(xml);
        assert_eq!(lines[0].text, "plain words");
        assert!(lines[0].words.is_none());
        assert_eq!(lines[0].end, Some(6.0));
    }

    #[test]
    fn ttml_entities_and_time_units_decode() {
        assert_eq!(parse_ttml_time("01:02.5"), Some(62.5));
        assert_eq!(parse_ttml_time("1500ms"), Some(1.5));
        assert_eq!(parse_ttml_time("2m"), Some(120.0));
        assert_eq!(parse_ttml_time("nan"), None);
        let xml = r#"<tt><body><p begin="1s">Tom &amp; Jerry &#x41;</p></body></tt>"#;
        assert_eq!(parse_ttml(xml)[0].text, "Tom & Jerry A");
    }

    #[test]
    fn karaoke_prefix_layout_builds_words() {
        let text = "[1000,2000](1000,500)Hel(1500,500)lo(2000,1000)world";
        let lines = parse_karaoke(text);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Helloworld");
        assert_eq!(lines[0].time, 1.0);
        let words = lines[0].words.as_ref().expect("words");
        assert_eq!(words[1].start, 1.5);
        assert_eq!(words[1].end, 2.0);
    }

    #[test]
    fn karaoke_suffix_layout_is_chosen_when_it_has_more_text() {
        let text = "[0,3000]Hello(0,500)  world(500,2000)\n[3000,1000]x(3000,500)";
        let lines = parse_karaoke(text);
        assert_eq!(lines[0].text, "Hello world");
        assert_eq!(lines[0].end, Some(3.0));
    }

    #[test]
    fn enhanced_lrc_reads_word_stamps_and_plain_lrc_reads_lines() {
        let enhanced = "[00:01.00]<00:01.00>Hel<00:01.50>lo <00:02.00>there";
        let lines = parse_lrc(enhanced);
        assert_eq!(lines[0].text, "Hello there");
        assert_eq!(lines[0].words.as_ref().expect("words")[2].start, 2.0);

        let plain = "[00:05.50]line one\n[00:09.25][00:12.00]line two\n[ar:Someone]";
        let lines = parse_lrc(plain);
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].time, 5.5);
        assert_eq!(lines[2].text, "line two");
        assert!(lines[0].words.is_none());
    }

    #[test]
    fn provider_envelope_unwraps_json_strings_and_drops_tag_lines() {
        let wrapped = serde_json::to_string("[00:01.00]Wrapped").expect("json");
        assert_eq!(timed(parse_provider_any(&wrapped))[0].text, "Wrapped");

        let fenced = "```lrc\n[00:02.00]Fenced\n```";
        assert_eq!(timed(parse_provider_any(fenced))[0].text, "Fenced");

        match parse_provider_any("[ti:Song]\nFirst line\nSecond line") {
            Some(Parsed::Plain(text)) => assert_eq!(text, "First line\nSecond line"),
            _ => panic!("expected plain text"),
        }
    }

    #[test]
    fn provider_sentinels_and_json_objects_are_no_answer() {
        assert!(parse_provider_any("Lyrics Not Found").is_none());
        assert!(parse_provider_any("error").is_none());
        assert!(parse_provider_any(r#"{"error":"nope"}"#).is_none());
    }

    #[test]
    fn credit_lines_are_removed_from_both_ends() {
        let lines = vec![
            SyncedLyricLine::at(0.0, "词/曲：Writer"),
            SyncedLyricLine::at(1.0, "Real line"),
            SyncedLyricLine::at(2.0, "Lyrics by: Writer"),
        ];
        let kept = without_opening(lines);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].text, "Real line");
    }

    #[test]
    fn timed_result_fills_line_ends_and_flags_word_sync() {
        let mut first = SyncedLyricLine::at(1.0, "a");
        first.words = Some(vec![SyncedLyricWord {
            start: 1.0,
            end: 1.4,
            text: "a".to_owned(),
        }]);
        let result = timed_result("Test", vec![SyncedLyricLine::at(9.0, "b"), first]).expect("lines");
        let lines = result.synced.expect("synced");
        assert_eq!(lines[0].end, Some(1.4));
        assert_eq!(lines[1].end, Some(11.0));
        assert!(result.word_synced);
        assert!(timed_result("Test", Vec::new()).is_none());
    }

    #[test]
    fn ttml_agent_attributes_leave_the_text_alone() {
        let xml = r#"<tt><body><p begin="1s" end="2s" ttm:agent="v2"><span begin="1s" end="2s">Hi</span></p></body></tt>"#;
        let lines = parse_ttml(xml);
        assert_eq!(lines[0].text, "Hi");
        assert_eq!(lines[0].end, Some(2.0));
    }

    #[test]
    fn lrc_stamps_without_hundredths_and_crlf_endings() {
        let lines = parse_lrc("[00:05]Five\r\n[00:07.5]Seven\r\n");
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].time, 5.0);
        assert_eq!(lines[0].text, "Five");
        assert_eq!(lines[1].time, 7.5);
        assert_eq!(lines[1].text, "Seven");
    }

    #[test]
    fn enhanced_lrc_last_word_lasts_the_fallback_length() {
        let lines = parse_lrc("[00:01.00]<00:01.00>one <00:02.00>two");
        let words = lines[0].words.as_ref().expect("words");
        assert_eq!(words[0].end, 2.0);
        assert!((words[1].end - 2.8).abs() < 1e-9);
    }

    #[test]
    fn lrc_offset_positive_shows_lyrics_earlier() {
        let lines = parse_lrc("[offset:+500]\n[00:05.00]Line");
        assert_eq!(lines.len(), 1);
        assert!((lines[0].time - 4.5).abs() < 1e-9);
        assert_eq!(lines[0].text, "Line");
    }

    #[test]
    fn lrc_offset_negative_with_spaces_shows_lyrics_later() {
        let lines = parse_lrc("[OFFSET: -250]\n[00:05.00]Line");
        assert!((lines[0].time - 5.25).abs() < 1e-9);
    }

    #[test]
    fn lrc_offset_clamps_times_at_zero() {
        let lines = parse_lrc("[offset:+10000]\n[00:03.00]Early\n[00:12.00]Later");
        assert_eq!(lines[0].time, 0.0);
        assert!((lines[1].time - 2.0).abs() < 1e-9);
    }

    #[test]
    fn lrc_offset_shifts_word_stamps() {
        let lines = parse_lrc("[offset:+500]\n[00:01.00]<00:01.00>one <00:02.00>two");
        assert!((lines[0].time - 0.5).abs() < 1e-9);
        let words = lines[0].words.as_ref().expect("words");
        assert!((words[0].start - 0.5).abs() < 1e-9);
        assert!((words[0].end - 1.5).abs() < 1e-9);
        assert!((words[1].start - 1.5).abs() < 1e-9);
        assert!((words[1].end - 2.3).abs() < 1e-9);
    }

    #[test]
    fn lrc_malformed_offset_is_ignored() {
        for tag in ["[offset:abc]", "[offset:]", "[offset:+ 5 0]"] {
            let lines = parse_lrc(&format!("{tag}\n[00:05.00]Line"));
            assert_eq!(lines[0].time, 5.0, "tag {tag}");
        }
    }

    #[test]
    fn lrc_without_offset_is_unchanged() {
        let lines = parse_lrc("[00:05.00]Line\n[00:07.50]Next");
        assert_eq!(lines[0].time, 5.0);
        assert_eq!(lines[1].time, 7.5);
    }

    #[test]
    fn byte_order_mark_before_lrc_is_ignored() {
        let lines = timed(parse_provider_any("\u{feff}[00:01.00]First"));
        assert_eq!(lines[0].text, "First");
        assert_eq!(lines[0].time, 1.0);
    }

    #[test]
    fn plain_text_keeps_blank_lines_between_stanzas() {
        match parse_provider_any("First line\nsecond\n\nNext stanza") {
            Some(Parsed::Plain(text)) => assert_eq!(text, "First line\nsecond\n\nNext stanza"),
            _ => panic!("expected plain text"),
        }
    }
}
