// IPC client CLI.
// Usage:
//   ipc-client --sock <path> --req '{"op":"ping","req_id":1}'
//   ipc-client --sock <path> --op ping --req_id 1
//   ipc-client --sock <path> --op open-window --req_id 5 --id w-5
//
// Prints the JSON response on stdout. Exits 0 on ok:true, 1 otherwise.

use std::path::PathBuf;

use interprocess::local_socket::tokio::prelude::*;
use interprocess::local_socket::{GenericFilePath, ToFsName};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn default_sock() -> PathBuf {
    let uid = unsafe {
        extern "C" {
            fn getuid() -> u32;
        }
        getuid()
    };
    PathBuf::from(format!("/tmp/nf-test-{}.sock", uid))
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> std::process::ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let mut sock: Option<PathBuf> = None;
    let mut raw_req: Option<String> = None;
    let mut op: Option<String> = None;
    let mut req_id: Option<u64> = None;
    let mut id: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--sock" => {
                sock = args.get(i + 1).map(PathBuf::from);
                i += 2;
            }
            "--req" => {
                raw_req = args.get(i + 1).cloned();
                i += 2;
            }
            "--op" => {
                op = args.get(i + 1).cloned();
                i += 2;
            }
            "--req_id" => {
                req_id = args.get(i + 1).and_then(|s| s.parse().ok());
                i += 2;
            }
            "--id" => {
                id = args.get(i + 1).cloned();
                i += 2;
            }
            _ => {
                i += 1;
            }
        }
    }
    let sock = sock.unwrap_or_else(default_sock);
    let payload = if let Some(r) = raw_req {
        r
    } else if let (Some(op), Some(rid)) = (op.as_ref(), req_id) {
        match id {
            Some(idv) => format!(r#"{{"op":"{}","req_id":{},"id":"{}"}}"#, op, rid, idv),
            None => format!(r#"{{"op":"{}","req_id":{}}}"#, op, rid),
        }
    } else {
        eprintln!("usage: ipc-client --sock <path> (--req <json> | --op <op> --req_id <n> [--id <id>])");
        return std::process::ExitCode::from(2);
    };

    let name = match sock
        .to_str()
        .expect("utf8")
        .to_fs_name::<GenericFilePath>()
    {
        Ok(n) => n,
        Err(e) => {
            eprintln!("fsname err: {e}");
            return std::process::ExitCode::from(2);
        }
    };
    let conn = match interprocess::local_socket::tokio::Stream::connect(name).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("connect err: {e}");
            return std::process::ExitCode::from(2);
        }
    };
    let (read_half, mut write_half) = conn.split();
    let line = format!("{}\n", payload.trim());
    if let Err(e) = write_half.write_all(line.as_bytes()).await {
        eprintln!("write err: {e}");
        return std::process::ExitCode::from(2);
    }
    if let Err(e) = write_half.flush().await {
        eprintln!("flush err: {e}");
        return std::process::ExitCode::from(2);
    }

    let mut reader = BufReader::new(read_half);
    let mut resp = String::new();
    match reader.read_line(&mut resp).await {
        Ok(0) => {
            eprintln!("eof before resp");
            return std::process::ExitCode::from(2);
        }
        Ok(_) => {}
        Err(e) => {
            eprintln!("read err: {e}");
            return std::process::ExitCode::from(2);
        }
    }
    print!("{}", resp);
    // Parse ok flag
    let v: serde_json::Value = match serde_json::from_str(resp.trim()) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("parse err: {e}");
            return std::process::ExitCode::from(2);
        }
    };
    if v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false) {
        std::process::ExitCode::from(0)
    } else {
        std::process::ExitCode::from(1)
    }
}
