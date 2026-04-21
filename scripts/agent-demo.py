#!/usr/bin/env python3
"""Minimal OpenAI-compatible agent loop for NextFrame TTS POC."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


PRICING: dict[str, tuple[float, float]] = {
    "Pro/MiniMaxAI/MiniMax-M2.5": (0.80, 2.40),
    "deepseek-ai/DeepSeek-V3.2": (0.28, 0.42),
    "Pro/deepseek-ai/DeepSeek-V3.2": (0.28, 0.42),
    "deepseek-ai/DeepSeek-V3.1-Terminus": (0.28, 0.42),
    "deepseek-ai/DeepSeek-R1": (0.55, 2.19),
    "Pro/zai-org/GLM-5.1": (1.00, 3.00),
    "Pro/zai-org/GLM-5": (1.00, 3.00),
    "Pro/zai-org/GLM-4.7": (0.80, 2.40),
    "zai-org/GLM-4.6": (0.50, 1.50),
    "Qwen/Qwen3.6-35B-A3B": (0.42, 0.84),
    "Qwen/Qwen3.5-397B-A17B": (1.50, 3.00),
    "Qwen/Qwen3.5-35B-A3B": (0.35, 0.70),
    "Qwen/Qwen3.5-9B": (0.0, 0.0),
    "Qwen/Qwen3-Coder-30B-A3B-Instruct": (0.0, 0.0),
}


def estimate_cost(model: str, in_tok: int, out_tok: int) -> float:
    p_in, p_out = PRICING.get(model, (0.0, 0.0))
    return round((in_tok / 1e6) * p_in + (out_tok / 1e6) * p_out, 6)


TOOLS: list[dict[str, Any]] = [
    {"type": "function", "function": {"name": "Bash", "description": "Run any shell command. Use for ls / cat / ffprobe / file 等查询. Returns stdout+stderr+exit code.", "parameters": {"type": "object", "properties": {"command": {"type": "string", "description": "shell command to run"}, "timeout_sec": {"type": "integer", "default": 30}}, "required": ["command"]}}},
    {"type": "function", "function": {"name": "Read", "description": "Read file content. For text files (md/json/txt).", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "max_chars": {"type": "integer", "default": 10000}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "nf_tts_synth", "description": "合成 TTS mp3. voice 可选 xiaoxiao/yunxi/yunyang(默认晓晓). 输出到 out_path.", "parameters": {"type": "object", "properties": {"text": {"type": "string", "description": "要合成的文本"}, "voice": {"type": "string", "enum": ["xiaoxiao", "yunxi", "yunyang"], "default": "xiaoxiao"}, "out_path": {"type": "string", "description": "mp3 输出绝对路径 · 如 /tmp/hello.mp3"}}, "required": ["text", "out_path"]}}},
]


def bash_tool(command: str, timeout_sec: int = 30) -> dict[str, Any]:
    try:
        p = subprocess.run(["bash", "-c", command], timeout=timeout_sec, capture_output=True, text=True)
        return {"stdout": p.stdout, "stderr": p.stderr, "exit_code": p.returncode}
    except subprocess.TimeoutExpired as e:
        return {"stdout": e.stdout or "", "stderr": f"command timed out after {timeout_sec}s\n{e.stderr or ''}", "exit_code": 124}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": 1}


def read_tool(path: str, max_chars: int = 10000) -> dict[str, Any]:
    try:
        return {"ok": True, "path": path, "content": Path(path).expanduser().read_text(encoding="utf-8")[:max_chars]}
    except Exception as e:
        return {"ok": False, "path": path, "error": str(e)}


def probe_duration_ms(path: Path) -> int | None:
    try:
        p = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return int(float(p.stdout.strip()) * 1000) if p.returncode == 0 else None
    except Exception:
        return None


def nf_tts_synth(text: str, out_path: str, voice: str = "xiaoxiao") -> dict[str, Any]:
    voices = {"xiaoxiao": "zh-CN-XiaoxiaoNeural", "yunxi": "zh-CN-YunxiNeural", "yunyang": "zh-CN-YunyangNeural"}
    target = Path(out_path).expanduser()
    batch_path: Path | None = None
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        batch = [{"id": 1, "voice": voices.get(voice, voices["xiaoxiao"]), "text": text, "filename": target.name}]
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False, dir=target.parent) as f:
            json.dump(batch, f, ensure_ascii=False)
            batch_path = Path(f.name)
        p = subprocess.run(["nf-tts", "batch", str(batch_path), "--dir", str(target.parent)], capture_output=True, text=True, timeout=180)
        ok = p.returncode == 0 and target.exists()
        return {"ok": ok, "mp3": str(target), "duration_ms": probe_duration_ms(target) if ok else None, "stdout": p.stdout, "stderr": p.stderr, "exit_code": p.returncode}
    except subprocess.TimeoutExpired as e:
        return {"ok": False, "mp3": str(target), "error": f"nf-tts timed out: {e}"}
    except Exception as e:
        return {"ok": False, "mp3": str(target), "error": str(e)}
    finally:
        if batch_path:
            batch_path.unlink(missing_ok=True)


def dispatch(name: str, args: dict[str, Any]) -> dict[str, Any]:
    try:
        if name == "Bash":
            return bash_tool(str(args["command"]), int(args.get("timeout_sec", 30)))
        if name == "Read":
            return read_tool(str(args["path"]), int(args.get("max_chars", 10000)))
        if name == "nf_tts_synth":
            return nf_tts_synth(str(args["text"]), str(args["out_path"]), str(args.get("voice", "xiaoxiao")))
        return {"ok": False, "error": f"unknown tool: {name}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def make_client() -> Any:
    from dotenv import load_dotenv
    from openai import OpenAI

    load_dotenv()
    key = os.getenv("SILICONFLOW_API_KEY")
    if not key:
        raise SystemExit("missing SILICONFLOW_API_KEY in environment or .env")
    return OpenAI(api_key=key, base_url=os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"))


def agent_loop(task: str, max_iters: int = 10) -> str | None:
    client = make_client()
    messages: list[dict[str, Any]] = [{"role": "user", "content": task}]
    model = os.getenv("SILICONFLOW_MODEL", "Pro/MiniMaxAI/MiniMax-M2.5")
    total_in = 0
    total_out = 0
    iters = 0
    final: str | None = None
    for _ in range(max_iters):
        iters += 1
        resp = client.chat.completions.create(model=model, messages=messages, tools=TOOLS, tool_choice="auto")
        if resp.usage:
            total_in += resp.usage.prompt_tokens or 0
            total_out += resp.usage.completion_tokens or 0
        msg = resp.choices[0].message
        messages.append(msg.model_dump(exclude_none=True))
        if not msg.tool_calls:
            print("FINAL:", msg.content)
            final = msg.content
            break
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments or "{}")
            print(f"→ tool: {tc.function.name}({args})")
            result = dispatch(tc.function.name, args)
            print(f"← result: {json.dumps(result, ensure_ascii=False)[:200]}")
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, ensure_ascii=False)})
    else:
        print("max iters reached")
    stats = {
        "model": model,
        "iters": iters,
        "prompt_tokens": total_in,
        "completion_tokens": total_out,
        "completed": final is not None,
        "est_cost_usd": estimate_cost(model, total_in, total_out),
        "note": "硅基实际价格可能不同 · est 按公开 2026-04 数据估算",
    }
    print(f"__NF_STATS__ {json.dumps(stats, ensure_ascii=False)}")
    return final


def dry_run() -> int:
    args = {"text": "测试", "voice": "xiaoxiao", "out_path": "/tmp/_dryrun.mp3"}
    print(f"→ tool: nf_tts_synth({args})")
    result = dispatch("nf_tts_synth", args)
    print(f"← result: {json.dumps(result, ensure_ascii=False)[:200]}")
    return 0 if result.get("ok") else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="NextFrame minimal agent demo")
    parser.add_argument("task", nargs="?", help="agent task, e.g. 用 nf-tts 合成 mp3")
    parser.add_argument("--dry-run", action="store_true", help="test tool dispatch only")
    parser.add_argument("--max-iters", type=int, default=10)
    args = parser.parse_args()
    if args.dry_run:
        return dry_run()
    if not args.task:
        print("task is required unless --dry-run is set", file=sys.stderr)
        return 2
    agent_loop(args.task, args.max_iters)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
