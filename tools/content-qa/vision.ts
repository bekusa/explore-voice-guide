/**
 * vision.ts — image classification through `claude -p`.
 *
 * The factory transport disables every tool, so the model cannot see an image. This variant keeps
 * the same flags but allows ONLY the Read tool, with the working directory set to a temp folder
 * holding the candidate (and reference) thumbnails. The model reads them and answers with a label.
 *
 * Phase 0 must verify this works in the cloud environment (one call on a known photo). Until then,
 * QA_VISION_DISABLED=1 makes every call return "unsure", which the photo check treats as a reject
 * that needs a second opinion — i.e. nothing is deleted on the strength of a disabled vision pass.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QA_CONFIG } from "./config";

export type VisionLabel = "modern_photo_of_subject" | "historical_photo" | "drawing_or_art" | "map_or_plan" | "other_place" | "person_or_event" | "low_quality" | "unsure";
const LABELS = /modern_photo_of_subject|historical_photo|drawing_or_art|map_or_plan|other_place|person_or_event|low_quality|unsure/;

export type VisionResult = { label: VisionLabel; reason: string; costUsd: number; ok: boolean; error?: string };

export async function classifyImage(opts: { candidate: Buffer; reference?: Buffer | null; place: string; city: string; model: string }): Promise<VisionResult> {
  if (process.env.QA_VISION_DISABLED === "1") return { label: "unsure", reason: "vision disabled", costUsd: 0, ok: true };
  const dir = mkdtempSync(join(tmpdir(), "lokali-qa-vision-"));
  writeFileSync(join(dir, "candidate.jpg"), opts.candidate);
  if (opts.reference) writeFileSync(join(dir, "reference.jpg"), opts.reference);
  const system =
    `You classify a photo for a travel app's carousel about "${opts.place}" (${opts.city}). ` +
    `Use the Read tool to look at candidate.jpg${opts.reference ? " and reference.jpg (a known photo of this place)" : ""}. ` +
    "Reply with exactly one label on the first line: modern_photo_of_subject | historical_photo | drawing_or_art | map_or_plan | other_place | person_or_event | low_quality | unsure. " +
    "modern_photo_of_subject means a colour photograph, taken roughly in the last 30 years, whose subject is this place (exterior, interior or a characteristic detail). " +
    "Then one short sentence of reason.";
  writeFileSync(join(dir, "system.txt"), system);
  const args = [
    "-p", "--safe-mode", "--setting-sources", "", "--no-chrome", "--disable-slash-commands",
    "--model", opts.model, "--system-prompt-file", join(dir, "system.txt"),
    "--tools", "Read", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
    "--exclude-dynamic-system-prompt-sections",
    "--settings", '{"alwaysThinkingEnabled":false,"includeGitInstructions":false}',
    "--no-session-persistence", "--max-turns", "4", "--output-format", "json",
    "--max-budget-usd", String(QA_CONFIG.maxBudgetPerCallUsd),
  ];
  return await new Promise<VisionResult>((resolve) => {
    const child = spawn("claude", args, { cwd: dir, env: { ...process.env, MAX_THINKING_TOKENS: "0", DISABLE_PROMPT_CACHING: "1" }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => child.kill("SIGINT"), 120_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.stdin.end(`Classify candidate.jpg${opts.reference ? " against reference.jpg" : ""}.`);
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      try {
        const o = JSON.parse(out.trim().split("\n").filter((l) => l.startsWith("{")).pop() ?? "{}");
        const text: string = typeof o.result === "string" ? o.result : "";
        const label = (text.match(LABELS)?.[0] as VisionLabel) ?? "unsure";
        resolve({ label, reason: text.split("\n").slice(1).join(" ").trim().slice(0, 200), costUsd: Number(o.total_cost_usd ?? 0), ok: o.is_error !== true, error: o.is_error ? String(o.result) : undefined });
      } catch {
        resolve({ label: "unsure", reason: "unparseable", costUsd: 0, ok: false, error: (err || out).slice(0, 300) });
      }
    });
  });
}
