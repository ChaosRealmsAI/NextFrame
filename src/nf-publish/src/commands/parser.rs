//! command argument parsing helpers
use crate::error::{ensure_fix, error_with_fix};

pub(crate) fn parse_command_token(input: &str) -> Result<(String, &str), String> {
    let trimmed = input.trim_start();
    if trimmed.is_empty() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the publish command",
                "the command is missing a required argument",
                "Provide the required argument and retry the command.",
            ),
        );
    }
    if trimmed.starts_with('"') {
        let mut escaped = false;
        for (idx, ch) in trimmed.char_indices().skip(1) {
            if escaped {
                escaped = false;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                continue;
            }
            if ch == '"' {
                let token = &trimmed[..=idx];
                let parsed = serde_json::from_str::<String>(token).map_err(|err| {
                    error_with_fix(
                        "parse the quoted command argument",
                        err,
                        "Close the quotes correctly and escape embedded quotes as JSON.",
                    )
                })?;
                let rest = trimmed[idx + 1..].trim_start();
                return Ok((parsed, rest));
            }
        }
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the quoted command argument",
                "the argument ended before the closing quote",
                "Close the quoted argument and retry the command.",
            ),
        );
    }

    if let Some(space) = trimmed.find(char::is_whitespace) {
        Ok((trimmed[..space].to_owned(), trimmed[space..].trim_start()))
    } else {
        Ok((trimmed.to_owned(), ""))
    }
}

pub(crate) fn parse_selector_arg(input: &str, usage: &str) -> Result<String, String> {
    let (selector, tail) = parse_command_token(input)
        .map_err(|err| ensure_fix(err, "parse the selector argument", usage))?;
    if selector.is_empty() || !tail.trim().is_empty() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the selector argument",
                format!("invalid arguments for `{usage}`"),
                usage,
            ),
        );
    }
    Ok(selector)
}

pub(crate) fn parse_selector_pair(input: &str, usage: &str) -> Result<(String, String), String> {
    let (first, rest) = parse_command_token(input)
        .map_err(|err| ensure_fix(err, "parse the selector pair", usage))?;
    if first.is_empty() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the selector pair",
                format!("invalid arguments for `{usage}`"),
                usage,
            ),
        );
    }
    let (second, tail) = parse_command_token(rest)
        .map_err(|err| ensure_fix(err, "parse the selector pair", usage))?;
    if second.is_empty() || !tail.trim().is_empty() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the selector pair",
                format!("invalid arguments for `{usage}`"),
                usage,
            ),
        );
    }
    Ok((first, second))
}

pub(crate) fn parse_selector_and_value(
    input: &str,
    usage: &str,
) -> Result<(String, String), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the selector and value arguments",
                format!("invalid arguments for `{usage}`"),
                usage,
            ),
        );
    }
    if let Some(rest) = trimmed.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            let selector = rest[..end].to_owned();
            let value = rest[end + 1..].trim();
            if value.is_empty() {
                return Err(
                    /* Fix: user-facing error formatted below */
                    error_with_fix(
                        "parse the selector and value arguments",
                        format!("invalid arguments for `{usage}`"),
                        usage,
                    ),
                );
            }
            return Ok((selector, value.to_owned()));
        }
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the quoted selector",
                "the selector ended before the closing quote",
                "Close the quoted selector and retry the command.",
            ),
        );
    }

    let Some(space) = trimmed.find(' ') else {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the selector and value arguments",
                format!("invalid arguments for `{usage}`"),
                usage,
            ),
        );
    };
    let selector = trimmed[..space].trim();
    let value = trimmed[space + 1..].trim();
    if selector.is_empty() || value.is_empty() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the selector and value arguments",
                format!("invalid arguments for `{usage}`"),
                usage,
            ),
        );
    }
    Ok((selector.to_owned(), value.to_owned()))
}

