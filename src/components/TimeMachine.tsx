import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Hourglass,
  MapPin,
  Play,
  Star,
} from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { useT, useTranslated } from "@/hooks/useT";
import type { UiKey } from "@/lib/i18n";
// Catalog + role whitelist live in lib/timeMachineData.ts so the
// /api/time-machine server route can import them without dragging
// the React UI tree into the worker bundle. We re-export the
// `Attraction` type for any external caller that still imports it
// from this module (HomeScreen's TM strip, route file).
import {
  ATTRACTIONS as ATTRACTIONS_DATA,
  ROLES_META,
  type Attraction,
  type RoleMeta,
  type Tier,
} from "@/lib/timeMachineData";
export type { Attraction, Tier };
export const ATTRACTIONS = ATTRACTIONS_DATA;

// Single source of truth for the role list now lives in
// lib/timeMachineData.ts so the catalog dropdown here AND the
// "switch character" picker on /tm-sim share one definition.
type Role = Omit<RoleMeta, "labelKey" | "hintKey"> & {
  labelKey: UiKey;
  hintKey: UiKey;
};
const ROLES: Role[] = ROLES_META.map((r) => ({
  ...r,
  labelKey: r.labelKey as UiKey,
  hintKey: r.hintKey as UiKey,
}));

const TIER_STYLE: Record<Tier, string> = {
  MVP: "bg-[#c9972a] text-black",
  "TOP 10": "bg-orange-500 text-black",
  "TOP 20": "bg-blue-500 text-white",
};

const SCORE_COLOR: Record<Tier, string> = {
  MVP: "bg-gradient-to-r from-[#c9972a] to-amber-300",
  "TOP 10": "bg-gradient-to-r from-orange-500 to-amber-400",
  "TOP 20": "bg-gradient-to-r from-blue-500 to-cyan-400",
};

// Loading stages — keys resolve via the i18n dictionary at render time
// so the cycling overlay copy follows the user's chosen language.
const LOADING_STAGES: { emoji: string; titleKey: UiKey; subKey: UiKey }[] = [
  {
    emoji: "⌛",
    titleKey: "tm.loading.timeFolding.title",
    subKey: "tm.loading.timeFolding.sub",
  },
  {
    emoji: "🌀",
    titleKey: "tm.loading.historyAwakens.title",
    subKey: "tm.loading.historyAwakens.sub",
  },
  {
    emoji: "🕯",
    titleKey: "tm.loading.candleLit.title",
    subKey: "tm.loading.candleLit.sub",
  },
  {
    emoji: "📜",
    titleKey: "tm.loading.scrollUnfolds.title",
    subKey: "tm.loading.scrollUnfolds.sub",
  },
];

interface TimeMachineProps {
  /**
   * Kept on the props for back-compat with the old simulation flow —
   * we don't use them now that Details navigates to the attraction
   * page instead, but the route file still passes them in.
   */
  language?: string;
  webhookUrl?: string;
  onResult?: (data: unknown) => void;
  /**
   * Optional ID to pre-select on mount. Used by Home's Time Machine
   * strip so tapping a card lands the user directly on that moment
   * (the card auto-expands and scrolls into view).
   */
  initialId?: string | null;
}

