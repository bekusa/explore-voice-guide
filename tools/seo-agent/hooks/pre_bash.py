#!/usr/bin/env python3
"""PreToolUse hook for the Bash tool (Lokali SEO/GEO agent).

Reads the hook payload as JSON on stdin. Exit 2 blocks the command and sends the
stderr text back to the model; exit 0 allows it.

Rules that always apply (any session in this repo):
  - rm -r / rm -rf, git push --force, git reset --hard, "curl … | bash", DROP/TRUNCATE
  - printing secrets (printenv, bare env, cat .env, echo $…KEY/SECRET/TOKEN)

Rules that apply only while tools/seo-agent/.active exists and is younger than 6 h
(i.e. while the SEO agent runs; the content factory and Beka are unaffected):
  - calls to the paid lokali.travel endpoints (/api/guide, /api/attractions,
    /api/museum-highlights, /api/photo (not photo-gallery), /api/place-details)
  - DELETE on tables other than seo_*
  - ad-hoc deploy commands (deploy_project, wrangler deploy/publish)
"""
import json
import os
import re
import sys
import time

ACTIVE_MAX_AGE_S = 6 * 3600


def agent_active(repo_root: str) -> bool:
    marker = os.path.join(repo_root, "tools", "seo-agent", ".active")
    try:
        return (time.time() - os.path.getmtime(marker)) < ACTIVE_MAX_AGE_S
    except OSError:
        return False


ALWAYS = [
    (r"(^|[\s;&|(])rm\s+(-[A-Za-z]*[rR][A-Za-z]*\b)", "recursive rm is blocked (RULES.md §8). Move files to _to_delete/ instead."),
    (r"\bgit\s+push\b[^\n]*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S)", "force push is blocked (RULES.md §8)."),
    (r"\bgit\s+reset\s+--hard\b", "git reset --hard is blocked (RULES.md §8)."),
    (r"\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b", "piping a download into a shell is blocked (RULES.md §9)."),
    (r"\b(DROP|TRUNCATE)\s+TABLE\b", "DROP/TRUNCATE is blocked; the agent never changes app tables (RULES.md §1, §8)."),
    (r"\bprintenv\b", "printing the environment is blocked (secrets)."),
    (r"(^|[;&|]\s*)env\s*($|[;&|>])", "printing the environment is blocked (secrets)."),
    (r"\bcat\b[^\n]*(^|[\s/])\.env\b", "reading .env is blocked (secrets)."),
    (r"\becho\b[^\n]*\$\{?\w*(KEY|SECRET|TOKEN|PASSWORD|PASS)\w*", "echoing a secret is blocked."),
]

ACTIVE_ONLY = [
    (r"lokali\.travel/api/(guide|attractions|museum-highlights|place-details)\b",
     "paid lokali.travel endpoint: allowed only for keys verified as cache HITs (RULES.md §1). Use static pages or /api/photo-gallery."),
    (r"lokali\.travel/api/photo(?!-gallery)",
     "/api/photo can fall through to paid Google Places (RULES.md §1). Use /api/photo-gallery or the cached_photos table."),
    (r"\bDELETE\s+FROM\s+(?!seo_)[A-Za-z_\"`.]+", "DELETE on app tables is blocked (RULES.md §8). Only seo_* tables may be modified."),
    (r"\b(deploy_project|wrangler\s+(deploy|publish))\b", "deployments go through the pipeline (RULES.md §8), not ad-hoc commands."),
]


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if data.get("tool_name") != "Bash":
        return 0
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if not cmd:
        return 0
    here = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(here)))
    rules = list(ALWAYS)
    if agent_active(repo_root):
        rules += ACTIVE_ONLY
    for pattern, message in rules:
        if re.search(pattern, cmd, re.IGNORECASE | re.MULTILINE):
            sys.stderr.write("seo-agent hook: " + message + "\n")
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
