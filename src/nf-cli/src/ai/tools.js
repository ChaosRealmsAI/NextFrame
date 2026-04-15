// AI tool definitions — v0.3 layers[] format.
import { getREGISTRY, listScenes, getScene } from '../lib/scene-registry.js';
import { validateTimelineV3 } from '../lib/timeline-validate.js';
import { describeAt } from '../lib/v3-describe.js';
import { addLayer, removeLayer, moveLayer, resizeLayer, setLayerProp, listLayers } from 'nf-core/engine/ops.js';
export const TOOLS = {
    list_scenes: {
        schema: { name: "list_scenes", description: "List all v0.3 scenes from registry", params: [] },
        handler: () => ({ ok: true, value: listScenes() }),
    },
    get_scene: {
        schema: {
            name: "get_scene",
            description: "Get scene metadata by id",
            params: [{ name: "id", type: "string", required: true }],
        },
        handler: ({ id }) => {
            const scene = getScene(id);
            if (!scene)
                return { ok: false, error: { code: "UNKNOWN_SCENE", message: `no scene "${id}"` } };
            return { ok: true, value: scene };
        },
    },
    validate_timeline: {
        schema: {
            name: "validate_timeline",
            description: "Validate v0.3 layers[] timeline",
            params: [{ name: "timeline", type: "object", required: true }],
        },
        handler: ({ timeline }) => validateTimelineV3(timeline),
    },
    describe_frame: {
        schema: {
            name: "describe_frame",
            description: "Describe active layers at time t",
            params: [{ name: "timeline", type: "object", required: true }, { name: "t", type: "number", required: true }],
        },
        handler: ({ timeline, t }) => describeAt(timeline, t),
    },
    find_layers: {
        schema: {
            name: "find_layers",
            description: "Search layers by scene or time",
            params: [{ name: "timeline", type: "object", required: true }, { name: "scene", type: "string" }, { name: "at", type: "number" }],
        },
        handler: ({ timeline, scene, at }) => {
            const matches = [];
            for (const layer of (timeline.layers || [])) {
                if (scene && layer.scene !== scene)
                    continue;
                if (typeof at === "number" && (at < layer.start || at >= layer.start + layer.dur))
                    continue;
                matches.push({ id: layer.id, scene: layer.scene, start: layer.start, dur: layer.dur, end: layer.start + layer.dur });
            }
            return { ok: true, value: matches };
        },
    },
    get_layer: {
        schema: {
            name: "get_layer",
            description: "Get full layer details by id",
            params: [{ name: "timeline", type: "object", required: true }, { name: "layerId", type: "string", required: true }],
        },
        handler: async ({ timeline, layerId }) => {
            const layer = (timeline.layers || []).find((l) => l.id === layerId);
            if (!layer)
                return { ok: false, error: { code: "NOT_FOUND", message: `no layer "${layerId}"` } };
            const reg = await getREGISTRY();
            return { ok: true, value: { ...layer, sceneMeta: reg.get(layer.scene) || null } };
        },
    },
    list_layers: {
        schema: {
            name: "list_layers",
            description: "List all layers with timing",
            params: [{ name: "timeline", type: "object", required: true }],
        },
        handler: ({ timeline }) => listLayers(timeline),
    },
    apply_patch: {
        schema: {
            name: "apply_patch",
            description: "Apply layer mutations then validate",
            params: [{ name: "timeline", type: "object", required: true }, { name: "ops", type: "array", required: true }],
        },
        handler: ({ timeline, ops }) => {
            if (!Array.isArray(ops))
                return { ok: false, error: { code: "BAD_OPS", message: "ops must be an array" } };
            const tl = JSON.parse(JSON.stringify(timeline));
            let applied = 0;
            for (const op of ops) {
                const result = applyLayerOp(tl, op);
                if (!result.ok)
                    return result;
                applied += 1;
            }
            return { ok: true, value: { timeline: tl, validation: validateTimelineV3(tl), applied } };
        },
    },
    assert_at: {
        schema: {
            name: "assert_at",
            description: "Assert conditions at time t",
            params: [{ name: "timeline", type: "object", required: true }, { name: "t", type: "number", required: true }, { name: "checks", type: "array", required: true }],
        },
        handler: ({ timeline, t, checks }) => {
            if (!Array.isArray(checks))
                return { ok: false, error: { code: "BAD_CHECKS", message: "checks must be an array" } };
            const frame = describeAt(timeline, t);
            if (!frame.ok)
                return frame;
            const failed = [];
            let passed = 0;
            for (const check of checks) {
                const result = evaluateCheck(frame.value, check);
                if (!result.ok)
                    return result;
                if (result.value.pass)
                    passed += 1;
                else
                    failed.push({ check, expected: result.value.expected, actual: result.value.actual });
            }
            return { ok: true, value: { t, passed, failed, total: checks.length } };
        },
    },
};
export const TOOL_DEFINITIONS = Object.fromEntries(Object.entries(TOOLS).map(([name, tool]) => [name, { description: tool.schema.description }]));
function applyLayerOp(timeline, op) {
    if (!op || typeof op !== "object") {
        return { ok: false, error: { code: "BAD_OP", message: "op must be an object" } };
    }
    const o = op;
    switch (o.op) {
        case "add-layer":
            return addLayer(timeline, (o.layer || o));
        case "remove-layer":
            return removeLayer(timeline, o.id || o.layerId || '');
        case "move-layer":
            return moveLayer(timeline, o.id || o.layerId || '', o.start ?? 0);
        case "resize-layer":
            return resizeLayer(timeline, o.id || o.layerId || '', o.dur ?? 0);
        case "set-prop":
            return setLayerProp(timeline, o.id || o.layerId || '', o.key || '', o.value);
        default:
            return { ok: false, error: { code: "UNSUPPORTED_OP", message: `unsupported op "${o.op}"` } };
    }
}
function evaluateCheck(frame, check) {
    if (!check || typeof check !== "object") {
        return { ok: false, error: { code: "BAD_CHECK", message: "check must be an object" } };
    }
    const c = check;
    const active = frame.active || [];
    switch (c.type) {
        case "layer_visible": {
            const actual = active.some((l) => l.id === c.layerId);
            const expected = c.visible ?? true;
            return { ok: true, value: { pass: actual === expected, expected, actual } };
        }
        case "scene_active": {
            const actual = active.some((l) => l.scene === c.scene);
            const expected = c.active ?? true;
            return { ok: true, value: { pass: actual === expected, expected, actual } };
        }
        case "layer_count": {
            const actual = active.length;
            const expected = c.min ?? 0;
            return { ok: true, value: { pass: actual >= expected, expected: { min: expected }, actual } };
        }
        default:
            return { ok: false, error: { code: "UNSUPPORTED_CHECK", message: `unsupported check "${c.type}"` } };
    }
}
