import { Globe2 } from "lucide-react";
import { useT } from "@/hooks/useT";

/**
 * Small badge component shown on attraction cards + the attraction
 * page hero whenever the place matches a UNESCO World Heritage site
 * (see `lib/unesco.isUnescoSite`).
 *
 * Two visual variants:
 *   - "compact" (default): inline pill with a tiny globe + "UNESCO"
 *     label — used on result cards / nearby cards where space is
 *     tight.
 *   - "hero": larger pill with the full "UNESCO World Heritage"
 *     wording — used on the attraction page hero next to the title.
 *
 * Visual: a UN-blue (#009EDB) Globe2 glyph from lucide-react on a
 * matching tinted pill. We use the global `--unesco` colour token
 * so dark + light themes both look right; everywhere else in the
 * app uses the gold accent, this is the one place that should pop
 * blue (it's the United Nations colour, instantly recognisable).
 */
export function UnescoBadge({
  variant = "compact",
  className = "",
}: {
  variant?: "compact" | "hero";
  className?: string;
}) {
  const t = useT();
  const isHero = variant === "hero";

  return (
    <span
      title={t("unesco.title")}
      aria-label={t("unesco.title")}
      style={{
        color: "#009EDB",
        borderColor: "rgba(0,158,219,0.4)",
        backgroundColor: "rgba(0,158,219,0.10)",
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border backdrop-blur-md ${
        isHero
          ? "px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
          : "px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.14em]"
      } ${className}`}
    >
      <Globe2
        className={isHero ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}
        strokeWidth={2.2}
        aria-hidden="true"
      />
      {isHero ? t("unesco.title") : t("unesco.short")}
    </span>
  );
}
