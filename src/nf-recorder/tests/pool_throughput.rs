use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Result;
use crossbeam::queue::ArrayQueue;
use nf_recorder::frame_pool::sleep_then_spin_until;

#[derive(Clone, Copy)]
struct DummySurface {
    produced_at_ns: u64,
}

#[test]
fn frame_pool_spsc_throughput_stays_bounded() -> Result<()> {
    let workers = 4usize;
    let frames_per_worker = 240usize;
    let frame_interval = Duration::from_micros(750);
    let queues: Vec<Arc<ArrayQueue<DummySurface>>> = (0..workers)
        .map(|_| Arc::new(ArrayQueue::<DummySurface>::new(8)))
        .collect();
    let finished = Arc::new(AtomicUsize::new(0));

    let consumer_queues = queues.clone();
    let consumer_finished = finished.clone();
    let consumer = thread::spawn(move || {
        let mut latencies = Vec::with_capacity(workers * frames_per_worker);
        while consumer_finished.load(Ordering::Acquire) < workers
            || consumer_queues.iter().any(|queue| !queue.is_empty())
        {
            let mut drained = false;
            for queue in &consumer_queues {
                if let Some(frame) = queue.pop() {
                    latencies.push(now_ns().saturating_sub(frame.produced_at_ns));
                    drained = true;
                }
            }
            if !drained {
                thread::yield_now();
            }
        }
        latencies
    });

    let start = Instant::now();
    let handles = queues
        .into_iter()
        .map(|queue: Arc<ArrayQueue<DummySurface>>| {
            let finished = finished.clone();
            thread::spawn(move || -> Result<()> {
                for frame_index in 0..frames_per_worker {
                    let deadline = start + frame_interval.mul_f64((frame_index + 1) as f64);
                    sleep_then_spin_until(deadline);
                    let frame = DummySurface {
                        produced_at_ns: now_ns(),
                    };
                    while queue.push(frame).is_err() {
                        thread::yield_now();
                    }
                }
                finished.fetch_add(1, Ordering::AcqRel);
                Ok(())
            })
        })
        .collect::<Vec<_>>();

    for handle in handles {
        handle
            .join()
            .map_err(|_| anyhow::anyhow!("producer panicked"))??;
    }
    let mut latencies = consumer
        .join()
        .map_err(|_| anyhow::anyhow!("consumer panicked"))?;
    latencies.sort_unstable();
    let p95 = latencies[(latencies.len() * 95 / 100).min(latencies.len().saturating_sub(1))];

    assert_eq!(latencies.len(), workers * frames_per_worker);
    assert!(p95 < 5_000_000, "p95 latency too high: {p95}ns");
    Ok(())
}

fn now_ns() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0)
}
