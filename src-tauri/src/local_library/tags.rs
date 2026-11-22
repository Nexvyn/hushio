use std::fs;
use std::io;
use std::path::Path;

use lofty::config::WriteOptions;
use lofty::error::{ErrorKind, LoftyError};
use lofty::file::{AudioFile, TaggedFile, TaggedFileExt};
use lofty::tag::{Accessor, ItemKey, Tag, TagType};
use serde::Deserialize;

use super::{clean, mtime_ms, read_track, LocalTrack};

pub const MISSING: &str = "This file is missing.";
pub const READ_ONLY: &str = "This file is read-only.";
pub const UNSUPPORTED: &str = "Hushio cannot write tags to this file type.";
const CANNOT_READ: &str = "Hushio cannot read this file.";
const CANNOT_SAVE: &str = "Hushio could not save the tags. Your song was not changed.";
const CANNOT_PREPARE: &str = "Could not prepare the file for editing. Your song was not changed.";
const CANNOT_REPLACE: &str = "Could not replace the file. Your song was not changed.";
const MAX_NUMBER: i64 = 9999;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEdits {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub genre: Option<String>,
    pub year: Option<NumberEdit>,
    pub track_number: Option<NumberEdit>,
    pub disc_number: Option<NumberEdit>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum NumberEdit {
    Number(i64),
    Text(String),
}

fn number(edit: &NumberEdit, label: &str) -> Result<Option<u32>, String> {
    let value = match edit {
        NumberEdit::Number(value) => *value,
        NumberEdit::Text(text) if text.trim().is_empty() => return Ok(None),
        NumberEdit::Text(_) => return Err(format!("{label} must be a number.")),
    };
    match value {
        0 => Ok(None),
        1..=MAX_NUMBER => Ok(u32::try_from(value).ok()),
        _ => Err(format!("{label} must be a number up to {MAX_NUMBER}.")),
    }
}

fn apply(tag: &mut Tag, edits: &TagEdits) -> Result<(), String> {
    if let Some(value) = &edits.title {
        match clean(value.trim()) {
            Some(text) => tag.set_title(text),
            None => tag.remove_title(),
        }
    }
    if let Some(value) = &edits.artist {
        match clean(value.trim()) {
            Some(text) => tag.set_artist(text),
            None => tag.remove_artist(),
        }
    }
    if let Some(value) = &edits.album {
        match clean(value.trim()) {
            Some(text) => tag.set_album(text),
            None => tag.remove_album(),
        }
    }
    if let Some(value) = &edits.album_artist {
        match clean(value.trim()) {
            Some(text) => {
                tag.insert_text(ItemKey::AlbumArtist, text);
            }
            None => tag.remove_key(&ItemKey::AlbumArtist),
        }
    }
    if let Some(value) = &edits.genre {
        match clean(value.trim()) {
            Some(text) => tag.set_genre(text),
            None => tag.remove_genre(),
        }
    }
    if let Some(edit) = &edits.year {
        match number(edit, "Year")? {
            Some(value) => tag.set_year(value),
            None => tag.remove_year(),
        }
    }
    if let Some(edit) = &edits.track_number {
        match number(edit, "Track number")? {
            Some(value) => tag.set_track(value),
            None => tag.remove_track(),
        }
    }
    if let Some(edit) = &edits.disc_number {
        match number(edit, "Disc number")? {
            Some(value) => tag.set_disk(value),
            None => tag.remove_disk(),
        }
    }
    Ok(())
}

fn read_error(error: LoftyError) -> String {
    match error.kind() {
        ErrorKind::UnknownFormat => UNSUPPORTED.to_owned(),
        _ => CANNOT_READ.to_owned(),
    }
}

fn save_error(error: LoftyError) -> String {
    match error.kind() {
        ErrorKind::UnknownFormat | ErrorKind::UnsupportedTag => UNSUPPORTED.to_owned(),
        _ => CANNOT_SAVE.to_owned(),
    }
}

pub fn write_tags(path: &Path, edits: &TagEdits) -> Result<(), String> {
    write_with(path, edits, |from, to| fs::rename(from, to))
}

pub(super) fn write_with(
    path: &Path,
    edits: &TagEdits,
    commit: impl FnOnce(&Path, &Path) -> io::Result<()>,
) -> Result<(), String> {
    let meta = fs::metadata(path).map_err(|_| MISSING.to_owned())?;
    if !meta.is_file() {
        return Err(MISSING.to_owned());
    }
    if meta.permissions().readonly() {
        return Err(READ_ONLY.to_owned());
    }
    let mut tagged = lofty::read_from_path(path).map_err(read_error)?;
    let tag_type = tagged.file_type().primary_tag_type();
    if !tagged.file_type().supports_tag_type(tag_type) {
        return Err(UNSUPPORTED.to_owned());
    }

    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("track");
    let temp = path.with_file_name(format!(".{name}.hushio-tags.tmp"));
    let _ = fs::remove_file(&temp);
    fs::copy(path, &temp).map_err(|_| CANNOT_PREPARE.to_owned())?;

    let result = write_copy(&mut tagged, &temp, edits, tag_type).and_then(|()| {
        fs::set_permissions(&temp, meta.permissions()).map_err(|_| CANNOT_SAVE.to_owned())?;
        commit(&temp, path).map_err(|_| CANNOT_REPLACE.to_owned())
    });
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn write_copy(tagged: &mut TaggedFile, temp: &Path, edits: &TagEdits, tag_type: TagType) -> Result<(), String> {
    if tagged.primary_tag().is_none() {
        tagged.insert_tag(Tag::new(tag_type));
    }
    let tag = tagged.primary_tag_mut().ok_or_else(|| UNSUPPORTED.to_owned())?;
    apply(tag, edits)?;
    tagged.save_to_path(temp, WriteOptions::default()).map_err(save_error)
}

pub fn read_back(path: &Path, art_dir: &Path) -> Result<LocalTrack, String> {
    let meta = fs::metadata(path).map_err(|_| MISSING.to_owned())?;
    Ok(read_track(path, meta.len(), mtime_ms(&meta), art_dir))
}
