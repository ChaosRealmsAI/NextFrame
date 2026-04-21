#![allow(clippy::expect_used, clippy::unwrap_used, clippy::panic)]

use std::{
    collections::BTreeMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use nf_agent::{
    Agent, BashTool, Config, LlmProvider, Message, OpenAiCompat, ProviderConfig, SkillRegistry,
    SystemPrompt, Tool,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn bash_timeout_returns_timed_out_marker() -> Result<()> {
    let tool = BashTool::new(120);
    let started = std::time::Instant::now();
    let result = tool
        .call(serde_json::json!({
            "command": "sleep 5",
            "timeout_sec": 1
        }))
        .await?;

    assert_eq!(result["ok"].as_bool(), Some(false));
    assert_eq!(result["timed_out"].as_bool(), Some(true));
    assert_eq!(result["timeout_sec"].as_u64(), Some(1));
    assert!(
        started.elapsed() < Duration::from_secs(3),
        "timeout should kill the command promptly"
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn provider_429_retries_then_success() -> Result<()> {
    let server = RetryServer::spawn(2, 3).await?;
    let provider = OpenAiCompat::from_parts(&server.base_url(), "test-key", 5, 1)?;
    let agent = Agent::with_tools(
        make_config(5, 1),
        SkillRegistry::default(),
        Box::new(provider),
        Vec::new(),
    );

    let result = agent.run("finish without tools", 3).await?;

    assert!(result.completed);
    assert_eq!(result.final_text.as_deref(), Some("done"));
    assert_eq!(result.retries_by_status.get(&429), Some(&2));
    assert_eq!(server.requests(), 3);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn provider_429_exhausts_retries() -> Result<()> {
    let server = RetryServer::spawn(10, 4).await?;
    let provider = OpenAiCompat::from_parts(&server.base_url(), "test-key", 3, 1)?;

    let err = provider
        .chat("mock-model", &[Message::user("hello")], &[])
        .await
        .expect_err("provider should exhaust retries");

    assert!(
        err.to_string().contains("provider returned 429"),
        "unexpected error: {err:#}"
    );
    assert_eq!(provider.retries_by_status().get(&429), Some(&3));
    assert_eq!(server.requests(), 4);
    Ok(())
}

fn make_config(max_retries: usize, retry_base_ms: u64) -> Config {
    Config {
        provider: ProviderConfig {
            base_url: "http://mock.invalid/v1".to_owned(),
            api_key_env: "MOCK_KEY_THAT_WILL_NEVER_EXIST".to_owned(),
            model: "mock-model".to_owned(),
        },
        system_prompt: SystemPrompt {
            text: "mock agent".to_owned(),
        },
        bash_timeout_sec: 120,
        provider_max_retries: max_retries,
        provider_retry_base_ms: retry_base_ms,
        final_check_enabled: false,
        max_tool_result_chars: 4_000,
        max_history_chars: 200_000,
        pricing: BTreeMap::new(),
        providers: BTreeMap::new(),
    }
}

struct RetryServer {
    addr: std::net::SocketAddr,
    request_count: Arc<AtomicUsize>,
}

impl RetryServer {
    async fn spawn(failures_before_success: usize, max_requests: usize) -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let addr = listener.local_addr()?;
        let request_count = Arc::new(AtomicUsize::new(0));
        let server_count = Arc::clone(&request_count);

        tokio::spawn(async move {
            while let Ok((mut stream, _peer)) = listener.accept().await {
                let request_number = server_count.fetch_add(1, Ordering::SeqCst) + 1;
                let _ = read_http_request(&mut stream).await;
                let body = if request_number <= failures_before_success {
                    "{\"error\":\"rate limited\"}"
                } else {
                    "{\"choices\":[{\"message\":{\"content\":\"done\",\"tool_calls\":[]}}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}"
                };
                let status = if request_number <= failures_before_success {
                    "429 Too Many Requests"
                } else {
                    "200 OK"
                };
                let response = http_response(status, body);
                let _ = stream.write_all(response.as_bytes()).await;
                if request_number >= max_requests {
                    break;
                }
            }
        });

        Ok(Self {
            addr,
            request_count,
        })
    }

    fn base_url(&self) -> String {
        format!("http://{}/v1", self.addr)
    }

    fn requests(&self) -> usize {
        self.request_count.load(Ordering::SeqCst)
    }
}

async fn read_http_request(stream: &mut TcpStream) -> Result<()> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 1024];
    loop {
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            return Ok(());
        }
        buffer.extend_from_slice(&chunk[..n]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
            return Ok(());
        }
    }
}

fn http_response(status: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    )
}
