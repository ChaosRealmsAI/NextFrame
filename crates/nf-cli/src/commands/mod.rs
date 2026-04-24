use clap::{Args, Parser, Subcommand, ValueEnum};
use serde_json::Value;

use crate::errors::NfError;
use crate::ipc_client::{self, IpcResponse};

pub mod anchors;
pub mod app;
pub mod clips;
pub mod compositions;
pub mod doctor;
pub mod episodes;
pub mod export_cmd;
pub mod karaoke;
pub mod log;
pub mod projects;
pub mod utility;

#[derive(Debug, Parser)]
#[command(
    name = "nf",
    version,
    about = "NextFrame CLI for app control, project data, and AI-friendly inspection",
    long_about = r#"NextFrame CLI emits JSON on stdout and structured errors on stderr.

Use --project and --episode slugs to address data and app windows. Start with discovery commands, then mutate with explicit flags.

EXAMPLES:
    nf projects list
    nf projects create --slug=demo-video --name='Demo Video'
    nf open --project=demo-video --episode=ep-01

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`
    - validation failed -> exit 2 · hint: run `nf <command> --help` for flag formats"#,
    disable_help_subcommand = true
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    #[command(
        about = "Open or focus a NextFrame window for a project episode",
        long_about = r#"Open or focus a NextFrame window for one project and episode.

USAGE:
    nf open --project=<slug> --episode=<slug> [--clip=<slug>] [--t=<sec>] [--new-window]

EXAMPLES:
    nf open --project=next-frame --episode=ep-01
    nf open --project=next-frame --episode=ep-01 --clip=intro --t=12.45 --new-window

EXPECTED JSON:
    {"window_id":"win-1","pid":12345,"project":"next-frame","episode":"ep-01","is_new":true}

COMMON ERRORS:
    - unknown project or episode -> exit 5 · hint: `nf projects list` then `nf episodes list --project=<slug>`
    - socket failed -> exit 1 · hint: retry `nf open` or check the nf-shell socket"#
    )]
    Open(OpenArgs),
    #[command(
        about = "List running NextFrame windows and processes",
        long_about = r#"List the app process and open windows, optionally filtered by project and episode.

USAGE:
    nf ps [--project=<slug>] [--episode=<slug>]

EXAMPLES:
    nf ps
    nf ps --project=next-frame --episode=ep-01

EXPECTED JSON:
    [{"pid":12345,"window_id":"win-1","project":"next-frame","episode":"ep-01","focused":true}]

COMMON ERRORS:
    - socket failed -> exit 1 · hint: open a window with `nf open --project=<slug> --episode=<slug>`
    - episode without project is ambiguous · hint: include `--project=<slug>`"#
    )]
    Ps(ProjectEpisodeFilter),
    #[command(
        about = "Capture a screenshot from a NextFrame window",
        long_about = r#"Capture a full window or named region from the addressed project episode.

USAGE:
    nf screenshot --project=<slug> --episode=<slug> [--region=<area>] [--out=<path>] [--window=<id>]

EXAMPLES:
    nf screenshot --project=next-frame --episode=ep-01 --region=timeline --out=tmp/timeline.png
    nf screenshot --project=next-frame --episode=ep-01 --out=-

EXPECTED JSON:
    {"project":"next-frame","episode":"ep-01","region":"timeline","out":"tmp/timeline.png"}

COMMON ERRORS:
    - unknown window -> exit 5 · hint: run `nf ps --project=<slug> --episode=<slug>`
    - invalid region -> exit 2 · hint: use full, topbar, clips, log, timeline, inspector, or preview"#
    )]
    Screenshot(ScreenshotArgs),
    #[command(
        about = "Capture a native macOS window PNG including titlebar and shadow",
        long_about = r#"Capture a full native NextFrame window through macOS CoreGraphics.

USAGE:
    nf capture --project=<slug> --episode=<slug> --out=<path.png> [--window-id=<id>]

EXAMPLES:
    nf capture --project=next-frame --episode=ep-01 --out=tmp/cap.png
    nf capture --project=next-frame --episode=ep-01 --out=tmp/cap.png --window-id=w-1

EXPECTED JSON:
    {"out":"tmp/cap.png","bytes":12345,"width":2880,"height":1800,"window_id":"w-1","window_number":1234}

COMMON ERRORS:
    - unsupported platform -> exit 2 · hint: native capture requires macOS CoreGraphics
    - unknown window -> exit 5 · hint: run `nf ps --project=<slug> --episode=<slug>`"#
    )]
    Capture(CaptureArgs),
    #[command(
        about = "Generate a bilingual word-level karaoke HTML player for an episode",
        long_about = r#"Generate <episode-dir>/clips/index.html from episode word timings, cut report, and Chinese translations.

USAGE:
    nf karaoke <episode-dir>

EXAMPLES:
    nf karaoke /path/to/episode

EXPECTED JSON:
    {"out":"/path/to/episode/clips/index.html","bytes":12345,"clips":3,"segments":12}

COMMON ERRORS:
    - missing episode data -> hint: pass a directory containing sources/<slug>/words.json and clips/cut_report.json
    - missing translations -> hint: create clips/clip_NN.translations.zh.json for each cut clip"#
    )]
    Karaoke(KaraokeArgs),
    #[command(
        about = "Export an episode JSON timeline to MP4",
        long_about = r#"Export the current project episode or v2 composition to MP4 through the NextFrame recorder runtime.

USAGE:
    nf export --project=<slug> --episode=<slug> --out=<path.mp4>
    nf export --project=<slug> --composition=<slug> --profile=draft --out=<path.mp4>

EXAMPLES:
    nf export --project=demo-video --episode=ep-01 --out=tmp/demo.mp4
    nf export --project=v2-showcase --composition=showreel-24s --profile=final-fast --parallel=2 --events --out=tmp/showreel.mp4

EXPECTED JSON:
    {"out":"tmp/demo.mp4","source":"tmp/demo.mp4.source.json","profile":"draft","resolution":"720p","fps":30,"parallel":1,"bytes":12345,"frames":300,"duration_ms":5000,"warnings":[]}

PROFILES:
    draft      720p  · 30fps · parallel 1
    standard   1080p · 30fps · parallel 1
    final      1080p · 60fps · parallel 1
    final-fast 1080p · 60fps · parallel 2

COMMON ERRORS:
    - unknown project or episode -> exit 5 · hint: create or list projects first
    - invalid timeline -> exit 2 · hint: ensure at least one scene clip has valid start/end times
    - invalid profile/resolution/fps/parallel -> exit 2 · hint: run `nf export --help`"#
    )]
    Export(ExportArgs),
    #[command(
        name = "export-status",
        about = "Read a running desktop export job status",
        long_about = r#"Read export.status from the running nf-shell IPC server.

USAGE:
    nf export-status --job-id=<id>

EXPECTED JSON:
    {"job_id":"...","status":"running","progress":{"percent":42.0,"stage":"render","frames_encoded":120,"total_frames":720,"eta_seconds":12.3}}

COMMON ERRORS:
    - unknown job -> exit 2 · hint: start an export from the desktop app first
    - socket failed -> exit 1 · hint: start nf-shell"#
    )]
    ExportStatus(ExportStatusArgs),
    #[command(
        name = "export-cancel",
        about = "Cancel a running desktop export job",
        long_about = r#"Cancel a running export job through the nf-shell IPC server.

USAGE:
    nf export-cancel --job-id=<id>

EXPECTED JSON:
    {"job_id":"...","status":"cancelled","cancelled":true}

COMMON ERRORS:
    - unknown job -> exit 2 · hint: check `nf export-status --job-id=<id>`
    - job already finished -> returns cancelled=false"#
    )]
    ExportCancel(ExportStatusArgs),
    #[command(
        about = "Click a DOM element in a NextFrame window",
        long_about = r#"Click a DOM element through the real app path. Selectors may use ::shadow to cross web component shadow roots.

USAGE:
    nf click --project=<slug> --episode=<slug> --selector=<css> [--window=<id>]

EXAMPLES:
    nf click --project=next-frame --episode=ep-01 --selector='nf-clips::shadow .c-row[data-id=intro]'
    nf click --project=next-frame --episode=ep-01 --selector='nf-topbar::shadow button[data-tab=script]'

EXPECTED JSON:
    {"clicked":true,"selector":"nf-clips::shadow .c-row[data-id=intro]"}

COMMON ERRORS:
    - selector not found -> exit 3 · hint: inspect DOM with `nf devtools --query=<sel> --get=shadowRoot`
    - element not clickable -> exit 4 · hint: target a visible button or row element"#
    )]
    Click(ClickArgs),
    #[command(
        about = "Select a clip by slug without writing a CSS selector",
        long_about = r#"Select a clip semantically by slug. This is the stable AI-facing alternative to DOM click selectors.

USAGE:
    nf select --project=<slug> --episode=<slug> --clip=<slug>

EXAMPLES:
    nf select --project=next-frame --episode=ep-01 --clip=intro
    nf state --project=next-frame --episode=ep-01 --key=clips.selected-id

EXPECTED JSON:
    {"selected":"intro","project":"next-frame","episode":"ep-01"}

COMMON ERRORS:
    - unknown clip -> exit 5 · hint: run `nf clips list --project=<slug> --episode=<slug>`
    - window not open -> exit 1 · hint: run `nf open --project=<slug> --episode=<slug>`"#
    )]
    Select(SelectArgs),
    #[command(
        about = "Switch the active editor tab in a NextFrame window",
        long_about = r#"Switch the topbar tab by semantic tab name.

USAGE:
    nf tab --project=<slug> --episode=<slug> --switch=<script|slice|voice|edit>

EXAMPLES:
    nf tab --project=next-frame --episode=ep-01 --switch=script
    nf state --project=next-frame --episode=ep-01 --key=topbar.current-tab

EXPECTED JSON:
    {"tab":"script","project":"next-frame","episode":"ep-01"}

COMMON ERRORS:
    - invalid tab -> exit 2 · hint: use one of script, slice, voice, edit
    - window not open -> exit 1 · hint: run `nf open --project=<slug> --episode=<slug>`"#
    )]
    Tab(TabArgs),
    #[command(
        about = "Read a UI state key from a NextFrame window",
        long_about = r#"Read a dot-path state key such as topbar.current-tab or clips.selected-id.

USAGE:
    nf state --project=<slug> --episode=<slug> --key=<path> [--window=<id>]

EXAMPLES:
    nf state --project=next-frame --episode=ep-01 --key=topbar.current-tab
    nf state --project=next-frame --episode=ep-01 --key=timeline.current-time

EXPECTED JSON:
    {"key":"topbar.current-tab","value":"edit","type":"string"}

COMMON ERRORS:
    - unknown key -> exit 2 · hint: try topbar.current-tab, clips.selected-id, timeline.current-time, or inspector.clip-id
    - multiple windows -> hint: use `nf ps` and pass `--window=<id>`"#
    )]
    State(StateArgs),
    #[command(
        about = "Inspect or modify DOM state for debugging",
        long_about = r#"Query DOM, shadow roots, attributes, computed styles, or bounding boxes in a NextFrame window.

USAGE:
    nf devtools --project=<slug> --episode=<slug> --query=<sel> [--get=<prop>] [--action=<action>] [--value=<value>] [--window=<id>]

EXAMPLES:
    nf devtools --project=next-frame --episode=ep-01 --query='nf-topbar' --get=shadowRoot
    nf devtools --project=next-frame --episode=ep-01 --query='nf-timeline::shadow .playhead' --get=bounding-rect

EXPECTED JSON:
    {"query":"nf-topbar","get":"shadowRoot","value":"<div>...</div>"}

COMMON ERRORS:
    - selector not found -> exit 3 · hint: broaden the selector, then narrow through ::shadow
    - unsupported get/action -> exit 2 · hint: use outerHTML, shadowRoot, attributes, computed-style, bounding-rect, or custom-elements"#
    )]
    Devtools(DevtoolsArgs),
    #[command(
        about = "Close one NextFrame window without quitting the app",
        long_about = r#"Close the window for a project episode. The app process keeps running if other windows exist.

USAGE:
    nf close --project=<slug> --episode=<slug> [--window=<id>]

EXAMPLES:
    nf close --project=next-frame --episode=ep-01
    nf close --project=next-frame --episode=ep-01 --window=win-2

EXPECTED JSON:
    {"closed":true,"window_id":"win-2"}

COMMON ERRORS:
    - multiple windows match -> hint: run `nf ps --project=<slug> --episode=<slug>` and pass `--window=<id>`
    - socket failed -> exit 1 · hint: the app may already be closed"#
    )]
    Close(WindowTargetArgs),
    #[command(
        about = "Quit the NextFrame app process",
        long_about = r#"Quit the whole NextFrame app process and clean up the IPC socket.

USAGE:
    nf quit

EXAMPLES:
    nf quit

EXPECTED JSON:
    {"ok":true}

COMMON ERRORS:
    - socket failed -> exit 1 · hint: no app process may be running; verify with `nf ps`"#
    )]
    Quit,
    #[command(
        about = "Manage project metadata and project-scoped listings",
        long_about = r#"Manage projects and project-scoped episode or clip listings.

USAGE:
    nf projects <list|episodes|clips|show|create|rename|archive|delete> [flags]

EXAMPLES:
    nf projects list
    nf projects create --slug=demo-video --name='Demo Video'

EXPECTED JSON:
    [{"slug":"next-frame","name":"NextFrame","episodes_count":1}]

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`
    - slug exists -> exit 6 · hint: run `nf projects show --project=<slug>` or choose another slug"#
    )]
    Projects(ProjectCommand),
    #[command(
        about = "Manage episodes inside a project",
        long_about = r#"List, show, create, rename, archive, or delete episodes within one project.

