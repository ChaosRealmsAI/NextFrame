const meta = { name: "sample", kind: "cli", description: "Sample output stub" };
export default function sampleCmd(args = { _: [] }) {
  // TODO: sample behaviors, shapes, and scenes at requested times
  const payload = { ok: true, target: args._.join(" "), frames: [], stub: true };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log("(empty stub)");
  return payload;
}
export { meta };
