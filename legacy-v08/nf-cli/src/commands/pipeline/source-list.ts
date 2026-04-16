// Lists source library entries from a source library directory.
import { fail, listSources, parseSourceFlags, success } from "../_helpers/_source.js";

const HELP = "usage: nextframe source-list --library <path>";

export async function run(argv: string[]) {
  const { flags } = parseSourceFlags(argv, ["library"]);
  if (!flags.library) {
    fail("USAGE", HELP);
  }

  try {
    const rows = await listSources(String(flags.library));
    success(rows);
    return 0;
  } catch (error: unknown) {
    fail("SOURCE_LIST_FAILED", (error as Error).message);
  }
}

export default run;