USAGE:
    nf episodes <list|show|create|rename|archive|delete> --project=<slug> [flags]

EXAMPLES:
    nf episodes list --project=next-frame
    nf episodes create --project=next-frame --slug=ep-02 --name='Episode 2' --duration=90

EXPECTED JSON:
    [{"slug":"ep-01","name":"Episode 1","duration":60.0}]

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`
    - slug exists -> exit 6 · hint: choose another episode slug or show the existing one"#
    )]
    Episodes(EpisodeCommand),
    #[command(
        about = "Manage timeline clips inside an episode",
        long_about = r#"List, show, create, update, or delete timeline clips.

USAGE:
    nf clips <list|show|create|update|delete> --project=<slug> --episode=<slug> [flags]

EXAMPLES:
    nf clips list --project=next-frame --episode=ep-01
    nf clips create --project=next-frame --episode=ep-01 --slug=intro --label='Intro' --track=scene --start=0 --end=5

EXPECTED JSON:
    [{"slug":"intro","label":"Intro","track":"scene","start":0.0,"end":5.0}]

COMMON ERRORS:
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`
    - invalid anchor expression -> exit 2 · hint: run `nf anchors list --project=<slug> --episode=<slug>`"#
    )]
    Clips(ClipCommand),
    #[command(
        about = "Inspect or patch v2 composition JSON tracks",
        long_about = r#"Inspect or patch one v2 composition track without scraping the editor DOM.

