use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde_json::Value;

use crate::plugins::nextframe_home_dir;

#[derive(Debug, Clone)]
pub enum TemplateOrigin {
    GitHub { url: String },
    Fallback,
}

impl TemplateOrigin {
    pub fn label(&self) -> String {
        match self {
            Self::GitHub { url } => format!("github:{url}"),
            Self::Fallback => "fallback:embedded".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct MaterializedTemplate {
    pub name: String,
    pub path: PathBuf,
    pub origin: TemplateOrigin,
}

struct TemplateBundle {
    name: String,
    serialized: String,
    origin: TemplateOrigin,
}

pub fn template_output_root() -> PathBuf {
    nextframe_home_dir().join("templates")
}

pub fn materialize_template(name: &str) -> Result<MaterializedTemplate> {
    let bundle = resolve_template(name)?;
    let output_root = template_output_root();
    fs::create_dir_all(&output_root).with_context(|| format!("mkdir {}", output_root.display()))?;
    let dir = unique_output_dir(&output_root, &bundle.name);
    fs::create_dir_all(&dir).with_context(|| format!("mkdir {}", dir.display()))?;
    let path = dir.join("source.json");
    fs::write(&path, bundle.serialized.as_bytes())
        .with_context(|| format!("write {}", path.display()))?;
    Ok(MaterializedTemplate {
        name: bundle.name,
        path,
        origin: bundle.origin,
    })
}

fn resolve_template(name: &str) -> Result<TemplateBundle> {
    match fetch_github_template(name) {
        Ok(bundle) => Ok(bundle),
        Err(github_err) => load_fallback_template(name).with_context(|| {
            format!("template '{name}' unavailable from GitHub and fallback: {github_err}")
        }),
    }
}

fn fetch_github_template(name: &str) -> Result<TemplateBundle> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(4))
        .build()
        .context("build template-market http client")?;

    let mut last_err = None;
    for url in github_candidate_urls(name) {
        match client
            .get(&url)
            .header(reqwest::header::USER_AGENT, "nf-shell/template-market")
            .send()
        {
            Ok(response) if response.status().is_success() => {
                let text = response.text().context("read template response body")?;
                return parse_template_json(name, &text, TemplateOrigin::GitHub { url });
            }
            Ok(response) => {
                last_err = Some(anyhow::anyhow!(
                    "GET {} returned {}",
                    url,
                    response.status()
                ));
            }
            Err(err) => {
                last_err = Some(err.into());
            }
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("no GitHub template url matched")))
}

fn load_fallback_template(name: &str) -> Result<TemplateBundle> {
    let raw = fallback_template_raw(name)
        .ok_or_else(|| anyhow::anyhow!("no embedded fallback for template '{name}'"))?;
    parse_template_json(name, raw, TemplateOrigin::Fallback)
}

fn parse_template_json(name: &str, raw: &str, origin: TemplateOrigin) -> Result<TemplateBundle> {
    let value: Value = serde_json::from_str(raw)
        .with_context(|| format!("template '{name}' source.json is not valid JSON"))?;
    let serialized = serde_json::to_string_pretty(&value).context("pretty print template JSON")?;
    Ok(TemplateBundle {
        name: sanitize_name(name),
        serialized,
        origin,
    })
}

fn github_candidate_urls(name: &str) -> Vec<String> {
    let slug = sanitize_name(name);
    vec![
        format!("https://raw.githubusercontent.com/nextframe-templates/{slug}/main/source.json"),
        format!("https://raw.githubusercontent.com/nextframe-templates/{slug}/master/source.json"),
    ]
}

fn unique_output_dir(root: &std::path::Path, name: &str) -> PathBuf {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let base = root.join(format!("{}-{stamp}", sanitize_name(name)));
    if !base.exists() {
        return base;
    }
    for idx in 1..1000 {
        let candidate = root.join(format!("{}-{stamp}-{idx}", sanitize_name(name)));
        if !candidate.exists() {
            return candidate;
        }
    }
    root.join(format!("{}-{stamp}-overflow", sanitize_name(name)))
}

fn sanitize_name(name: &str) -> String {
    let slug = name
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "template".to_string()
    } else {
        slug
    }
}

