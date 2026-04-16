import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ttsFiller from "../../nf-core/anchors/fillers/tts.ts";
import manualFiller from "../../nf-core/anchors/fillers/manual.ts";
import codeFiller from "../../nf-core/anchors/fillers/code.ts";

test("ttsFiller generates stable segment and word anchors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nextframe-anchors-tts-"));
  try {
    const input = join(dir, "seg0.words.json");
    writeFileSync(input, JSON.stringify({
      segments: [
        {
          id: "seg0",
          startMs: 0,
          endMs: 3400,
          words: [
            { w: "hello", s: 0, e: 420 },
            { w: "world", s: 420, e: 900 },
          ],
        },
      ],
    }));

    const dict = await ttsFiller(input);
    assert.deepEqual(dict["seg0.begin"], { at: 0 });
    assert.deepEqual(dict["seg0.end"], { at: 3400 });
    assert.deepEqual(dict["seg0.w0.begin"], { at: 0, label: "hello" });
    assert.deepEqual(dict["seg0.w1.end"], { at: 900, label: "world" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("manualFiller validates and returns numeric anchor entries", () => {
  assert.deepEqual(manualFiller({ begin: 120, end: 480 }), {
    begin: 120,
    end: 480,
  });
  assert.throws(() => manualFiller({ at: -1 }), /BAD_MANUAL_ANCHOR:/);
});

test("codeFiller evaluates arithmetic over refs and literals", () => {
  const anchors = {
    intro: { begin: 1000, end: 2200 },
    beat: { at: 2800 },
  };

  assert.equal(codeFiller("intro.end - intro.begin + 0.5s", { anchors }), 1700);
  assert.equal(codeFiller("(beat.at - intro.end) / 2", { anchors }), 300);
  assert.throws(() => codeFiller("Math.max(intro.begin, beat.at)", { anchors }), /BAD_CODE_EXPR:/);
  assert.throws(() => codeFiller("intro.point + 1", { anchors }), /BAD_CODE_EXPR:/);
});
