const renderList = (items) => {
  if (!items || items.length === 0) return "";
  return items.map((item) => `  - ${item}`).join("\n");
};

const renderSection = (title, items) => {
  if (!items || items.length === 0) return "";
  return `${title}:\n${renderList(items)}`;
};

export function renderCommandHelp(name, entry) {
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

export function renderRootHelp(groups, specs, defaultFix) {
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

  lines.push("Key workflow:");
  lines.push("  1. Create or locate a segment timeline.");
  lines.push("  2. Inspect scenes with `nextframe scenes`.");
  lines.push("  3. Patch one layer at a time.");
  lines.push("  4. Run `nextframe validate` after each patch.");
  lines.push("  5. Use `nextframe preview` or `nextframe frame` to verify output.");
  lines.push("");
  lines.push(`Fix: ${defaultFix}`);
  return `${lines.join("\n")}\n`;
}
