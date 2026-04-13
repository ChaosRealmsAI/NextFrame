# Task: Implement NextFrame v0.4 Pipeline CLI Commands

## Context
NextFrame is a Node.js CLI video editor at `/Users/Zhuanz/bigbang/NextFrame/nextframe-cli/`.
We're adding pipeline workflow commands for video production (script → audio → atoms → output).

## Existing patterns to follow
- See `src/cli/project-new.js` for CLI command pattern
- See `src/cli/_io.js` for `parseFlags`, `emit` helpers
- See `bin/nextframe.js` for command registration (SUBCOMMANDS object)
- All commands use `export async function run(argv)` pattern
- Projects stored at `~/NextFrame/projects/{project}/{episode}/`
- JSON output with `--json` flag, human-readable by default

## Data file: pipeline.json
Each episode gets a `pipeline.json` file alongside `episode.json`.
Schema: see `/Users/Zhuanz/bigbang/NextFrame/spec/prototypes/v0.4/DESIGN.md`

## Commands to implement

### 1. src/cli/pipeline-get.js
```
nextframe pipeline-get <project> <episode> [--stage=script|audio|atoms|outputs] [--json]
```
- Reads `~/NextFrame/projects/{project}/{episode}/pipeline.json`
- If --stage specified, return only that section
- If pipeline.json doesn't exist, return empty pipeline structure
- JSON output by default (it's a data query)

### 2. src/cli/script-set.js
```
nextframe script-set <project> <episode> --segment=N --narration="..." [--visual="..."] [--role="..."] [--logic="..."]
```
- Loads pipeline.json (or creates empty)
- Upserts segment N in script.segments array
- Saves pipeline.json
- Also supports: --arc='["痛点","方案"]' to set narrative arc
- Also supports: --principles-audience="..." --principles-tone="..." etc

### 3. src/cli/script-get.js
```
nextframe script-get <project> <episode> [--segment=N]
```
- Returns script section from pipeline.json
- If --segment, return that one segment only

### 4. src/cli/audio-set.js
```
nextframe audio-set <project> <episode> --segment=N --status=generated --duration=8.2 [--file=path] [--sentences='[{"text":"...","start":0,"end":4.1}]']
```
- Upserts audio segment in pipeline.json audio.segments
- Also supports: --voice="晓晓" --speed=1.0 to set voice settings

### 5. src/cli/audio-get.js
```
nextframe audio-get <project> <episode> [--segment=N]
```

### 6. src/cli/atom-add.js
```
nextframe atom-add <project> <episode> --type=component --name="..." --scene=numberCounter --segment=1 --params='{...}'
nextframe atom-add <project> <episode> --type=video --name="..." --file=path.mp4 --duration=15.2
nextframe atom-add <project> <episode> --type=image --name="..." --file=path.png --dimensions=2400x2400 --size=1.2MB
```
- Auto-increments id
- Appends to pipeline.json atoms array

### 7. src/cli/atom-list.js
```
nextframe atom-list <project> <episode> [--type=component|video|image]
```

### 8. src/cli/atom-remove.js
```
nextframe atom-remove <project> <episode> --id=N
```

### 9. src/cli/output-add.js
```
nextframe output-add <project> <episode> --name="v1" --file=path.mp4 --duration=42.6 --size=12.4MB [--changes="..."]
```

### 10. src/cli/output-list.js
```
nextframe output-list <project> <episode>
```

### 11. src/cli/output-publish.js
```
nextframe output-publish <project> <episode> --id=N --platform=douyin
```

### 12. src/cli/project-config.js
```
nextframe project-config <project> --get [key]
nextframe project-config <project> --set key=value
```
Sets/gets fields in project.json.shared (brand, voice, principles, templates, exportPreset)

## Shared helper: src/cli/_pipeline.js
Create a shared helper for loading/saving pipeline.json:
```js
export async function loadPipeline(projectPath, episodeName) { ... }
export async function savePipeline(projectPath, episodeName, pipeline) { ... }
export function emptyPipeline() { return { version: "0.4", script: { principles: {}, arc: [], segments: [] }, audio: { voice: null, speed: 1.0, segments: [] }, atoms: [], outputs: [] }; }
```

## Register in bin/nextframe.js
Add ALL new commands to the SUBCOMMANDS object.

## Important
- Follow existing code style exactly (ES modules, async/await, parseFlags/emit pattern)
- Root path: `flags.root || join(homedir(), "NextFrame", "projects")`
- Always update project.json `updated` timestamp on writes
- Error handling: return proper error objects like existing commands
- Human-readable output by default, JSON with --json flag
