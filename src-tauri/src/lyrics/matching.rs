use std::sync::LazyLock;

use regex::{Captures, Regex};
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

use super::{Query, han};

const VERSION_WORDS: &[&str] = &[
    "live", "vivo", "directo", "concierto", "concert", "remix", "remixed", "rmx", "mix", "mixed",
    "mashup", "bootleg", "flip", "rework", "vip", "dj", "edit", "extended", "intro", "outro",
    "acoustic", "acustico", "acustica", "unplugged", "instrumental", "inst", "karaoke", "cappella",
    "acapella", "demo", "maqueta", "take", "outtake", "alternate", "rehearsal", "session",
    "sessions", "version", "ver", "cover", "sped", "speed", "slowed", "slow", "reverb",
    "nightcore", "daycore", "lofi", "chopped", "screwed", "8d", "orchestral", "symphonic",
    "reprise", "pt", "part",
];
const VERSION_MARKERS: &[&str] = &["version", "ver"];
const LABEL_WORDS: &[&str] = &[
    "album", "main", "single", "lp", "original", "explicit", "clean", "studio", "mono", "stereo",
];
const TEMPO_EDITS: &[&str] = &[
    "sped", "speed", "slowed", "slow", "reverb", "nightcore", "daycore", "8d", "lofi", "chopped",
    "screwed",
];
const CJK_LIVE: &[&str] = &["演唱会", "演唱會", "音乐会", "音樂會", "现场", "現場", "ライブ", "라이브"];
const CHINESE_NON_VERSIONS: &[&str] = &["唱片", "录音室", "錄音室", "正式", "原"];
const UPLOAD_LABELS: &[&str] = &[
    "official", "video", "audio", "lyric", "lyrics", "lyrical", "visualizer", "mv", "hd", "4k",
    "hq",
];
const PLACEHOLDER_ARTISTS: &[&str] = &["", "unknown artist", "unknown", "various artists", "artist"];
const GENIUS_SYMBOLS: [char; 12] = ['♪', '♫', '★', '☆', '【', '】', '《', '》', '「', '」', '~', '_'];

const SCRIPT_HAN: u8 = 1;
const SCRIPT_HANGUL: u8 = 2;
const SCRIPT_KANA: u8 = 4;
const SCRIPT_LATIN: u8 = 8;

static BRACKET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\(([^()]*)\)|\[([^\[\]]*)\]|（([^（）]*)）|【([^【】]*)】").expect("bracket regex")
});
static CREDIT_SPLIT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\s*(?:,|&|;|、|，|/|×|\+|\s+x\s+|\bfeat\b\.?|\bft\b\.?|\bfeaturing\b|\bwith\b|\band\b)\s*",
    )
    .expect("credit split regex")
});
static FEAT_BRACKET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[\(\[（]\s*(?:feat|ft|featuring)\b[^\)\]）]*[\)\]）]").expect("feat bracket regex")
});
static FEAT_TAIL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\s+(?:feat|ft|featuring)\b\.?\s.*$").expect("feat tail regex"));
static LO_FI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)lo-?fi").expect("lo-fi regex"));
static DECORATION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\s*[\(\[（]\s*(?:official(?:\s+music)?\s+(?:video|audio)|lyric\s+video|lyrics|visualizer|mv|audio)\s*[\)\]）]",
    )
    .expect("decoration regex")
});
static HD_BRACKET: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\s*\[[^\]]*\b(?:hd|4k)\b[^\]]*\]").expect("hd regex"));
static LABEL_TAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\s+-\s+(?:official(?:\s+music)?\s+(?:video|audio)|lyric\s+video|lyrics)(?:\s*[\(\[]?(?:hd|4k)[\)\]]?)?\s*$",
    )
    .expect("label tail regex")
});
static PIPE_TAIL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\|.*$").expect("pipe regex"));
static MV_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\s*[\(\[]?\s*m\s*/\s*v\s*[\)\]]?\s*$").expect("mv regex"));
static LYRIC_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*(?:lyrics?|歌詞|歌词|가사|letra)\s*$").expect("lyric suffix regex")
});
static QUERY_BRACKET: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\([^()]*\)|\[[^\[\]]*\]|（[^（）]*）").expect("query bracket regex"));
static GENIUS_NOISE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\s*[\(\[（][^\)\]）]*\b(?:from|feat|ft|featuring|with|prod|produced by|official|lyrical|video|audio|remix|music video|visualizer|mv|hd|4k|hq|full song)\b[^\)\]）]*[\)\]）]",
    )
    .expect("genius noise regex")
});
static GENIUS_PHRASES: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)official video|official audio|lyrical video|4k video|hd video|music video")
        .expect("genius phrase regex")
});
static PROD_TAIL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bprod\.?\s.*$").expect("prod tail regex"));
static RELEASE_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\s+-\s+(?:single|ep)\s*$").expect("release suffix regex"));
static WHITESPACE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").expect("whitespace regex"));