USAGE:
    nf composition show --project=<slug> --composition=<slug> [--track=<id>] [--field=<path>]
    nf composition patch --project=<slug> --composition=<slug> --track=<id> --field=<path> --value=<json-or-string>

EXAMPLES:
    nf composition show --project=v2-showcase --composition=showreel-24s --track=final-title --field=params.title
    nf composition patch --project=v2-showcase --composition=showreel-24s --track=final-title --field=params.title --value='NEXTFRAME LIVE EDIT'

EXPECTED JSON:
    {"composition":{...},"source":{...},"warnings":[]}

COMMON ERRORS:
    - unknown track -> exit 2 · hint: run `nf composition show --project=<slug> --composition=<slug>`
    - invalid field path -> exit 2 · hint: use dot paths such as params.title, style.x, or time.start"#
    )]
    Composition(CompositionCommand),
    #[command(
        about = "Manage named time anchors for an episode",
        long_about = r#"List, set, or unset named time anchors used by clip start and end expressions.

USAGE:
    nf anchors <list|set|unset> --project=<slug> --episode=<slug> [flags]

EXAMPLES:
    nf anchors list --project=next-frame --episode=ep-01
    nf anchors set --project=next-frame --episode=ep-01 --name=intro-end --time=5.0

EXPECTED JSON:
    {"intro-end":5.0,"feat-1-end":14.5}

COMMON ERRORS:
    - anchor still referenced -> exit 8 · hint: update clips first with `nf clips update`
    - invalid time -> exit 2 · hint: pass seconds such as `--time=14.5`"#
    )]
    Anchors(AnchorCommand),
    #[command(
        about = "Read or append episode operation logs",
        long_about = r#"Tail, show, or create operation log entries for an episode.

USAGE:
    nf log <tail|show|create> --project=<slug> --episode=<slug> [flags]

EXAMPLES:
    nf log tail --project=next-frame --episode=ep-01 --limit=5 --actor=AI
    nf log create --project=next-frame --episode=ep-01 --actor=AI --desc='Created intro' --cli='nf clips create ...' --status=done

EXPECTED JSON:
    [{"id":"log-001","actor":"AI","desc":"Created intro","status":"done"}]

COMMON ERRORS:
    - unknown log entry -> exit 5 · hint: run `nf log tail --project=<slug> --episode=<slug>`
    - invalid actor/status -> exit 2 · hint: actor is AI or human; status is pending, done, or failed"#
    )]
    Log(LogCommand),
    #[command(
        about = "Print self-contained NextFrame command help",
        long_about = r#"Print command usage, examples, common errors, and hints. Use --json for structured output.

USAGE:
    nf help [<command>] [--json]

EXAMPLES:
    nf help
    nf help projects create --json

EXPECTED JSON:
    {"topic":"projects create","usage":"nf projects create --slug=<id> ...","examples":[...]}

COMMON ERRORS:
    - unknown topic -> hint: run `nf help` to list commands
    - JSON expected -> hint: pass `--json`"#
    )]
    Help(HelpArgs),
    #[command(
        about = "Check the local NextFrame CLI, socket, and registry",
        long_about = r#"Check binary path, version, IPC socket path, registry path, known projects, app status, and warnings.

USAGE:
    nf doctor [--json]

EXAMPLES:
    nf doctor
    nf doctor --json

EXPECTED JSON:
    {"binary":"/path/to/nf","version":"0.2.0","app_running":false,"warnings":[]}

COMMON ERRORS:
    - registry unreadable -> hint: repair or recreate ~/.nextframe/registry.json
    - socket missing -> hint: open an app window with `nf open --project=<slug> --episode=<slug>`"#
    )]
    Doctor(DoctorArgs),
    #[command(
        about = "Print the nf CLI version as JSON",
        long_about = r#"Print the CLI package version and optional build metadata.

USAGE:
    nf version

EXAMPLES:
    nf version

EXPECTED JSON:
    {"version":"0.2.0","git_hash":null,"build_date":null}

COMMON ERRORS:
    - build metadata missing -> hint: version is still valid; git_hash/build_date may be null"#
    )]
    Version,
}

#[derive(Debug, Args)]
pub struct ProjectEpisodeFilter {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug filter, for example next-frame"
    )]
    pub project: Option<String>,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug filter, for example ep-01; use with --project"
    )]
    pub episode: Option<String>,
}

#[derive(Debug, Args)]
pub struct WindowTargetArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that identifies the target window"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug that identifies the target window"
    )]
    pub episode: String,
    #[arg(
        long,
        value_name = "ID",
        help = "Optional window id from `nf ps` when multiple windows match"
    )]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct OpenArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug, for example next-frame"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        required_unless_present = "composition",
        help = "Episode slug inside the project, for example ep-01"
    )]
    pub episode: Option<String>,
    #[arg(
        long,
        value_name = "SLUG",
        required_unless_present = "episode",
        help = "V2 composition slug inside the project, for example launch-open"
    )]
    pub composition: Option<String>,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Optional clip slug to select after opening"
    )]
    pub clip: Option<String>,
    #[arg(
        long,
        value_name = "SEC",
        help = "Optional playhead time in seconds, for example 12.45"
    )]
    pub t: Option<f64>,
    #[arg(
        long,
        help = "Force a new window even if this project episode is already open"
    )]
    pub new_window: bool,
}

