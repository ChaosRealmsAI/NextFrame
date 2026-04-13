/* === state.js === */
const DESKTOP_CONNECT_MESSAGE = "Connect via desktop app to load projects";
const NO_PROJECTS_MESSAGE = "No projects — create one with `nextframe project-new <name>`";
const IPC_HOME_TIMEOUT_MS = 1500;
const IPC_LOAD_TIMEOUT_MS = 4000;
const IPC_POLL_TIMEOUT_MS = 1200;
const IPC_COMPOSE_TIMEOUT_MS = 20000;
const HOME_RETRY_DELAY_MS = 500;
const HOME_RETRY_COUNT = 3;
const ACCENT_NAMES = ["accent", "warm", "blue"];
const GLOW_NAMES = ["glow-accent", "glow-warm", "glow-blue"];

let TOTAL_DURATION = 26;
let isPlaying = false;
let currentTime = 2.4;
let playRAF = null;
let lastTS = null;

let playerPlaying = false;
let playerAnim = null;
let playerDur = 26;

let overlay = null;

let currentProject = null;
let currentEpisode = null;
let currentSegment = null;
let currentSegmentPath = null;
let currentTimeline = null;
let currentSelectedClipId = null;
let previewEngine = null;
let previewStageHost = null;
let previewTimeline = null;
let previewStageClickHandler = null;
let previewReloadSeq = 0;

let projectsCache = [];
let episodesCache = [];
let segmentsCache = [];
let episodesCacheProject = null;
let exportsCache = [];

let homeLoadSeq = 0;
let projectLoadSeq = 0;
let editorLoadSeq = 0;
