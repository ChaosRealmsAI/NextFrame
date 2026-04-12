# POC W5 Report

## Verification

- Command run: `npm install && node test.js`
- Result: passed
- Verified surface: `find_clips`, `get_clip`, `describe_frame`, `apply_patch`, `assert_at`, `render_ascii`, `ascii_gantt`
- Verified rhythm: `THINK -> SEARCH -> PATCH -> ASSERT -> RENDER`

## LOC Per Function

- `reset_step_log`: 3 LOC
- `record_step`: 10 LOC
- `find_clips`: 13 LOC
- `get_clip`: 11 LOC
- `describe_frame`: 19 LOC
- `apply_patch`: 33 LOC
- `assert_at`: 43 LOC
- `render_ascii`: 21 LOC
- `ascii_gantt`: 55 LOC

## Completeness

For a single-file POC, the tool surface feels complete enough for an LLM to inspect a timeline, target clips by stable id, patch safely, assert postconditions, and emit human-readable render artifacts. The step log also gives the model an internal audit trail, which matters once edits become iterative.

It is not production-complete yet. The current surface is enough for deterministic timeline edits and verification, but it still assumes a small in-memory registry, simple scene schemas, and a lightweight assertion DSL.

## Missing

- Undo or transactional rollback beyond returning `{ ok, errors }`
- `list_scenes_available()` or manifest export for discovery
- Audio cue / marker search by semantic label
- Bulk diff preview: "show me what this patch will change"
- Stronger sandbox rules for cross-track composition policies
- Richer predicate DSL with quantifiers and frame-wide assertions
- Persistence helpers for reading/writing timeline JSON on disk

## Sample Step Log

This is the shape printed at the end of `node test.js`:

```json
[
  {
    "index": 1,
    "kind": "THINK",
    "detail": {
      "message": "I need to add a headline clip after aurora ends"
    }
  },
  {
    "index": 2,
    "kind": "SEARCH",
    "detail": {
      "tool": "find_clips",
      "predicate": {
        "sceneId": "auroraGradient"
      },
      "result": ["clip-1"]
    }
  },
  {
    "index": 6,
    "kind": "PATCH",
    "detail": {
      "tool": "apply_patch",
      "patch": [
        {
          "op": "addClip",
          "track": "v1",
          "clip": {
            "id": "clip-headline",
            "sceneId": "kineticHeadline",
            "start": { "after": "clip-1", "gap": 0.5 }
          }
        }
      ],
      "ok": true,
      "errors": []
    }
  },
  {
    "index": 18,
    "kind": "ASSERT",
    "detail": {
      "tool": "assert_at",
      "t": 7.1,
      "predicate": "clip-headline.visible == true",
      "pass": true
    }
  },
  {
    "index": 21,
    "kind": "RENDER",
    "detail": {
      "tool": "ascii_gantt"
    }
  },
  {
    "index": 23,
    "kind": "RENDER",
    "detail": {
      "tool": "render_ascii",
      "t": 8
    }
  }
]
```

## Notes

- The ASCII screenshot renderer is semantic rather than pixel-sampled: it draws from each scene's `describe()` output.
- Symbolic time currently supports raw numbers plus references like `clip-1.end+0.5`, `{ after: "clip-1", gap: 0.5 }`, markers, and chapter edges.
