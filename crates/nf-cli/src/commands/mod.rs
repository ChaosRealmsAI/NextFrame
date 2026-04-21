use clap::{Args, Parser, Subcommand, ValueEnum};
use serde_json::Value;

use crate::errors::NfError;
use crate::ipc_client::{self, IpcResponse};

pub mod anchors;
pub mod app;
pub mod clips;
pub mod episodes;
pub mod log;
pub mod projects;
pub mod utility;

#[derive(Debug, Parser)]
#[command(
    name = "nf",
    version,
    about = "NextFrame CLI",
    disable_help_subcommand = true
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Open(OpenArgs),
    Ps(ProjectEpisodeFilter),
    Screenshot(ScreenshotArgs),
    Click(ClickArgs),
    Select(SelectArgs),
    Tab(TabArgs),
    State(StateArgs),
    Devtools(DevtoolsArgs),
    Close(WindowTargetArgs),
    Quit,
    Projects(ProjectCommand),
    Episodes(EpisodeCommand),
    Clips(ClipCommand),
    Anchors(AnchorCommand),
    Log(LogCommand),
    Help(HelpArgs),
    Doctor(DoctorArgs),
    Version,
}

#[derive(Debug, Args)]
pub struct ProjectEpisodeFilter {
    #[arg(long)]
    pub project: Option<String>,
    #[arg(long)]
    pub episode: Option<String>,
}

#[derive(Debug, Args)]
pub struct WindowTargetArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct OpenArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub clip: Option<String>,
    #[arg(long)]
    pub t: Option<f64>,
    #[arg(long)]
    pub new_window: bool,
}

#[derive(Debug, Args)]
pub struct ScreenshotArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long, default_value = "full")]
    pub region: String,
    #[arg(long, default_value = "-")]
    pub out: String,
    #[arg(long)]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClickArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub selector: String,
    #[arg(long)]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct SelectArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub clip: String,
}

#[derive(Debug, Args)]
pub struct TabArgs {
    #[arg(long = "switch")]
    pub switch_to: TabName,
    #[arg(long)]
    pub project: String,
    #[arg(long)]
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
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub key: String,
    #[arg(long)]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct DevtoolsArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub query: String,
    #[arg(long, default_value = "outerHTML")]
    pub get: String,
    #[arg(long)]
    pub action: Option<String>,
    #[arg(long)]
    pub value: Option<String>,
    #[arg(long)]
    pub window: Option<String>,
}

#[derive(Debug, Args)]
pub struct HelpArgs {
    pub topic: Vec<String>,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct DoctorArgs {
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct SlugProjectArgs {
    #[arg(long)]
    pub project: String,
}

#[derive(Debug, Args)]
pub struct SlugProjectEpisodeArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
}

#[derive(Debug, Subcommand)]
pub enum ProjectSubcommand {
    List,
    Episodes(SlugProjectArgs),
    Clips(SlugProjectEpisodeArgs),
    Show(SlugProjectArgs),
    Create(ProjectCreateArgs),
    Rename(ProjectRenameArgs),
    Archive(SlugProjectArgs),
    Delete(ProjectDeleteArgs),
}

#[derive(Debug, Args)]
pub struct ProjectCommand {
    #[command(subcommand)]
    pub command: ProjectSubcommand,
}

#[derive(Debug, Args)]
pub struct ProjectCreateArgs {
    #[arg(long)]
    pub slug: String,
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub description: Option<String>,
    #[arg(long)]
    pub tags: Option<String>,
}

#[derive(Debug, Args)]
pub struct ProjectRenameArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub name: String,
}

#[derive(Debug, Args)]
pub struct ProjectDeleteArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub confirm: bool,
}

#[derive(Debug, Subcommand)]
pub enum EpisodeSubcommand {
    List(SlugProjectArgs),
    Show(SlugProjectEpisodeArgs),
    Create(EpisodeCreateArgs),
    Rename(EpisodeRenameArgs),
    Archive(SlugProjectEpisodeArgs),
    Delete(EpisodeDeleteArgs),
}

#[derive(Debug, Args)]
pub struct EpisodeCommand {
    #[command(subcommand)]
    pub command: EpisodeSubcommand,
}

#[derive(Debug, Args)]
pub struct EpisodeCreateArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub slug: String,
    #[arg(long)]
    pub name: String,
    #[arg(long, default_value_t = 60.0)]
    pub duration: f64,
}

#[derive(Debug, Args)]
pub struct EpisodeRenameArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub name: String,
}

#[derive(Debug, Args)]
pub struct EpisodeDeleteArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub confirm: bool,
}

#[derive(Debug, Subcommand)]
pub enum ClipSubcommand {
    List(ClipListArgs),
    Show(ClipTargetArgs),
    Create(ClipCreateArgs),
    Update(ClipUpdateArgs),
    Delete(ClipDeleteArgs),
}

#[derive(Debug, Args)]
pub struct ClipCommand {
    #[command(subcommand)]
    pub command: ClipSubcommand,
}

#[derive(Debug, Args)]
pub struct ClipListArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub track: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClipTargetArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub clip: String,
}

#[derive(Debug, Args)]
pub struct ClipCreateArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub slug: String,
    #[arg(long)]
    pub label: String,
    #[arg(long)]
    pub track: String,
    #[arg(long)]
    pub start: String,
    #[arg(long)]
    pub end: String,
    #[arg(long)]
    pub effects: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClipUpdateArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub clip: String,
    #[arg(long)]
    pub start: Option<String>,
    #[arg(long)]
    pub end: Option<String>,
    #[arg(long)]
    pub label: Option<String>,
    #[arg(long)]
    pub effects: Option<String>,
}

#[derive(Debug, Args)]
pub struct ClipDeleteArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub clip: String,
    #[arg(long)]
    pub confirm: bool,
}

#[derive(Debug, Subcommand)]
pub enum AnchorSubcommand {
    List(SlugProjectEpisodeArgs),
    Set(AnchorSetArgs),
    Unset(AnchorUnsetArgs),
}

#[derive(Debug, Args)]
pub struct AnchorCommand {
    #[command(subcommand)]
    pub command: AnchorSubcommand,
}

#[derive(Debug, Args)]
pub struct AnchorSetArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub time: f64,
}

#[derive(Debug, Args)]
pub struct AnchorUnsetArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub name: String,
}

#[derive(Debug, Subcommand)]
pub enum LogSubcommand {
    Tail(LogTailArgs),
    Show(LogShowArgs),
    Create(LogCreateArgs),
}

#[derive(Debug, Args)]
pub struct LogCommand {
    #[command(subcommand)]
    pub command: LogSubcommand,
}

#[derive(Debug, Args)]
pub struct LogTailArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long, default_value_t = 20)]
    pub limit: usize,
    #[arg(long)]
    pub actor: Option<String>,
    #[arg(long)]
    pub since: Option<String>,
}

#[derive(Debug, Args)]
pub struct LogShowArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub id: String,
}

#[derive(Debug, Args)]
pub struct LogCreateArgs {
    #[arg(long)]
    pub project: String,
    #[arg(long)]
    pub episode: String,
    #[arg(long)]
    pub actor: String,
    #[arg(long)]
    pub desc: String,
    #[arg(long)]
    pub cli: String,
    #[arg(long)]
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
