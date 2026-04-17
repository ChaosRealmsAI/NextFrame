//! Fragmented MP4 writer seam. Real impl uses `mp4-atom` to emit moov/moof/mdat.

use std::path::Path;

pub trait FragmentedMp4Writer {
    fn open(&mut self, path: &Path) -> anyhow::Result<()>;
    fn write_sample(&mut self, pts_ns: u64, dts_ns: u64, bytes: &[u8]) -> anyhow::Result<()>;
    fn close(&mut self) -> anyhow::Result<()>;
}

pub struct StubMuxer;

impl FragmentedMp4Writer for StubMuxer {
    fn open(&mut self, _path: &Path) -> anyhow::Result<()> {
        Ok(())
    }

    fn write_sample(&mut self, _pts_ns: u64, _dts_ns: u64, _bytes: &[u8]) -> anyhow::Result<()> {
        Ok(())
    }

    fn close(&mut self) -> anyhow::Result<()> {
        Ok(())
    }
}
