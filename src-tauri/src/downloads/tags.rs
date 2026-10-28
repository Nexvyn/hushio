use std::io::Write;
use std::path::{Path, PathBuf};

const OWNED: [[u8; 4]; 4] = [*b"\xa9nam", *b"\xa9ART", *b"\xa9alb", *b"covr"];
const BAD_ATOM: &str = "Unsupported MP4: bad atom size";

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CoverFormat {
    Jpeg,
    Png,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Cover {
    pub format: CoverFormat,
    pub data: Vec<u8>,
}

impl Cover {
    pub fn sniff(data: Vec<u8>) -> Option<Self> {
        let format = if data.starts_with(&[0xFF, 0xD8]) {
            CoverFormat::Jpeg
        } else if data.starts_with(&[0x89, 0x50]) {
            CoverFormat::Png
        } else {
            return None;
        };
        Some(Self { format, data })
    }
}

#[derive(Debug, Clone)]
pub struct Tags {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub cover: Option<Cover>,
}

pub fn write(part: &Path, tags: &Tags) -> Result<(), String> {
    let tagging = PathBuf::from(format!("{}.tagging", part.display()));
    let outcome = stage(part, &tagging, tags);
    if outcome.is_err() {
        super::remove_file_logged(&tagging);
    }
    outcome
}

fn stage(part: &Path, tagging: &Path, tags: &Tags) -> Result<(), String> {
    let file = std::fs::read(part).map_err(|error| error.to_string())?;
    let tagged = retag(&file, tags)?;
    {
        let mut out = std::fs::File::create(tagging).map_err(|error| error.to_string())?;
        out.write_all(&tagged).map_err(|error| error.to_string())?;
        out.sync_all().map_err(|error| error.to_string())?;
    }
    std::fs::rename(tagging, part).map_err(|error| error.to_string())
}

struct Atom {
    kind: [u8; 4],
    start: usize,
    header: usize,
    end: usize,
}

impl Atom {
    fn raw<'a>(&self, data: &'a [u8]) -> &'a [u8] {
        &data[self.start..self.end]
    }

    fn body<'a>(&self, data: &'a [u8]) -> &'a [u8] {
        &data[self.start + self.header..self.end]
    }
}

fn atoms(data: &[u8]) -> Result<Vec<Atom>, String> {
    let mut found = Vec::new();
    let mut at = 0;
    while at < data.len() {
        let head = data.get(at..at + 8).ok_or(BAD_ATOM)?;
        let size32 = u32::from_be_bytes(head[..4].try_into().map_err(|_| BAD_ATOM)?);
        let kind: [u8; 4] = head[4..8].try_into().map_err(|_| BAD_ATOM)?;
        let (size, header) = match size32 {
            0 => (data.len() - at, 8),
            1 => {
                let large = data.get(at + 8..at + 16).ok_or(BAD_ATOM)?;
                let size = u64::from_be_bytes(large.try_into().map_err(|_| BAD_ATOM)?);
                (usize::try_from(size).map_err(|_| BAD_ATOM)?, 16)
            }
            size => (size as usize, 8),
        };
        if size < header || at + size > data.len() {
            return Err(BAD_ATOM.to_owned());
        }
        found.push(Atom {
            kind,
            start: at,
            header,
            end: at + size,
        });
        at += size;
    }
    Ok(found)
}

fn atom(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let size = u32::try_from(8 + body.len()).expect("atom under 4 GiB");
    let mut out = size.to_be_bytes().to_vec();
    out.extend_from_slice(kind);
    out.extend_from_slice(body);
    out
}

fn full_atom(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    atom(kind, &[&[0u8; 4][..], body].concat())
}

fn data_atom(flags: u32, payload: &[u8]) -> Vec<u8> {
    atom(
        b"data",
        &[&flags.to_be_bytes()[..], &[0u8; 4], payload].concat(),
    )
}

fn retag(file: &[u8], tags: &Tags) -> Result<Vec<u8>, String> {
    if file.get(4..8) != Some(b"ftyp".as_slice()) {
        return Err("Unsupported MP4: no ftyp box".to_owned());
    }
    let top = atoms(file)?;
    if top.iter().any(|atom| &atom.kind == b"moof") {
        return Err("Unsupported MP4: fragmented files are not tagged".to_owned());
    }
    let moovs: Vec<&Atom> = top.iter().filter(|atom| &atom.kind == b"moov").collect();
    let [moov] = moovs[..] else {
        return Err(format!(
            "Unsupported MP4: expected one moov box, found {}",
            moovs.len()
        ));
    };

    let moov_body = moov.body(file);
    let children = atoms(moov_body)?;
    let old_udta = children
        .iter()
        .find(|child| &child.kind == b"udta")
        .map(|child| child.body(moov_body));
    let udta = new_udta(old_udta, tags)?;

    let mut new_body = Vec::new();
    let mut placed = false;
    for child in &children {
        if &child.kind == b"udta" {
            if !placed {
                new_body.extend_from_slice(&udta);
                placed = true;
            }
        } else {
            new_body.extend_from_slice(child.raw(moov_body));
        }
    }
    if !placed {
        new_body.extend_from_slice(&udta);
    }

    let mut new_moov = atom(b"moov", &new_body);
    let old_len = moov.end - moov.start;
    let delta = i64::try_from(new_moov.len()).map_err(|_| BAD_ATOM)?
        - i64::try_from(old_len).map_err(|_| BAD_ATOM)?;
    shift_chunk_offsets(&mut new_moov[8..], moov.end as u64, delta)?;

    Ok([&file[..moov.start], &new_moov, &file[moov.end..]].concat())
}