#[derive(Debug, Args)]
pub struct ScreenshotArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug for the target window")]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug for the target window")]
    pub episode: String,
    #[arg(
        long,
        default_value = "full",
        value_name = "AREA",
        help = "Capture region: full, topbar, clips, log, timeline, inspector, or preview"
    )]
    pub region: String,
    #[arg(
        long,
        default_value = "-",
        value_name = "PATH",
        help = "Output path; - writes PNG base64 JSON to stdout"
    )]
    pub out: String,
    #[arg(long, value_name = "ID", help = "Optional window id from `nf ps`")]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct CaptureArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug for the target window")]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug for the target window")]
    pub episode: String,
    #[arg(long, value_name = "PATH", help = "Output PNG path")]
    pub out: std::path::PathBuf,
    #[arg(
        long = "window-id",
        value_name = "ID",
        help = "Optional window id from `nf ps`"
    )]
    pub window_id: Option<String>,
}

#[derive(Debug, Args)]
pub struct KaraokeArgs {
    #[arg(
        help = "Episode directory path containing clips/ and sources/",
        value_name = "EPISODE_DIR"
    )]
    pub episode_dir: std::path::PathBuf,
}

#[derive(Debug, Args)]
pub struct ExportArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug to export")]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        required_unless_present = "composition",
        help = "Episode slug to export"
    )]
    pub episode: Option<String>,
    #[arg(
        long,
        value_name = "SLUG",
        required_unless_present = "episode",
        help = "V2 composition slug to export"
    )]
    pub composition: Option<String>,
    #[arg(long, value_name = "PATH", help = "Output MP4 path")]
    pub out: std::path::PathBuf,
    #[arg(
        long,
        value_name = "PROFILE",
        default_value = "final",
        help = "Export profile: draft, standard, final, final-fast"
    )]
    pub profile: String,
    #[arg(
        long,
        value_name = "RES",
        help = "Override profile resolution: 720p, 1080p or 4k"
    )]
    pub resolution: Option<String>,
    #[arg(long, value_name = "FPS", help = "Override profile fps: 30 or 60")]
    pub fps: Option<u32>,
    #[arg(
        long,
        value_name = "N",
        help = "Override profile parallel workers; 1 disables recorder slicing"
    )]
    pub parallel: Option<usize>,
    #[arg(
        long,
        help = "Print recorder JSONL progress events before the final summary JSON"
    )]
    pub events: bool,
}

#[derive(Debug, Args)]
pub struct ExportStatusArgs {
    #[arg(
        long = "job-id",
        value_name = "ID",
        help = "Export job id returned by export.start"
    )]
    pub job_id: String,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug for the target window")]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug for the target window")]
    pub episode: String,
    #[arg(
        long,
        value_name = "CSS",
        help = "CSS selector; supports ::shadow across web component shadow roots"
    )]
    pub selector: String,
    #[arg(long, value_name = "ID", help = "Optional window id from `nf ps`")]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct SelectArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug for the target window")]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug for the target window")]
    pub episode: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Clip slug to select, for example intro"
    )]
    pub clip: String,
}

#[derive(Debug, Args)]
pub struct TabArgs {
    #[arg(
        long = "switch",
        value_name = "TAB",
        help = "Target tab: script, slice, voice, or edit"
    )]
    pub switch_to: TabName,
    #[arg(long, value_name = "SLUG", help = "Project slug for the target window")]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug for the target window")]
    pub episode: String,
}

#[derive(Debug, Clone, ValueEnum)]
pub enum TabName {
    Script,
    Slice,
    Voice,
    Edit,
}

impl TabName {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Script => "script",
            Self::Slice => "slice",
            Self::Voice => "voice",
            Self::Edit => "edit",
        }
    }
}

#[derive(Debug, Args)]
pub struct StateArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug for the target window")]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug for the target window")]
    pub episode: String,
    #[arg(
        long,
        value_name = "PATH",
        help = "State dot path, for example topbar.current-tab"
    )]
    pub key: String,
    #[arg(long, value_name = "ID", help = "Optional window id from `nf ps`")]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct DevtoolsArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug for the target window")]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug for the target window")]
    pub episode: String,
    #[arg(
        long,
        value_name = "CSS",
        help = "CSS selector; supports ::shadow across web component shadow roots"
    )]
    pub query: String,
    #[arg(
        long,
        default_value = "outerHTML",
        value_name = "PROP",
        help = "Value to read: outerHTML, shadowRoot, attributes, computed-style, bounding-rect, or custom-elements"
    )]
    pub get: String,
    #[arg(
        long,
        value_name = "ACTION",
        help = "Optional mutation action: append-style, remove, set-css-var, or fill"
    )]
    pub action: Option<String>,
    #[arg(long, value_name = "VALUE", help = "Value used with --action")]
    pub value: Option<String>,
    #[arg(
        long,
        value_name = "VALUE",
        help = "Shortcut for --action=fill --value=<VALUE>"
    )]
    pub fill: Option<String>,
    #[arg(long, value_name = "ID", help = "Optional window id from `nf ps`")]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct HelpArgs {
    #[arg(
        value_name = "COMMAND",
        help = "Optional command topic, for example projects create"
    )]
    pub topic: Vec<String>,
    #[arg(long, help = "Emit structured JSON help instead of text")]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct DoctorArgs {
    #[arg(
        long,
        help = "Print a human-readable environment report instead of JSON"
    )]
    pub human: bool,
    #[arg(
        long,
        hide = true,
        help = "Deprecated: JSON is the default output format"
    )]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct SlugProjectArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug, for example next-frame"
    )]
    pub project: String,
}

#[derive(Debug, Args)]
pub struct SlugProjectEpisodeArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug, for example next-frame"
    )]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug, for example ep-01")]
    pub episode: String,
}

#[derive(Debug, Args)]
pub struct CompositionCommand {
    #[command(subcommand)]
    pub command: CompositionSubcommand,
}

#[derive(Debug, Subcommand)]
pub enum CompositionSubcommand {
    #[command(about = "Show a v2 composition, track, or field")]
    Show(CompositionShowArgs),
    #[command(about = "Patch one v2 composition track field by dot path")]
    Patch(CompositionPatchArgs),
}

#[derive(Debug, Args)]
pub struct CompositionShowArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug, for example v2-showcase"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Composition slug, for example showreel-24s"
    )]
    pub composition: String,
    #[arg(long, value_name = "ID", help = "Optional track id to return")]
    pub track: Option<String>,
    #[arg(
        long,
        value_name = "PATH",
        help = "Optional field path inside the track"
    )]
    pub field: Option<String>,
}

