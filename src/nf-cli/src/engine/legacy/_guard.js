// Validates guarded result shapes for legacy engine functions when guard mode is enabled.
function isStructuredError(error) {
  return !!error && typeof error === "object" && typeof error.code === "string" && typeof error.message === "string";
}

function reportGuard(name, problem, result) {
  if (process.env.NEXTFRAME_GUARD !== "1") return result;
  process.stderr.write(`[NEXTFRAME_GUARD] ${name}: ${problem}\n`);
  return result;
}

export function guarded(name, result) {
  if (process.env.NEXTFRAME_GUARD !== "1") return result;
  if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
    return reportGuard(name, "return must be an object with boolean ok", result);
  }
  if (result.ok === true && !("value" in result) && !("canvas" in result)) {
    return reportGuard(name, "ok:true result missing value/canvas payload", result);
  }
  if (result.ok === false && !isStructuredError(result.error)) {
    return reportGuard(name, "ok:false result missing structured error", result);
  }
  return result;
}
