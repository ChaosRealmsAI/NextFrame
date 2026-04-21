use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub path: PathBuf,
    pub content: String,
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
            let parent_name = path
                .parent()
                .and_then(Path::file_name)
                .and_then(|name| name.to_str())
                .unwrap_or("skill");
            let (name, description) = parse_skill_header(&content, parent_name);
            skills.insert(
                name.clone(),
                Skill {
                    name,
                    description,
                    path,
                    content,
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
