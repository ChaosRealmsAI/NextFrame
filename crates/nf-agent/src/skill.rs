use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use serde::Deserialize;
use walkdir::WalkDir;

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SkillFrontmatter {
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub expected_outputs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub path: PathBuf,
    pub content: String,
    pub expected_outputs: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct SkillRegistry {
    skills: BTreeMap<String, Skill>,
}

impl SkillRegistry {
    pub fn load(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref();
        if !root.exists() {
            return Ok(Self::default());
        }

        let mut skills = BTreeMap::new();
        for entry in WalkDir::new(root).follow_links(false) {
            let entry =
                entry.with_context(|| format!("failed to walk skills dir {}", root.display()))?;
            if !entry.file_type().is_file() || entry.file_name() != "SKILL.md" {
                continue;
            }

            let path = entry.path().to_path_buf();
            let content = fs::read_to_string(&path)
                .with_context(|| format!("failed to read skill {}", path.display()))?;
            let (frontmatter, body) = parse_frontmatter(&content)
                .with_context(|| format!("failed to parse skill frontmatter {}", path.display()))?;
            let parent_name = path
                .parent()
                .and_then(Path::file_name)
                .and_then(|name| name.to_str())
                .unwrap_or("skill");
            let (header_name, header_description) = parse_skill_header(&body, parent_name);
            let name = frontmatter
                .name
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(header_name);
            let description = frontmatter
                .description
                .filter(|description| !description.trim().is_empty())
                .unwrap_or(header_description);
            skills.insert(
                name.clone(),
                Skill {
                    name,
                    description,
                    path,
                    content: body,
                    expected_outputs: frontmatter.expected_outputs,
                },
            );
        }

        Ok(Self { skills })
    }

    pub fn names(&self) -> Vec<String> {
        self.skills.keys().cloned().collect()
    }

    pub fn descriptions(&self) -> Vec<String> {
        self.skills
            .values()
            .map(|skill| {
                if skill.description.is_empty() {
                    skill.name.clone()
                } else {
                    format!("{}={}", skill.name, skill.description)
                }
            })
            .collect()
    }

    pub fn get(&self, name: &str) -> Option<&Skill> {
        self.skills.get(name)
    }
}

fn parse_frontmatter(content: &str) -> Result<(SkillFrontmatter, String)> {
    let Some(rest) = content.strip_prefix("---\n") else {
        return Ok((SkillFrontmatter::default(), content.to_owned()));
    };
    let Some(end) = rest.find("\n---\n") else {
        return Ok((SkillFrontmatter::default(), content.to_owned()));
    };

    let yaml = &rest[..end];
    let body = rest[end + "\n---\n".len()..]
        .strip_prefix('\n')
        .unwrap_or(&rest[end + "\n---\n".len()..])
        .to_owned();
    let frontmatter = serde_yaml::from_str::<SkillFrontmatter>(yaml)
        .context("invalid YAML frontmatter in skill")?;
    Ok((frontmatter, body))
}

fn parse_skill_header(content: &str, fallback_name: &str) -> (String, String) {
    let Some(first_line) = content.lines().next() else {
        return (fallback_name.to_owned(), String::new());
    };
    let Some(heading) = first_line.strip_prefix("# ") else {
        return (fallback_name.to_owned(), String::new());
    };
    let mut parts = heading.splitn(2, '·');
    let name = parts
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback_name)
        .to_owned();
    let description = parts.next().map(str::trim).unwrap_or("").to_owned();
    (name, description)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frontmatter_and_strips_body() -> Result<()> {
        let content = "\
---
name: demo
description: Demo skill
expected_outputs:
  - \"**/outputs/index.html\"
  - \"**/outputs/item_*.json\"
---

# ignored header
";

        let (frontmatter, body) = parse_frontmatter(content)?;

        assert_eq!(frontmatter.name.as_deref(), Some("demo"));
        assert_eq!(frontmatter.description.as_deref(), Some("Demo skill"));
        assert_eq!(
            frontmatter.expected_outputs,
            vec![
                "**/outputs/index.html".to_owned(),
                "**/outputs/item_*.json".to_owned()
            ]
        );
        assert!(body.starts_with("# ignored header"));
        assert!(!body.starts_with("---"));
        Ok(())
    }

    #[test]
    fn old_format_keeps_header_fallback() -> Result<()> {
        let content = "# demo · Existing format\n\nbody";
        let (frontmatter, body) = parse_frontmatter(content)?;
        let (name, description) = parse_skill_header(&body, "fallback");

        assert!(frontmatter.expected_outputs.is_empty());
        assert_eq!(body, content);
        assert_eq!(name, "demo");
        assert_eq!(description, "Existing format");
        Ok(())
    }
}