pub struct Recording {
    pub core: String,
    pub aliases: Vec<String>,
    pub versions: String,
}

pub fn nfkc(text: &str) -> String {
    text.nfkc().collect()
}

pub fn plain_words(text: &str) -> String {
    let decomposed: String = text
        .nfkd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect::<String>()
        .to_lowercase();
    let spaced: String = decomposed
        .chars()
        .map(|c| if c.is_alphanumeric() || is_combining_mark(c) { c } else { ' ' })
        .collect();
    WHITESPACE
        .replace_all(han::fold_han(&spaced).trim(), " ")
        .into_owned()
}

fn collapse(text: &str) -> String {
    WHITESPACE.replace_all(text.trim(), " ").into_owned()
}

fn bracket_content<'a>(caps: &Captures<'a>) -> &'a str {
    caps.iter().skip(1).flatten().next().map_or("", |m| m.as_str())
}

fn split_brackets(text: &str) -> (String, Vec<String>) {
    let mut outside = String::new();
    let mut inside = Vec::new();
    let mut last = 0;
    for caps in BRACKET.captures_iter(text) {
        let whole = caps.get(0).expect("whole match");
        outside.push_str(&text[last..whole.start()]);
        outside.push(' ');
        last = whole.end();
        inside.push(bracket_content(&caps).to_owned());
    }
    outside.push_str(&text[last..]);
    (outside, inside)
}

fn tokens(text: &str) -> Vec<String> {
    let folded = LO_FI.replace_all(text, "lofi");
    plain_words(&folded)
        .split_whitespace()
        .map(str::to_owned)
        .collect()
}

fn canonical(token: &str) -> &str {
    match token {
        "vivo" | "directo" | "concierto" | "concert" => "live",
        "acustico" | "acustica" => "acoustic",
        "maqueta" => "demo",
        other => other,
    }
}

fn is_version_word(token: &str) -> bool {
    VERSION_WORDS.contains(&token) && !VERSION_MARKERS.contains(&token)
}

fn version_words(text: &str) -> Vec<String> {
    tokens(text)
        .iter()
        .filter(|word| is_version_word(word))
        .map(|word| canonical(word).to_owned())
        .collect()
}

fn scripts(text: &str) -> u8 {
    text.chars().fold(0, |acc, c| {
        acc | match c {
            '\u{4e00}'..='\u{9fff}'
            | '\u{3400}'..='\u{4dbf}'
            | '\u{f900}'..='\u{faff}'
            | '\u{20000}'..='\u{2fa1f}' => SCRIPT_HAN,
            '\u{ac00}'..='\u{d7af}' | '\u{1100}'..='\u{11ff}' | '\u{3130}'..='\u{318f}' => SCRIPT_HANGUL,
            '\u{3040}'..='\u{30ff}' => SCRIPT_KANA,
            'a'..='z' | 'A'..='Z' | '\u{c0}'..='\u{24f}' => SCRIPT_LATIN,
            _ => 0,
        }
    })
}

fn bracket_versions(inside: &str) -> Vec<String> {
    let words = tokens(inside);
    let mut found = version_words(inside);
    if found.is_empty() {
        if words.iter().any(|word| VERSION_MARKERS.contains(&word.as_str())) {
            let qualifiers: Vec<&str> = words
                .iter()
                .map(String::as_str)
                .filter(|word| !LABEL_WORDS.contains(word) && !VERSION_MARKERS.contains(word))
                .collect();
            if !qualifiers.is_empty() {
                found.push(format!("version:{}", qualifiers.join(" ")));
            }
        } else if let Some(index) = inside.find('版') {
            let base = inside[..index].trim();
            if !base.is_empty() && !CHINESE_NON_VERSIONS.contains(&base) {
                found.push(format!("版:{}", plain_words(base)));
            }
        }
    }
    if CJK_LIVE.iter().any(|key| inside.contains(*key)) {
        found.push("live".to_owned());
    }
    found
}

