//! ipc http transport helpers
use std::fmt::Display;
use std::io::{ErrorKind, Read, Write};
use std::net::{Shutdown, TcpStream};
use std::time::Instant;

pub(crate) struct HttpConnection {
    pub(crate) stream: TcpStream,
    pub(crate) buffer: Vec<u8>,
    pub(crate) accepted_at: Instant,
}

pub(crate) struct HttpRequest {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) body: Vec<u8>,
}

fn error_with_fix(action: &str, reason: impl Display, fix: &str) -> String {
    format!("failed to {action}: {reason}. Fix: {fix}")
}

pub(crate) fn read_http_request(
    connection: &mut HttpConnection,
) -> Result<Option<HttpRequest>, String> {
    let mut chunk = [0_u8; 8192];
    loop {
        match connection.stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(read_len) => connection.buffer.extend_from_slice(&chunk[..read_len]),
            Err(error) if error.kind() == ErrorKind::WouldBlock => break,
            Err(error) => {
                return Err(error_with_fix(
                    "read the HTTP request",
                    error,
                    "Retry after reconnecting the HTTP client and resending the request.",
                ));
            }
        }
    }

    let Some(header_end) = connection
        .buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
    else {
        return Ok(None);
    };

    let header_bytes = &connection.buffer[..header_end];
    let header_text = std::str::from_utf8(header_bytes).map_err(|error| {
        error_with_fix(
            "decode the HTTP request headers",
            format!("header bytes were not valid UTF-8: {error}"),
            "Send ASCII or UTF-8 HTTP headers and retry the request.",
        )
    })?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| {
            error_with_fix(
                "parse the HTTP request line",
                "the request line was missing",
                "Send a complete HTTP request starting with `METHOD /path HTTP/1.1`.",
            )
        })?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| {
            error_with_fix(
                "parse the HTTP request method",
                "the request line did not include an HTTP method",
                "Start the request line with a method such as `GET` or `POST`.",
            )
        })?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| {
            error_with_fix(
                "parse the HTTP request path",
                "the request line did not include a path",
                "Include a request path such as `/status` or `/navigate` in the request line.",
            )
        })?
        .to_string();

    let mut content_length = 0_usize;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            content_length = value.trim().parse::<usize>().map_err(|error| {
                error_with_fix(
                    "parse the HTTP Content-Length header",
                    format!("invalid Content-Length value `{}`: {error}", value.trim()),
                    "Send a non-negative integer Content-Length header that matches the request body size.",
                )
            })?;
        }
    }

    let body_offset = header_end + 4;
    let total_len = body_offset + content_length;
    if connection.buffer.len() < total_len {
        return Ok(None);
    }

    Ok(Some(HttpRequest {
        method,
        path,
        body: connection.buffer[body_offset..total_len].to_vec(),
    }))
}

pub(crate) fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    status_text: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let _ = stream.set_nonblocking(false);
    let header = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()?;
    let _ = stream.shutdown(Shutdown::Both);
    Ok(())
}
