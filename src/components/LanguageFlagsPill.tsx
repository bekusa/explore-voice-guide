import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
import { useT } from "@/hooks/useT";

/**
 * Rotating language-flag visuals for the home "Available in every
 * language" section.
 *
 * Two exports:
 *  - <LanguageFlagsCluster /> — JUST the auto-rotating flag chips, with
 *    no link/label. Used as the "image" inside the everyLang benefit
 *    card (Beka 2026-06-28: merged the card + the old standalone pill
 *    into one tappable unit, with the moving flags as the visual).
 *  - <LanguageFlagsPill /> — the original Lovable-style badge (cluster +
 *    "Choose your language" + arrow) wrapped in a Link to /language.
 *    Kept for reuse; it now builds on the shared cluster.
 *
 * Note on flags: emoji flags render as real flags on iOS / Android
 * (the app's primary targets) and as 2-letter country codes on Windows
 * desktop — the same OS limitation the existing /language list already
 * lives with. No external assets, fully consistent with the app.
 */

/**
 * Unique flags from the catalogue, so the cycle stays varied even
 * though several locales share a flag (English US/UK, Spanish ES/MX,
 * the Indian languages, etc.).
 */
function useRotatingFlags() {
  const flags = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of LANGUAGES) {
      if (l.flag && !seen.has(l.flag)) {
        seen.add(l.flag);
        out.push(l.flag);
      }
    }
    return out;
  }, []);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (flags.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % flags.length), 1600);
    return () => clearInterval(id);
  }, [flags.length]);

  if (flags.length === 0) return null;
  return [0, 1, 2].map((o) => flags[(idx + o) % flags.length]);
}

/**
 * The rotating flag cluster on its own — 3 overlapping chips that
 * cross-fade every ~1.6 s. No link, no text, so it can sit inside any
 * container (e.g. the everyLang card) as a pure visual.
 */
export function LanguageFlagsCluster({ className = "" }: { className?: string }) {
  const visible = useRotatingFlags();
  if (!visible) return null;

  return (
    <span className={`relative h-7 w-[64px] shrink-0 ${className}`}>
      {visible.map((flag, i) => (
        <span
          key={`${i}-${flag}`}
          className="absolute top-0 grid h-7 w-7 place-items-center rounded-full border border-foreground/10 bg-card text-[15px] leading-none shadow-sm animate-in fade-in zoom-in-95 duration-500"
          style={{ left: i * 19, zIndex: i }}
        >
          {flag}
        </span>
      ))}
    </span>
  );
}

/**
 * Standalone Lovable-style pill: rotating flags + "Choose your language"
 * + arrow, wrapped in a Link to the language picker. Styled to match the
 * dark home pills (border-foreground/15, bg-background/40, blur).
 */
export function LanguageFlagsPill() {
  const t = useT();

  return (
    <Link
      to="/language"
      aria-label={t("home.everyLang.cta")}
      className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/40 py-1.5 pe-3.5 ps-1.5 text-[12px] font-semibold text-foreground backdrop-blur-md transition-smooth hover:bg-background/60 active:scale-95"
    >
      <LanguageFlagsCluster />
      <span>{t("home.everyLang.cta")}</span>
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
    </Link>
  );
}
