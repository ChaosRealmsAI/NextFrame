use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use anyhow::{anyhow, Context, Result};
use mp4_atom::{
    Dinf, Dref, Ftyp, Hdlr, Hev1, Matrix, Mdhd, Mdia, Mfhd, Minf, Moof, Moov, Mvex, Mvhd, Stbl,
    Stsc, Stsd, Stsz, Stts, Tfdt, Tfhd, Traf, Trak, Trex, Trun, TrunEntry, Url, Vmhd, WriteTo,
};

use crate::encoder::EncodedSample;

pub struct FragmentedMp4Writer {
    writer: BufWriter<File>,
    bytes_written: u64,
    sequence_number: u32,
    track_id: u32,
}

impl FragmentedMp4Writer {
    pub fn new(
        path: &Path,
        width: u16,
        height: u16,
        fps: u32,
        mut sample_entry: Hev1,
    ) -> Result<Self> {
        sample_entry.width = width;
        sample_entry.height = height;
        sample_entry.data_reference_index = 1;

        let file = File::create(path).with_context(|| format!("create {}", path.display()))?;
        let mut writer = BufWriter::new(file);
        let mut bytes_written = 0_u64;
        bytes_written += write_atom(
            &mut writer,
            &Ftyp {
                major_brand: (*b"iso6").into(),
                minor_version: 512,
                compatible_brands: vec![
                    (*b"iso6").into(),
                    (*b"cmfc").into(),
                    (*b"hev1").into(),
                    (*b"mp41").into(),
                ],
            },
        )?;
        bytes_written += write_atom(
            &mut writer,
            &build_init_segment(width, height, fps, sample_entry),
        )?;
        Ok(Self {
            writer,
            bytes_written,
            sequence_number: 1,
            track_id: 1,
        })
    }

    pub fn write_sample(&mut self, sample: &EncodedSample) -> Result<()> {
        let tfhd = Tfhd {
            track_id: self.track_id,
            base_data_offset: Some(self.bytes_written),
            sample_description_index: None,
            default_sample_duration: None,
            default_sample_size: None,
            default_sample_flags: None,
        };
        let tfdt = Some(Tfdt {
            base_media_decode_time: sample.pts,
        });
        let trun_entry = TrunEntry {
            duration: Some(sample.duration.max(1)),
            size: Some(sample.data.len() as u32),
            flags: Some(sample_flags(sample.is_sync)),
            cts: Some(0),
        };
        let mut trun = Trun {
            data_offset: Some(0),
            entries: vec![trun_entry],
        };
        let mut moof = Moof {
            mfhd: Mfhd {
                sequence_number: self.sequence_number,
            },
            traf: vec![Traf {
                tfhd,
                tfdt,
                trun: Some(trun.clone()),
            }],
        };
        let mut moof_bytes = Vec::new();
        moof.write_to(&mut moof_bytes)?;
        trun.data_offset = Some((moof_bytes.len() + 8) as i32);
        moof.traf[0].trun = Some(trun);
        moof_bytes.clear();
        moof.write_to(&mut moof_bytes)?;
        fix_trun_box(&mut moof_bytes)?;
        self.writer.write_all(&moof_bytes)?;
        self.bytes_written += moof_bytes.len() as u64;
        self.bytes_written += write_mdat(&mut self.writer, &sample.data)?;
        self.sequence_number += 1;
        Ok(())
    }

    pub fn finish(&mut self) -> Result<()> {
        self.writer.flush()?;
        Ok(())
    }
}