fn fallback_template_raw(name: &str) -> Option<&'static str> {
    match sanitize_name(name).as_str() {
        "basic-slideshow" => Some(BASIC_SLIDESHOW_TEMPLATE),
        _ => None,
    }
}

const BASIC_SLIDESHOW_TEMPLATE: &str = r##"
{
  "meta": {
    "name": "Basic Slideshow",
    "description": "基础模板 · 3 页轮播 · 可直接在 nf-shell 里改字和配色",
    "template": "basic-slideshow",
    "version": "v1.65"
  },
  "viewport": {
    "ratio": "16:9",
    "w": 1920,
    "h": 1080
  },
  "duration": "demo.end",
  "anchors": {
    "demo": {
      "begin": "0",
      "end": "demo.begin + 12s",
      "filler": "manual"
    }
  },
  "tracks": [
    {
      "id": "bg-template",
      "kind": "bg",
      "src": "src/nf-tracks/official/bg.js",
      "clips": [
        {
          "id": "bg-template-01",
          "begin": "demo.begin",
          "end": "demo.end",
          "params": {
            "type": "gradient",
            "gradient": "linear",
            "angle": 135,
            "stops": [
              { "offset": 0, "color": "#08111f" },
              { "offset": 0.45, "color": "#0f2a43" },
              { "offset": 1, "color": "#122c39" }
            ]
          }
        }
      ]
    },
    {
      "id": "scene-slideshow",
      "kind": "scene",
      "src": "src/nf-tracks/official/scene.js",
      "clips": [
        {
          "id": "slide-01",
          "begin": "0",
          "end": "4s",
          "params": {
            "layout": "hero",
            "title": "Slide One",
            "subtitle": "替换成你的标题和副标题",
            "accent_color": "#5eead4"
          }
        },
        {
          "id": "slide-02",
          "begin": "4s",
          "end": "8s",
          "params": {
            "layout": "stat",
            "big_number": "128%",
            "label": "Quarter-over-quarter growth",
            "sublabel": "把这里改成你的关键指标",
            "accent_color": "#fbbf24"
          }
        },
        {
          "id": "slide-03",
          "begin": "8s",
          "end": "12s",
          "params": {
            "layout": "hero",
            "title": "Closing Slide",
            "subtitle": "From Template... 生成后可直接继续编辑",
            "accent_color": "#f472b6"
          }
        }
      ]
    }
  ]
}
"##;

#[cfg(test)]
mod tests {
    use super::{materialize_template, sanitize_name, template_output_root, TemplateOrigin};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn unique_temp_dir(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("nf-shell-{label}-{stamp}"))
    }

    #[test]
    fn sanitize_name_keeps_basic_slug() {
        assert_eq!(sanitize_name("basic-slideshow"), "basic-slideshow");
        assert_eq!(sanitize_name("Basic Slideshow"), "basic-slideshow");
    }

    #[test]
    fn materialize_fallback_template_writes_source_json() -> Result<(), Box<dyn std::error::Error>>
    {
        let _guard = env_lock().lock().map_err(|_| "env lock poisoned")?;
        let home = unique_temp_dir("template-home");
        let prev_home = std::env::var_os("HOME");
        std::env::set_var("HOME", &home);
        let created = materialize_template("basic-slideshow")?;
        match created.origin {
            TemplateOrigin::GitHub { .. } | TemplateOrigin::Fallback => {}
        }
        assert!(created.path.ends_with("source.json"));
        assert!(created.path.is_file());
        assert!(created.path.starts_with(template_output_root()));
        let _ = fs::remove_dir_all(home);
        match prev_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        Ok(())
    }
}
