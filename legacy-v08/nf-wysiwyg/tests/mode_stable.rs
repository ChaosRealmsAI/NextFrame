use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use nf_wysiwyg::{data_mode_attr, Mode};

#[test]
fn mode_stable_body_data_mode_does_not_change_dom_tree_hash() {
    let edit_html = minimal_html(data_mode_attr(Mode::Edit));
    let export_html = minimal_html(data_mode_attr(Mode::Export));

    assert_ne!(edit_html, export_html);
    assert_eq!(dom_tree_hash(&edit_html), dom_tree_hash(&export_html));
}

fn minimal_html(mode: &str) -> String {
    format!(
        "<!DOCTYPE html><html><head><title>mode-stable</title></head><body data-mode=\"{mode}\"><main><div class=\"stage\"><span>Hello</span></div></main></body></html>"
    )
}

fn dom_tree_hash(html: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    strip_body_data_mode(html).hash(&mut hasher);
    hasher.finish()
}

fn strip_body_data_mode(html: &str) -> String {
    let body_start = match html.find("<body") {
        Some(index) => index,
        None => return html.to_string(),
    };
    let tag_end = match html[body_start..].find('>') {
        Some(offset) => body_start + offset,
        None => return html.to_string(),
    };

    let body_tag = &html[body_start..=tag_end];
    let normalized_body_tag = body_tag
        .replace(" data-mode=\"edit\"", "")
        .replace(" data-mode=\"export\"", "")
        .replace(" data-mode=\"record\"", "");

    let mut normalized = String::with_capacity(html.len());
    normalized.push_str(&html[..body_start]);
    normalized.push_str(&normalized_body_tag);
    normalized.push_str(&html[tag_end + 1..]);
    normalized
}
