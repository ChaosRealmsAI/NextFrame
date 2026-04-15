import { GlobalFonts, createCanvas as createNapiCanvas } from "@napi-rs/canvas";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
const FONT_EXTENSIONS = new Set([".ttf", ".ttc", ".otf", ".otc"]);
const FONT_PATTERNS = {
    mono: [
        "jetbrains mono",
        "jetbrainsmono",
        "sf mono",
        "sfmono",
        "sfnsmono",
        "menlo",
        "sarasa mono",
        "sarasamono",
        "cascadia mono",
        "cascadiamono",
        "consolas",
        "noto sans mono cjk",
        "notosansmonocjk",
        "noto sans mono",
        "notosansmono",
    ],
    serif: [
        "songti",
        "宋体",
        "hiragino mincho",
        "hiraginomincho",
        "mincho",
        "noto serif cjk",
        "notoserifcjk",
        "noto serif sc",
        "notoserifsc",
        "source han serif",
        "sourcehanserif",
        "思源宋体",
        "simsun",
        "nsimsun",
        "mingliu",
        "pmingliu",
        "ukai",
        "uming",
    ],
    sans: [
        "pingfang",
        "苹方",
        "hiragino sans gb",
        "hiraginosansgb",
        "hiragino sans",
        "hiraginosans",
        "heiti",
        "黑体",
        "stheiti",
        "noto sans cjk",
        "notosanscjk",
        "noto sans sc",
        "notosanssc",
        "source han sans",
        "sourcehansans",
        "思源黑体",
        "microsoft yahei",
        "microsoftyahei",
        "微软雅黑",
        "yahei",
        "msyh",
        "simhei",
        "wenquanyi zen hei",
        "wenquanyizenhei",
        "sarasa gothic",
        "sarasagothic",
    ],
};
const FONT_ALIASES = {
    sans: ["PingFang SC", "Hiragino Sans GB", "system-ui", "-apple-system", "sans-serif"],
    serif: ["Georgia", "Hiragino Mincho ProN", "Noto Serif SC", "serif"],
    mono: ["SF Mono", "Menlo", "JetBrains Mono", "monospace"],
};
const DEFAULT_REPORT = {
    searchedRoots: [],
    matchedFonts: [],
    aliasAssignments: {},
};
let cachedReport = DEFAULT_REPORT;
let fontsInitialized = false;
function normalizeFontName(filePath) {
    const fileName = basename(filePath, extname(filePath));
    const spaced = fileName
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
        .trim();
    return {
        fileName,
        spaced,
        compact: spaced.replace(/\s+/g, ""),
    };
}
function tokenMatchIndex(filePath, tokens) {
    const normalized = normalizeFontName(filePath);
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const spaced = token.toLowerCase();
        const compact = spaced.replace(/\s+/g, "");
        if (normalized.spaced.includes(spaced) || normalized.compact.includes(compact)) {
            return i;
        }
    }
    return -1;
}
function classifyFont(filePath) {
    let best = null;
    for (const kind of ["mono", "serif", "sans"]) {
        const tokenIndex = tokenMatchIndex(filePath, FONT_PATTERNS[kind]);
        if (tokenIndex === -1)
            continue;
        if (!best || tokenIndex < best.tokenIndex) {
            best = { kind, tokenIndex };
        }
    }
    return best;
}
function getFontRoots() {
    const home = homedir();
    if (process.platform === "darwin") {
        return [
            "/System/Library/Fonts",
            "/Library/Fonts",
            join(home, "Library/Fonts"),
        ];
    }
    if (process.platform === "win32") {
        const winDir = process.env.WINDIR || "C:\\Windows";
        return [join(winDir, "Fonts")];
    }
    return [
        "/usr/share/fonts",
        join(home, ".fonts"),
        join(home, ".local/share/fonts"),
    ];
}
function scanFontDirectory(root, rootIndex, candidates) {
    if (!existsSync(root))
        return;
    const queue = [root];
    while (queue.length > 0) {
        const current = queue.pop();
        let entries = [];
        try {
            entries = readdirSync(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = join(current, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (!FONT_EXTENSIONS.has(extname(entry.name).toLowerCase()))
                continue;
            const match = classifyFont(fullPath);
            if (!match)
                continue;
            candidates.push({
                path: fullPath,
                kind: match.kind,
                name: entry.name,
                tokenIndex: match.tokenIndex,
                rootIndex,
            });
        }
    }
}
function sortCandidates(a, b) {
    if (a.tokenIndex !== b.tokenIndex)
        return a.tokenIndex - b.tokenIndex;
    if (a.rootIndex !== b.rootIndex)
        return a.rootIndex - b.rootIndex;
    return a.path.localeCompare(b.path);
}
function registerFontPath(filePath, alias) {
    try {
        return GlobalFonts.registerFromPath(filePath, alias);
    }
    catch {
        return null;
    }
}
export function ensureCanvasFonts() {
    if (fontsInitialized)
        return cachedReport;
    fontsInitialized = true;
    const searchedRoots = getFontRoots().filter((root) => existsSync(root));
    const candidates = [];
    for (const [index, root] of searchedRoots.entries()) {
        scanFontDirectory(root, index, candidates);
    }
    candidates.sort(sortCandidates);
    const seenPaths = new Set();
    const matchedFonts = [];
    for (const candidate of candidates) {
        if (seenPaths.has(candidate.path))
            continue;
        seenPaths.add(candidate.path);
        if (registerFontPath(candidate.path)) {
            matchedFonts.push(candidate.path);
        }
    }
    const aliasAssignments = {};
    for (const kind of ["sans", "serif", "mono"]) {
        const winner = candidates.find((candidate) => candidate.kind === kind);
        if (!winner)
            continue;
        for (const alias of FONT_ALIASES[kind]) {
            if (GlobalFonts.has(alias)) {
                aliasAssignments[alias] = aliasAssignments[alias] || "(existing)";
                continue;
            }
            if (registerFontPath(winner.path, alias)) {
                aliasAssignments[alias] = winner.path;
            }
        }
    }
    cachedReport = {
        searchedRoots,
        matchedFonts,
        aliasAssignments,
    };
    return cachedReport;
}
export function getCanvasFontReport() {
    return cachedReport;
}
export function createCanvas(width, height) {
    ensureCanvasFonts();
    return createNapiCanvas(width, height);
}
