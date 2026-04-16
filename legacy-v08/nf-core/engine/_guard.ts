// Guard helper for structured engine results.
// Validates ok/value/error shape when NEXTFRAME_GUARD=1.

function isStructuredError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

function reportGuard<T>(name: string, problem: string, result: T): T {
  if (process.env.NEXTFRAME_GUARD !== "1") return result;
  process.stderr.write(`[NEXTFRAME_GUARD] ${name}: ${problem}\n`);
  return result;
}

export function guarded<T extends Record<string, unknown>>(name: string, result: T): T {
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
