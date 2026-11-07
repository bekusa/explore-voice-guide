#!/usr/bin/env python3
"""Stop hook (Lokali SEO/GEO agent).

While tools/seo-agent/.active exists (and is younger than 6 h), the session may not
end until this run has written: a report in tools/seo-agent/reports/ newer than the
marker, and backlog.md newer than the marker. Exit 2 asks the model to continue with
the reason; stop_hook_active=true (we already asked once) always allows stopping,
so there is no loop. Other sessions (no marker): no-op.
"""
import json
import os
import sys
import time

ACTIVE_MAX_AGE_S = 6 * 3600


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if data.get("stop_hook_active"):
        return 0
    here = os.path.dirname(os.path.abspath(__file__))
    agent_dir = os.path.dirname(here)
    marker = os.path.join(agent_dir, ".active")
    try:
        marker_mtime = os.path.getmtime(marker)
    except OSError:
        return 0
    if time.time() - marker_mtime > ACTIVE_MAX_AGE_S:
        return 0
    missing = []
    reports_dir = os.path.join(agent_dir, "reports")
    newest_report = 0.0
    if os.path.isdir(reports_dir):
        for name in os.listdir(reports_dir):
            p = os.path.join(reports_dir, name)
            if os.path.isfile(p):
                newest_report = max(newest_report, os.path.getmtime(p))
    if newest_report < marker_mtime:
        missing.append("a report in tools/seo-agent/reports/ written in this run")
    backlog = os.path.join(agent_dir, "backlog.md")
    if not os.path.exists(backlog) or os.path.getmtime(backlog) < marker_mtime:
        missing.append("tools/seo-agent/backlog.md updated in this run")
    if missing:
        sys.stderr.write(
            "seo-agent hook: the run is still active (.active marker). Before stopping, write: "
            + "; ".join(missing)
            + "; then rename tools/seo-agent/.active to .inactive.\n"
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