fn build_init_segment(width: u16, height: u16, fps: u32, sample_entry: Hev1) -> Moov {
    Moov {
        mvhd: Mvhd {
            creation_time: 0,
            modification_time: 0,
            timescale: fps,
            duration: 0,
            rate: 1.into(),
            volume: 1.into(),
            matrix: identity_matrix(),
            next_track_id: 2,
        },
        meta: None,
        mvex: Some(Mvex {
            mehd: None,
            trex: vec![Trex {
                track_id: 1,
                default_sample_description_index: 1,
                default_sample_duration: 0,
                default_sample_size: 0,
                default_sample_flags: 0,
            }],
        }),
        trak: vec![Trak {
            tkhd: mp4_atom::Tkhd {
                creation_time: 0,
                modification_time: 0,
                track_id: 1,
                duration: 0,
                layer: 0,
                alternate_group: 0,
                enabled: true,
                volume: 0.into(),
                matrix: identity_matrix(),
                width: width.into(),
                height: height.into(),
            },
            edts: None,
            meta: None,
            mdia: Mdia {
                mdhd: Mdhd {
                    creation_time: 0,
                    modification_time: 0,
                    timescale: fps,
                    duration: 0,
                    language: "und".into(),
                },
                hdlr: Hdlr {
                    handler: (*b"vide").into(),
                    name: "VideoHandler".into(),
                },
                minf: Minf {
                    vmhd: Some(Vmhd {
                        graphics_mode: 0,
                        op_color: Default::default(),
                    }),
                    smhd: None,
                    dinf: Dinf {
                        dref: Dref {
                            urls: vec![Url {
                                location: String::new(),
                            }],
                        },
                    },
                    stbl: Stbl {
                        stsd: Stsd {
                            hev1: Some(sample_entry),
                            ..Stsd::default()
                        },
                        stts: Stts { entries: vec![] },
                        ctts: None,
                        stss: None,
                        stsc: Stsc { entries: vec![] },
                        stsz: Stsz::default(),
                        stco: None,
                        co64: None,
                    },
                },
            },
        }],
        udta: None,
    }
}

fn write_atom<W: Write, T: WriteTo>(writer: &mut W, atom: &T) -> Result<u64> {
    let mut bytes = Vec::new();
    atom.write_to(&mut bytes)?;
    writer.write_all(&bytes)?;
    Ok(bytes.len() as u64)
}

fn write_mdat<W: Write>(writer: &mut W, payload: &[u8]) -> Result<u64> {
    let size = 8_u32 + payload.len() as u32;
    writer.write_all(&size.to_be_bytes())?;
    writer.write_all(b"mdat")?;
    writer.write_all(payload)?;
    Ok(size as u64)
}

fn fix_trun_box(moof_bytes: &mut Vec<u8>) -> Result<()> {
    let original_len = moof_bytes.len();
    let traf_start = find_child(moof_bytes, 8, b"traf")?;
    let trun_start = find_child(moof_bytes, traf_start + 8, b"trun")?;
    let remove_at = trun_start + 20;
    if moof_bytes.len() < remove_at + 4 {
        return Err(anyhow!("trun box too short to patch"));
    }
    moof_bytes.drain(remove_at..remove_at + 4);
    let trun_size = read_u32(moof_bytes, trun_start)? - 4;
    let traf_size = read_u32(moof_bytes, traf_start)? - 4;
    write_u32(moof_bytes, trun_start, trun_size)?;
    write_u32(moof_bytes, traf_start, traf_size)?;
    let new_moof_size = original_len as u32 - 4;
    write_u32(moof_bytes, 0, new_moof_size)?;
    write_i32(moof_bytes, trun_start + 16, new_moof_size as i32 + 8)?;
    Ok(())
}

fn find_child(bytes: &[u8], start: usize, kind: &[u8; 4]) -> Result<usize> {
    let mut cursor = start;
    while cursor + 8 <= bytes.len() {
        let size = read_u32(bytes, cursor)? as usize;
        if &bytes[cursor + 4..cursor + 8] == kind {
            return Ok(cursor);
        }
        if size < 8 {
            break;
        }
        cursor += size;
    }
    Err(anyhow!("box {:?} not found", kind))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32> {
    let slice = bytes
        .get(offset..offset + 4)
        .context("u32 read outside encoded atom buffer")?;
    Ok(u32::from_be_bytes(
        slice.try_into().context("invalid u32 slice")?,
    ))
}

fn write_u32(bytes: &mut [u8], offset: usize, value: u32) -> Result<()> {
    let slice = bytes
        .get_mut(offset..offset + 4)
        .context("u32 write outside encoded atom buffer")?;
    slice.copy_from_slice(&value.to_be_bytes());
    Ok(())
}

fn write_i32(bytes: &mut [u8], offset: usize, value: i32) -> Result<()> {
    let slice = bytes
        .get_mut(offset..offset + 4)
        .context("i32 write outside encoded atom buffer")?;
    slice.copy_from_slice(&value.to_be_bytes());
    Ok(())
}

fn identity_matrix() -> Matrix {
    Matrix {
        a: 65_536,
        b: 0,
        u: 0,
        c: 0,
        d: 65_536,
        v: 0,
        x: 0,
        y: 0,
        w: 1_073_741_824,
    }
}

fn sample_flags(is_sync: bool) -> u32 {
    if is_sync {
        0x0200_0000
    } else {
        0x0101_0000
    }
}
