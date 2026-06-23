import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
import { useT } from "@/hooks/useT";

/**
 * "Available in every language" companion pill — a Lovable-style badge
 * whose flag cluster auto-rotates through Lokali's language catalogue
 * (instead of Lovable's app-connector icons). Three overlapping flag
 * chips cross-fade every ~1.6 s; tapping opens the language picker.
 *
 * Styled to match the dark home pills (border-foreground/15, bg-
 * background/40, backdrop blur) so it sits naturally under the
 * everyLang card.
 *
 * Note on flags: emoji flags render as real flags on iOS / Android
 * (the app's primary targets) and as 2-letter country codes on Windows
 * desktop — the same OS limitation the existing /language list already
 * lives with. No external assets, fully consistent with the app.
 */
export function LanguageFlagsPill() {
  const t = useT();

  // Unique flags from the catalogue, so the cycle stays varied even
  // though several locales share a flag (English US/UK, Spanish ES/MX,
  // the Indian languages, etc.).
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
  const visible = [0, 1, 2].map((o) => flags[(idx + o) % flags.length]);

  return (
    <Link
      to="/language"
      aria-label={t("home.everyLang.cta")}
      className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/40 py-1.5 pe-3.5 ps-1.5 text-[12px] font-semibold text-foreground backdrop-blur-md transition-smooth hover:bg-background/60 active:scale-95"
    >
      {/* Rotating flag cluster — 3 overlapping chips, cross-fading. */}
      <span className="relative h-6 w-[60px] shrink-0">
        {visible.map((flag, i) => (
          <span
            key={`${i}-${flag}`}
            className="absolute top-0 grid h-6 w-6 place-items-center rounded-full border border-foreground/10 bg-card text-[13px] leading-none shadow-sm animate-in fade-in zoom-in-95 duration-500"
            style={{ left: i * 18, zIndex: i }}
          >
            {flag}
          </span>
        ))}
      </span>
      <span>{t("home.everyLang.cta")}</span>
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
    </Link>
  );
}
