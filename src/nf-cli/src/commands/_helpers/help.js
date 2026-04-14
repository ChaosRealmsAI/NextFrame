const DEFAULT_FIX = 'run the same command with --help to see required params, examples, and constraints';

function spec(summary, usage, params, examples, constraints, fix = DEFAULT_FIX) {
  return { summary, usage, params, examples, constraints, fix };
}

const TOP_LEVEL_COMMANDS = [
  {
    title: "Timeline",
    commands: ["new", "validate", "build", "lint-scenes", "scenes", "preview", "frame", "render"],
  },
  {
    title: "Layer CRUD",
    commands: ["layer-list", "layer-add", "layer-move", "layer-resize", "layer-set", "layer-remove"],
  },
  {
    title: "Project Hierarchy",
    commands: ["project-new", "project-list", "project-config", "episode-new", "episode-list", "segment-new", "segment-list"],
  },
  {
    title: "Pipeline",
    commands: ["pipeline-get", "script-set", "script-get", "audio-set", "audio-get", "atom-add", "atom-list", "atom-remove", "output-add", "output-list", "output-publish"],
  },
  {
    title: "Source Library",
    commands: ["source-download", "source-transcribe", "source-align", "source-cut", "source-list", "source-link"],
  },
  {
    title: "Desktop App",
    commands: ["app", "app-pipeline", "app-eval", "app-screenshot"],
  },
];

