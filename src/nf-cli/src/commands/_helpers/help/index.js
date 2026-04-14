import {
  COMMAND_SPECS,
  DEFAULT_FIX,
  TOP_LEVEL_COMMANDS,
  getCommandSpec,
  hasCommandHelp,
  listTopLevelHelpCommands,
} from "./commands.js";
import { renderCommandHelp as formatCommandHelp, renderRootHelp as formatRootHelp } from "./format.js";

export { hasCommandHelp, listTopLevelHelpCommands };

export function renderCommandHelp(name) {
  return formatCommandHelp(name, getCommandSpec(name));
}

export function renderRootHelp() {
  return formatRootHelp(TOP_LEVEL_COMMANDS, COMMAND_SPECS, DEFAULT_FIX);
}

export function defaultFixSuggestion() {
  return DEFAULT_FIX;
}
