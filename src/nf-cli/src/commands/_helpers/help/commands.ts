// Defines grouped CLI command metadata, usage text, and help constraints.
import { COMMAND_EXAMPLES } from "./examples.js";

export const DEFAULT_FIX = "run the same command with --help to see required params, examples, and constraints";

const lines = (text: string) => text.trim().split("\n").map((line: string) => line.trim()).filter(Boolean);
const group = (title: string, commands: string) => ({
  title,
  commands: commands.trim().split(/\s+/)
});
const command = (name: string, summary: string, usage: string, params: string, constraints: string, fix = DEFAULT_FIX) => [
  name,
  { summary, usage: lines(usage), params: lines(params), examples: COMMAND_EXAMPLES[name] || [], constraints: lines(constraints), fix },
];

export const TOP_LEVEL_COMMANDS = [
  group("Timeline", "new validate build scenes preview frame describe-frame render"),
  group("WYSIWYG", "wysiwyg"),
  group("Match", "match"),
  group("Scene Dev", "scene-new scene-preview scene-validate"),
  group("Layer CRUD", "layer-list layer-add layer-move layer-resize layer-set layer-remove"),
  group("Project Hierarchy", "project-new project-list project-config episode-new episode-list segment-new segment-list"),
  group("Pipeline", "pipeline-get script-set script-get audio-set audio-get audio-synth atom-add atom-list atom-remove output-add output-list output-publish"),
  group("Source Library", "source-download source-transcribe source-align source-cut source-list source-link"),
  group("Desktop App", "app app-pipeline app-eval app-screenshot"),
];