pub fn recording_name(title: &str, plain_text: bool) -> Recording {
    let title = strip_feat(&nfkc(title));
    let (outside, inside) = split_brackets(&title);
    let (head, after_dash) = match outside.split_once(" - ") {
        Some((head, after)) => (head.to_owned(), Some(after.to_owned())),
        None => (outside.clone(), None),
    };
    let head_scripts = scripts(&head);
    let mut versions = Vec::new();
    let mut aliases = Vec::new();
    for content in &inside {
        let found = bracket_versions(content);
        let content_scripts = scripts(content);
        if found.is_empty() && content_scripts != 0 && (content_scripts & head_scripts) == 0 {
            aliases.push(plain_words(content));
        }
        versions.extend(found);
    }
    if let Some(after) = after_dash {
        versions.extend(version_words(&after));
    }
    if plain_text {
        versions.retain(|token| !TEMPO_EDITS.contains(&token.as_str()));
    }
    versions.sort();
    versions.dedup();
    aliases.sort();
    aliases.dedup();
    Recording {
        core: plain_words(&head),
        aliases,
        versions: versions.join(" "),
    }
}

pub fn same_name(a: &Recording, b: &Recording) -> bool {
    a.versions == b.versions
        && ((!a.core.is_empty() && a.core == b.core)
            || a.aliases.iter().any(|alias| b.aliases.contains(alias) || *alias == b.core)
            || b.aliases.iter().any(|alias| *alias == a.core))
}

fn strip_feat(title: &str) -> String {
    let without_brackets = FEAT_BRACKET.replace_all(title, " ");
    FEAT_TAIL.replace(&without_brackets, "").into_owned()
}

pub fn clean_title(raw: &str) -> String {
    let mut title = DECORATION.replace_all(raw, "").into_owned();
    title = HD_BRACKET.replace_all(&title, "").into_owned();
    title = LABEL_TAIL.replace_all(&title, "").into_owned();
    title = PIPE_TAIL.replace_all(&title, "").into_owned();
    title = MV_SUFFIX.replace_all(&title, "").into_owned();
    if let Some(end) = LYRIC_SUFFIX.find(&title).map(|m| m.start()) {
        let stripped = &title[..end];
        let name = match stripped.split_once(" - ") {
            Some((_, song)) => song,
            None => stripped,
        };
        if !name.trim().is_empty() {
            title = name.to_owned();
        }
    }
    collapse(&title)
}

pub fn query_title(raw: &str) -> String {
    collapse(&QUERY_BRACKET.replace_all(raw, " "))
}

pub fn search_title(raw: &str) -> String {
    strip_feat(&clean_title(raw)).trim().to_owned()
}

pub fn genius_clean_query(raw: &str) -> String {
    let mut text = raw.to_owned();
    for symbol in GENIUS_SYMBOLS {
        text = text.replace(symbol, " ");
    }
    text = GENIUS_NOISE.replace_all(&text, "").into_owned();
    text = GENIUS_PHRASES.replace_all(&text, "").into_owned();
    text = PROD_TAIL.replace_all(&text, "").into_owned();
    if let Some((before, _)) = text.split_once(" | ") {
        text = before.to_owned();
    }
    collapse(&text)
}

pub fn release_name(album: &str) -> String {
    let cleaned = clean_title(album);
    RELEASE_SUFFIX.replace(&cleaned, "").trim().to_owned()
}

pub fn artist_names(artist: &str) -> Vec<String> {
    let artist = nfkc(artist);
    let (outside, inside) = split_brackets(&artist);
    let mut raw: Vec<String> = Vec::new();
    for content in inside {
        if tokens(&content).iter().any(|word| is_version_word(word)) {
            continue;
        }
        raw.extend(split_credit(&content));
    }
    raw.extend(split_credit(&outside));
    raw.iter()
        .map(|name| plain_words(name))
        .filter(|name| !PLACEHOLDER_ARTISTS.contains(&name.as_str()))
        .collect()
}

fn split_credit(text: &str) -> Vec<String> {
    CREDIT_SPLIT
        .split(text)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect()
}

pub fn share_artist(a: &[String], b: &[String]) -> bool {
    a.iter().any(|name| b.contains(name))
}

pub fn comparable(a: &[String], b: &[String]) -> bool {
    (scripts(&a.join(" ")) & scripts(&b.join(" "))) != 0
}

fn has_bracket(text: &str) -> bool {
    text.contains(['(', '[', '（', '【'])
}

fn is_upload_label(content: &str) -> bool {
    tokens(content)
        .iter()
        .any(|word| UPLOAD_LABELS.contains(&word.as_str()))
        || (scripts(content) & SCRIPT_LATIN) == 0
}

fn strip_labels(rest: &str) -> String {
    let without_feat = strip_feat(rest);
    let stripped = BRACKET.replace_all(&without_feat, |caps: &Captures| {
        if is_upload_label(bracket_content(caps)) {
            String::new()
        } else {
            caps.get(0).expect("whole match").as_str().to_owned()
        }
    });
    collapse(&stripped)
}