#[derive(Debug, Args)]
pub struct CompositionPatchArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug, for example v2-showcase"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Composition slug, for example showreel-24s"
    )]
    pub composition: String,
    #[arg(long, value_name = "ID", help = "Track id to patch")]
    pub track: String,
    #[arg(
        long,
        value_name = "PATH",
        help = "Field path, for example params.title or style.x"
    )]
    pub field: String,
    #[arg(
        long,
        value_name = "VALUE",
        help = "JSON scalar/object or raw string value"
    )]
    pub value: String,
}

#[derive(Debug, Subcommand)]
pub enum ProjectSubcommand {
    #[command(
        about = "List all registered projects",
        long_about = r#"List all registered projects without opening a window.

USAGE:
    nf projects list

EXAMPLES:
    nf projects list
    nf projects list | jq '.[].slug'

EXPECTED JSON:
    [{"slug":"next-frame","name":"NextFrame","episodes_count":1}]

COMMON ERRORS:
    - registry unreadable -> exit 1 · hint: run `nf doctor` and inspect ~/.nextframe/registry.json"#
    )]
    List,
    #[command(
        about = "List episodes for one project",
        long_about = r#"List episode summaries for a project.

USAGE:
    nf projects episodes --project=<slug>

EXAMPLES:
    nf projects episodes --project=next-frame
    nf projects episodes --project=demo-video | jq '.[].slug'

EXPECTED JSON:
    [{"slug":"ep-01","name":"Episode 1","duration":60.0,"clips_count":7}]

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`"#
    )]
    Episodes(SlugProjectArgs),
    #[command(
        about = "List clips for one project episode",
        long_about = r#"List clip summaries for an episode through the projects namespace.

USAGE:
    nf projects clips --project=<slug> --episode=<slug>

EXAMPLES:
    nf projects clips --project=next-frame --episode=ep-01
    nf projects clips --project=demo-video --episode=ep-01 | jq '.[].slug'

EXPECTED JSON:
    [{"slug":"intro","label":"Intro","track":"scene","start":0.0,"end":5.0}]

COMMON ERRORS:
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`"#
    )]
    Clips(SlugProjectEpisodeArgs),
    #[command(
        about = "Show project metadata and episode list",
        long_about = r#"Show one project's metadata, tags, timestamps, and episodes.

USAGE:
    nf projects show --project=<slug>

EXAMPLES:
    nf projects show --project=next-frame
    nf projects show --project=demo-video | jq .episodes

EXPECTED JSON:
    {"slug":"next-frame","name":"NextFrame","episodes":[{"slug":"ep-01"}]}

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`"#
    )]
    Show(SlugProjectArgs),
    #[command(
        about = "Create a new project",
        long_about = r#"Create a new project directory, project.json, and registry entry.

USAGE:
    nf projects create --slug=<id> --name=<name> [--description=<text>] [--tags=<csv>]

EXAMPLES:
    nf projects create --slug=demo-video --name='Demo Video'
    nf projects create --slug=launch-cut --name='Launch Cut' --description='Product launch' --tags=demo,launch

EXPECTED JSON:
    {"slug":"demo-video","name":"Demo Video","path":"~/.nextframe/demo-video/project.json"}

COMMON ERRORS:
    - slug already exists -> exit 6 · hint: `nf projects show --project=<slug>` or choose another slug
    - invalid slug -> exit 2 · hint: use lowercase letters, numbers, and hyphens"#
    )]
    Create(ProjectCreateArgs),
    #[command(
        about = "Rename a project without changing its slug",
        long_about = r#"Change the human-readable project name. The project slug remains stable.

USAGE:
    nf projects rename --project=<slug> --name=<new-name>

EXAMPLES:
    nf projects rename --project=demo-video --name='Demo Video v2'
    nf projects show --project=demo-video

EXPECTED JSON:
    {"slug":"demo-video","name":"Demo Video v2"}

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`
    - empty name -> exit 2 · hint: pass a non-empty --name"#
    )]
    Rename(ProjectRenameArgs),
    #[command(
        about = "Archive a project without hard deleting files",
        long_about = r#"Move a project into the archive area so it is hidden from active listings.

USAGE:
    nf projects archive --project=<slug>

EXAMPLES:
    nf projects archive --project=demo-video
    nf projects list

EXPECTED JSON:
    {"slug":"demo-video","archived":true}

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`
    - archived slug exists -> exit 6 · hint: remove or restore the archived project first"#
    )]
    Archive(SlugProjectArgs),
    #[command(
        about = "Permanently delete a project after explicit confirmation",
        long_about = r#"Hard delete a project directory. This is irreversible and requires --confirm.

USAGE:
    nf projects delete --project=<slug> --confirm

EXAMPLES:
    nf projects delete --project=demo-video --confirm
    nf projects list

EXPECTED JSON:
    {"slug":"demo-video","deleted":true}

COMMON ERRORS:
    - missing --confirm -> exit 7 · hint: rerun with `--confirm` only when deletion is intended
    - unknown project -> exit 5 · hint: run `nf projects list`"#
    )]
    Delete(ProjectDeleteArgs),
}

#[derive(Debug, Args)]
pub struct ProjectCommand {
    #[command(subcommand)]
    pub command: ProjectSubcommand,
}

#[derive(Debug, Args)]
pub struct ProjectCreateArgs {
    #[arg(
        long,
        value_name = "ID",
        help = "Unique project slug; lowercase letters, numbers, and hyphens"
    )]
    pub slug: String,
    #[arg(
        long,
        value_name = "NAME",
        help = "Human-readable project name, for example 'Demo Video'"
    )]
    pub name: String,
    #[arg(long, value_name = "TEXT", help = "Optional project description")]
    pub description: Option<String>,
    #[arg(
        long,
        value_name = "CSV",
        help = "Optional comma-separated tags, for example demo,launch"
    )]
    pub tags: Option<String>,
}

#[derive(Debug, Args)]
pub struct ProjectRenameArgs {
    #[arg(long, value_name = "SLUG", help = "Existing project slug to rename")]
    pub project: String,
    #[arg(long, value_name = "NAME", help = "New human-readable project name")]
    pub name: String,
}

#[derive(Debug, Args)]
pub struct ProjectDeleteArgs {
    #[arg(long, value_name = "SLUG", help = "Project slug to permanently delete")]
    pub project: String,
    #[arg(long, help = "Required confirmation flag for irreversible deletion")]
    pub confirm: bool,
}

#[derive(Debug, Subcommand)]
pub enum EpisodeSubcommand {
    #[command(
        about = "List episodes in a project",
        long_about = r#"List all episodes in a project.

USAGE:
    nf episodes list --project=<slug>

EXAMPLES:
    nf episodes list --project=next-frame
    nf episodes list --project=demo-video | jq '.[].slug'

EXPECTED JSON:
    [{"slug":"ep-01","name":"Episode 1","duration":60.0,"clips_count":7}]

COMMON ERRORS:
    - unknown project -> exit 5 · hint: run `nf projects list`"#
    )]
    List(SlugProjectArgs),
    #[command(
        about = "Show one episode with clips, anchors, and log",
        long_about = r#"Show one episode's metadata, anchors, clips, and log entries.

USAGE:
    nf episodes show --project=<slug> --episode=<slug>

EXAMPLES:
    nf episodes show --project=next-frame --episode=ep-01
    nf episodes show --project=demo-video --episode=ep-01 | jq .clips

EXPECTED JSON:
    {"slug":"ep-01","name":"Episode 1","anchors":{},"clips":[],"log":[]}

COMMON ERRORS:
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`"#
    )]
    Show(SlugProjectEpisodeArgs),
    #[command(
        about = "Create a new episode in a project",
        long_about = r#"Create a new episode JSON file inside a project.

