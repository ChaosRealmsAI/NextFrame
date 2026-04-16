use serde_json::Value;

pub trait SceneDom {
    fn render(&self, params: &Value) -> String;
    fn id(&self) -> &'static str;
}
