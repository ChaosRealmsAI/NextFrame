//! SCStream capture adapter (hidden layer snapshot → IOSurface).

pub trait ScreenCapture {
    fn start(&mut self) -> anyhow::Result<()>;
    fn stop(&mut self) -> anyhow::Result<()>;
}

pub struct StubCapture;

impl ScreenCapture for StubCapture {
    fn start(&mut self) -> anyhow::Result<()> {
        Ok(())
    }

    fn stop(&mut self) -> anyhow::Result<()> {
        Ok(())
    }
}
