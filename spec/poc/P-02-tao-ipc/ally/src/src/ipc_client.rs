use std::{
    env,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process,
};

use interprocess::local_socket::{
    prelude::*, GenericFilePath, Stream as LocalSocketStream, ToFsName,
};
use serde_json::{json, Value};

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = Args::parse()?;
    let socket_display = args.socket.display().to_string();
    let name = args
        .socket
        .to_fs_name::<GenericFilePath>()
        .map_err(|err| format!("invalid socket path {socket_display}: {err}"))?;

    let mut stream =
        LocalSocketStream::connect(name).map_err(|err| format!("connect failed: {err}"))?;
    writeln!(stream, "{}", args.request).map_err(|err| format!("write failed: {err}"))?;
    stream
        .flush()
        .map_err(|err| format!("flush failed: {err}"))?;

    let mut reader = BufReader::new(stream);
    let mut response = String::new();
    reader
        .read_line(&mut response)
        .map_err(|err| format!("read failed: {err}"))?;
    if response.trim().is_empty() {
        return Err("empty response".to_string());
    }

    println!("{}", response.trim_end());
    Ok(())
}

struct Args {
    socket: PathBuf,
    request: Value,
}

impl Args {
    fn parse() -> Result<Self, String> {
        let mut socket = default_socket_path();
        let mut req_id: Option<Value> = None;
        let mut op: Option<String> = None;
        let mut window_id: Option<String> = None;
        let mut raw_json: Option<Value> = None;

        let mut args = env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--socket" => {
                    socket = PathBuf::from(
                        args.next()
                            .ok_or_else(|| "--socket requires a path".to_string())?,
                    );
                }
                "--req-id" => {
                    let value = args
                        .next()
                        .ok_or_else(|| "--req-id requires a value".to_string())?;
                    req_id = Some(parse_req_id(&value));
                }
                "--op" => {
                    op = Some(
                        args.next()
                            .ok_or_else(|| "--op requires a value".to_string())?,
                    );
                }
                "--window-id" => {
                    window_id = Some(
                        args.next()
                            .ok_or_else(|| "--window-id requires a value".to_string())?,
                    );
                }
                "--json" => {
                    let raw = args
                        .next()
                        .ok_or_else(|| "--json requires a request object".to_string())?;
                    raw_json = Some(
                        serde_json::from_str(&raw)
                            .map_err(|err| format!("invalid --json request: {err}"))?,
                    );
                }
                "--help" | "-h" => {
                    return Err(help());
                }
                other => return Err(format!("unknown arg: {other}\n{}", help())),
            }
        }

        let request = if let Some(raw_json) = raw_json {
            raw_json
        } else {
            let op = op.ok_or_else(help)?;
            let mut request = json!({
                "req_id": req_id.unwrap_or_else(|| json!(1)),
                "op": op,
            });
            if let Some(window_id) = window_id {
                request["window_id"] = json!(window_id);
            }
            request
        };

        Ok(Self { socket, request })
    }
}

fn parse_req_id(value: &str) -> Value {
    value
        .parse::<i64>()
        .map(Value::from)
        .unwrap_or_else(|_| Value::from(value.to_string()))
}

fn default_socket_path() -> PathBuf {
    let uid = env::var("UID")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    PathBuf::from(format!("/tmp/nf-test-{uid}.sock"))
}

fn help() -> String {
    "usage: ipc-client [--socket PATH] (--op OP [--req-id ID] [--window-id ID] | --json JSON)"
        .to_string()
}
