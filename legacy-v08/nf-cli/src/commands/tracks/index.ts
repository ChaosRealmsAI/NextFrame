import { defaultFixSuggestion, renderCommandHelp } from "../_helpers/help/index.js";

const SUBCOMMANDS = {
  add: () => import("./add.js"),
  list: () => import("./list.js"),
};

export async function run(argv: string[]) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    process.stdout.write(renderCommandHelp("tracks") ?? "");
    return 0;
  }
  if (argv[1] === "--help" || argv[1] === "-h") {
    const help = renderCommandHelp(`tracks ${subcommand}`);
    if (help) {
      process.stdout.write(help);
      return 0;
    }
  }

  const loader = SUBCOMMANDS[subcommand as keyof typeof SUBCOMMANDS];
  if (!loader) {
    process.stderr.write(`error: unknown tracks subcommand "${subcommand}"\n`);
    process.stderr.write('Fix: run "nextframe tracks --help" to see supported tracks subcommands\n');
    return 3;
  }

  try {
    const mod = await loader();
    return await mod.run(argv.slice(1));
  } catch (error: unknown) {
    process.stderr.write(`error: ${(error as Error).message}\n`);
    process.stderr.write(`Fix: ${defaultFixSuggestion()}\n`);
    return 2;
  }
}
