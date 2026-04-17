//! HEVC HDR10 prefix-SEI injector: Mastering Display Colour Volume + Content Light Level Info.
//!
//! Walking stub: real impl parses NALUs and prepends MDCV(137)/CLLI(144) prefix SEIs per sample.

pub trait SeiInjector {
    fn prepend_hdr10(&mut self, nalu: &mut Vec<u8>) -> anyhow::Result<()>;
}

pub struct StubInjector;

impl SeiInjector for StubInjector {
    fn prepend_hdr10(&mut self, _nalu: &mut Vec<u8>) -> anyhow::Result<()> {
        Ok(())
    }
}
