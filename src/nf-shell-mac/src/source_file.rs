//! Atomic source.json writes and notify-based watching.

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use anyhow::{Context, Result};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};

const DEFAULT_DEBOUNCE: Duration = Duration::from_millis(50);

pub struct SourceWatcher {
    watch_dir: PathBuf,
    watcher: RecommendedWatcher,
    stop_tx: Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl SourceWatcher {
    pub fn watch<F>(path: &Path, on_change: F) -> Result<Self>
    where
        F: Fn() + Send + Sync + 'static,
    {
        Self::watch_with_debounce(path, DEFAULT_DEBOUNCE, on_change)
    }

    pub fn watch_with_debounce<F>(path: &Path, debounce: Duration, on_change: F) -> Result<Self>
    where
        F: Fn() + Send + Sync + 'static,
    {
        let canonical_target = path
            .canonicalize()
            .or_else(|_| Ok::<PathBuf, std::io::Error>(path.to_path_buf()))
            .context("resolve watcher target path")?;
        let watch_dir = canonical_target
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| anyhow::anyhow!("source path has no parent: {}", canonical_target.display()))?;

        let (event_tx, event_rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |result| {
                let _ = event_tx.send(result);
            },
            Config::default(),
        )
        .context("create notify watcher")?;
        watcher
            .watch(&watch_dir, RecursiveMode::NonRecursive)
            .with_context(|| format!("watch {}", watch_dir.display()))?;

        let callback = Arc::new(on_change);
        let (stop_tx, stop_rx) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("nf-shell-source-watch".to_string())
            .spawn({
                let callback = Arc::clone(&callback);
                move || worker_loop(canonical_target, debounce, event_rx, stop_rx, callback)
            })
            .context("spawn source watcher worker")?;

        Ok(Self {
            watch_dir,
            watcher,
            stop_tx,
            worker: Some(worker),
        })
    }

    pub fn stop(&mut self) -> Result<()> {
        let _ = self.stop_tx.send(());
        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .map_err(|_| anyhow::anyhow!("source watcher worker panicked"))?;
        }
        self.watcher
            .unwatch(&self.watch_dir)
            .ok();
        Ok(())
    }
}

impl Drop for SourceWatcher {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("source path has no parent: {}", path.display()))?;
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map_or(String::from("tmp"), |ext| format!("{ext}.tmp"));
    let temp_path = path.with_extension(extension);

    {
        let mut file = File::create(&temp_path)
            .with_context(|| format!("create temp file {}", temp_path.display()))?;
        file.write_all(bytes)
            .with_context(|| format!("write temp file {}", temp_path.display()))?;
        file.sync_all()
            .with_context(|| format!("sync temp file {}", temp_path.display()))?;
    }

    std::fs::rename(&temp_path, path)
        .with_context(|| format!("rename {} -> {}", temp_path.display(), path.display()))?;

    let dir = File::open(parent).with_context(|| format!("open dir {}", parent.display()))?;
    dir.sync_all()
        .with_context(|| format!("sync dir {}", parent.display()))?;
    Ok(())
}

fn worker_loop<F>(
    canonical_target: PathBuf,
    debounce: Duration,
    event_rx: Receiver<notify::Result<Event>>,
    stop_rx: Receiver<()>,
    callback: Arc<F>,
) where
    F: Fn() + Send + Sync + 'static,
{
    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        match recv_event(&event_rx, &stop_rx) {
            EventOutcome::Stop => break,
            EventOutcome::Event(Some(event)) if event_mentions_target(&event, &canonical_target) => {
                debounce_burst(&event_rx, &stop_rx, &canonical_target, debounce);
                callback();
            }
            EventOutcome::Event(_) => {}
        }
    }
}

fn recv_event(
    event_rx: &Receiver<notify::Result<Event>>,
    stop_rx: &Receiver<()>,
) -> EventOutcome {
    loop {
        if stop_rx.try_recv().is_ok() {
            return EventOutcome::Stop;
        }
        match event_rx.recv_timeout(Duration::from_millis(10)) {
            Ok(Ok(event)) => return EventOutcome::Event(Some(event)),
            Ok(Err(_)) => return EventOutcome::Event(None),
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => return EventOutcome::Stop,
        }
    }
}

fn debounce_burst(
    event_rx: &Receiver<notify::Result<Event>>,
    stop_rx: &Receiver<()>,
    canonical_target: &Path,
    debounce: Duration,
) {
    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }
        match event_rx.recv_timeout(debounce) {
            Ok(Ok(event)) => {
                if event_mentions_target(&event, canonical_target) {
                    continue;
                }
            }
            Ok(Err(_)) => {}
            Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn event_mentions_target(event: &Event, target: &Path) -> bool {
    event.paths.iter().any(|path| {
        path == target
            || path
                .canonicalize()
                .map(|canonical| canonical == target)
                .unwrap_or(false)
    })
}

enum EventOutcome {
    Stop,
    Event(Option<Event>),
}