const COMMAND_SPECS = {
  new: spec(
    "Create an empty v0.3 timeline JSON file.",
    ["nextframe new <out.json> [--duration=N] [--fps=N] [--width=N] [--height=N] [--json]"],
    [
      "<out.json> output file path to create",
      "--duration=N timeline duration in seconds, default 10",
      "--fps=N timeline fps, default 30",
      "--width=N stage width in pixels, default 1920",
      "--height=N stage height in pixels, default 1080",
      "--json return structured JSON on success",
    ],
    [
      "nextframe new intro.json --duration=8 --width=1080 --height=1920",
      "nextframe new /tmp/demo.json --fps=24 --json",
    ],
    [
      "The output path must not already exist unless the filesystem allows overwrite.",
      "Choose width/height first because scene ratios must match the timeline ratio.",
    ],
  ),
  validate: spec(
    "Run timeline validation and report format, errors, warnings, and fix hints.",
    [
      "nextframe validate <project> <episode> <segment> [--json]",
      "nextframe validate <timeline.json> [--json]",
    ],
    [
      "<project> <episode> <segment> resolve to ~/NextFrame/projects/<project>/<episode>/<segment>.json",
      "<timeline.json> validate a direct file path instead of project hierarchy",
      "--json emit structured validation output",
    ],
    [
      "nextframe validate demo ep01 intro",
      "nextframe validate ./timeline.json --json",
    ],
    [
      "Validation is the required assert step after every patch.",
      "A non-zero exit means errors or warnings were found.",
    ],
  ),
  build: spec(
    "Bundle a timeline into playable HTML.",
    [
      "nextframe build <project> <episode> <segment> [--output=out.html] [-o out.html] [--json]",
      "nextframe build <timeline.json> [--output=out.html] [-o out.html] [--json]",
    ],
    [
      "<project> <episode> <segment> build a segment from the project hierarchy",
      "<timeline.json> build a direct timeline file",
      "--output=PATH or -o PATH write HTML to a custom path",
      "--json emit structured result data",
    ],
    [
      "nextframe build demo ep01 intro",
      "nextframe build ./timeline.json -o ./dist/intro.html",
    ],
    [
      "The timeline must validate before build succeeds.",
      "Legacy v0.1 tracks/clips timelines are rejected by build.",
    ],
  ),
  "lint-scenes": spec(
    "Audit scene component metadata, lifecycle methods, and stage-size rules.",
    ["nextframe lint-scenes [--json]"],
    [
      "--json emit per-file lint results as JSON",
    ],
    [
      "nextframe lint-scenes",
      "nextframe lint-scenes --json",
    ],
    [
      "Reads scene modules from the runtime scene directory.",
      "Use this after adding or editing a scene component.",
    ],
  ),
  scenes: spec(
    "List all available scenes or inspect one scene contract, including params.",
    [
      "nextframe scenes [--json]",
      "nextframe scenes <id> [--json]",
    ],
    [
      "<id> inspect a single scene",
      "--json emit structured scene metadata",
    ],
    [
      "nextframe scenes",
      "nextframe scenes headline --json",
    ],
    [
      "Use this before layer-add so the AI does not guess scene ids or params.",
      "Pick scenes whose ratio matches the target timeline ratio.",
    ],
  ),
  preview: spec(
    "Render screenshots plus a layout map at selected times for AI verification.",
    [
      "nextframe preview <project> <episode> <segment> [--time=T | --times=T1,T2] [--out=DIR] [--auto] [--json]",
      "nextframe preview <timeline.json> [--time=T | --times=T1,T2] [--out=DIR] [--auto] [--json]",
    ],
    [
      "--time=T capture one time in seconds",
      "--times=T1,T2 capture a comma-separated list of times in seconds",
      "--auto auto-pick interesting frames when no explicit time is supplied",
      "--out=DIR write preview artifacts into a directory",
      "--json emit screenshot paths, visible layers, issues, and JS errors",
    ],
    [
      "nextframe preview demo ep01 intro --times=0,3,5",
      "nextframe preview ./timeline.json --auto --out=/tmp/preview",
    ],
    [
      "Requires Chrome and puppeteer-core in the local environment.",
      "Use preview after build/validate to verify the actual rendered frame layout.",
    ],
  ),
  frame: spec(
    "Render a single frame PNG at a chosen time.",
    [
      "nextframe frame <project> <episode> <segment> <t> [--width=N] [--height=N] [--json]",
      "nextframe frame <timeline.json> <t> <out.png> [--width=N] [--height=N] [--json]",
    ],
    [
      "<t> frame time in seconds or mm:ss(.f)",
      "<out.png> required only for direct timeline.json mode",
      "--width=N override render width",
      "--height=N override render height",
      "--json emit the output path and byte count",
    ],
    [
      "nextframe frame demo ep01 intro 3.5",
      "nextframe frame ./timeline.json 00:03.5 ./frame.png --width=1080 --height=1920",
    ],
    [
      "Project hierarchy mode writes to the segment .frames directory automatically.",
      "Time must parse to a non-negative finite number.",
    ],
  ),
  render: spec(
    "Render an MP4 via the ffmpeg or recorder backend.",
    [
      "nextframe render <project> <episode> <segment> [--target=ffmpeg|recorder] [--fps=N] [--crf=N] [--width=N] [--height=N] [--audio=PATH] [--quiet] [--json]",
      "nextframe render <timeline.json> <out.mp4> [--target=ffmpeg|recorder] [--fps=N] [--crf=N] [--width=N] [--height=N] [--audio=PATH] [--quiet] [--json]",
    ],
    [
      "--target=ffmpeg|recorder select the export backend, default ffmpeg",
      "--fps=N override render fps",
      "--crf=N set video quality, integer 0..51",
      "--width=N and --height=N override output size",
      "--audio=PATH mux external audio into the output mp4",
      "--quiet suppress progress output",
      "--json emit structured export result data",
    ],
    [
      "nextframe render demo ep01 intro --target=ffmpeg",
      "nextframe render ./timeline.json ./intro.mp4 --target=recorder --crf=18",
    ],
    [
      "The timeline is validated before rendering starts.",
      "Direct timeline.json mode requires an explicit output mp4 path.",
    ],
  ),
  "layer-list": spec(
    "List layers in a timeline with id, scene, start, dur, and end.",
    [
      "nextframe layer-list <project> <episode> <segment> [--json]",
      "nextframe layer-list <timeline.json> [--json]",
    ],
    [
      "--json emit structured layer rows",
    ],
    [
      "nextframe layer-list demo ep01 intro",
      "nextframe layer-list ./timeline.json --json",
    ],
    [
      "Use this before move/set/remove so you operate on a real layer id.",
    ],
  ),
  "layer-add": spec(
    "Add one layer with a scene id, timing, params, and optional layout/animation props.",
    [
      "nextframe layer-add <project> <episode> <segment> <scene> [--id=ID] [--start=N] [--dur=N] [--params=JSON] [--x=VALUE] [--y=VALUE] [--w=VALUE] [--h=VALUE] [--z=N] [--enter=NAME] [--exit=NAME] [--transition=NAME] [--opacity=N] [--blend=MODE] [--json]",
      "nextframe layer-add <timeline.json> <scene> [same flags]",
    ],
    [
      "<scene> scene id from nextframe scenes",
      "--id=ID explicit layer id, otherwise derived from scene id",
      "--start=N start time in seconds, default 0",
      "--dur=N duration in seconds, default 5",
      "--params=JSON scene params object",
      "--x/--y/--w/--h layout values such as 10% or 320",
      "--z=N z-index",
      "--enter/--exit/--transition animation names",
      "--opacity=N opacity 0..1",
      "--blend=MODE CSS blend mode",
      "--json emit structured layer result",
    ],
    [
      'nextframe layer-add demo ep01 intro headline --id=hero --start=0 --dur=5 --params={"text":"Hello"}',
      'nextframe layer-add ./timeline.json videoWindow --start=4 --dur=6 --x=60% --y=8% --w=32% --h=28%',
    ],
    [
      "One visual element should map to one layer.",
      "Use nextframe scenes first so scene ids and params are not guessed.",
    ],
  ),
  "layer-move": spec(
    "Move a layer by replacing its start time.",
    [
      "nextframe layer-move <project> <episode> <segment> <layer-id> --start=N [--json]",
      "nextframe layer-move <timeline.json> <layer-id> --start=N [--json]",
    ],
    [
      "<layer-id> layer id from layer-list",
      "--start=N new non-negative start time in seconds",
      "--json emit the updated layer",
    ],
    [
      "nextframe layer-move demo ep01 intro hero --start=2.5",
      "nextframe layer-move ./timeline.json hero --start=2.5 --json",
    ],
    [
      "The layer must exist.",
      "Timeline validation runs after the move before the file is saved.",
    ],
  ),
  "layer-resize": spec(
    "Change a layer duration.",
    [
      "nextframe layer-resize <project> <episode> <segment> <layer-id> --dur=N [--json]",
      "nextframe layer-resize <timeline.json> <layer-id> --dur=N [--json]",
    ],
    [
      "<layer-id> layer id from layer-list",
      "--dur=N new positive duration in seconds",
      "--json emit the updated layer",
    ],
    [
      "nextframe layer-resize demo ep01 intro hero --dur=4",
      "nextframe layer-resize ./timeline.json hero --dur=4 --json",
    ],
    [
      "Duration must be greater than 0.",
      "Timeline validation runs after the resize before the file is saved.",
    ],
  ),
  "layer-set": spec(
    "Set arbitrary layer properties using key=value assignments and optional params JSON.",
    [
      "nextframe layer-set <project> <episode> <segment> <layer-id> <key=value>... [--params=JSON] [--json]",
      "nextframe layer-set <timeline.json> <layer-id> <key=value>... [--params=JSON] [--json]",
    ],
    [
      "<layer-id> layer id from layer-list",
      "<key=value> one or more property assignments such as opacity=0.7 x=10%",
      "--params=JSON merge a params object into layer.params",
      "--json emit the updated layer",
    ],
    [
      'nextframe layer-set demo ep01 intro hero opacity=0.7 x=10% y=20%',
      'nextframe layer-set ./timeline.json hero --params={"text":"Updated","subtitle":"Now"}',
    ],
    [
      "Scalar values parse as booleans, null, numbers, JSON, or raw strings.",
      "Timeline validation runs after the update before the file is saved.",
    ],
  ),
  "layer-remove": spec(
    "Remove one layer from a timeline.",
    [
      "nextframe layer-remove <project> <episode> <segment> <layer-id> [--json]",
      "nextframe layer-remove <timeline.json> <layer-id> [--json]",
    ],
    [
      "<layer-id> layer id from layer-list",
      "--json emit the removed layer",
    ],
    [
      "nextframe layer-remove demo ep01 intro hero",
      "nextframe layer-remove ./timeline.json hero --json",
    ],
    [
      "The layer must exist.",
      "Validation runs after removal before the file is saved.",
    ],
  ),
  "project-new": spec(
    "Create a new project directory and project.json.",
    ["nextframe project-new <name> [--root=PATH] [--json]"],
    [
      "<name> project directory name",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the created path",
    ],
    [
      "nextframe project-new series",
      "nextframe project-new series --root=/tmp/NextFrameProjects --json",
    ],
    [
      "Project names must be unique under the selected root.",
    ],
  ),
  "project-list": spec(
    "List known projects, episode counts, and last-updated timestamps.",
    ["nextframe project-list [--root=PATH] [--json]"],
    [
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured rows",
    ],
    [
      "nextframe project-list",
      "nextframe project-list --root=/tmp/NextFrameProjects --json",
    ],
    [
      "Only directories with project.json are listed.",
    ],
  ),
  "project-config": spec(
    "Read or update shared project config stored in project.json.",
    [
      "nextframe project-config <project> --get [key] [--root=PATH] [--json]",
      "nextframe project-config <project> --set key=value [--root=PATH] [--json]",
    ],
    [
      "<project> project name",
      "--get [key] read one shared config value or the whole shared object",
      "--set key=value write one shared config value",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured result data",
    ],
    [
      "nextframe project-config series --get",
      'nextframe project-config series --set theme={"accent":"#ff6a00"} --json',
    ],
    [
      "Use exactly one of --get or --set.",
      "Set values parse as booleans, null, numbers, JSON, or strings.",
    ],
  ),
  "episode-new": spec(
    "Create an episode directory, episode.json, and an empty pipeline.json.",
    ["nextframe episode-new <project> <name> [--root=PATH] [--json]"],
    [
      "<project> existing project name",
      "<name> episode directory name",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the created path",
    ],
    [
      "nextframe episode-new series alpha",
      "nextframe episode-new series alpha --root=/tmp/NextFrameProjects --json",
    ],
    [
      "The project must already exist.",
      "Episode names must be unique within the project.",
    ],
  ),
  "episode-list": spec(
    "List episodes inside a project, including segment count and total duration.",
    ["nextframe episode-list <project> [--root=PATH] [--json]"],
    [
      "<project> existing project name",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured rows",
    ],
    [
      "nextframe episode-list series",
      "nextframe episode-list series --json",
    ],
    [
      "Only directories with episode.json are listed.",
    ],
  ),
  "segment-new": spec(
    "Create a new segment timeline JSON inside an episode.",
    ["nextframe segment-new <project> <episode> <name> [--root=PATH] [--duration=N] [--fps=N] [--width=N] [--height=N] [--json]"],
    [
      "<project> existing project name",
      "<episode> existing episode name",
      "<name> segment file name without .json",
      "--duration=N timeline duration in seconds, default 10",
      "--fps=N timeline fps, default 30",
      "--width=N stage width in pixels, default 1920",
      "--height=N stage height in pixels, default 1080",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the created path",
    ],
    [
      "nextframe segment-new series alpha intro --duration=12 --width=1080 --height=1920",
      "nextframe segment-new series alpha intro --root=/tmp/NextFrameProjects --json",
    ],
    [
      "The project and episode must already exist.",
      "Choose width/height before adding scenes so ratio-matched components are used.",
    ],
  ),
  "segment-list": spec(
    "List segments in an episode.",
    ["nextframe segment-list <project> <episode> [--root=PATH] [--json]"],
    [
      "<project> existing project name",
      "<episode> existing episode name",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured rows",
    ],
    [
      "nextframe segment-list series alpha",
      "nextframe segment-list series alpha --json",
    ],
    [
      "Only .json segment files are listed; episode.json and pipeline.json are skipped.",
    ],
  ),
  "pipeline-get": spec(
    "Read pipeline.json or one pipeline stage.",
    ["nextframe pipeline-get <project> <episode> [--stage=script|audio|atoms|outputs] [--root=PATH] [--json]"],
    [
      "<project> existing project name",
      "<episode> existing episode name",
      "--stage=... restrict output to one stage",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured JSON",
    ],
    [
      "nextframe pipeline-get series alpha",
      "nextframe pipeline-get series alpha --stage=atoms --json",
    ],
    [
      "The episode must already exist and contain pipeline.json.",
    ],
  ),
  "script-set": spec(
    "Write or replace one script segment in pipeline.json.",
    ["nextframe script-set <project> <episode> --segment=N --narration=TEXT [--visual=TEXT] [--role=TEXT] [--logic=TEXT] [--arc=JSON] [--principles-topic=TEXT ...] [--root=PATH] [--json]"],
    [
      "--segment=N 1-based script segment index",
      "--narration=TEXT required narration text",
      "--visual=TEXT visual notes for the segment",
      "--role=TEXT narration role or speaker",
      "--logic=TEXT reasoning or editorial note",
      "--arc=JSON JSON array/object for story arc data",
      "--principles-*=TEXT arbitrary principle flags stored under script.principles",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the updated script state",
    ],
    [
      'nextframe script-set series alpha --segment=1 --narration="Problem" --visual="Show chart"',
      'nextframe script-set series alpha --segment=2 --narration="Solution" --arc=["setup","payoff"] --json',
    ],
    [
      "Segment numbers are 1-based positive integers.",
      "At minimum, provide --segment and --narration.",
    ],
  ),
  "script-get": spec(
    "Read the whole script stage or one script segment.",
    ["nextframe script-get <project> <episode> [--segment=N] [--root=PATH] [--json]"],
    [
      "--segment=N optional 1-based segment index",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured JSON",
    ],
    [
      "nextframe script-get series alpha",
      "nextframe script-get series alpha --segment=1 --json",
    ],
    [
      "When --segment is omitted, the full script stage is returned.",
    ],
  ),
  "audio-set": spec(
    "Write or replace one audio segment entry in pipeline.json.",
    ["nextframe audio-set <project> <episode> --segment=N --status=STATUS --duration=N [--file=PATH] [--sentences=JSON] [--voice=NAME] [--speed=N] [--root=PATH] [--json]"],
    [
      "--segment=N 1-based audio segment index",
      "--status=STATUS required audio status label",
      "--duration=N required duration in seconds",
      "--file=PATH rendered audio file path",
      "--sentences=JSON JSON array of sentence timing metadata",
      "--voice=NAME voice identifier",
      "--speed=N playback or synthesis speed",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the updated audio state",
    ],
    [
      'nextframe audio-set series alpha --segment=1 --status=ready --duration=6.4 --file=audio/seg1.wav',
      'nextframe audio-set series alpha --segment=2 --status=draft --duration=5.1 --sentences=[{"start":0,"end":1.2}] --json',
    ],
    [
      "At minimum, provide --segment, --status, and --duration.",
      "Segment numbers are 1-based positive integers.",
    ],
  ),
  "audio-get": spec(
    "Read the whole audio stage or one audio segment.",
    ["nextframe audio-get <project> <episode> [--segment=N] [--root=PATH] [--json]"],
    [
      "--segment=N optional 1-based segment index",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured JSON",
    ],
    [
      "nextframe audio-get series alpha",
      "nextframe audio-get series alpha --segment=1 --json",
    ],
    [
      "When --segment is omitted, the full audio stage is returned.",
    ],
  ),
  "atom-add": spec(
    "Add one pipeline atom of type component, video, or image.",
    ["nextframe atom-add <project> <episode> --type=component|video|image --name=TEXT [--scene=ID] [--segment=N] [--params=JSON] [--file=PATH] [--duration=N] [--root=PATH] [--json]"],
    [
      "--type=component|video|image required atom type",
      "--name=TEXT required human-readable atom name",
      "--scene=ID required for component atoms",
      "--segment=N required for component atoms",
      "--params=JSON optional component params object",
      "--file=PATH required for video and image atoms",
      "--duration=N required for video atoms",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the created atom and updated atom list",
    ],
    [
      'nextframe atom-add series alpha --type=component --name="Hero chart" --scene=barChartReveal --segment=1 --params={"value":42}',
      'nextframe atom-add series alpha --type=video --name="B-roll" --file=clips/broll.mp4 --duration=4.2 --json',
    ],
    [
      "Component atoms require --scene and --segment.",
      "Video atoms require --file and --duration; image atoms require --file.",
    ],
  ),
  "atom-list": spec(
    "List pipeline atoms, optionally filtered by type.",
    ["nextframe atom-list <project> <episode> [--type=component|video|image] [--root=PATH] [--json]"],
    [
      "--type=... optional atom type filter",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured JSON",
    ],
    [
      "nextframe atom-list series alpha",
      "nextframe atom-list series alpha --type=video --json",
    ],
    [
      "Only known atom types are supported in the filter.",
    ],
  ),
  "atom-remove": spec(
    "Remove one pipeline atom by numeric id.",
    ["nextframe atom-remove <project> <episode> --id=N [--root=PATH] [--json]"],
    [
      "--id=N required atom id",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the removed atom and updated atom list",
    ],
    [
      "nextframe atom-remove series alpha --id=3",
      "nextframe atom-remove series alpha --id=3 --json",
    ],
    [
      "Atom ids are numeric and unique within the pipeline.",
    ],
  ),
  "output-add": spec(
    "Register one rendered output artifact in pipeline.json.",
    ["nextframe output-add <project> <episode> --name=TEXT --file=PATH --duration=N --size=TEXT [--changes=TEXT] [--root=PATH] [--json]"],
    [
      "--name=TEXT required output label",
      "--file=PATH required output file path",
      "--duration=N required duration in seconds",
      "--size=TEXT required size label such as 1920x1080",
      "--changes=TEXT optional release/change note",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the created output row",
    ],
    [
      'nextframe output-add series alpha --name="intro-v1" --file=exports/intro.mp4 --duration=12 --size=1920x1080',
      'nextframe output-add series alpha --name="intro-v2" --file=exports/intro-v2.mp4 --duration=12 --size=1080x1920 --changes="portrait pass" --json',
    ],
    [
      "At minimum, provide --name, --file, --duration, and --size.",
    ],
  ),
  "output-list": spec(
    "List outputs recorded in pipeline.json.",
    ["nextframe output-list <project> <episode> [--root=PATH] [--json]"],
    [
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit structured JSON",
    ],
    [
      "nextframe output-list series alpha",
      "nextframe output-list series alpha --json",
    ],
    [
      "Returns exactly what is recorded in pipeline.json.",
    ],
  ),
  "output-publish": spec(
    "Mark one output as published to a target platform.",
    ["nextframe output-publish <project> <episode> --id=N --platform=NAME [--root=PATH] [--json]"],
    [
      "--id=N required output id",
      "--platform=NAME required publish target label such as youtube or reels",
      "--root=PATH projects root, default ~/NextFrame/projects",
      "--json emit the updated output row",
    ],
    [
      "nextframe output-publish series alpha --id=2 --platform=youtube",
      "nextframe output-publish series alpha --id=2 --platform=reels --json",
    ],
    [
      "The output id must already exist.",
    ],
  ),
  "source-download": spec(
    "Download a source video into the source library and create source.json.",
    ["nextframe source-download <url> --library <path> [--format 720]"],
    [
      "<url> source video URL",
      "--library <path> required source library root",
      "--format 720 optional target height, normalized to 720p, 1080p, etc.",
    ],
    [
      "nextframe source-download https://www.youtube.com/watch?v=abc --library ~/NextFrame/library",
      "nextframe source-download https://example.com/video --library ./sources --format 1080",
    ],
    [
      "Requires the nf-source binary to be installed and executable.",
      "This creates a new source directory containing source.json, media, and metadata.",
    ],
  ),
  "source-transcribe": spec(
    "Run ASR on a downloaded source and write transcript summary into source.json.",
    ["nextframe source-transcribe <source-dir> [--model base.en] [--lang auto]"],
    [
      "<source-dir> existing downloaded source directory",
      "--model MODEL whisper model name, default base.en",
      "--lang LANG language code or auto, default auto",
    ],
    [
      "nextframe source-transcribe ~/NextFrame/library/my-source",
      "nextframe source-transcribe ./sources/my-source --model small.en --lang en",
    ],
    [
      "Use this when you do not have an SRT file.",
      "Requires a source directory that already contains source.mp4 and source.json.",
    ],
  ),
  "source-align": spec(
    "Align an existing SRT against a source video and write transcript summary into source.json.",
    ["nextframe source-align <source-dir> --srt <file> [--lang auto]"],
    [
      "<source-dir> existing downloaded source directory",
      "--srt <file> required subtitle file to align",
      "--lang LANG language code or auto, default auto",
    ],
    [
      "nextframe source-align ~/NextFrame/library/my-source --srt ./subs/my-source.srt",
      "nextframe source-align ./sources/my-source --srt ./subs/my-source.srt --lang en",
    ],
    [
      "Use this when you already have an SRT file; it is usually faster and more accurate than transcribe.",
      "Requires a source directory that already contains source.mp4 and source.json.",
    ],
  ),
  "source-cut": spec(
    "Cut clips from a source using sentence-id ranges and update source.json clip metadata.",
    ["nextframe source-cut <source-dir> --plan <plan.json> [--margin 0.2]"],
    [
      "<source-dir> existing source directory with transcript data",
      "--plan <plan.json> required cut plan file",
      "--margin N optional seconds of padding around each cut, default 0.2",
    ],
    [
      "nextframe source-cut ~/NextFrame/library/my-source --plan ./cut-plan.json",
      "nextframe source-cut ./sources/my-source --plan ./cut-plan.json --margin 0.1",
    ],
    [
      "Run source-transcribe or source-align first so sentences.json exists.",
      "The cut plan must reference valid sentence id ranges.",
    ],
  ),
  "source-list": spec(
    "List all sources in a library with transcript and clip status.",
    ["nextframe source-list --library <path>"],
    [
      "--library <path> required source library root",
    ],
    [
      "nextframe source-list --library ~/NextFrame/library",
      "nextframe source-list --library ./sources",
    ],
    [
      "Only directories containing valid source.json files are listed.",
    ],
  ),
  "source-link": spec(
    "Link source clips into a project pipeline as video atoms.",
    ["nextframe source-link <source-dir> --project <name> --episode <name> [--root <path>]"],
    [
      "<source-dir> source directory whose clips should be linked",
      "--project <name> required target project",
      "--episode <name> required target episode",
      "--root <path> optional projects root, default ~/NextFrame/projects",
    ],
    [
      "nextframe source-link ~/NextFrame/library/my-source --project series --episode alpha",
      "nextframe source-link ./sources/my-source --project series --episode alpha --root /tmp/NextFrameProjects",
    ],
    [
      "Run source-cut first so source.json contains clips to link.",
      "Each linked clip becomes a video atom in the episode pipeline.",
    ],
  ),
  app: spec(
    "Control a running NextFrame desktop app session.",
    [
      "nextframe app <subcommand>",
      "nextframe app <subcommand> --help",
    ],
    [
      "Subcommands: eval, screenshot, diagnose, navigate, click, status",
      "Run nextframe app <subcommand> --help for subcommand-specific params and examples",
    ],
    [
      "nextframe app status",
      "nextframe app navigate demo ep01 intro",
      "nextframe app eval --help",
    ],
    [
      "The desktop app must be running on port 19820.",
    ],
  ),
  "app eval": spec(
    "Evaluate JavaScript in the running desktop app.",
    ["nextframe app eval <js> [--timeout=MS] [--json]"],
    [
      "<js> required JavaScript source to evaluate in the app window",
      "--timeout=MS request timeout in milliseconds, default 10000",
      "--json emit structured result data",
    ],
    [
      'nextframe app eval "document.title"',
      'nextframe app eval "window.location.pathname" --timeout=2000 --json',
    ],
    [
      "The desktop app must be running.",
      "Pass the script as positional text after eval.",
    ],
  ),
  "app screenshot": spec(
    "Capture a screenshot from the running desktop app.",
    ["nextframe app screenshot [--out=path.png] [--json]"],
    [
      "--out=path.png output path, default /tmp/nf-screenshot.png",
      "--json emit structured result data",
    ],
    [
      "nextframe app screenshot",
      "nextframe app screenshot --out=/tmp/editor.png --json",
    ],
    [
      "The desktop app must be running.",
      "The output directory must be writable.",
    ],
  ),
  "app diagnose": spec(
    "Fetch desktop app diagnostics.",
    ["nextframe app diagnose [--json]"],
    [
      "--json emit structured result data",
    ],
    [
      "nextframe app diagnose",
      "nextframe app diagnose --json",
    ],
    [
      "The desktop app must be running.",
    ],
  ),
  "app navigate": spec(
    "Navigate the desktop app to a project, episode, segment, or view.",
    ["nextframe app navigate <project> [<episode>] [<segment>] [--view=editor|project] [--timeout=MS] [--json]"],
    [
      "<project> required project name",
      "<episode> optional episode name",
      "<segment> optional segment name",
      "--view=editor|project target view, default editor",
      "--timeout=MS request timeout in milliseconds, default 10000",
      "--json emit structured result data",
    ],
    [
      "nextframe app navigate demo ep01 intro",
      "nextframe app navigate demo --view=project --json",
    ],
    [
      "The desktop app must be running.",
    ],
  ),
  "app click": spec(
    "Dispatch a click at viewport coordinates inside the running desktop app.",
    ["nextframe app click <x> <y> [--timeout=MS] [--json]"],
    [
      "<x> viewport x coordinate in CSS pixels",
      "<y> viewport y coordinate in CSS pixels",
      "--timeout=MS request timeout in milliseconds, default 10000",
      "--json emit structured result data",
    ],
    [
      "nextframe app click 320 240",
      "nextframe app click 640 120 --json",
    ],
    [
      "Coordinates must be finite numbers.",
      "The desktop app must be running.",
    ],
  ),
  "app status": spec(
    "Read the current desktop app status.",
    ["nextframe app status [--json]"],
    [
      "--json emit structured result data",
    ],
    [
      "nextframe app status",
      "nextframe app status --json",
    ],
    [
      "The desktop app must be running.",
    ],
  ),
  "app-pipeline": spec(
    "Control the pipeline view in the running desktop app.",
    [
      "nextframe app-pipeline <subcommand>",
      "nextframe app-pipeline <subcommand> --help",
    ],
    [
      "Subcommands: navigate, tab, status, play, stop",
      "Run nextframe app-pipeline <subcommand> --help for subcommand-specific params and examples",
    ],
    [
      "nextframe app-pipeline status",
      "nextframe app-pipeline navigate --project=demo --episode=ep01",
      "nextframe app-pipeline tab --help",
    ],
    [
      "The desktop app must be running on port 19820.",
    ],
  ),
  "app-pipeline navigate": spec(
    "Open the pipeline view for a project and optional episode.",
    ["nextframe app-pipeline navigate --project=<name> [--episode=<name>] [--json]"],
    [
      "--project=<name> required project name",
      "--episode=<name> optional episode name",
      "--json emit structured result data",
    ],
    [
      "nextframe app-pipeline navigate --project=demo --episode=ep01",
      "nextframe app-pipeline navigate --project=demo --json",
    ],
    [
      "The desktop app must be running.",
    ],
  ),
  "app-pipeline tab": spec(
    "Switch the active pipeline tab in the desktop app.",
    ["nextframe app-pipeline tab --tab=<script|audio|clips|atoms|assembly|output> [--json]"],
    [
      "--tab=<...> required pipeline tab name",
      "--json emit structured result data",
    ],
    [
      "nextframe app-pipeline tab --tab=atoms",
      "nextframe app-pipeline tab --tab=output --json",
    ],
    [
      "The desktop app must be running.",
      "Use one of the known pipeline tab names.",
    ],
  ),
  "app-pipeline status": spec(
    "Read pipeline view status from the desktop app.",
    ["nextframe app-pipeline status [--json]"],
    [
      "--json emit structured result data",
    ],
    [
      "nextframe app-pipeline status",
      "nextframe app-pipeline status --json",
    ],
    [
      "The desktop app must be running.",
    ],
  ),
  "app-pipeline play": spec(
    "Play audio for one pipeline segment in the desktop app.",
    ["nextframe app-pipeline play --segment=<n> [--json]"],
    [
      "--segment=<n> required 1-based pipeline segment number",
      "--json emit structured result data",
    ],
    [
      "nextframe app-pipeline play --segment=2",
      "nextframe app-pipeline play --segment=2 --json",
    ],
    [
      "The desktop app must be running.",
      "Segment numbers are 1-based positive integers.",
    ],
  ),
  "app-pipeline stop": spec(
    "Stop all currently playing pipeline audio in the desktop app.",
    ["nextframe app-pipeline stop [--json]"],
    [
      "--json emit structured result data",
    ],
    [
      "nextframe app-pipeline stop",
      "nextframe app-pipeline stop --json",
    ],
    [
      "The desktop app must be running.",
    ],
  ),
  "app-eval": spec(
    "Legacy wrapper for nextframe app eval.",
    ["nextframe app-eval <js> [--timeout=MS] [--json]"],
    [
      "<js> required JavaScript source to evaluate in the app window",
      "--timeout=MS request timeout in milliseconds, default 10000",
      "--json emit structured result data",
    ],
    [
      'nextframe app-eval "document.title"',
      'nextframe app-eval "window.location.pathname" --json',
    ],
    [
      "Equivalent to nextframe app eval <js>.",
      "The desktop app must be running.",
    ],
  ),
  "app-screenshot": spec(
    "Legacy wrapper for nextframe app screenshot.",
    ["nextframe app-screenshot [--out=path.png] [--json]"],
    [
      "--out=path.png output path, default /tmp/nf-screenshot.png",
      "--json emit structured result data",
    ],
    [
      "nextframe app-screenshot",
      "nextframe app-screenshot --out=/tmp/editor.png --json",
    ],
    [
      "Equivalent to nextframe app screenshot.",
      "The desktop app must be running.",
    ],
  ),
};

