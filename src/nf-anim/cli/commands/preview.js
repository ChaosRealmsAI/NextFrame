const meta = { name: "preview", kind: "cli", description: "Preview launcher stub" };
export default function previewCmd(args = { _: [] }) {
  // TODO: start python server and open browser for gallery preview
  const payload = { ok: true, command: "preview", args: args._, stub: true };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log("(empty stub)");
  return payload;
}
export { meta };