export const COMMAND_SPECS = Object.fromEntries([
  command("new", "Create an empty v0.3 timeline JSON file.", `nextframe new <out.json> [--duration=N] [--fps=N] [--width=N] [--height=N] [--json]`, `<out.json> output file path to create
    --duration=N timeline duration in seconds, default 10
    --fps=N timeline fps, default 30
    --width=N stage width in pixels, default 1920
    --height=N stage height in pixels, default 1080
    --json return structured JSON on success`, `The output path must not already exist unless the filesystem allows overwrite.
    Choose width/height first because scene ratios must match the timeline ratio.`),
  command("validate", "Run timeline validation and report format, errors, warnings, and fix hints.", `nextframe validate <project> <episode> <segment> [--json]
    nextframe validate <timeline.json> [--json]`, `<project> <episode> <segment> resolve to ~/NextFrame/projects/<project>/<episode>/<segment>.json
    <timeline.json> validate a direct file path instead of project hierarchy
    --json emit structured validation output`, `Validation is the required assert step after every patch.
    A non-zero exit means errors or warnings were found.`),
  command("build", "Bundle a timeline into playable HTML.", `nextframe build <project> <episode> <segment> [--output=out.html] [-o out.html] [--json]
    nextframe build <timeline.json> [--output=out.html] [-o out.html] [--json]`, `<project> <episode> <segment> build a segment from the project hierarchy
    <timeline.json> build a direct timeline file
    --output=PATH or -o PATH write HTML to a custom path
    --json emit structured result data`, `The timeline must validate before build succeeds.
    Legacy v0.1 tracks/clips timelines are rejected by build.`),
  command("scene-new", "Create a new scene component skeleton (directory + index.js + preview.html).", `nextframe scene-new <name> --ratio=<16:9|9:16|4:3> --category=<cat> [--tech=dom]`, `--ratio target aspect ratio
    --category backgrounds|typography|data|shapes|overlays|media|browser
    --tech dom|canvas2d|svg|webgl|video|lottie`, `Creates a ready-to-edit skeleton. Next: edit render(), then scene-preview, then scene-validate.`),
  command("scene-preview", "Open a scene's preview.html in the browser for visual verification.", `nextframe scene-preview <name> [--ratio=16:9]`, `<name> scene id (searches across categories)`, `BLOCKING step — must visually confirm no overflow, smooth animation, correct colors.`),
  command("scene-validate", "Validate a scene against ADR-008 contract (16 checks).", `nextframe scene-validate <name> [--ratio=16:9] [--json]`, `<name> scene id
    --json emit structured result`, `Checks meta fields, render output, screenshots, lint, preview.html existence. All must pass before commit.`),
  command("scenes", "List all available scenes or inspect one scene contract, including params.", `nextframe scenes [--json]
    nextframe scenes <id> [--json]`, `<id> inspect a single scene
    --json emit structured scene metadata`, `Use this before layer-add so the AI does not guess scene ids or params.
    Pick scenes whose ratio matches the target timeline ratio.`),
  command("preview", "Render screenshots plus a layout map at selected times for AI verification.", `nextframe preview <project> <episode> <segment> [--time=T | --times=T1,T2] [--out=DIR] [--auto] [--json]
    nextframe preview <timeline.json> [--time=T | --times=T1,T2] [--out=DIR] [--auto] [--json]`, `--time=T capture one time in seconds
    --times=T1,T2 capture a comma-separated list of times in seconds
    --auto auto-pick interesting frames when no explicit time is supplied
    --out=DIR write preview artifacts into a directory
    --json emit screenshot paths, visible layers, issues, and JS errors`, `Requires Chrome and puppeteer-core in the local environment.
    Use preview after build/validate to verify the actual rendered frame layout.`),
  command("frame", "Render a single frame PNG at a chosen time.", `nextframe frame <project> <episode> <segment> <t> [--width=N] [--height=N] [--json]
    nextframe frame <timeline.json> <t> <out.png> [--width=N] [--height=N] [--json]`, `<t> frame time in seconds or mm:ss(.f)
    <out.png> required only for direct timeline.json mode
    --width=N override render width
    --height=N override render height
    --json emit the output path and byte count`, `Project hierarchy mode writes to the segment .frames directory automatically.
    Time must parse to a non-negative finite number.`),
  command("describe-frame", "Describe the active clips at one time using each scene's describe() contract.", `nextframe describe-frame <project> <episode> <segment> <t>
    nextframe describe-frame <timeline.json> <t>`, `<t> frame time in seconds or mm:ss(.f)`, `Outputs JSON shaped like {time, active_clips:[{id, scene, describe_result}]}.
    Every active clip scene must exist in src/nf-runtime/web/src/components/index.js.`),
  command("render", "Render an MP4 via the ffmpeg or recorder backend.", `nextframe render <project> <episode> <segment> [--target=ffmpeg|recorder] [--fps=N] [--crf=N] [--width=N] [--height=N] [--audio=PATH] [--quiet] [--json]
    nextframe render <timeline.json> <out.mp4> [--target=ffmpeg|recorder] [--fps=N] [--crf=N] [--width=N] [--height=N] [--audio=PATH] [--quiet] [--json]`, `--target=ffmpeg|recorder select the export backend, default ffmpeg
    --fps=N override render fps
    --crf=N set video quality, integer 0..51
    --width=N and --height=N override output size
    --audio=PATH mux external audio into the output mp4
    --quiet suppress progress output
    --json emit structured export result data`, `The timeline is validated before rendering starts.
    Direct timeline.json mode requires an explicit output mp4 path.`),
  command("wysiwyg", "Dispatch v0.7 WYSIWYG scaffold subcommands.", `nextframe wysiwyg <subcommand>
    nextframe wysiwyg <subcommand> --help`, `Subcommands: diff, simulate
    Run nextframe wysiwyg <subcommand> --help for subcommand-specific params`, `This is additive v0.7 scaffolding only.
    diff captures and compares frames; simulate remains a placeholder.`),
  command("wysiwyg diff", "Compare a preview frame against the current export-frame stub.", `nextframe wysiwyg diff <timeline.json> --t=T [--json]`, `<timeline.json> direct path to a timeline file
    --t=T required frame time in seconds or mm:ss(.f)
    --time=T legacy alias for --t
    --json accepted for CLI compatibility; output is always JSON`, `The current export path is a walking skeleton and copies the preview frame before diffing.
    Time must parse to a finite non-negative value.`),
  command("wysiwyg simulate", "Stub inline-edit simulation entrypoint.", `nextframe wysiwyg simulate <timeline.json> --layer=N <action> [arg ...] [--json]`, `<timeline.json> direct path to a timeline file
    --layer=N required zero-based layer index
    <action> edit action label such as move, resize, or edit-text
    [arg ...] optional action args passed through untouched
    --json emit structured placeholder output`, `Walking skeleton only: no edits are applied yet.
    Layer indexes must parse to non-negative integers.`),
  command("match", "Plan, validate, and preview v0.6 tracks+matches workflows.", `nextframe match <subcommand>
    nextframe match <subcommand> --help`, `Subcommands: plan, validate, preview
    Run nextframe match <subcommand> --help for subcommand-specific params and examples`, `Use this only for v0.6 tracks+matches timelines.
    The rule implementation is selected by name and dispatched through nf-core/matches.`),
  command("match plan", "Generate a rule-specific match plan skeleton for one episode.", `nextframe match plan <episode> --rule <name> [--json]`, `<episode> target episode identifier or path token for planning
    --rule <name> required match rule name such as scene-per-segment
    --json emit structured output`, `The selected rule must exist in nf-core/matches.
    Planning is rule-specific and does not write timestamps by hand.`),
  command("match validate", "Validate timeline matches against registered rules.", `nextframe match validate <project> <episode> <segment> [--json]
    nextframe match validate <timeline.json> [--json]`, `<project> <episode> <segment> resolve to ~/NextFrame/projects/<project>/<episode>/<segment>.json
    <timeline.json> validate a direct file path instead of project hierarchy
    --json emit structured validation output`, `Validation dispatches by match.rule.
    Non-zero exit means usage failure or rule validation failure.`),
  command("match preview", "Preview one planned segment without running a full render.", `nextframe match preview <plan> --seg <N> [--json]`, `<plan> path to a saved match plan or timeline artifact
    --seg <N> required 1-based segment number
    --json emit structured output`, `Preview targets exactly one segment.
    Segment numbers are 1-based positive integers.`),
  command("layer-list", "List layers in a timeline with id, scene, start, dur, and end.", `nextframe layer-list <project> <episode> <segment> [--json]
    nextframe layer-list <timeline.json> [--json]`, `--json emit structured layer rows`, `Use this before move/set/remove so you operate on a real layer id.`),
  command("layer-add", "Add one layer with a scene id, timing, params, and optional layout/animation props.", `nextframe layer-add <project> <episode> <segment> <scene> [--id=ID] [--start=N] [--dur=N] [--params=JSON] [--x=VALUE] [--y=VALUE] [--w=VALUE] [--h=VALUE] [--z=N] [--enter=NAME] [--exit=NAME] [--transition=NAME] [--opacity=N] [--blend=MODE] [--json]
    nextframe layer-add <timeline.json> <scene> [same flags]`, `<scene> scene id from nextframe scenes
    --id=ID explicit layer id, otherwise derived from scene id
    --start=N start time in seconds, default 0
    --dur=N duration in seconds, default 5
    --params=JSON scene params object
    --x/--y/--w/--h layout values such as 10% or 320
    --z=N z-index
    --enter/--exit/--transition animation names
    --opacity=N opacity 0..1
    --blend=MODE CSS blend mode
    --json emit structured layer result`, `One visual element should map to one layer.
    Use nextframe scenes first so scene ids and params are not guessed.`),
  command("layer-move", "Move a layer by replacing its start time.", `nextframe layer-move <project> <episode> <segment> <layer-id> --start=N [--json]
    nextframe layer-move <timeline.json> <layer-id> --start=N [--json]`, `<layer-id> layer id from layer-list
    --start=N new non-negative start time in seconds
    --json emit the updated layer`, `The layer must exist.
    Timeline validation runs after the move before the file is saved.`),
  command("layer-resize", "Change a layer duration.", `nextframe layer-resize <project> <episode> <segment> <layer-id> --dur=N [--json]
    nextframe layer-resize <timeline.json> <layer-id> --dur=N [--json]`, `<layer-id> layer id from layer-list
    --dur=N new positive duration in seconds
    --json emit the updated layer`, `Duration must be greater than 0.
    Timeline validation runs after the resize before the file is saved.`),
  command("layer-set", "Set arbitrary layer properties using key=value assignments and optional params JSON.", `nextframe layer-set <project> <episode> <segment> <layer-id> <key=value>... [--params=JSON] [--json]
    nextframe layer-set <timeline.json> <layer-id> <key=value>... [--params=JSON] [--json]`, `<layer-id> layer id from layer-list
    <key=value> one or more property assignments such as opacity=0.7 x=10%
    --params=JSON merge a params object into layer.params
    --json emit the updated layer`, `Scalar values parse as booleans, null, numbers, JSON, or raw strings.
    Timeline validation runs after the update before the file is saved.`),
  command("layer-remove", "Remove one layer from a timeline.", `nextframe layer-remove <project> <episode> <segment> <layer-id> [--json]
    nextframe layer-remove <timeline.json> <layer-id> [--json]`, `<layer-id> layer id from layer-list
    --json emit the removed layer`, `The layer must exist.
    Validation runs after removal before the file is saved.`),
  command("project-new", "Create a new project directory and project.json.", `nextframe project-new <name> [--root=PATH] [--json]`, `<name> project directory name
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the created path`, `Project names must be unique under the selected root.`),
  command("project-list", "List known projects, episode counts, and last-updated timestamps.", `nextframe project-list [--root=PATH] [--json]`, `--root=PATH projects root, default ~/NextFrame/projects
    --json emit structured rows`, `Only directories with project.json are listed.`),
  command("project-config", "Read or update shared project config stored in project.json.", `nextframe project-config <project> --get [key] [--root=PATH] [--json]
    nextframe project-config <project> --set key=value [--root=PATH] [--json]`, `<project> project name
    --get [key] read one shared config value or the whole shared object
    --set key=value write one shared config value
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured result data`, `Use exactly one of --get or --set.
    Set values parse as booleans, null, numbers, JSON, or strings.`),
  command("episode-new", "Create an episode directory, episode.json, and an empty pipeline.json.", `nextframe episode-new <project> <name> [--root=PATH] [--json]`, `<project> existing project name
    <name> episode directory name
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the created path`, `The project must already exist.
    Episode names must be unique within the project.`),
  command("episode-list", "List episodes inside a project, including segment count and total duration.", `nextframe episode-list <project> [--root=PATH] [--json]`, `<project> existing project name
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured rows`, `Only directories with episode.json are listed.`),
  command("segment-new", "Create a new segment timeline JSON inside an episode.", `nextframe segment-new <project> <episode> <name> [--root=PATH] [--duration=N] [--fps=N] [--width=N] [--height=N] [--json]`, `<project> existing project name
    <episode> existing episode name
    <name> segment file name without .json
    --duration=N timeline duration in seconds, default 10
    --fps=N timeline fps, default 30
    --width=N stage width in pixels, default 1920
    --height=N stage height in pixels, default 1080
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the created path`, `The project and episode must already exist.
    Choose width/height before adding scenes so ratio-matched components are used.`),
  command("segment-list", "List segments in an episode.", `nextframe segment-list <project> <episode> [--root=PATH] [--json]`, `<project> existing project name
    <episode> existing episode name
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured rows`, `Only .json segment files are listed; episode.json and pipeline.json are skipped.`),
  command("pipeline-get", "Read pipeline.json or one pipeline stage.", `nextframe pipeline-get <project> <episode> [--stage=script|audio|atoms|outputs] [--root=PATH] [--json]`, `<project> existing project name
    <episode> existing episode name
    --stage=... restrict output to one stage
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON`, `The episode must already exist and contain pipeline.json.`),
  command("script-set", "Write or replace one script segment in pipeline.json.", `nextframe script-set <project> <episode> --segment=N --narration=TEXT [--visual=TEXT] [--role=TEXT] [--logic=TEXT] [--arc=JSON] [--principles-topic=TEXT ...] [--root=PATH] [--json]`, `--segment=N 1-based script segment index
    --narration=TEXT required narration text
    --visual=TEXT visual notes for the segment
    --role=TEXT narration role or speaker
    --logic=TEXT reasoning or editorial note
    --arc=JSON JSON array/object for story arc data
    --principles-*=TEXT arbitrary principle flags stored under script.principles
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the updated script state`, `Segment numbers are 1-based positive integers.
    At minimum, provide --segment and --narration.`),
  command("script-get", "Read the whole script stage or one script segment.", `nextframe script-get <project> <episode> [--segment=N] [--root=PATH] [--json]`, `--segment=N optional 1-based segment index
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON`, `When --segment is omitted, the full script stage is returned.`),
  command("audio-set", "Write or replace one audio segment entry in pipeline.json.", `nextframe audio-set <project> <episode> --segment=N --status=STATUS --duration=N [--file=PATH] [--sentences=JSON] [--voice=NAME] [--speed=N] [--root=PATH] [--json]`, `--segment=N 1-based audio segment index
    --status=STATUS required audio status label
    --duration=N required duration in seconds
    --file=PATH rendered audio file path
    --sentences=JSON JSON array of sentence timing metadata
    --voice=NAME voice identifier
    --speed=N playback or synthesis speed
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the updated audio state`, `At minimum, provide --segment, --status, and --duration.
    Segment numbers are 1-based positive integers.`),
  command("audio-get", "Read the whole audio stage or one audio segment.", `nextframe audio-get <project> <episode> [--segment=N] [--root=PATH] [--json]`, `--segment=N optional 1-based segment index
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON`, `When --segment is omitted, the full audio stage is returned.`),
  command("audio-synth", "Generate TTS audio plus subtitles for one script segment and register the result.", `nextframe audio-synth <project> <episode> --segment=N [--voice=NAME] [--backend=edge|volcengine] [--root=PATH] [--json]`, `--segment=N required 1-based script segment index
    --voice=NAME optional TTS voice override; also stored on pipeline.audio.voice
    --backend=edge|volcengine optional vox backend override
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the synthesized artifact paths and duration`, `Requires the vox binary to be installed and available on PATH.
    The selected script segment must already contain narration text.`),
  command("atom-add", "Add one pipeline atom of type component, video, or image.", `nextframe atom-add <project> <episode> --type=component|video|image --name=TEXT [--scene=ID] [--segment=N] [--params=JSON] [--file=PATH] [--duration=N] [--root=PATH] [--json]`, `--type=component|video|image required atom type
    --name=TEXT required human-readable atom name
    --scene=ID required for component atoms
    --segment=N required for component atoms
    --params=JSON optional component params object
    --file=PATH required for video and image atoms
    --duration=N required for video atoms
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the created atom and updated atom list`, `Component atoms require --scene and --segment.
    Video atoms require --file and --duration; image atoms require --file.`),
  command("atom-list", "List pipeline atoms, optionally filtered by type.", `nextframe atom-list <project> <episode> [--type=component|video|image] [--root=PATH] [--json]`, `--type=... optional atom type filter
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON`, `Only known atom types are supported in the filter.`),
  command("atom-remove", "Remove one pipeline atom by numeric id.", `nextframe atom-remove <project> <episode> --id=N [--root=PATH] [--json]`, `--id=N required atom id
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the removed atom and updated atom list`, `Atom ids are numeric and unique within the pipeline.`),
  command("output-add", "Register one rendered output artifact in pipeline.json.", `nextframe output-add <project> <episode> --name=TEXT --file=PATH --duration=N --size=TEXT [--changes=TEXT] [--root=PATH] [--json]`, `--name=TEXT required output label
    --file=PATH required output file path
    --duration=N required duration in seconds
    --size=TEXT required size label such as 1920x1080
    --changes=TEXT optional release/change note
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the created output row`, `At minimum, provide --name, --file, --duration, and --size.`),
  command("output-list", "List outputs recorded in pipeline.json.", `nextframe output-list <project> <episode> [--root=PATH] [--json]`, `--root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON`, `Returns exactly what is recorded in pipeline.json.`),
  command("output-publish", "Mark one output as published to a target platform.", `nextframe output-publish <project> <episode> --id=N --platform=NAME [--root=PATH] [--json]`, `--id=N required output id
    --platform=NAME required publish target label such as youtube or reels
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit the updated output row`, `The output id must already exist.`),
  command("source-download", "Download a source video into an episode sources directory and create source.json.", `nextframe source-download <project> <episode> --url <url> [--format 720] [--root=PATH] [--json]
    nextframe source-download <url> --library <path> [--format 720]`, `<project> <episode> target episode that owns the downloaded source
    --url <url> required source video URL in episode mode
    --format 720 optional target height, normalized to 720p, 1080p, etc.
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON
    <url> + --library keeps the legacy direct-library mode`, `Requires the nf-source binary to be installed and executable.
    Episode mode writes into <episode>/sources/<source-name>/ and preserves the legacy --library mode for direct path workflows.`),
  command("source-transcribe", "Run ASR on an episode source and write transcript summary into source.json.", `nextframe source-transcribe <project> <episode> --source <name> [--model base.en] [--lang auto] [--root=PATH] [--json]
    nextframe source-transcribe <source-dir> [--model base.en] [--lang auto]`, `<project> <episode> target episode that owns or references the source
    --source <name> source directory name under <episode>/sources/, required in episode mode
    --model MODEL whisper model name, default base.en
    --lang LANG language code or auto, default auto
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON
    <source-dir> keeps the legacy direct-path mode`, `Use this when you do not have an SRT file.
    Episode mode resolves <episode>/sources/<name>/ first and falls back to ~/NextFrame/library/ when the episode has no sources directory.`),
  command("source-align", "Align an existing SRT against a source video and write transcript summary into source.json.", `nextframe source-align <source-dir> --srt <file> [--lang auto]`, `<source-dir> existing downloaded source directory
    --srt <file> required subtitle file to align
    --lang LANG language code or auto, default auto`, `Use this when you already have an SRT file; it is usually faster and more accurate than transcribe.
    Requires a source directory that already contains source.mp4 and source.json.`),
  command("source-cut", "Cut clips from an episode source, write them into the episode clips directory, and register video atoms.", `nextframe source-cut <project> <episode> [--source <name>] --plan <plan.json> [--margin 0.2] [--root=PATH] [--json]
    nextframe source-cut <source-dir> --plan <plan.json> [--margin 0.2]`, `<project> <episode> target episode that owns the resulting clips
    --source <name> source directory name under <episode>/sources/; omit to use the first source dir
    --plan <plan.json> required cut plan file
    --margin N optional seconds of padding around each cut, default 0.2
    --root=PATH projects root, default ~/NextFrame/projects
    --json emit structured JSON
    <source-dir> keeps the legacy direct-path mode`, `Run source-transcribe or source-align first so sentences.json exists.
    Episode mode writes clip media into <episode>/clips/, updates source.json, and appends matching video atoms into pipeline.json.`),
  command("source-list", "List all sources in a library with transcript and clip status.", `nextframe source-list --library <path>`, `--library <path> required source library root`, `Only directories containing valid source.json files are listed.`),
  command("source-link", "Link source clips into a project pipeline as video atoms.", `nextframe source-link <source-dir> --project <name> --episode <name> [--root <path>]`, `<source-dir> source directory whose clips should be linked
    --project <name> required target project
    --episode <name> required target episode
    --root <path> optional projects root, default ~/NextFrame/projects`, `Run source-cut first so source.json contains clips to link.
    Each linked clip becomes a video atom in the episode pipeline.`),
  command("app", "Control a running NextFrame desktop app session.", `nextframe app <subcommand>
    nextframe app <subcommand> --help`, `Subcommands: eval, screenshot, diagnose, navigate, click, status
    Run nextframe app <subcommand> --help for subcommand-specific params and examples`, `The desktop app must be running on port 19820.`),
  command("app eval", "Evaluate JavaScript in the running desktop app.", `nextframe app eval <js> [--timeout=MS] [--json]`, `<js> required JavaScript source to evaluate in the app window
    --timeout=MS request timeout in milliseconds, default 10000
    --json emit structured result data`, `The desktop app must be running.
    Pass the script as positional text after eval.`),
  command("app screenshot", "Capture a screenshot from the running desktop app.", `nextframe app screenshot [--out=path.png] [--json]`, `--out=path.png output path, default /tmp/nf-screenshot.png
    --json emit structured result data`, `The desktop app must be running.
    The output directory must be writable.`),
  command("app diagnose", "Fetch desktop app diagnostics.", `nextframe app diagnose [--json]`, `--json emit structured result data`, `The desktop app must be running.`),
  command("app navigate", "Navigate the desktop app to a project, episode, segment, or view.", `nextframe app navigate <project> [<episode>] [<segment>] [--view=editor|project] [--timeout=MS] [--json]`, `<project> required project name
    <episode> optional episode name
    <segment> optional segment name
    --view=editor|project target view, default editor
    --timeout=MS request timeout in milliseconds, default 10000
    --json emit structured result data`, `The desktop app must be running.`),
  command("app click", "Dispatch a click at viewport coordinates inside the running desktop app.", `nextframe app click <x> <y> [--timeout=MS] [--json]`, `<x> viewport x coordinate in CSS pixels
    <y> viewport y coordinate in CSS pixels
    --timeout=MS request timeout in milliseconds, default 10000
    --json emit structured result data`, `Coordinates must be finite numbers.
    The desktop app must be running.`),
  command("app status", "Read the current desktop app status.", `nextframe app status [--json]`, `--json emit structured result data`, `The desktop app must be running.`),
  command("app-pipeline", "Control the pipeline view in the running desktop app.", `nextframe app-pipeline <subcommand>
    nextframe app-pipeline <subcommand> --help`, `Subcommands: navigate, tab, status, play, stop
    Run nextframe app-pipeline <subcommand> --help for subcommand-specific params and examples`, `The desktop app must be running on port 19820.`),
  command("app-pipeline navigate", "Open the pipeline view for a project and optional episode.", `nextframe app-pipeline navigate --project=<name> [--episode=<name>] [--json]`, `--project=<name> required project name
    --episode=<name> optional episode name
    --json emit structured result data`, `The desktop app must be running.`),
  command("app-pipeline tab", "Switch the active pipeline tab in the desktop app.", `nextframe app-pipeline tab --tab=<script|audio|clips|atoms|assembly|output> [--json]`, `--tab=<...> required pipeline tab name
    --json emit structured result data`, `The desktop app must be running.
    Use one of the known pipeline tab names.`),
  command("app-pipeline status", "Read pipeline view status from the desktop app.", `nextframe app-pipeline status [--json]`, `--json emit structured result data`, `The desktop app must be running.`),
  command("app-pipeline play", "Play audio for one pipeline segment in the desktop app.", `nextframe app-pipeline play --segment=<n> [--json]`, `--segment=<n> required 1-based pipeline segment number
    --json emit structured result data`, `The desktop app must be running.
    Segment numbers are 1-based positive integers.`),
  command("app-pipeline stop", "Stop all currently playing pipeline audio in the desktop app.", `nextframe app-pipeline stop [--json]`, `--json emit structured result data`, `The desktop app must be running.`),
  command("app-eval", "Legacy wrapper for nextframe app eval.", `nextframe app-eval <js> [--timeout=MS] [--json]`, `<js> required JavaScript source to evaluate in the app window
    --timeout=MS request timeout in milliseconds, default 10000
    --json emit structured result data`, `Equivalent to nextframe app eval <js>.
    The desktop app must be running.`),
  command("app-screenshot", "Legacy wrapper for nextframe app screenshot.", `nextframe app-screenshot [--out=path.png] [--json]`, `--out=path.png output path, default /tmp/nf-screenshot.png
    --json emit structured result data`, `Equivalent to nextframe app screenshot.
    The desktop app must be running.`),
]);

export const getCommandSpec = (name: string) => COMMAND_SPECS[name] || null;
export const listTopLevelHelpCommands = () => TOP_LEVEL_COMMANDS.flatMap((entry) => entry.commands);
export const hasCommandHelp = (name: string) => Object.prototype.hasOwnProperty.call(COMMAND_SPECS, name);