fn has_latin_or_digit_bracket(text: &str) -> bool {
    BRACKET
        .captures_iter(text)
        .any(|caps| bracket_content(&caps).chars().any(|c| c.is_ascii_alphanumeric()))
}

fn upload_label_names(
    title: &str,
    theirs: &[String],
    their_name: &Recording,
    credited: bool,
    plain_text: bool,
) -> bool {
    let Some((before, rest)) = title.split_once(" - ") else {
        return false;
    };
    let lead = artist_names(before);
    if !share_artist(&lead, theirs) {
        return false;
    }
    let labels = strip_labels(rest);
    let bare = !title.contains('|')
        && !has_bracket(&labels)
        && !labels.contains(" - ")
        && !has_latin_or_digit_bracket(before);
    (credited || bare) && same_name(&recording_name(rest, plain_text), their_name)
}

fn names_release_recording(q: &Query, their_title: &str) -> bool {
    let Some(album) = q.album.as_deref() else {
        return false;
    };
    let release = plain_words(&release_name(album));
    let playing = recording_name(&clean_title(&q.title), false);
    let theirs = recording_name(their_title, false);
    !release.is_empty()
        && playing.core == release
        && playing.versions.is_empty()
        && !theirs.versions.is_empty()
        && theirs.core == playing.core
}

