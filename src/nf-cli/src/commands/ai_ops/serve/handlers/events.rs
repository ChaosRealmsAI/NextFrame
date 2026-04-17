use std::convert::Infallible;
use std::time::Duration;

use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
};
use tokio::time::{interval, MissedTickBehavior};
use tokio_stream::{wrappers::IntervalStream, StreamExt};

use crate::commands::ai_ops::serve::state::AppState;

pub async fn handle(
    State(state): State<AppState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let mut ticker = interval(Duration::from_secs(1));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut index = 0_u64;
    let stream = IntervalStream::new(ticker).map(move |_| {
        let event = if index.is_multiple_of(2) {
            Event::default()
                .event("ping")
                .data(serde_json::json!({ "type": "ping" }).to_string())
        } else {
            Event::default()
                .event("state_change")
                .data(state.state_change_payload())
        };
        index += 1;
        Ok::<Event, Infallible>(event)
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}
