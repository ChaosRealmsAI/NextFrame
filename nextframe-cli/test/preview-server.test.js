import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function startPreviewServer(workspaceRoot) {
  const previousRoot = process.env.NEXTFRAME_WORKSPACE_ROOT;
  process.env.NEXTFRAME_WORKSPACE_ROOT = workspaceRoot;
  const { server } = await import(new URL(`../preview/server.mjs?preview-test=${Date.now()}`, import.meta.url));

  try {
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  } catch (error) {
    restoreWorkspaceRoot(previousRoot);
    throw error;
  }

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolveClose) => server.close(resolveClose));
      restoreWorkspaceRoot(previousRoot);
    },
  };
}

function restoreWorkspaceRoot(previousRoot) {
  if (previousRoot === undefined) {
    delete process.env.NEXTFRAME_WORKSPACE_ROOT;
    return;
  }
  process.env.NEXTFRAME_WORKSPACE_ROOT = previousRoot;
}

test("preview-1: /api/mp4 rejects paths outside the workspace root", async (t) => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "nextframe-preview-"));
  const preview = await startPreviewServer(workspaceRoot);

  t.after(async () => {
    await preview.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  const response = await fetch(`${preview.baseUrl}/api/mp4?path=${encodeURIComponent("/etc/hosts")}`);
  assert.equal(response.status, 403);

  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /path outside workspace/);
});
