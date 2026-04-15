// Formats CLI help text for individual commands and the root command listing.
const renderList = (items: any) => {
  if (!items || items.length === 0) return "";
  return items.map((item: any) => `  - ${item}`).join("\n");
};

const renderSection = (title: any, items: any) => {
  if (!items || items.length === 0) return "";
  return `${title}:\n${renderList(items)}`;
};

export function renderCommandHelp(name: any, entry: any) {
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

export function renderRootHelp(groups: any, specs: any, defaultFix: any) {
  const lines = [
    "nextframe — AI video editor CLI",
    "",
    "Every command is self-describing. Run `nextframe <command> --help` for params, examples, constraints, and fix guidance.",
    "",
  ];

  for (const group of groups) {
    lines.push(`${group.title}:`);
    for (const name of group.commands) {
      lines.push(`  ${name.padEnd(16)} ${specs[name].summary}`);
    }
    lines.push("");
  }

  lines.push("Video production workflow (state machine — each step must complete before next):");
  lines.push("");
  lines.push("  Step 1 — Scene inventory:");
  lines.push("    nextframe scenes --ratio=16:9                    List available scenes");
  lines.push("    Identify which scenes are missing for your video");
  lines.push("");
  lines.push("  Step 2 — Build missing scenes (repeat per scene):");
  lines.push("    nextframe scene-new <name> --ratio=16:9 --category=<cat>   Create skeleton");
  lines.push("    [edit index.js — implement render(), single responsibility]");
  lines.push("    [edit preview.html — inline render + demo params]");
  lines.push("    nextframe scene-preview <name>                   BLOCKING: verify visually");
  lines.push("    nextframe scene-validate <name>                  Must pass all checks");
  lines.push("");
  lines.push("  Step 3 — Assemble timeline:");
  lines.push("    nextframe new -o timeline.json --ratio=16:9 --duration=48");
  lines.push("    nextframe layer-add timeline.json --scene=auroraGradient --start=0 --dur=48");
  lines.push("    nextframe layer-add timeline.json --scene=slideChrome --start=0 --dur=48 ...");
  lines.push("    nextframe layer-add timeline.json --scene=codeTerminal --start=0 --dur=14 ...");
  lines.push("    [add effects: nextframe layer-set timeline.json 3 enter=fadeIn enter.dur=0.8]");
  lines.push("");
  lines.push("  Step 4 — Validate + build + preview:");
  lines.push("    nextframe validate timeline.json                 6 gates must pass");
  lines.push("    nextframe build timeline.json -o output.html     Single-file HTML");
  lines.push("    nextframe preview timeline.json                  Screenshot verification");
  lines.push("");
  lines.push("  Step 5 — Record:");
  lines.push("    nextframe render timeline.json -o output.mp4 --width=1920 --height=1080 --dpr=2");
  lines.push("");
  lines.push(`Fix: ${defaultFix}`);
  return `${lines.join("\n")}\n`;
}
