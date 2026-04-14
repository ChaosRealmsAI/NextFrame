//! JavaScript literal extraction helpers for inline HTML parsing.

use regex::Regex;

use crate::error_with_fix;

/// Extracts the string value from a JS assignment like `NAME = 'value'`.
pub(super) fn extract_assignment_string(source: &str, name: &str) -> Option<String> {
    let start = source.find(name)?;
    let after_name = &source[start + name.len()..];
    let equals_index = after_name.find('=')?;
    let rest = after_name[equals_index + 1..].trim_start();
    parse_js_string(rest)
        .map(|(value, _)| value)
        .filter(|value| !value.is_empty())
}

/// Extracts a numeric value from a JS assignment like `NAME = 42`.
pub(super) fn extract_number(source: &str, name: &str) -> Option<f64> {
    let pattern = format!(r"(?m)\b{}\s*=\s*([0-9]+(?:\.[0-9]+)?)", regex::escape(name));
    Regex::new(&pattern)
        .ok()?
        .captures(source)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

/// Extracts the inner content of a JS array assignment like `NAME = [...]`.
pub(super) fn extract_assignment_array(source: &str, name: &str) -> Option<String> {
    let start = source.find(name)?;
    let after_name = &source[start + name.len()..];
    let equals_index = after_name.find('=')?;
    let rest = after_name[equals_index + 1..].trim_start();
    let (slice, _) = parse_balanced_block(rest, '[', ']')?;
    Some(slice)
}

/// Extracts the top-level object literal assigned to `name`.
/// e.g. `window.__SLIDE_SEGMENTS = { ... }` -> inner content of `{ ... }`
pub(super) fn extract_assignment_object(source: &str, name: &str) -> Option<String> {
    let start = source.find(name)?;
    let after_name = &source[start + name.len()..];
    let equals_index = after_name.find('=')?;
    let rest = after_name[equals_index + 1..].trim_start();
    let (inner, _) = parse_balanced_block(rest, '{', '}')?;
    Some(inner)
}

/// Extracts the content of a named array field inside an object literal.
/// e.g. from `segments: [ ... ]` -> inner content of `[ ... ]`
pub(super) fn extract_inner_array(source: &str, field: &str) -> Option<String> {
    let field_idx = source.find(field)?;
    let rest = &source[field_idx + field.len()..];
    let colon_idx = rest.find(':')?;
    let after_colon = rest[colon_idx + 1..].trim_start();
    let (inner, _) = parse_balanced_block(after_colon, '[', ']')?;
    Some(inner)
}

/// Splits object literals out of a JS source fragment.
pub(super) fn extract_object_literals(source: &str) -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    let bytes = source.as_bytes();
    let mut idx = 0;
    while idx < bytes.len() {
        match bytes[idx] as char {
            '{' => {
                let (block, consumed) = parse_balanced_block(&source[idx..], '{', '}')
                    .ok_or_else(|| {
                        error_with_fix(
                            "parse the inline SRT object literal",
                            "unterminated SRT object literal",
                            "Close each `{ ... }` subtitle object in the inline SRT array and retry.",
                        )
                    })?;
                result.push(block);
                idx += consumed;
            }
            '\'' | '"' => {
                idx += parse_js_string_len(&source[idx..]).unwrap_or(1);
            }
            _ => idx += 1,
        }
    }
    Ok(result)
}

/// Extracts a numeric field from a JS object literal like `field: 42`.
pub(super) fn extract_object_number(source: &str, field: &str) -> Option<f64> {
    let pattern = format!(r"\b{}\s*:\s*([0-9]+(?:\.[0-9]+)?)", regex::escape(field));
    Regex::new(&pattern)
        .ok()?
        .captures(source)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

/// Extracts a string field from a JS object literal like `field: 'value'`.
pub(super) fn extract_object_string(source: &str, field: &str) -> Option<String> {
    let field_idx = source.find(field)?;
    let rest = &source[field_idx + field.len()..];
    let colon_idx = rest.find(':')?;
    let value = rest[colon_idx + 1..].trim_start();
    parse_js_string(value).map(|(text, _)| text)
}

/// Parses a balanced block delimited by `open`/`close` characters, returning the inner content
/// and the number of bytes consumed.
pub(super) fn parse_balanced_block(
    source: &str,
    open: char,
    close: char,
) -> Option<(String, usize)> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut quote = '\0';
    let mut escape = false;
    for (idx, ch) in source.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if ch == '\\' {
                escape = true;
                continue;
            }
            if ch == quote {
                in_string = false;
            }
            continue;
        }
        if ch == '\'' || ch == '"' {
            in_string = true;
            quote = ch;
            continue;
        }
        if ch == open {
            depth += 1;
        } else if ch == close {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                let inner = source[1..idx].to_string();
                return Some((inner, idx + close.len_utf8()));
            }
        }
    }
    None
}

/// Parses a JS string literal (single or double quoted) and returns the content and consumed length.
pub(super) fn parse_js_string(source: &str) -> Option<(String, usize)> {
    let quote = source.chars().next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let mut output = String::new();
    let mut chars = source.char_indices();
    chars.next()?;
    let mut escaped = false;
    while let Some((idx, ch)) = chars.next() {
        if escaped {
            output.push(match ch {
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                '\\' => '\\',
                '\'' => '\'',
                '"' => '"',
                'u' => {
                    let digits = source.get(idx + 1..idx + 5)?;
                    let value = u16::from_str_radix(digits, 16).ok()?;
                    let character = char::from_u32(value as u32)?;
                    for _ in 0..4 {
                        chars.next();
                    }
                    character
                }
                other => other,
            });
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == quote {
            return Some((output, idx + ch.len_utf8()));
        }
        output.push(ch);
    }
    None
}

fn parse_js_string_len(source: &str) -> Option<usize> {
    parse_js_string(source).map(|(_, len)| len)
}
