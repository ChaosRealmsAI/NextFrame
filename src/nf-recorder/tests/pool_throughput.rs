use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use crossbeam::queue::ArrayQueue;
use nf_recorder::frame_pool::{sleep_then_spin_until, FramePool};

#[derive(Clone)]
struct DummySurface {
    produced_at_ns: u64,
}

#[derive(Clone)]
struct Permit {
    _slot: usize,
}

struct WorkerFrame {
    permit: Arc<Permit>,
    surface: DummySurface,
}

#[test]
fn frame_pool_spsc_throughput_stays_bounded() -> Result<()> {
    let workers = 4usize;
    let frames_per_worker = 240usize;
    let frame_interval = Duration::from_micros(750);
    let pool = FramePool::new(
        (0..(workers + 2))
            .map(|slot| Arc::new(Permit { _slot: slot }))
            .collect(),
    )?;
    let queues: Vec<Arc<ArrayQueue<WorkerFrame>>> = (0..workers)
        .map(|_| Arc::new(ArrayQueue::<WorkerFrame>::new(workers + 2)))
        .collect();
    let finished = Arc::new(AtomicUsize::new(0));

    let consumer_queues = queues.clone();
    let consumer_finished = finished.clone();
    let consumer_pool = pool.clone();
    let consumer = thread::spawn(move || -> Result<Vec<u64>> {
        let mut latencies = Vec::with_capacity(workers * frames_per_worker);
        while consumer_finished.load(Ordering::Acquire) < workers
            || consumer_queues.iter().any(|queue| !queue.is_empty())
        {
            let mut drained = false;
            for queue in &consumer_queues {
                if let Some(frame) = queue.pop() {
                    latencies.push(now_ns().saturating_sub(frame.surface.produced_at_ns));
                    consumer_pool.release(frame.permit)?;
                    drained = true;
                }
            }
            if !drained {
                thread::yield_now();
            }
        }
        Ok(latencies)
    });

    let start = Instant::now();
    let handles = queues
        .into_iter()
        .map(|queue| {
            let finished = finished.clone();
            let producer_pool = pool.clone();
            thread::spawn(move || -> Result<()> {
                for frame_index in 0..frames_per_worker {
                    let deadline = start + frame_interval.mul_f64((frame_index + 1) as f64);
                    sleep_then_spin_until(deadline);
                    let permit = acquire_permit(&producer_pool);
                    let frame = WorkerFrame {
                        permit,
                        surface: DummySurface {
                            produced_at_ns: now_ns(),
                        },
                    };
                    push_frame(&queue, frame);
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
        .map_err(|_| anyhow::anyhow!("consumer panicked"))??;
    latencies.sort_unstable();
    let p95 = latencies[(latencies.len() * 95 / 100).min(latencies.len().saturating_sub(1))];

    assert_eq!(latencies.len(), workers * frames_per_worker);
    assert!(p95 < 5_000_000, "p95 latency too high: {p95}ns");
    Ok(())
}

fn acquire_permit(pool: &FramePool<Permit>) -> Arc<Permit> {
    loop {
        if let Some(permit) = pool.acquire() {
            return permit;
        }
        thread::yield_now();
    }
}

fn push_frame(queue: &ArrayQueue<WorkerFrame>, frame: WorkerFrame) {
    let mut frame = Some(frame);
    while let Some(pending) = frame.take() {
        match queue.push(pending) {
            Ok(()) => return,
            Err(returned) => {
                frame = Some(returned);
                thread::yield_now();
            }
        }
    }
}

fn now_ns() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0)
}
