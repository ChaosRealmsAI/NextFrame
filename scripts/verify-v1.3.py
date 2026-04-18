#!/usr/bin/env python3
"""v1.3 verify · 5 VP 机器可跑（JSON 静态检查 · VP-5 派 subagent 由主 agent 单独做）"""
import json
import re
import sys
from pathlib import Path

SPEC = Path("/Users/Zhuanz/bigbang/NextFrame/spec")
VERIFY_DIR = SPEC / "versions/v1.3/verify"
VERIFY_DIR.mkdir(parents=True, exist_ok=True)

results = {"all_pass": True, "vps": {}}


def emit(vp_id, data):
    pass_ = data.get("pass", False)
    results["vps"][vp_id] = data
    if not pass_:
        results["all_pass"] = False
    print(json.dumps({"event": f"{vp_id}.done", **{k: v for k, v in data.items() if k != "details"}}, ensure_ascii=False))


# ========== VP-1 · 18 模块全列 · 5/5/4/4/2 分布 ==========
try:
    arch = json.loads((SPEC / "versions/v1.3/spec/architecture.json").read_text())
    mods = json.loads((SPEC / "versions/v1.3/spec/modules.json").read_text())

    layer_counts = arch["counts"]["by_layer"] if False else {}  # compute from modules
    layer_counts = {"core": 0, "media": 0, "shell": 0, "dx": 0, "ecosystem": 0}
    for m in mods["modules"]:
        layer_counts[m["layer"]] = layer_counts.get(m["layer"], 0) + 1

    expected = {"core": 5, "media": 5, "shell": 4, "dx": 4, "ecosystem": 2}
    pass_ = (len(mods["modules"]) == 20 and layer_counts == expected)
    (VERIFY_DIR / "vp-1-modules.json").write_text(json.dumps(
        {"pass": pass_, "total": len(mods["modules"]), "by_layer": layer_counts, "expected": expected},
        ensure_ascii=False, indent=2))
    emit("VP-1", {"pass": pass_, "total": len(mods["modules"]), "by_layer": layer_counts})
except Exception as e:
    emit("VP-1", {"pass": False, "error": str(e)})


# ========== VP-2 · v1.4..v2.2 每版 3 字段齐 ==========
try:
    r = json.loads((SPEC / "roadmap.json").read_text())
    planned = r.get("planned", {})
    required_fields = ["scope", "depends_on", "timebox"]
    per_version = {}
    all_pass = True
    for ver in sorted(planned.keys()):
        p = planned[ver]
        missing = [f for f in required_fields if f not in p or p[f] is None or p[f] == ""]
        per_version[ver] = {"fields_ok": len(missing) == 0, "missing": missing}
        if missing:
            all_pass = False
    (VERIFY_DIR / "vp-2-roadmap.json").write_text(json.dumps(
        {"pass": all_pass, "version_count": len(planned), "per_version": per_version},
        ensure_ascii=False, indent=2))
    emit("VP-2", {"pass": all_pass, "version_count": len(planned)})
except Exception as e:
    emit("VP-2", {"pass": False, "error": str(e)})


# ========== VP-3 · ADR-038..042 五要素齐 ==========
try:
    adrs = json.loads((SPEC / "adrs.json").read_text())
    target_ids = ["ADR-038", "ADR-039", "ADR-040", "ADR-041", "ADR-042"]
    required_fields = ["context", "decision", "rationale", "constraints", "alternatives_rejected"]
    per_adr = {}
    all_pass = True
    for adr in adrs["decisions"]:
        if adr["id"] not in target_ids:
            continue
        missing = [f for f in required_fields if f not in adr or not adr[f]]
        per_adr[adr["id"]] = {"fields_ok": len(missing) == 0, "missing": missing,
                              "status": adr.get("status"), "version": adr.get("version")}
        if missing:
            all_pass = False
    found_ids = list(per_adr.keys())
    all_found = all(tid in found_ids for tid in target_ids)
    final_pass = all_pass and all_found
    (VERIFY_DIR / "vp-3-adrs.json").write_text(json.dumps(
        {"pass": final_pass, "all_found": all_found, "per_adr": per_adr},
        ensure_ascii=False, indent=2))
    emit("VP-3", {"pass": final_pass, "found_count": len(found_ids)})
except Exception as e:
    emit("VP-3", {"pass": False, "error": str(e)})


# ========== VP-4 · drop list 三处一致 ==========
try:
    manifesto = json.loads((SPEC / "manifesto.json").read_text())
    adrs = json.loads((SPEC / "adrs.json").read_text())
    sample_preview = (SPEC / "versions/v1.3/kickoff/sample-preview.html").read_text()

    manifesto_drop = [d["id"] for d in manifesto.get("drop_list", [])]
    manifesto_count = len(manifesto_drop)

    adr042 = next((a for a in adrs["decisions"] if a["id"] == "ADR-042"), None)
    # ADR-042 lists 12 items in decision text · count "(" + num + ")" pattern
    adr042_text = adr042["decision"] if adr042 else ""
    adr042_count = len(re.findall(r"\([1-9][0-9]?\)\s*\S", adr042_text))

    # sample-preview drop list · count .drop-entry divs in 卡 10
    sp_drop_count = sample_preview.count('class="drop-entry"')

    all_match = (manifesto_count == 12 and adr042_count == 12 and sp_drop_count == 12)
    (VERIFY_DIR / "vp-4-drop-consistency.json").write_text(json.dumps(
        {"pass": all_match, "manifesto": manifesto_count, "adr_042": adr042_count,
         "sample_preview": sp_drop_count, "expected": 12},
        ensure_ascii=False, indent=2))
    emit("VP-4", {"pass": all_match, "manifesto": manifesto_count,
                  "adr_042": adr042_count, "sample_preview": sp_drop_count})
except Exception as e:
    emit("VP-4", {"pass": False, "error": str(e)})


# ========== Summary ==========
(VERIFY_DIR / "verify-summary.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps({"event": "verify.done", "all_pass": results["all_pass"], "vp_count": len(results["vps"])}, ensure_ascii=False))
sys.exit(0 if results["all_pass"] else 1)
