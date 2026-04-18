#!/usr/bin/env python3
"""
verify-v1.4.py · 主 agent 自动验 v1.4 kickoff VP-1..4。
VP-5 需主 agent 亲派 subagent，本脚本不跑。

Usage: python3 scripts/verify-v1.4.py
Exit 0 = all green · exit 1 = any VP fail
Evidence files -> spec/versions/v1.4/verify/VP-{1..4}-*.json
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SPEC = REPO / "spec"
V14 = SPEC / "versions" / "v1.4"
VERIFY_DIR = V14 / "verify"
VERIFY_DIR.mkdir(parents=True, exist_ok=True)


def emit(vp, pass_, detail):
    path = VERIFY_DIR / f"{vp}.json"
    path.write_text(json.dumps({"vp": vp, "pass": pass_, "detail": detail},
                                ensure_ascii=False, indent=2))
    status = "✅ PASS" if pass_ else "❌ FAIL"
    print(f"{status} {vp} · evidence → {path.relative_to(REPO)}")
    return pass_


def vp1_interfaces_coverage():
    """interfaces.json 20 模块字段级全覆盖 (项目级 · spec/ 根)"""
    ifp = SPEC / "interfaces.json"
    if not ifp.exists():
        return emit("VP-1-interfaces-coverage", False, {"error": f"not found: {ifp}"})
    data = json.loads(ifp.read_text())
    modules = data.get("modules", [])
    report = {"total": len(modules), "passed": 0, "per_module": []}
    for m in modules:
        mid = m.get("id", "<no-id>")
        itype = m.get("interface_type", "")
        required = ["id", "layer", "interface_type", "role", "status", "version_introduced", "contracts"]
        missing = [f for f in required if not m.get(f)]
        # interface_type-specific checks
        if itype == "subprocess":
            if not m.get("subprocess_protocol"):
                missing.append("subprocess_protocol")
            else:
                sp = m["subprocess_protocol"]
                for sub_req in ["exit_codes"]:
                    if not sp.get(sub_req):
                        missing.append(f"subprocess_protocol.{sub_req}")
        elif itype == "library":
            if not m.get("public_methods"):
                missing.append("public_methods")
        elif itype == "runtime_injected":
            if not m.get("window_nf_api"):
                missing.append("window_nf_api")
        elif itype == "artifact_format":
            if not m.get("format_spec"):
                missing.append("format_spec")
        status = "pass" if not missing else "fail"
        if status == "pass":
            report["passed"] += 1
        report["per_module"].append({"id": mid, "interface_type": itype, "status": status, "missing": missing})
    ok = report["total"] == 20 and report["passed"] == 20
    return emit("VP-1-interfaces-coverage", ok, report)


def vp2_roadmap_dag():
    """roadmap.json 30 版每版 5 字段齐 + 拓扑无环"""
    rp = SPEC / "roadmap.json"
    data = json.loads(rp.read_text())
    planned = data.get("planned", {})
    required = ["version_id", "wave", "scope", "depends_on", "timebox"]
    missing_report = []
    for vid, v in planned.items():
        miss = [f for f in required if f not in v or v[f] in (None, "", [])]
        # depends_on=[] is allowed meaning "none" but in our DAG every version must depend at least on v1.4
        # we relax that check here — an empty depends_on list means depends only on v1.4 implicitly
        # but we still want the key present
        if "depends_on" not in v:
            miss.append("depends_on")
        if miss:
            missing_report.append({"version": vid, "missing": miss})
    # topo sort (Kahn)
    # build graph: node -> list of dependencies that are in planned
    # nodes also include pseudo "v1.4" as a source (every planned version may depend on v1.4)
    nodes = set(planned.keys()) | {"v1.4"}
    # Also include earlier versions appearing in depends_on (shouldn't happen but be safe)
    for vid, v in planned.items():
        for d in v.get("depends_on", []):
            nodes.add(d)
    indeg = {n: 0 for n in nodes}
    adj = {n: [] for n in nodes}
    for vid, v in planned.items():
        for d in v.get("depends_on", []):
            adj[d].append(vid)
            indeg[vid] += 1
    # sources
    from collections import deque
    q = deque([n for n in nodes if indeg[n] == 0])
    topo = []
    while q:
        n = q.popleft()
        topo.append(n)
        for m in adj[n]:
            indeg[m] -= 1
            if indeg[m] == 0:
                q.append(m)
    has_cycle = len(topo) != len(nodes)
    detail = {
        "total": len(planned),
        "missing_fields": missing_report,
        "has_cycle": has_cycle,
        "topo_order": topo,
    }
    ok = len(planned) == 30 and not missing_report and not has_cycle
    return emit("VP-2-roadmap-dag", ok, detail)


def vp3_adr_043():
    """ADR-043 五要素齐 + ADR-039 superseded"""
    ap = SPEC / "adrs.json"
    data = json.loads(ap.read_text())
    decisions = data.get("decisions", [])
    by_id = {a["id"]: a for a in decisions}
    report = {"adr_043": {}, "adr_039_status": None, "checks": {}}
    adr_043 = by_id.get("ADR-043")
    if not adr_043:
        return emit("VP-3-adr-043", False, {"error": "ADR-043 not found"})
    five_req = ["context", "decision", "rationale", "constraints", "alternatives_rejected"]
    for f in five_req:
        v = adr_043.get(f)
        ok_field = bool(v) and (len(v) > 0 if isinstance(v, (list, str)) else True)
        report["adr_043"][f] = "present" if ok_field else "MISSING"
    all_five_ok = all(report["adr_043"][f] == "present" for f in five_req)
    accepted = adr_043.get("status") == "accepted"

    adr_039 = by_id.get("ADR-039")
    superseded_ok = False
    if adr_039:
        report["adr_039_status"] = adr_039.get("status")
        superseded_ok = adr_039.get("status") == "superseded_by_ADR_043"
    else:
        report["adr_039_status"] = "MISSING"

    report["checks"] = {
        "adr_043_five_elements": all_five_ok,
        "adr_043_accepted": accepted,
        "adr_039_superseded": superseded_ok,
    }
    ok = all_five_ok and accepted and superseded_ok
    return emit("VP-3-adr-043", ok, report)


def vp4_wave_consistency():
    """波次一致性 · depends_on 不反向跨波"""
    rp = SPEC / "roadmap.json"
    data = json.loads(rp.read_text())
    planned = data.get("planned", {})
    # map version -> wave
    wave_of = {vid: v.get("wave") for vid, v in planned.items()}
    wave_of["v1.4"] = 0  # interface-lock source
    violations = []
    for vid, v in planned.items():
        w = v.get("wave")
        for d in v.get("depends_on", []):
            if d not in wave_of:
                violations.append({"version": vid, "dep": d, "issue": "dep not in DAG"})
                continue
            dw = wave_of[d]
            if dw > w:
                violations.append({"version": vid, "dep": d, "dep_wave": dw, "version_wave": w, "issue": "dep wave > version wave (reverse)"})
    # Also check: wave 1 versions' depends_on only include v1.4 (no other wave1 versions)
    w1_violations = []
    for vid, v in planned.items():
        if v.get("wave") != 1:
            continue
        for d in v.get("depends_on", []):
            if d != "v1.4":
                w1_violations.append({"version": vid, "dep": d, "issue": "wave 1 must depend only on v1.4"})
    detail = {
        "total": len(planned),
        "violations": violations,
        "wave1_integrity_violations": w1_violations,
    }
    ok = not violations and not w1_violations
    return emit("VP-4-wave-consistency", ok, detail)


def main():
    results = []
    results.append(vp1_interfaces_coverage())
    results.append(vp2_roadmap_dag())
    results.append(vp3_adr_043())
    results.append(vp4_wave_consistency())
    passed = sum(1 for r in results if r)
    total = len(results)
    summary = {"passed": passed, "total": total, "all_green": passed == total}
    (VERIFY_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\n=== {passed}/{total} green ===")
    if passed != total:
        print("⚠ VP-5 (subagent) 需主 agent 另派 · 本脚本只验静态 VP-1..4")
        sys.exit(1)
    print("VP-1..4 全绿 · 主 agent 下一步：派 Explore subagent 跑 VP-5")
    sys.exit(0)


if __name__ == "__main__":
    main()
