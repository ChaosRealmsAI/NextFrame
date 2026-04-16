use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

fn default_version() -> String {
    "0.7".to_owned()
}

fn default_ratio() -> String {
    "16:9".to_owned()
}

fn default_params() -> Value {
    Value::Object(Map::new())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Timeline {
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default = "default_ratio")]
    pub ratio: String,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub fps: u32,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub layers: Vec<Layer>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Layer {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub scene: String,
    #[serde(default)]
    pub start: f64,
    #[serde(default, alias = "duration")]
    pub dur: f64,
    #[serde(default)]
    pub layout: Layout,
    #[serde(default = "default_params")]
    pub params: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Layout {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default = "default_full")]
    pub w: f64,
    #[serde(default = "default_full")]
    pub h: f64,
}

fn default_full() -> f64 {
    100.0
}

impl Default for Timeline {
    fn default() -> Self {
        let viewport = viewport_for_ratio(&default_ratio());
        Self {
            version: default_version(),
            ratio: default_ratio(),
            width: viewport.0,
            height: viewport.1,
            fps: 30,
            duration: 0.0,
            layers: Vec::new(),
        }
    }
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            w: default_full(),
            h: default_full(),
        }
    }
}

impl Timeline {
    pub fn default_demo() -> Self {
        default_demo()
    }
}

fn viewport_for_ratio(ratio: &str) -> (u32, u32) {
    match ratio {
        "9:16" => (1080, 1920),
        "1:1" => (1080, 1080),
        _ => (1920, 1080),
    }
}

fn layer(id: &str, scene: &str, start: f64, dur: f64, layout: Layout, params: Value) -> Layer {
    Layer {
        id: id.to_owned(),
        scene: scene.to_owned(),
        start,
        dur,
        layout,
        params,
    }
}

pub fn default_demo() -> Timeline {
    let ratio = default_ratio();
    let viewport = viewport_for_ratio(&ratio);
    Timeline {
        version: default_version(),
        ratio,
        width: viewport.0,
        height: viewport.1,
        fps: 30,
        duration: 30.0,
        layers: vec![
            layer(
                "bg",
                "darkGradient",
                0.0,
                30.0,
                Layout::default(),
                json!({}),
            ),
            layer(
                "video",
                "videoClip",
                0.0,
                30.0,
                Layout {
                    x: 11.0,
                    y: 6.5,
                    w: 78.0,
                    h: 78.0,
                },
                json!({
                    "src": "demo.mp4",
                    "label": "[video]"
                }),
            ),
            layer(
                "headline",
                "headlineCenter",
                0.0,
                5.0,
                Layout {
                    x: 10.0,
                    y: 40.0,
                    w: 80.0,
                    h: 20.0,
                },
                json!({
                    "text": "桌面剪辑预览<br><span style='color:var(--accent)'>预览即导出</span>",
                    "fontSize": 5.4
                }),
            ),
            layer(
                "sub",
                "subtitleBar",
                0.0,
                30.0,
                Layout {
                    x: 0.0,
                    y: 82.0,
                    w: 100.0,
                    h: 12.0,
                },
                json!({
                    "fontSize": 2.5,
                    "srt": [
                        {"s": 0.2, "e": 5.0, "t": "我们三年前谈过一次。"},
                        {"s": 5.5, "e": 12.0, "t": "底层技术的指数增长，基本符合预期。"},
                        {"s": 13.0, "e": 22.0, "t": "大众完全没意识到，我们离指数终点有多近。"},
                        {"s": 23.0, "e": 30.0, "t": "这是一个所见即所得的预览。"}
                    ]
                }),
            ),
        ],
    }
}
