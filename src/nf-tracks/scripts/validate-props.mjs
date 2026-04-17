// AJV-backed props validator.
// Loads a Track module, calls describe(), and validates a props JSON file.
//
// CLI:  node scripts/validate-props.mjs <track.js> <props.json>
// Prog: validateProps(mod, props) -> { valid, errors }

import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

let sharedAjv;

function getAjv() {
  if (!sharedAjv) {
    sharedAjv = new Ajv({ allErrors: true, strict: false });
    addFormats(sharedAjv);
  }
  return sharedAjv;
}

/**
 * Validate props against a Track module's describe() schema.
 * @param {object} mod
 * @param {unknown} props
 * @returns {{valid: boolean, errors: object[] | null}}
 */
export function validateProps(mod, props) {
  if (!mod || typeof mod.describe !== "function") {
    return { valid: false, errors: [{ message: "module has no describe()" }] };
  }
  const schema = mod.describe();
  const ajv = getAjv();
  const validate = ajv.compile(schema);
  const valid = validate(props);
  return { valid, errors: valid ? null : validate.errors ?? [] };
}

async function main() {
  const [trackPath, propsPath] = process.argv.slice(2);
  if (!trackPath || !propsPath) {
    process.stdout.write(
      JSON.stringify({ valid: false, errors: [{ message: "usage: validate-props.mjs <track.js> <props.json>" }] }) + "\n",
    );
    process.exit(2);
  }
  const trackAbs = isAbsolute(trackPath) ? trackPath : resolve(process.cwd(), trackPath);
  const propsAbs = isAbsolute(propsPath) ? propsPath : resolve(process.cwd(), propsPath);
  const mod = await import(pathToFileURL(trackAbs).href);
  const props = JSON.parse(readFileSync(propsAbs, "utf8"));
  const result = validateProps(mod, props);
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(result.valid ? 0 : 1);
}

const invokedAsCli = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (invokedAsCli) {
  main().catch((err) => {
    process.stdout.write(
      JSON.stringify({ valid: false, errors: [{ message: String(err?.stack ?? err) }] }) + "\n",
    );
    process.exit(1);
  });
}
