import { describeEntry } from "../../catalog.js";
const meta = {
  name: "suggest",
  kind: "cli",
  description: "Prompt-to-motion suggestion stub",
};
const KEYWORDS = {
  like: [
    ["scene", "heartLike"],
    ["shape", "heart"],
  ],
  heart: [
    ["scene", "heartLike"],
    ["shape", "heart"],
  ],
  fade: [
    ["behavior", "fadeIn"],
    ["behavior", "fadeOut"],
    ["scene", "dissolveCard"],
  ],
  count: [
    ["behavior", "countUp"],
    ["scene", "statHero"],
    ["scene", "statBig"],
  ],
  grow: [
    ["behavior", "countUp"],
    ["behavior", "barGrow"],
  ],
  chart: [
    ["scene", "barChart"],
    ["scene", "lineChart"],
    ["scene", "pieChart"],
  ],
  line: [
    ["scene", "lineChart"],
    ["shape", "line"],
    ["behavior", "lineDraw"],
  ],
  pie: [
    ["scene", "pieChart"],
    ["shape", "pie"],
    ["behavior", "pieFill"],
  ],
  bar: [
    ["scene", "barChart"],
    ["shape", "bar"],
    ["behavior", "barGrow"],
  ],
  card: [
    ["scene", "dissolveCard"],
    ["scene", "pushReveal"],
  ],
  check: [
    ["scene", "animatedCheck"],
    ["shape", "check"],
  ],
  success: [
    ["scene", "successConfetti"],
    ["scene", "animatedCheck"],
  ],
  error: [
    ["scene", "errorShake"],
    ["shape", "cross"],
  ],
  load: [
    ["scene", "loadingPulse"],
    ["behavior", "pulse"],
  ],
  transition: [
    ["scene", "wipeNext"],
    ["scene", "dissolveCard"],
    ["scene", "pushReveal"],
  ],
  wipe: [
    ["scene", "wipeNext"],
    ["behavior", "wipeReveal"],
  ],
  reveal: [
    ["scene", "brandReveal"],
    ["scene", "pushReveal"],
    ["behavior", "wipeReveal"],
  ],
};
export default function suggestCmd(args = { _: [] }) {
  // TODO: add synonym packs from the recipe markdown once those become machine-readable.
  const prompt = args._.join(" ").trim().toLowerCase();
  if (!prompt)
    return void ((process.exitCode = 1),
    console.error('Fix: run nf-anim suggest "prompt text"'));
  const tokens = prompt
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length > 2 &&
          ![
            "make",
            "show",
            "with",
            "that",
            "this",
            "from",
            "the",
            "into",
            "onto",
            "user",
            "users",
          ].includes(token),
      ),
    scores = new Map(),
    why = new Map();
  for (const token of tokens)
    for (const [kind, id] of KEYWORDS[token] || []) {
      const key = `${kind}:${id}`;
      scores.set(key, (scores.get(key) || 0) + 3);
      why.set(key, [...(why.get(key) || []), token]);
    }
  for (const [kind, ids] of Object.entries({
    behavior: ["fadeIn", "fadeOut", "countUp", "barGrow"],
    scene: ["heartLike", "statHero", "barChart", "wipeNext"],
    shape: ["heart", "check", "bar", "line"],
  }))
    for (const id of ids) {
      const entry = describeEntry(kind, id);
      const hay =
        `${entry?.name || ""} ${entry?.description || ""} ${entry?.category || ""}`.toLowerCase();
      if (!entry) continue;
      for (const token of tokens)
        if (hay.includes(token)) {
          const key = `${kind}:${id}`;
          scores.set(key, (scores.get(key) || 0) + 1);
          why.set(key, [...new Set([...(why.get(key) || []), token])]);
        }
    }
  const top = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, score]) => {
      const [kind, id] = key.split(":");
      const entry = describeEntry(kind, id);
      return {
        kind,
        id,
        score,
        why: why.get(key) || [],
        description: entry?.description || "",
      };
    });
  const payload = {
    prompt: args._.join(" "),
    top: top.length
      ? top
      : [
          {
            kind: "scene",
            id: "brandReveal",
            score: 0,
            why: ["fallback"],
            description:
              describeEntry("scene", "brandReveal")?.description || "",
          },
        ],
  };
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}
export { meta };