pub(crate) fn parse_selector_and_timeout(
    input: &str,
    default_timeout_ms: u64,
) -> Result<(String, u64), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the wait command",
                "missing selector argument",
                "Use `wait <selector> [timeout_ms]`.",
            ),
        );
    }

    if let Some(rest) = trimmed.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            let selector = rest[..end].to_owned();
            let timeout = rest[end + 1..].trim();
            if timeout.is_empty() {
                return Ok((selector, default_timeout_ms));
            }
            return timeout
                .parse::<u64>()
                .map(|ms| (selector, ms))
                .map_err(|_| {
                    error_with_fix(
                        "parse the wait timeout",
                        format!("`{timeout}` is not a valid integer timeout in milliseconds"),
                        "Use a non-negative integer timeout such as `5000`.",
                    )
                });
        }
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the quoted selector",
                "the selector ended before the closing quote",
                "Close the quoted selector and retry the command.",
            ),
        );
    }

    let mut parts = trimmed.rsplitn(2, ' ');
    let last = parts.next().unwrap_or_default().trim();
    let rest = parts.next().unwrap_or_default().trim();
    if !rest.is_empty()
        && let Ok(timeout_ms) = last.parse::<u64>()
    {
        return Ok((rest.to_owned(), timeout_ms));
    }
    Ok((trimmed.to_owned(), default_timeout_ms))
}

pub(crate) fn parse_xy_args(input: &str, usage: &str) -> Result<(f64, f64), String> {
    let parts: Vec<&str> = input.split_whitespace().collect();
    if parts.len() != 2 {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the coordinate arguments",
                format!("invalid arguments for `{usage}`"),
                usage,
            ),
        );
    }
    let x = parts[0].parse::<f64>().map_err(|_| {
        error_with_fix(
            "parse the x coordinate",
            format!("`{}` is not a valid number", parts[0]),
            "Use a numeric x coordinate such as `120` or `120.5`.",
        )
    })?;
    let y = parts[1].parse::<f64>().map_err(|_| {
        error_with_fix(
            "parse the y coordinate",
            format!("`{}` is not a valid number", parts[1]),
            "Use a numeric y coordinate such as `240` or `240.5`.",
        )
    })?;
    Ok((x, y))
}

pub(crate) fn parse_coords(coords: &str) -> Result<(f64, f64), String> {
    let parts: Vec<&str> = coords.split(',').collect();
    if let (Some(xs), Some(ys)) = (parts.first(), parts.get(1))
        && let (Ok(x), Ok(y)) = (xs.parse::<f64>(), ys.parse::<f64>())
    {
        return Ok((x, y));
    }
    Err(
        /* Fix: user-facing error formatted below */
        error_with_fix(
            "parse the element coordinates",
            format!("`{coords}` is not in `x,y` format"),
            "Return coordinates as `x,y` with numeric values.",
        ),
    )
}

pub(crate) fn parse_rect(rect: &str) -> Result<(i64, i64, i64, i64), String> {
    let parts: Vec<&str> = rect.split(',').collect();
    if parts.len() != 4 {
        return Err(
            /* Fix: user-facing error formatted below */
            error_with_fix(
                "parse the rectangle",
                format!("`{rect}` is not in `x,y,width,height` format"),
                "Use four comma-separated integers such as `0,0,1280,720`.",
            ),
        );
    }
    let x = parts[0].parse::<i64>().map_err(|_| {
        error_with_fix(
            "parse the rectangle",
            format!("`{rect}` is not in `x,y,width,height` format"),
            "Use four comma-separated integers such as `0,0,1280,720`.",
        )
    })?;
    let y = parts[1].parse::<i64>().map_err(|_| {
        error_with_fix(
            "parse the rectangle",
            format!("`{rect}` is not in `x,y,width,height` format"),
            "Use four comma-separated integers such as `0,0,1280,720`.",
        )
    })?;
    let w = parts[2].parse::<i64>().map_err(|_| {
        error_with_fix(
            "parse the rectangle",
            format!("`{rect}` is not in `x,y,width,height` format"),
            "Use four comma-separated integers such as `0,0,1280,720`.",
        )
    })?;
    let h = parts[3].parse::<i64>().map_err(|_| {
        error_with_fix(
            "parse the rectangle",
            format!("`{rect}` is not in `x,y,width,height` format"),
            "Use four comma-separated integers such as `0,0,1280,720`.",
        )
    })?;
    Ok((x, y, w, h))
}