fn new_udta(old: Option<&[u8]>, tags: &Tags) -> Result<Vec<u8>, String> {
    let mut children = Vec::new();
    let mut foreign_items = Vec::new();
    if let Some(old) = old {
        for child in atoms(old)? {
            if &child.kind == b"meta" {
                foreign_items = foreign_ilst_items(child.body(old))?;
            } else {
                children.extend_from_slice(child.raw(old));
            }
        }
    }
    children.extend_from_slice(&meta_box(foreign_items, tags));
    Ok(atom(b"udta", &children))
}

fn foreign_ilst_items(meta_body: &[u8]) -> Result<Vec<u8>, String> {
    let body = meta_body.get(4..).ok_or(BAD_ATOM)?;
    let mut items = Vec::new();
    for child in atoms(body)? {
        if &child.kind == b"ilst" {
            let ilst = child.body(body);
            for item in atoms(ilst)? {
                if !OWNED.contains(&item.kind) {
                    items.extend_from_slice(item.raw(ilst));
                }
            }
        }
    }
    Ok(items)
}

fn meta_box(mut items: Vec<u8>, tags: &Tags) -> Vec<u8> {
    items.extend(atom(&OWNED[0], &data_atom(1, tags.title.as_bytes())));
    items.extend(atom(&OWNED[1], &data_atom(1, tags.artist.as_bytes())));
    if let Some(album) = &tags.album {
        items.extend(atom(&OWNED[2], &data_atom(1, album.as_bytes())));
    }
    if let Some(cover) = &tags.cover {
        let flags = match cover.format {
            CoverFormat::Jpeg => 13,
            CoverFormat::Png => 14,
        };
        items.extend(atom(b"covr", &data_atom(flags, &cover.data)));
    }
    let hdlr = full_atom(
        b"hdlr",
        &[&[0u8; 4][..], b"mdir", b"appl", &[0u8; 8], &[0u8]].concat(),
    );
    let ilst = atom(b"ilst", &items);
    full_atom(b"meta", &[hdlr, ilst].concat())
}

fn shift_chunk_offsets(data: &mut [u8], from: u64, delta: i64) -> Result<(), String> {
    for child in atoms(data)? {
        let (body_start, body_end) = (child.start + child.header, child.end);
        match &child.kind {
            b"trak" | b"mdia" | b"minf" | b"stbl" => {
                shift_chunk_offsets(&mut data[body_start..body_end], from, delta)?;
            }
            b"stco" => shift_entries(&mut data[body_start..body_end], 4, from, delta)?,
            b"co64" => shift_entries(&mut data[body_start..body_end], 8, from, delta)?,
            b"saio" => {
                return Err(
                    "Unsupported MP4: sample auxiliary info offsets (encrypted audio)".to_owned(),
                );
            }
            _ => {}
        }
    }
    Ok(())
}

fn shift_entries(body: &mut [u8], width: usize, from: u64, delta: i64) -> Result<(), String> {
    let count = u32::from_be_bytes(
        body.get(4..8)
            .ok_or(BAD_ATOM)?
            .try_into()
            .map_err(|_| BAD_ATOM)?,
    );
    let end = 8 + count as usize * width;
    let entries: &mut [u8] = body.get_mut(8..end).ok_or(BAD_ATOM)?;
    for entry in entries.chunks_exact_mut(width) {
        let value = match width {
            4 => u64::from(u32::from_be_bytes(entry.try_into().map_err(|_| BAD_ATOM)?)),
            _ => u64::from_be_bytes(entry.try_into().map_err(|_| BAD_ATOM)?),
        };
        if value < from {
            continue;
        }
        let shifted = value.checked_add_signed(delta).ok_or(BAD_ATOM)?;
        match width {
            4 => {
                entry.copy_from_slice(&u32::try_from(shifted).map_err(|_| BAD_ATOM)?.to_be_bytes())
            }
            _ => entry.copy_from_slice(&shifted.to_be_bytes()),
        }
    }
    Ok(())
}
