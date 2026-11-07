#!/usr/bin/env python3
"""PostToolUse hook for Write / Edit / MultiEdit (Lokali SEO/GEO agent).

When a file under public/ was written, run tools/seo-agent/precheck.py --file on it.
A hard failure (exit 1 from precheck) blocks with exit 2 so the model sees the reason.
Other paths: no-op. Never blocks on the checker's own errors.
"""
import json
import os
import subprocess
import sys


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if data.get("tool_name") not in ("Write", "Edit", "MultiEdit"):
        return 0
    tool_input = data.get("tool_input") or {}
    path = tool_input.get("file_path") or tool_input.get("path") or ""
    if not path:
        return 0
    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(here)))
    abs_path = path if os.path.isabs(path) else os.path.join(data.get("cwd") or repo_root, path)
    abs_path = os.path.normpath(abs_path)
    public_root = os.path.normpath(os.path.join(repo_root, "public"))
    if not abs_path.startswith(public_root + os.sep) and abs_path != public_root:
        return 0
    checker = os.path.join(repo_root, "tools", "seo-agent", "precheck.py")
    if not os.path.exists(checker):
        return 0
    try:
        proc = subprocess.run(
            [sys.executable, checker, "--file", abs_path],
            capture_output=True, text=True, timeout=120, cwd=repo_root,
        )
    except Exception:
        return 0
    if proc.returncode == 1:
        sys.stderr.write("seo-agent hook: precheck failed for " + os.path.relpath(abs_path, repo_root) + "\n")
        sys.stderr.write((proc.stdout or "")[-4000:])
        sys.stderr.write((proc.stderr or "")[-2000:])
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