USAGE:
    nf episodes create --project=<slug> --slug=<id> --name=<name> [--duration=<sec>]

EXAMPLES:
    nf episodes create --project=next-frame --slug=ep-02 --name='Episode 2' --duration=90
    nf episodes create --project=demo-video --slug=ep-01 --name='Pilot'

EXPECTED JSON:
    {"project":"next-frame","slug":"ep-02","name":"Episode 2","duration":90.0}

COMMON ERRORS:
    - slug already exists -> exit 6 · hint: run `nf episodes show --project=<slug> --episode=<slug>`
    - invalid duration -> exit 2 · hint: pass seconds such as `--duration=90`"#
    )]
    Create(EpisodeCreateArgs),
    #[command(
        about = "Rename an episode without changing its slug",
        long_about = r#"Change the human-readable episode name. The episode slug remains stable.

USAGE:
    nf episodes rename --project=<slug> --episode=<slug> --name=<new-name>

EXAMPLES:
    nf episodes rename --project=next-frame --episode=ep-01 --name='Intro Cut'
    nf episodes show --project=next-frame --episode=ep-01

EXPECTED JSON:
    {"project":"next-frame","slug":"ep-01","name":"Intro Cut"}

COMMON ERRORS:
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`
    - empty name -> exit 2 · hint: pass a non-empty --name"#
    )]
    Rename(EpisodeRenameArgs),
    #[command(
        about = "Archive an episode without hard deleting it",
        long_about = r#"Move an episode to the archive area for its project.

USAGE:
    nf episodes archive --project=<slug> --episode=<slug>

EXAMPLES:
    nf episodes archive --project=next-frame --episode=ep-01
    nf episodes list --project=next-frame

EXPECTED JSON:
    {"project":"next-frame","episode":"ep-01","archived":true}

COMMON ERRORS:
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`
    - archived slug exists -> exit 6 · hint: remove or restore the archived episode first"#
    )]
    Archive(SlugProjectEpisodeArgs),
    #[command(
        about = "Permanently delete an episode after explicit confirmation",
        long_about = r#"Hard delete one episode JSON file. This is irreversible and requires --confirm.

USAGE:
    nf episodes delete --project=<slug> --episode=<slug> --confirm

EXAMPLES:
    nf episodes delete --project=next-frame --episode=ep-01 --confirm
    nf episodes list --project=next-frame

EXPECTED JSON:
    {"project":"next-frame","episode":"ep-01","deleted":true}

COMMON ERRORS:
    - missing --confirm -> exit 7 · hint: rerun with `--confirm` only when deletion is intended
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`"#
    )]
    Delete(EpisodeDeleteArgs),
}

#[derive(Debug, Args)]
pub struct EpisodeCommand {
    #[command(subcommand)]
    pub command: EpisodeSubcommand,
}

#[derive(Debug, Args)]
pub struct EpisodeCreateArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that will contain the episode"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "ID",
        help = "Unique episode slug inside the project, for example ep-01"
    )]
    pub slug: String,
    #[arg(long, value_name = "NAME", help = "Human-readable episode name")]
    pub name: Option<String>,
    #[arg(
        long,
        default_value_t = 60.0,
        value_name = "SEC",
        help = "Episode duration in seconds"
    )]
    pub duration: f64,
}

#[derive(Debug, Args)]
pub struct EpisodeRenameArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode"
    )]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug to rename")]
    pub episode: String,
    #[arg(long, value_name = "NAME", help = "New human-readable episode name")]
    pub name: String,
}

#[derive(Debug, Args)]
pub struct EpisodeDeleteArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode"
    )]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug to permanently delete")]
    pub episode: String,
    #[arg(long, help = "Required confirmation flag for irreversible deletion")]
    pub confirm: bool,
}

#[derive(Debug, Subcommand)]
pub enum ClipSubcommand {
    #[command(
        about = "List clips in an episode",
        long_about = r#"List clips in one episode, optionally filtered by track.

USAGE:
    nf clips list --project=<slug> --episode=<slug> [--track=<scene|text|audio|trans>]

EXAMPLES:
    nf clips list --project=next-frame --episode=ep-01
    nf clips list --project=next-frame --episode=ep-01 --track=scene

EXPECTED JSON:
    [{"slug":"intro","label":"Intro","track":"scene","start":0.0,"end":5.0}]

COMMON ERRORS:
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`
    - invalid track -> exit 2 · hint: use scene, text, audio, or trans"#
    )]
    List(ClipListArgs),
    #[command(
        about = "Show one clip",
        long_about = r#"Show one clip's timing, label, track, effects, and related metadata.

USAGE:
    nf clips show --project=<slug> --episode=<slug> --clip=<slug>

EXAMPLES:
    nf clips show --project=next-frame --episode=ep-01 --clip=intro
    nf clips show --project=demo-video --episode=ep-01 --clip=title | jq .effects

EXPECTED JSON:
    {"slug":"intro","label":"Intro","track":"scene","start":0.0,"end":5.0,"effects":[]}

COMMON ERRORS:
    - unknown clip -> exit 5 · hint: run `nf clips list --project=<slug> --episode=<slug>`"#
    )]
    Show(ClipTargetArgs),
    #[command(
        about = "Create a clip in an episode timeline",
        long_about = r#"Create a timeline clip. Start and end accept seconds or anchor expressions.

USAGE:
    nf clips create --project=<slug> --episode=<slug> --slug=<id> --label=<str> --track=<scene|text|audio|trans> --start=<expr> --end=<expr> [--effects=<csv>]

EXAMPLES:
    nf clips create --project=next-frame --episode=ep-01 --slug=intro --label='Intro' --track=scene --start=0 --end=5
    nf clips create --project=next-frame --episode=ep-01 --slug=feat-4 --label='Feature 4' --track=scene --start='feat-3-end' --end='feat-3-end + 12.0'

EXPECTED JSON:
    {"slug":"intro","label":"Intro","track":"scene","start":0.0,"end":5.0}

