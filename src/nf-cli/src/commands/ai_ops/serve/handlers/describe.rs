use axum::Json;

pub async fn handle() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "actions": [
            {
                "name": "build",
                "description": "Stub build action for AI-ops HTTP clients.",
                "args_schema": {
                    "type": "object",
                    "properties": {
                        "source": { "type": "string" },
                        "output": { "type": "string" }
                    },
                    "required": ["source", "output"]
                }
            },
            {
                "name": "record",
                "description": "Stub record action for AI-ops HTTP clients.",
                "args_schema": {
                    "type": "object",
                    "properties": {
                        "bundle": { "type": "string" },
                        "output": { "type": "string" }
                    },
                    "required": ["bundle", "output"]
                }
            },
            {
                "name": "validate",
                "description": "Stub validate action for AI-ops HTTP clients.",
                "args_schema": {
                    "type": "object",
                    "properties": {
                        "source": { "type": "string" }
                    },
                    "required": ["source"]
                }
            },
            {
                "name": "ai-ops.state",
                "description": "Read current AI-ops state.",
                "args_schema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "ai-ops.simulate",
                "description": "Simulate an AI-ops action.",
                "args_schema": {
                    "type": "object",
                    "properties": {
                        "action": { "type": "string" }
                    },
                    "required": ["action"]
                }
            },
            {
                "name": "ai-ops.screenshot",
                "description": "Capture a screenshot.",
                "args_schema": {
                    "type": "object",
                    "properties": {
                        "output": { "type": "string" }
                    },
                    "required": ["output"]
                }
            }
        ]
    }))
}