export default function TimeMachine({ onResult, initialId }: TimeMachineProps) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | Tier>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [openRoleFor, setOpenRoleFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    initialId ? { [initialId]: true } : {},
  );

  // Honour deep-link from Home: pre-select + scroll the chosen card
  // into view so the user lands right on the moment they tapped.
  useEffect(() => {
    if (!initialId) return;
    setSelectedId(initialId);
    setExpanded((m) => ({ ...m, [initialId]: true }));
    // Defer the scroll until after the cards have rendered.
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`tm-card-${initialId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [initialId]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [cached, setCached] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);

  const toggleSave = (id: string) =>
    setSaved((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const downloadOffline = (id: string) => {
    if (cached.has(id) || downloading) return;
    setDownloading(id);
    setTimeout(() => {
      setCached((c) => new Set(c).add(id));
      setDownloading(null);
    }, 900);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ATTRACTIONS.filter((a) => {
      if (tierFilter !== "ALL" && a.tier !== tierFilter) return false;
      if (!q) return true;
      return [a.name, a.country, a.era, a.situation].some((s) => s.toLowerCase().includes(q));
    });
  }, [query, tierFilter]);

  /**
   * Hand off to the rich /time-machine/$id/$role result page. The
   * page itself owns the simulation fetch, loading skeleton, audio
   * player, save toggle, and the cinematic chrome — same visual
   * idiom as /attraction/$id (Beka's spec: "უნდა იყოს იგივე ფორმატის
   * რაც Attraction შედეგად გამოდის").
   *
   * History: this used to POST inline + show a plain text overlay,
   * which itself had replaced an even worse navigate-to-/attraction
   * placeholder. The current pattern keeps URL state clean (browser
   * back works, simulations are shareable, refresh re-fetches) and
   * matches the reading experience of the rest of the app.
   */
  const handleStart = (attraction: Attraction, roleValue: string) => {
    setSelectedId(attraction.id);
    onResult?.({ navigated_to: attraction.id, role: roleValue });
    void navigate({
      to: "/tm-sim/$id/$role",
      params: { id: attraction.id, role: roleValue },
    });
  };

  return (
    <MobileFrame>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground md:h-[860px]">
        <div className="h-full overflow-y-auto pb-44 scrollbar-hide">
          {/* ─── HERO ─── */}
          <section className="relative px-5 pb-6 pt-12">
            <div className="flex items-center gap-2">
              <Link
                to="/"
                aria-label={t("tm.backToHome")}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                {t("tm.brand")}
              </div>
            </div>

            <h1
              className="mt-4 text-[34px] font-medium leading-[1.05] tracking-[-0.02em]"
              style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
            >
              {t("tm.travelThrough")} <span className="italic text-primary">{t("tm.time")}</span>
            </h1>
            <p className="mt-2.5 text-[12.5px] italic leading-[1.55] text-muted-foreground">
              {t("tm.subtitle")}
            </p>
          </section>

          {/* ─── CARDS GRID (single column on mobile frame) ─── */}
          <section className="px-5 pt-4">
            <div className="flex flex-col gap-3">
              {filtered.map((a) => (
                <TimeMachineCard
                  key={a.id}
                  a={a}
                  isSelected={selectedId === a.id}
                  isOpen={!!expanded[a.id]}
                  onToggleExpand={() => setExpanded((m) => ({ ...m, [a.id]: !m[a.id] }))}
                  roleValue={roles[a.id]}
                  isRoleOpen={openRoleFor === a.id}
                  onToggleRole={() => setOpenRoleFor((cur) => (cur === a.id ? null : a.id))}
                  onPickRole={(rv) => {
                    setRoles((m) => ({ ...m, [a.id]: rv }));
                    setOpenRoleFor(null);
                  }}
                  isSaved={saved.has(a.id)}
                  isCached={cached.has(a.id)}
                  isDownloading={downloading === a.id}
                  loading={false}
                  onToggleSave={() => toggleSave(a.id)}
                  onDownload={() => downloadOffline(a.id)}
                  onStart={() => {
                    const r = roles[a.id];
                    if (!r) {
                      setOpenRoleFor(a.id);
                      return;
                    }
                    handleStart(a, r);
                  }}
                />
              ))}
            </div>
          </section>
        </div>

        {/* The result + loading overlays used to live here, but the
            simulation now opens at /time-machine/$id/$role with the
            full attraction-page layout. The cycling LOADING_STAGES
            copy moved to that route's loading skeleton; the role
            scroller, search, and tier filter are all this component
            needs to do now. */}
      </div>
    </MobileFrame>
  );
}

/**
 * One row in the Time Machine list. Lifted into its own component so we
 * can call `useTranslated` per-card — that batches the visible attraction
 * fields (name, country, era, situation, desc, year) through the
 * translate gateway and re-renders when language changes.
 *
 * Static UI strings (Save/Saved/Download/Details/Score/Choose your role)
 * resolve through `useT` against the UI dictionary so they switch with
 * the rest of the app's chrome.
 */
function TimeMachineCard({
  a,
  isSelected,
  isOpen,
  onToggleExpand,
  roleValue,
  isRoleOpen,
  onToggleRole,
  onPickRole,
  isSaved,
  isCached,
  isDownloading,
  loading,
  onToggleSave,
  onDownload,
  onStart,
}: {
  a: Attraction;
  isSelected: boolean;
  isOpen: boolean;
  onToggleExpand: () => void;
  roleValue: string | undefined;
  isRoleOpen: boolean;
  onToggleRole: () => void;
  onPickRole: (rv: string) => void;
  isSaved: boolean;
  isCached: boolean;
  isDownloading: boolean;
  loading: boolean;
  onToggleSave: () => void;
  onDownload: () => void;
  onStart: () => void;
}) {
  const t = useT();
  // Translate the visible per-attraction text fields in one batch.
  const [name, country, era, situation, desc, year] = useTranslated([
    a.name,
    a.country,
    a.era,
    a.situation,
    a.desc,
    a.year,
  ]);
  const role = ROLES.find((r) => r.value === roleValue);
  const roleLabel = role ? t(role.labelKey) : "";
  const roleHint = role ? t(role.hintKey) : "";

  return (
    <article
      id={`tm-card-${a.id}`}
      className={`relative overflow-hidden rounded-2xl border bg-card transition-smooth ${
        isSelected ? "border-primary shadow-glow" : "border-border hover:border-primary/40"
      }`}
    >
      {/* ── Collapsed header (tap to expand) ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center gap-3 p-3 text-left"
      >
        <div className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl">
          <img
            src={a.image}
            alt={name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[15px] font-semibold leading-tight text-foreground"
            style={{ fontFamily: "'Playfair Display', ui-serif, Georgia, serif" }}
          >
            {/* Decorative emoji removed per Beka — same call as the
                Home strip and museum cards. */}
            {name}
          </h3>
          <p className="my-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Hourglass className="h-2.5 w-2.5" /> {t("tm.title")}
            {isCached && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[8.5px] tracking-[0.12em] text-primary">
                <Download className="h-2 w-2" /> {t("tm.offline")}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {t("tm.minutes", { n: 10 })}
            </span>
            <span className="inline-flex items-center gap-1 text-primary">
              <Star className="h-2.5 w-2.5 fill-primary" /> {(a.score / 10).toFixed(2)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" /> {country}
            </span>
          </div>
        </div>
        <span
          className={`grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-smooth ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* ── Expanded body ── */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 pb-4 pt-4">
            {/* Meta chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-primary">
                {a.tier}
              </span>
              <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {year}
              </span>
              <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {era}
              </span>
            </div>

            {/* Situation / description */}
            <p className="mt-3 text-[12.5px] italic leading-[1.55] text-foreground/80">
              {situation}
            </p>
            <p className="mt-2 text-[12px] leading-[1.55] text-muted-foreground">{desc}</p>

            {/* Score bar */}
            <div className="mt-3.5">
              <div className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                <span>{t("tm.score")}</span>
                <span>{t("tm.scoreOver", { n: a.score, max: 50 })}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-gradient-gold"
                  style={{ width: `${(a.score / 50) * 100}%` }}
                />
              </div>
            </div>

            {/* Inline ROLE dropdown — sits right above the action row */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">
                  {t("tm.chooseRole")}
                </span>
                {role && (
                  <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    {roleHint}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRole();
                }}
                aria-expanded={isRoleOpen}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-left text-[12px] font-semibold text-foreground transition-smooth hover:border-primary/50"
              >
                <span className={role ? "text-foreground" : "text-muted-foreground"}>
                  {role ? `${role.emoji}  ${roleLabel}` : t("tm.selectChar")}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                    isRoleOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isRoleOpen && (
                <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg scrollbar-hide">
                  {ROLES.map((r) => (
                    <RoleOption
                      key={r.value}
                      role={r}
                      active={roleValue === r.value}
                      onPick={() => onPickRole(r.value)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons (Save / Download / Details→Start) */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave();
                }}
                aria-pressed={isSaved}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-smooth ${
                  isSaved
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {isSaved ? (
                  <BookmarkCheck className="h-4 w-4 fill-current" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
                {isSaved ? t("tm.saved") : t("tm.save")}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                disabled={isDownloading}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-smooth ${
                  isCached
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                } disabled:cursor-wait disabled:opacity-70`}
              >
                {isCached ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {isDownloading ? t("tm.saving") : isCached ? t("tm.offline") : t("tm.download")}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStart();
                }}
                disabled={loading}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] shadow-glow transition-smooth disabled:opacity-60 ${
                  role
                    ? "bg-gradient-gold text-primary-foreground hover:scale-[1.02]"
                    : "border border-border bg-card text-muted-foreground"
                }`}
                title={role ? t("tm.startSim") : t("tm.chooseRoleFirst")}
              >
                <Play className="h-4 w-4 fill-current" />
                {t("tm.details")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * One option inside the role dropdown — its own component so the
 * label/hint translations come from the i18n dictionary via `useT`,
 * keeping the dropdown options in step with the rest of the chrome.
 */
function RoleOption({ role, active, onPick }: { role: Role; active: boolean; onPick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-smooth ${
        active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary/60"
      }`}
    >
      <span className="text-base leading-tight">{role.emoji}</span>
      <span className="flex flex-col items-start gap-0.5">
        <span className="text-[12px] font-semibold">{t(role.labelKey)}</span>
        <span className="text-[10px] italic text-muted-foreground">{t(role.hintKey)}</span>
      </span>
    </button>
  );
}
