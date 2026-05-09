/**
 * LoadingMessages — rotating progress text during slow AI calls.
 *
 * Shown while /api/attractions or /api/guide is fetching a fresh
 * (uncached) response from Claude — typically 5-10 seconds. A static
 * "Loading…" felt dead; this gives the user a sense that the system
 * is doing thoughtful work step by step. Beka's spec was a five-step
 * narrative that feels like progress, not just spinning.
 *
 * Implementation: cycles through an ordered list of i18n keys at
 * `intervalMs` (default 3 s). When it reaches the last message it
 * stays there until the loading state ends — the user shouldn't see
 * the strip wrap back to step 1, which would imply the system gave
 * up and started over.
 *
 * Cross-fade between messages keeps the swap feeling deliberate
 * instead of jumpy.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/hooks/useT";
import type { UiKey } from "@/lib/i18n";

const DEFAULT_STEPS: UiKey[] = [
  "loading.searching",
  "loading.checkingSources",
  "loading.selectingDetails",
  "loading.preparingRecommendations",
  "loading.almostReady",
];

export function LoadingMessages({
  steps = DEFAULT_STEPS,
  // Beka asked for the rotation 5× slower than the original 3 s tempo,
  // so each message holds for 15 s. With LLM fetches typically running
  // 5-15 s, most users will see one or two messages instead of the
  // strip flickering through all five.
  intervalMs = 15000,
  className = "",
}: {
  steps?: UiKey[];
  intervalMs?: number;
  className?: string;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i >= steps.length) {
        // Pin on the last step — see component doc for why.
        clearInterval(id);
        setIndex(steps.length - 1);
        return;
      }
      setIndex(i);
    }, intervalMs);
    return () => clearInterval(id);
  }, [steps, intervalMs]);

  const message = t(steps[index] ?? steps[0]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2.5 text-[12px] text-muted-foreground ${className}`}
    >
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      <span
        // `key` on the span forces React to remount on text change,
        // which re-runs the entry animation for the cross-fade.
        key={index}
        className="animate-fade-in"
      >
        {message}
      </span>
    </div>
  );
}