COMMON ERRORS:
    - slug already exists -> exit 6 · hint: choose another clip slug or show the existing clip
    - invalid anchor expression -> exit 2 · hint: run `nf anchors list --project=<slug> --episode=<slug>`"#
    )]
    Create(ClipCreateArgs),
    #[command(
        about = "Update selected fields on a clip",
        long_about = r#"Update only the clip fields supplied on the command line.

USAGE:
    nf clips update --project=<slug> --episode=<slug> --clip=<slug> [--start=<expr>] [--end=<expr>] [--label=<str>] [--effects=<csv>] [--x=<percent> --y=<percent>]

EXAMPLES:
    nf clips update --project=next-frame --episode=ep-01 --clip=intro --label='Opening'
    nf clips update --project=next-frame --episode=ep-01 --clip=intro --start=1.0 --end='intro-end'
    nf clips update --project=next-frame --episode=ep-01 --clip=intro --x=42 --y=58

EXPECTED JSON:
    {"slug":"intro","label":"Opening","start":1.0,"end":5.0}

COMMON ERRORS:
    - unknown clip -> exit 5 · hint: run `nf clips list --project=<slug> --episode=<slug>`
    - no fields supplied -> exit 2 · hint: pass at least one of --start, --end, --label, --effects"#
    )]
    Update(ClipUpdateArgs),
    #[command(
        about = "Delete a clip after explicit confirmation",
        long_about = r#"Delete one timeline clip. This is irreversible and requires --confirm.

USAGE:
    nf clips delete --project=<slug> --episode=<slug> --clip=<slug> --confirm

EXAMPLES:
    nf clips delete --project=next-frame --episode=ep-01 --clip=intro --confirm
    nf clips list --project=next-frame --episode=ep-01

EXPECTED JSON:
    {"slug":"intro","deleted":true}

COMMON ERRORS:
    - missing --confirm -> exit 7 · hint: rerun with `--confirm` only when deletion is intended
    - unknown clip -> exit 5 · hint: run `nf clips list --project=<slug> --episode=<slug>`"#
    )]
    Delete(ClipDeleteArgs),
}

#[derive(Debug, Args)]
pub struct ClipCommand {
    #[command(subcommand)]
    pub command: ClipSubcommand,
}

#[derive(Debug, Args)]
pub struct ClipListArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode"
    )]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug to list clips from")]
    pub episode: String,
    #[arg(
        long,
        value_name = "TRACK",
        help = "Optional track filter: scene, text, audio, or trans"
    )]
    pub track: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClipTargetArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the clip"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug that contains the clip"
    )]
    pub episode: String,
    #[arg(long, value_name = "SLUG", help = "Clip slug, for example intro")]
    pub clip: String,
}

#[derive(Debug, Args)]
pub struct ClipCreateArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode"
    )]
    pub project: String,
    #[arg(long, value_name = "SLUG", help = "Episode slug to add the clip to")]
    pub episode: String,
    #[arg(long, value_name = "ID", help = "Unique clip slug inside the episode")]
    pub slug: String,
    #[arg(long, value_name = "LABEL", help = "Human-readable clip label")]
    pub label: String,
    #[arg(
        long,
        value_name = "TRACK",
        help = "Track: scene, text, audio, or trans"
    )]
    pub track: String,
    #[arg(
        long,
        value_name = "EXPR",
        help = "Start time in seconds or anchor expression, for example 0 or intro-end + 0.5"
    )]
    pub start: String,
    #[arg(
        long,
        value_name = "EXPR",
        help = "End time in seconds or anchor expression, for example 5 or intro-end"
    )]
    pub end: String,
    #[arg(long, value_name = "CSV", help = "Optional comma-separated effects")]
    pub effects: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClipUpdateArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the clip"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug that contains the clip"
    )]
    pub episode: String,
    #[arg(long, value_name = "SLUG", help = "Clip slug to update")]
    pub clip: String,
    #[arg(
        long,
        value_name = "EXPR",
        help = "Optional new start time in seconds or anchor expression"
    )]
    pub start: Option<String>,
    #[arg(
        long,
        value_name = "EXPR",
        help = "Optional new end time in seconds or anchor expression"
    )]
    pub end: Option<String>,
    #[arg(
        long,
        value_name = "LABEL",
        help = "Optional new human-readable clip label"
    )]
    pub label: Option<String>,
    #[arg(
        long,
        value_name = "CSV",
        help = "Optional replacement comma-separated effects"
    )]
    pub effects: Option<String>,
    #[arg(
        long,
        value_name = "PERCENT",
        help = "Optional title X position in percent"
    )]
    pub x: Option<f64>,
    #[arg(
        long,
        value_name = "PERCENT",
        help = "Optional title Y position in percent"
    )]
    pub y: Option<f64>,
}

#[derive(Debug, Args)]
pub struct ClipDeleteArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the clip"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug that contains the clip"
    )]
    pub episode: String,
    #[arg(long, value_name = "SLUG", help = "Clip slug to delete")]
    pub clip: String,
    #[arg(long, help = "Required confirmation flag for irreversible deletion")]
    pub confirm: bool,
}

#[derive(Debug, Subcommand)]
pub enum AnchorSubcommand {
    #[command(
        about = "List anchors in an episode",
        long_about = r#"List all named time anchors in an episode.

USAGE:
    nf anchors list --project=<slug> --episode=<slug>

EXAMPLES:
    nf anchors list --project=next-frame --episode=ep-01
    nf anchors list --project=demo-video --episode=ep-01 | jq 'keys'

EXPECTED JSON:
    {"intro-end":5.0,"feat-1-end":14.5}

COMMON ERRORS:
    - unknown episode -> exit 5 · hint: run `nf episodes list --project=<slug>`"#
    )]
    List(SlugProjectEpisodeArgs),
    #[command(
        about = "Create or update an episode time anchor",
        long_about = r#"Set an anchor to a time in seconds. Existing anchors are updated.

USAGE:
    nf anchors set --project=<slug> --episode=<slug> --name=<id> --time=<sec>

EXAMPLES:
    nf anchors set --project=next-frame --episode=ep-01 --name=intro-end --time=5.0
    nf anchors list --project=next-frame --episode=ep-01

EXPECTED JSON:
    {"name":"intro-end","time":5.0}

COMMON ERRORS:
    - invalid anchor name -> exit 2 · hint: use lowercase letters, numbers, and hyphens
    - invalid time -> exit 2 · hint: pass seconds such as `--time=14.5`"#
    )]
    Set(AnchorSetArgs),
    #[command(
        about = "Remove an episode time anchor",
        long_about = r#"Remove an anchor after ensuring no clip start or end expression references it.

USAGE:
    nf anchors unset --project=<slug> --episode=<slug> --name=<id>

EXAMPLES:
    nf anchors unset --project=next-frame --episode=ep-01 --name=intro-end
    nf anchors list --project=next-frame --episode=ep-01