pub fn names_recording(
    q: &Query,
    their_title: &str,
    their_artist: &str,
    their_length: Option<f64>,
    plain_text: bool,
) -> bool {
    let title = nfkc(&clean_title(&q.title));
    let theirs_name = recording_name(their_title, plain_text);
    let theirs = artist_names(their_artist);
    let mine = artist_names(&q.artist);
    let their_length = their_length.filter(|length| *length > 0.0);
    let uncheckable = !comparable(&mine, &theirs)
        && q.duration > 0.0
        && their_length.is_some_and(|length| (length - q.duration).abs() <= 3.0);
    let credited = mine.is_empty() || theirs.is_empty() || uncheckable || share_artist(&mine, &theirs);
    if credited && same_name(&recording_name(&title, plain_text), &theirs_name) {
        return true;
    }
    if credited && names_release_recording(q, their_title) {
        return true;
    }
    upload_label_names(&title, &theirs, &theirs_name, credited, plain_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(title: &str, artist: &str, album: Option<&str>) -> Query {
        Query {
            id: "id".to_owned(),
            title: title.to_owned(),
            artist: artist.to_owned(),
            album: album.map(str::to_owned),
            duration: 200.0,
        }
    }

    fn names(title: &str, artist: &str, length: Option<f64>) -> bool {
        names_recording(&query("Song", "Singer", None), title, artist, length, false)
    }

    #[test]
    fn same_song_by_same_artist_passes() {
        assert!(names("Song", "Singer", Some(200.0)));
    }

    #[test]
    fn different_song_fails() {
        assert!(!names("Other Song", "Singer", Some(200.0)));
    }

    #[test]
    fn different_artist_fails() {
        assert!(!names("Song", "Stranger", Some(200.0)));
    }

    #[test]
    fn live_recording_does_not_match_studio_song() {
        assert!(!names("Song (Live)", "Singer", Some(200.0)));
        assert!(!names("Song - Live at Wembley", "Singer", Some(200.0)));
    }

    #[test]
    fn remix_and_tv_version_do_not_match_studio_song() {
        assert!(!names("Song (Remix)", "Singer", Some(200.0)));
        assert!(!names("Song (TV ver.)", "Singer", Some(200.0)));
        assert!(!names("Song (Japanese ver.)", "Singer", Some(200.0)));
    }

    #[test]
    fn label_qualifiers_are_ignored() {
        assert!(names("Song (Album Version)", "Singer", Some(200.0)));
        assert!(names("Song (Explicit Ver.)", "Singer", Some(200.0)));
        assert!(names("Song (Main Version - Clean)", "Singer", Some(200.0)));
        assert!(names("Song - Single", "Singer", Some(200.0)));
    }

    #[test]
    fn matching_version_words_on_both_sides_pass() {
        let q = query("Song (Live)", "Singer", None);
        assert!(names_recording(&q, "Song (Live at Hall)", "Singer", Some(200.0), false));
        assert!(names_recording(&q, "Song (Vivo)", "Singer", Some(200.0), false));
    }

    #[test]
    fn tempo_edits_match_only_in_plain_text() {
        let q = query("Song (Sped Up)", "Singer", None);
        assert!(!names_recording(&q, "Song", "Singer", Some(200.0), false));
        assert!(names_recording(&q, "Song", "Singer", Some(200.0), true));
    }

    #[test]
    fn traditional_and_simplified_titles_match() {
        let q = query("戦後", "Singer", None);
        assert!(names_recording(&q, "战后", "Singer", Some(200.0), false));
        assert_eq!(plain_words("戦後"), plain_words("战后"));
    }

    #[test]
    fn upload_artist_song_format_passes() {
        let q = query("Singer - Song (Official Video)", "Singer", None);
        assert!(names_recording(&q, "Song", "Singer", Some(200.0), false));
    }

    #[test]
    fn credited_artist_list_matches_shared_artist() {
        let q = query("Song", "Singer feat. Guest", None);
        assert!(names_recording(&q, "Song", "Guest & Other", Some(200.0), false));
    }

    #[test]
    fn release_entry_names_playing_recording() {
        let q = query("Album", "Singer", Some("Album - Single"));
        assert!(names_recording(&q, "Album (Radio Edit)", "Singer", Some(200.0), false));
        assert!(!names_recording(&query("Album", "Singer", None), "Album (Radio Edit)", "Singer", Some(200.0), false));
    }

    #[test]
    fn uncheckable_scripts_pass_when_lengths_agree() {
        let q = query("Song", "周杰倫", None);
        assert!(names_recording(&q, "Song", "Jay Chou", Some(202.0), false));
        assert!(!names_recording(&q, "Song", "Jay Chou", Some(260.0), false));
    }

    #[test]
    fn clean_title_removes_upload_decorations() {
        assert_eq!(clean_title("Song (Official Video)"), "Song");
        assert_eq!(clean_title("Song (Official Music Video) [4K]"), "Song");
        assert_eq!(clean_title("Song - Lyrics (HD)"), "Song");
        assert_eq!(clean_title("Song | Official"), "Song");
        assert_eq!(clean_title("Song M/V"), "Song");
        assert_eq!(clean_title("Song - Video Games"), "Song - Video Games");
    }

    #[test]
    fn clean_title_turns_lyric_titles_into_song_names() {
        assert_eq!(clean_title("Artist - Song Lyrics"), "Song");
        assert_eq!(clean_title("周杰倫 - 告白氣球 歌詞"), "告白氣球");
        assert_eq!(clean_title("사랑 가사"), "사랑");
    }

    #[test]
    fn query_title_drops_every_bracket() {
        assert_eq!(query_title("Song (Remix) [HD] （Live）"), "Song");
    }

    #[test]
    fn search_title_keeps_version_words_and_drops_feat() {
        assert_eq!(search_title("Song (Live) feat. Guest"), "Song (Live)");
    }

    #[test]
    fn genius_clean_query_strips_noise() {
        assert_eq!(genius_clean_query("Song (Official Video) | Site"), "Song");
        assert_eq!(genius_clean_query("♪ Song ♫"), "Song");
        assert_eq!(genius_clean_query("Song (feat. Guest)"), "Song");
    }

    #[test]
    fn artist_names_ignore_recording_brackets_and_placeholders() {
        assert_eq!(artist_names("Singer (Guest Cover)"), vec!["singer"]);
        assert_eq!(artist_names("Unknown Artist"), Vec::<String>::new());
        assert_eq!(artist_names("A, B feat. C"), vec!["a", "b", "c"]);
    }

    #[test]
    fn recording_name_splits_core_and_versions() {
        let live = recording_name("Song (Live) - Bonus", false);
        assert_eq!(live.core, "song");
        assert_eq!(live.versions, "live");
        assert_eq!(recording_name("Song (Album Version)", false).versions, "");
        assert_eq!(recording_name("Song (Japanese ver.)", false).versions, "version:japanese");
    }

    #[test]
    fn foreign_script_bracket_becomes_alias() {
        let name = recording_name("Song (告白氣球)", false);
        assert_eq!(name.aliases, vec![plain_words("告白氣球")]);
        assert!(same_name(&name, &recording_name("告白氣球", false)));
    }

    #[test]
    fn share_artist_needs_whole_name() {
        assert!(share_artist(&["singer".to_owned()], &["singer".to_owned()]));
        assert!(!share_artist(&["sing".to_owned()], &["singer".to_owned()]));
    }

    #[test]
    fn comparable_needs_shared_script() {
        assert!(!comparable(&["周杰伦".to_owned()], &["jay chou".to_owned()]));
        assert!(comparable(&["周杰伦".to_owned()], &["周杰倫".to_owned()]));
    }
}