function renderList(items) {
  if (!items || items.length === 0) return "";
  return items.map((item) => `  - ${item}`).join("\n");
}

function renderSection(title, items) {
  if (!items || items.length === 0) return "";
  return `${title}:\n${renderList(items)}`;
}

export function renderCommandHelp(name) {
  const entry = COMMAND_SPECS[name];
  if (!entry) return null;
  const parts = [
    `${name} — ${entry.summary}`,
    renderSection("Usage", entry.usage),
    renderSection("Params", entry.params),
    renderSection("Examples", entry.examples),
    renderSection("Constraints", entry.constraints),
    renderSection("Fix", [entry.fix]),
  ].filter(Boolean);
  return `${parts.join("\n\n")}\n`;
}

export function renderRootHelp() {
  const lines = [
    "nextframe — AI video editor CLI",
    "",
    "Every command is self-describing. Run `nextframe <command> --help` for params, examples, constraints, and fix guidance.",
    "",
  ];

  for (const group of TOP_LEVEL_COMMANDS) {
    lines.push(`${group.title}:`);
    for (const name of group.commands) {
      lines.push(`  ${name.padEnd(16)} ${COMMAND_SPECS[name].summary}`);
    }
    lines.push("");
  }

  lines.push("Key workflow:");
  lines.push("  1. Create or locate a segment timeline.");
  lines.push("  2. Inspect scenes with `nextframe scenes`.");
  lines.push("  3. Patch one layer at a time.");
  lines.push("  4. Run `nextframe validate` after each patch.");
  lines.push("  5. Use `nextframe preview` or `nextframe frame` to verify output.");
  lines.push("");
  lines.push(`Fix: ${DEFAULT_FIX}`);
  return `${lines.join("\n")}\n`;
}

export function listTopLevelHelpCommands() {
  return TOP_LEVEL_COMMANDS.flatMap((group) => group.commands);
}

export function hasCommandHelp(name) {
  return Object.prototype.hasOwnProperty.call(COMMAND_SPECS, name);
}

export function defaultFixSuggestion() {
  return DEFAULT_FIX;
}