EXPECTED JSON:
    {"name":"intro-end","deleted":true}

COMMON ERRORS:
    - anchor still referenced -> exit 8 · hint: run `nf clips update` to move references first
    - unknown anchor -> exit 5 · hint: run `nf anchors list --project=<slug> --episode=<slug>`"#
    )]
    Unset(AnchorUnsetArgs),
}

#[derive(Debug, Args)]
pub struct AnchorCommand {
    #[command(subcommand)]
    pub command: AnchorSubcommand,
}

#[derive(Debug, Args)]
pub struct AnchorSetArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug that contains the anchor"
    )]
    pub episode: String,
    #[arg(long, value_name = "ID", help = "Anchor name, for example intro-end")]
    pub name: String,
    #[arg(
        long,
        value_name = "SEC",
        help = "Anchor time in seconds, for example 14.5"
    )]
    pub time: f64,
}

#[derive(Debug, Args)]
pub struct AnchorUnsetArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug that contains the anchor"
    )]
    pub episode: String,
    #[arg(
        long,
        value_name = "ID",
        help = "Anchor name to remove, for example intro-end"
    )]
    pub name: String,
}

#[derive(Debug, Subcommand)]
pub enum LogSubcommand {
    #[command(
        about = "Tail recent operation log entries",
        long_about = r#"Read recent operation log entries, optionally filtered by actor or start time.

USAGE:
    nf log tail --project=<slug> --episode=<slug> [--limit=<n>] [--actor=<AI|human>] [--since=<iso>]

EXAMPLES:
    nf log tail --project=next-frame --episode=ep-01 --limit=5
    nf log tail --project=next-frame --episode=ep-01 --actor=AI --since=2026-04-21T00:00:00Z

EXPECTED JSON:
    [{"id":"log-001","time":"2026-04-21T00:00:00Z","actor":"AI","status":"done"}]

COMMON ERRORS:
    - invalid limit -> exit 2 · hint: pass a positive integer such as `--limit=20`
    - invalid since -> exit 2 · hint: pass an ISO datetime"#
    )]
    Tail(LogTailArgs),
    #[command(
        about = "Show one operation log entry",
        long_about = r#"Show a single operation log entry by id.

USAGE:
    nf log show --project=<slug> --episode=<slug> --id=<entry-id>

EXAMPLES:
    nf log show --project=next-frame --episode=ep-01 --id=log-001
    nf log tail --project=next-frame --episode=ep-01 --limit=1

EXPECTED JSON:
    {"id":"log-001","actor":"AI","desc":"Created intro","cli":"nf clips create ..."}

COMMON ERRORS:
    - unknown log entry -> exit 5 · hint: run `nf log tail --project=<slug> --episode=<slug>`"#
    )]
    Show(LogShowArgs),
    #[command(
        about = "Append an operation log entry",
        long_about = r#"Append a manual operation log entry for development and tests.

USAGE:
    nf log create --project=<slug> --episode=<slug> --actor=<AI|human> --desc=<str> --cli=<str> [--status=<pending|done|failed>]

EXAMPLES:
    nf log create --project=next-frame --episode=ep-01 --actor=AI --desc='Created intro' --cli='nf clips create ...' --status=done
    nf log tail --project=next-frame --episode=ep-01 --limit=1

EXPECTED JSON:
    {"id":"log-002","actor":"AI","desc":"Created intro","status":"done"}

COMMON ERRORS:
    - invalid actor -> exit 2 · hint: use AI or human
    - empty desc or cli -> exit 2 · hint: pass a concise description and the command string"#
    )]
    Create(LogCreateArgs),
}

#[derive(Debug, Args)]
pub struct LogCommand {
    #[command(subcommand)]
    pub command: LogSubcommand,
}

#[derive(Debug, Args)]
pub struct LogTailArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode log"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug whose log should be read"
    )]
    pub episode: String,
    #[arg(
        long,
        default_value_t = 20,
        value_name = "N",
        help = "Maximum entries to return"
    )]
    pub limit: usize,
    #[arg(
        long,
        value_name = "ACTOR",
        help = "Optional actor filter: AI or human"
    )]
    pub actor: Option<String>,
    #[arg(long, value_name = "ISO", help = "Optional ISO datetime lower bound")]
    pub since: Option<String>,
}

#[derive(Debug, Args)]
pub struct LogShowArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode log"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug whose log should be read"
    )]
    pub episode: String,
    #[arg(long, value_name = "ID", help = "Log entry id from `nf log tail`")]
    pub id: String,
}

#[derive(Debug, Args)]
pub struct LogCreateArgs {
    #[arg(
        long,
        value_name = "SLUG",
        help = "Project slug that contains the episode log"
    )]
    pub project: String,
    #[arg(
        long,
        value_name = "SLUG",
        help = "Episode slug whose log should be appended"
    )]
    pub episode: String,
    #[arg(
        long,
        value_name = "ACTOR",
        help = "Actor string, expected AI or human"
    )]
    pub actor: String,
    #[arg(
        long,
        value_name = "TEXT",
        help = "Human-readable operation description"
    )]
    pub desc: String,
    #[arg(
        long,
        value_name = "CMD",
        help = "CLI command string that caused the log entry"
    )]
    pub cli: String,
    #[arg(
        long,
        value_name = "STATUS",
        help = "Optional status: pending, done, or failed"
    )]
    pub status: Option<String>,
}

pub fn print_json(value: &Value) -> Result<(), NfError> {
    let output = serde_json::to_string(value)?;
    println!("{output}");
    Ok(())
}

pub fn send_ipc(op: &str, params: Value) -> Result<(), NfError> {
    let resp = ipc_client::send(ipc_client::request(op, params))?;
    print_ipc_response(resp)
}

fn print_ipc_response(resp: IpcResponse) -> Result<(), NfError> {
    if resp.ok {
        let value = resp.data.unwrap_or_else(|| serde_json::json!({}));
        return print_json(&value);
    }

    match resp.error {
        Some(value) => Err(remote_error(value)),
        None => Err(NfError::SocketFailed(
            "IPC server returned an unknown error".to_string(),
        )),
    }
}

fn remote_error(value: Value) -> NfError {
    let Some(object) = value.as_object() else {
        return NfError::SocketFailed(value.to_string());
    };

    NfError::Remote {
        error: object
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("remote error")
            .to_string(),
        detail: object
            .get("detail")
            .and_then(Value::as_str)
            .unwrap_or("IPC server returned an error")
            .to_string(),
        hint: object
            .get("hint")
            .and_then(Value::as_str)
            .unwrap_or("run `nf help <command>` for supported operations")
            .to_string(),
        exit_code: object
            .get("exit_code")
            .and_then(Value::as_u64)
            .and_then(|code| u8::try_from(code).ok())
            .unwrap_or(1),
    }
}
