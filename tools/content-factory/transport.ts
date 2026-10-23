/**
 * Transport: one model call = one `claude -p` process, using the Claude
 * subscription login (cloud session credits / Max plan), NOT the paid
 * Anthropic API key.
 *
 * Identity rules (see claude/content-factory-plan-2026-10.md §2):
 *  - the system prompt is REPLACED with the app's own prompt
 *    (--system-prompt-file), not appended to Claude Code's;
 *  - no tools, no MCP servers, no skills/plugins/hooks, no thinking,
 *    one turn — the model can only write its answer;
 *  - the process runs in an empty temp directory so no CLAUDE.md or
 *    project settings are picked up.
 *
 * Known residual difference: Claude Code cannot set temperature (the
 * app uses 0.7), and a cloud session still adds ~1.8k tokens of
 * harness context. The pilot measures whether either shows up in the
 * output distribution.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ErrorKind = "usage_limit" | "rate_limit" | "overloaded" | "auth" | "budget" | "timeout" | "other";

/** Subscription usage windows, as Claude Code reports them on every call
 *  (`rate_limit_event`). Utilization is 0..1 of the plan's limit. */
export type UsageLimits = {
  status?: string;
  fiveHour?: { utilization: number; resetsAt: number };
  sevenDay?: { utilization: number; resetsAt: number };
  overageStatus?: string;
  isUsingOverage?: boolean;
};

let lastLimits: UsageLimits | null = null;
/** Latest usage windows seen by any call in this process (null until the first call). */
export const latestLimits = () => lastLimits;

function readLimits(info: any): UsageLimits {
  const w = info?.unifiedWindows ?? {};
  const win = (x: any) => (x && Number.isFinite(Number(x.utilization)) ? { utilization: Number(x.utilization), resetsAt: Number(x.resetsAt) } : undefined);
  return { status: info?.status, fiveHour: win(w.five_hour), sevenDay: win(w.seven_day), overageStatus: info?.overageStatus, isUsingOverage: info?.isUsingOverage };
}

export type ClaudeResult = {
  ok: boolean;
  limits?: UsageLimits;
  text: string;
  structured?: unknown;
  costUsd: number;
  model: string;
  durationMs: number;
  usage?: Record<string, unknown>;
  error?: string;
  errorKind?: ErrorKind;
};

export type ClaudeCall = {
  system: string;
  user: string;
  model: string;
  /** Hard cap for this one call (client-side estimate, list price). */
  maxBudgetUsd?: number;
  /** When set, the answer is validated against this JSON Schema and
   *  returned in `structured`. Used by the fact-checker only — the
   *  generator must NOT use it, the app does not. */
  jsonSchema?: object;
  timeoutMs?: number;
  /** Turn prompt caching off for one-off prompts (fact-check, repair):
   *  Claude Code writes a 1h cache entry at 2x input price, which only
   *  pays off when the same prefix is reused — the generator's system
   *  prompt is, an evidence pack is not. */
  noCache?: boolean;
};

function classify(message: string): ErrorKind {
  const m = message.toLowerCase();
  if (/usage limit|session limit|weekly limit|limit reached|hit your( \w+)? limit|out of (extra )?usage|credit balance/.test(m)) return "usage_limit";
  if (/rate[_ ]limit|429/.test(m)) return "rate_limit";
  if (/overloaded|529/.test(m)) return "overloaded";
  if (/auth|401|403|login/.test(m)) return "auth";
  if (/budget/.test(m)) return "budget";
  return "other";
}

export async function runClaude(call: ClaudeCall): Promise<ClaudeResult> {
  const dir = mkdtempSync(join(tmpdir(), "lokali-cf-"));
  const sysFile = join(dir, "system.txt");
  writeFileSync(sysFile, call.system);
  const args = [
    "-p",
    "--safe-mode",
    "--setting-sources", "",
    "--no-chrome",
    "--disable-slash-commands",
    "--model", call.model,
    "--system-prompt-file", sysFile,
    "--tools", "",
    "--strict-mcp-config",
    "--mcp-config", '{"mcpServers":{}}',
    "--exclude-dynamic-system-prompt-sections",
    "--settings", '{"alwaysThinkingEnabled":false,"includeGitInstructions":false}',
    "--no-session-persistence",
    // --json-schema answers through a structured-output tool call, which needs an extra turn.
    "--max-turns", call.jsonSchema ? "3" : "1",
    // stream-json (not json) so the subscription's usage windows come back too.
    "--output-format", "stream-json",
    "--verbose",
  ];
  if (call.maxBudgetUsd) args.push("--max-budget-usd", String(call.maxBudgetUsd));
  if (call.jsonSchema) args.push("--json-schema", JSON.stringify(call.jsonSchema));

  const started = Date.now();
  const timeoutMs = call.timeoutMs ?? 240_000;
  return await new Promise<ClaudeResult>((resolve) => {
    const child = spawn("claude", args, {
      cwd: dir,
      env: { ...process.env, MAX_THINKING_TOKENS: "0", ...(call.noCache ? { DISABLE_PROMPT_CACHING: "1" } : {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGINT"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.stdin.end(call.user);
    child.on("close", (code) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      const durationMs = Date.now() - started;
      let parsed: Record<string, any> | null = null;
      let limits: UsageLimits | undefined;
      for (const line of out.split("\n")) {
        if (!line.startsWith("{")) continue;
        let o: Record<string, any>;
        try {
          o = JSON.parse(line);
        } catch {
          continue;
        }
        if (o.type === "rate_limit_event" && o.rate_limit_info) limits = readLimits(o.rate_limit_info);
        else if (o.type === "result") parsed = o;
      }
      if (limits) lastLimits = limits;
      if (!parsed) {
        const message = (err || out || `exit ${code}`).slice(0, 500);
        resolve({
          ok: false, text: "", costUsd: 0, model: call.model, durationMs, limits,
          error: message,
          errorKind: limits?.status === "rejected" ? "usage_limit" : durationMs >= timeoutMs ? "timeout" : classify(message),
        });
        return;
      }
      const isError = parsed.is_error === true || parsed.subtype !== "success";
      const text = typeof parsed.result === "string" ? parsed.result : "";
      const message = isError ? String(parsed.result ?? parsed.subtype ?? parsed.api_error_status ?? "error") : undefined;
      resolve({
        ok: !isError,
        text,
        structured: parsed.structured_output,
        costUsd: Number(parsed.total_cost_usd ?? 0),
        model: call.model,
        durationMs,
        usage: parsed.usage,
        error: message,
        errorKind: message ? (limits?.status === "rejected" ? "usage_limit" : classify(message)) : undefined,
        limits,
      });
    });
  });
}
