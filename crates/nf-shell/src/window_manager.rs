use std::collections::HashMap;

use serde::Serialize;
use tao::event_loop::{EventLoopProxy, EventLoopWindowTarget};
use tao::window::{UserAttentionType, Window, WindowId};
use wry::WebView;

use crate::events::UserEvent;
use crate::webview;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WindowStatus {
    pub window_id: String,
    pub project: String,
    pub episode: String,
    pub focused: bool,
}

#[derive(Debug, Clone)]
struct WindowMeta {
    project: String,
    episode: String,
}

pub struct WindowManager {
    windows: HashMap<String, Window>,
    webviews: HashMap<String, WebView>,
    id_by_wid: HashMap<WindowId, String>,
    metadata: HashMap<String, WindowMeta>,
    focused_window_id: Option<String>,
    next_seq: u64,
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            windows: HashMap::new(),
            webviews: HashMap::new(),
            id_by_wid: HashMap::new(),
            metadata: HashMap::new(),
            focused_window_id: None,
            next_seq: 1,
        }
    }

    pub fn open(
        &mut self,
        target: &EventLoopWindowTarget<UserEvent>,
        proxy: &EventLoopProxy<UserEvent>,
        project: &str,
        episode: &str,
    ) -> Result<String, String> {
        if let Some(window_id) = self.find_by_project_episode(project, episode, None) {
            self.focus(&window_id)?;
            return Ok(window_id);
        }

        self.open_new(target, proxy, project, episode)
    }

    pub fn open_new(
        &mut self,
        target: &EventLoopWindowTarget<UserEvent>,
        proxy: &EventLoopProxy<UserEvent>,
        project: &str,
        episode: &str,
    ) -> Result<String, String> {
        let window_id = self.allocate_window_id();
        let (window, webview) =
            webview::create_window(target, proxy.clone(), &window_id, project, episode)?;
        self.id_by_wid.insert(window.id(), window_id.clone());
        self.metadata.insert(
            window_id.clone(),
            WindowMeta {
                project: project.to_string(),
                episode: episode.to_string(),
            },
        );
        self.webviews.insert(window_id.clone(), webview);
        self.windows.insert(window_id.clone(), window);
        self.focused_window_id = Some(window_id.clone());
        Ok(window_id)
    }

    pub fn close(&mut self, window_id: &str) -> Result<(), String> {
        let window = self
            .windows
            .remove(window_id)
            .ok_or_else(|| format!("no such window: {window_id}"))?;
        self.webviews.remove(window_id);
        self.metadata.remove(window_id);
        self.id_by_wid.remove(&window.id());
        if self.focused_window_id.as_deref() == Some(window_id) {
            self.focused_window_id = None;
        }
        drop(window);
        Ok(())
    }

    pub fn close_target(
        &mut self,
        project: &str,
        episode: &str,
        window_id: Option<&str>,
    ) -> Result<String, String> {
        let target_id = self
            .find_by_project_episode(project, episode, window_id)
            .ok_or_else(|| format!("no window for {project}/{episode}"))?;
        self.close(&target_id)?;
        Ok(target_id)
    }

    pub fn remove_by_tao_window_id(&mut self, tao_id: WindowId) -> Option<String> {
        let window_id = self.id_by_wid.remove(&tao_id)?;
        self.windows.remove(&window_id);
        self.webviews.remove(&window_id);
        self.metadata.remove(&window_id);
        if self.focused_window_id.as_deref() == Some(window_id.as_str()) {
            self.focused_window_id = None;
        }
        Some(window_id)
    }

    pub fn quit_all(&mut self) {
        self.webviews.clear();
        self.windows.clear();
        self.id_by_wid.clear();
        self.metadata.clear();
        self.focused_window_id = None;
    }

    pub fn list(&self, project: Option<&str>, episode: Option<&str>) -> Vec<WindowStatus> {
        let mut statuses: Vec<WindowStatus> = self
            .metadata
            .iter()
            .filter(|(_, meta)| project.map_or(true, |value| value == meta.project))
            .filter(|(_, meta)| episode.map_or(true, |value| value == meta.episode))
            .map(|(window_id, meta)| WindowStatus {
                window_id: window_id.clone(),
                project: meta.project.clone(),
                episode: meta.episode.clone(),
                focused: self.focused_window_id.as_deref() == Some(window_id.as_str()),
            })
            .collect();
        statuses.sort_by(|left, right| left.window_id.cmp(&right.window_id));
        statuses
    }

    pub fn webview_for_target(
        &self,
        project: &str,
        episode: &str,
        window_id: Option<&str>,
    ) -> Result<(String, &WebView), String> {
        let target_id = self
            .find_by_project_episode(project, episode, window_id)
            .ok_or_else(|| format!("no window for {project}/{episode}"))?;
        let webview = self
            .webviews
            .get(&target_id)
            .ok_or_else(|| format!("webview missing for {target_id}"))?;
        Ok((target_id, webview))
    }

    pub fn webview_by_window_id(&self, window_id: &str) -> Result<&WebView, String> {
        self.webviews
            .get(window_id)
            .ok_or_else(|| format!("webview missing for {window_id}"))
    }

    pub fn focus(&mut self, window_id: &str) -> Result<(), String> {
        let window = self
            .windows
            .get(window_id)
            .ok_or_else(|| format!("no such window: {window_id}"))?;
        window.set_visible(true);
        window.set_focus();
        window.request_user_attention(Some(UserAttentionType::Informational));
        self.focused_window_id = Some(window_id.to_string());
        Ok(())
    }

    fn find_by_project_episode(
        &self,
        project: &str,
        episode: &str,
        window_id: Option<&str>,
    ) -> Option<String> {
        if let Some(window_id) = window_id {
            return self.metadata.get(window_id).and_then(|meta| {
                (meta.project == project && meta.episode == episode).then(|| window_id.to_string())
            });
        }

        self.metadata
            .iter()
            .find(|(_, meta)| meta.project == project && meta.episode == episode)
            .map(|(id, _)| id.clone())
    }

    fn allocate_window_id(&mut self) -> String {
        loop {
            let id = format!("w-{}", self.next_seq);
            self.next_seq += 1;
            if !self.windows.contains_key(&id) {
                return id;
            }
        }
    }
}

impl Default for WindowManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::WindowManager;

    #[test]
    fn allocates_stable_window_suffixes() {
        let mut manager = WindowManager::new();

        assert_eq!(manager.allocate_window_id(), "w-1");
        assert_eq!(manager.allocate_window_id(), "w-2");
    }

    #[test]
    fn close_missing_window_reports_error() -> Result<(), Box<dyn std::error::Error>> {
        let mut manager = WindowManager::new();

        let error = match manager.close("w-missing") {
            Ok(()) => {
                return Err(Box::new(std::io::Error::other(
                    "missing window closed unexpectedly",
                )));
            }
            Err(error) => error,
        };

        assert_eq!(error, "no such window: w-missing");
        Ok(())
    }
}
