const meta = { name: "describe", kind: "cli", description: "Describe component metadata stub" };
export default function describeCmd(args = { _: [] }) {
  // TODO: resolve behavior, shape, or scene metadata
  const payload = { ok: true, target: args._.join(" "), stub: true };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log("(empty stub)");
  return payload;
}
export { meta };
