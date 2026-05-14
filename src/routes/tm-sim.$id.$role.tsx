import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  User,
} from "lucide-react";
import { LoadingMessages } from "@/components/LoadingMessages";
import { InlineAudioPanel } from "@/components/InlineAudioPanel";
import { MobileFrame } from "@/components/MobileFrame";
import { ATTRACTIONS_BY_ID, ROLES_META, TIME_MACHINE_ROLES } from "@/lib/timeMachineData";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useT, useTranslated } from "@/hooks/useT";
import type { UiKey } from "@/lib/i18n";

/**
 * /tm-sim/$id/$role — the rich result page for one Time Machine
 * simulation. Mirrors the visual structure of /attraction/$id (hero
 * image + title + meta chips + action row + InlineAudioPanel +
 * stacked content sections) so the user gets a consistent reading
 * experience whether they're browsing a real present-day attraction
 * or stepping into a historical moment.
 *
 * Beka's spec evolution:
 *   1. "უნდა იყოს იგივე ფორმატის რაც Attraction შედეგად გამოდის" →
 *      mirror the attraction page chrome.
 *   2. "სათაური არ შეცვალო" → keep the title pinned to the moment's
 *      name. This is a historical story; "Pompeii" stays "Pompeii"
 *      across regenerations and roles, not a per-call AI flourish
 *      like "Pompeii — The Merchant's Last Evening".
 *   3. "დაამატე Player-ი" → use the same InlineAudioPanel component
 *      the attraction page uses (full transport row + scrubber).
 *   4. "პერსონაჟების არჩევა შეგეძლოს ატრაქციონის ფეიჯიდანაც" → role
 *      picker on this page so the user can switch character without
 *      bouncing back to /time-machine.
 */
type SimulationPayload = {
  // We deliberately ignore `title` from the payload — see Beka's
  // spec #2 above. The display title is always the moment's name.
  title?: string;
  intro?: string;
  body?: string;
  epilogue?: string;
  estimated_duration_seconds?: number;
};

export const Route = createFileRoute("/tm-sim/$id/$role")({
  head: ({ params }) => {
    const moment = ATTRACTIONS_BY_ID.get(params.id);
    const title = moment ? `${moment.name} — Time Machine` : "Time Machine";
    return {
      meta: [
        { title: `${title} — Lokali` },
        {
          name: "description",
          content: moment
            ? `Step into ${moment.name} (${moment.year}) as a ${params.role}.`
            : "Time Machine simulation.",
        },
      ],
    };
  },
  component: TimeMachineSimulationPage,
});

function TimeMachineSimulationPage() {
  const { id, role } = Route.useParams();
  const lang = usePreferredLanguage();
  const t = useT();
  const navigate = useNavigate();

  const moment = ATTRACTIONS_BY_ID.get(id);
  const validRole = (TIME_MACHINE_ROLES as readonly string[]).includes(role);

  const [data, setData] = useState<SimulationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Audio panel mount state — lifted up to the page so the panel can
  // sit in MobileFrame's floatingPanel slot (sticky just above the
  // TabBar) instead of inline in the action row. Same pattern as
  // /attraction/$id.
  const [audioOpen, setAudioOpen] = useState(false);

  // Role picker dropdown state.
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  // Save state — keyed locally per (id, role) so the user can star
  // their favourite simulations without coupling to the existing
  // savedStore (which is shaped around real attractions).
  const SAVED_KEY = "tm_saved";
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      setSaved(list.includes(`${id}::${role}`));
    } catch {
      /* noop */
    }
  }, [id, role]);
  const toggleSave = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      const key = `${id}::${role}`;
      const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSaved(next.includes(key));
    } catch {
      /* noop */
    }
  };

  // Fetch the simulation. POSTs to /api/time-machine which will hit
  // cache first; cold path falls through to Anthropic + cache write.
  useEffect(() => {
    if (!moment || !validRole) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Close any open audio panel from the previous role/script — its
    // blob references stale TTS output for a different narrative.
    setAudioOpen(false);
    fetch("/api/time-machine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attractionId: id, role, language: lang }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as
          | (SimulationPayload & { error?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !json || !json.body || json.error) {
          setError(json?.error ?? `Request failed (${res.status})`);
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, role, lang, moment, validRole, reloadTick]);

  // Translate the moment's static fields so the hero meta row stays
  // in the user's chosen language. The simulation prose is already
  // translated server-side by translateTimeMachinePayload.
  const [tName, tYear, tEra, tCountry] = useTranslated(
    moment ? [moment.name, moment.year, moment.era, moment.country] : ["", "", "", ""],
  );

  // Stitch the narrative for TTS. Intro + body + epilogue read as
  // one continuous monologue; double newlines give Azure a natural
  // pause between sections without us having to embed SSML. Computed
  // BEFORE the early returns to keep hook order stable.
  const ttsScript = useMemo(() => {
    const parts = [data?.intro, data?.body, data?.epilogue]
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim());
    return parts.join("\n\n");
  }, [data?.intro, data?.body, data?.epilogue]);

  if (!moment) {
    return (
      <MobileFrame>
        <NotFoundState message={`Unknown moment: ${id}`} />
      </MobileFrame>
    );
  }
  if (!validRole) {
    return (
      <MobileFrame>
        <NotFoundState message={`Unknown role: ${role}`} />
      </MobileFrame>
    );
  }

  // Beka spec #2: the displayed title is ALWAYS the moment's name —
  // never the LLM-generated `title`, which would shift between
  // regenerations and roles. "Pompeii" stays "Pompeii".
  const heroTitle = tName || moment.name;

  const currentRoleMeta = ROLES_META.find((r) => r.value === role);
  const switchRole = (newRole: string) => {
    setRolePickerOpen(false);
    if (newRole === role) return;
    void navigate({
      to: "/tm-sim/$id/$role",
      params: { id, role: newRole },
    });
  };

  const floatingPanel = audioOpen ? (
    <InlineAudioPanel
      name={heroTitle}
      script={ttsScript}
      language={lang}
      onClose={() => setAudioOpen(false)}
    />
  ) : null;

  return (
    <MobileFrame floatingPanel={floatingPanel}>
      <div className="relative min-h-full bg-background pb-10 text-foreground">
        {/* ─── Hero ─── */}
        <section className="relative h-[420px] w-full overflow-hidden">
          <img
            src={moment.image}
            alt={heroTitle}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-hero" />

          <header className="relative z-10 flex items-start justify-between px-6 pt-safe">
            <Link
              to="/time-machine"
              search={{ id }}
              aria-label={t("nav.back")}
              className="grid h-10 w-10 place-items-center rounded-full border border-foreground/20 bg-background/30 backdrop-blur-md transition-smooth hover:bg-background/50"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </header>

          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-7 animate-float-up">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
              <Sparkles className="h-3 w-3" /> {t("tm.brand")}
            </span>
            <h1 className="mt-4 font-display text-[2.25rem] font-medium leading-[1.05] text-foreground">
              {heroTitle}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-foreground/75">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> {tYear || moment.year}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> {tCountry || moment.country}
              </span>
              <span className="inline-flex items-center gap-1.5 text-primary">
                <Star className="h-3 w-3 fill-primary" /> {(moment.score / 10).toFixed(1)}
              </span>
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-foreground/55">
              {tEra || moment.era}
            </p>
          </div>
        </section>

        {/* ─── Action Row ─── */}
        <ActionRow
          script={ttsScript}
          loading={loading}
          saved={saved}
          audioOpen={audioOpen}
          onPlay={() => setAudioOpen(true)}
          onSave={toggleSave}
          onRegenerate={() => setReloadTick((n) => n + 1)}
        />

        {/* ─── Role picker — switch character without leaving the page ─── */}
        <RolePicker
          currentRole={role}
          isOpen={rolePickerOpen}
          onToggle={() => setRolePickerOpen((v) => !v)}
          onPick={switchRole}
          currentLabelKey={currentRoleMeta?.labelKey as UiKey | undefined}
          currentEmoji={currentRoleMeta?.emoji}
        />

        {/* ─── Body ─── */}
        {error && (
          <section className="mt-8 px-6">
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-[13px] text-destructive">
              {error}
            </div>
            <button
              onClick={() => setReloadTick((n) => n + 1)}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground transition-smooth hover:border-primary/50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </section>
        )}

        <AboutSection text={data?.intro} loading={loading} />
        <StorySection text={data?.body} loading={loading} />
        <EpilogueSection text={data?.epilogue} loading={loading} />

        {/* Source-of-truth panel — Beka's hand-written `situation`
            seed. Useful context: the simulation is built outward
            from this fact. Always shown (no LLM call needed). */}
        <SituationSection situation={moment.situation} desc={moment.desc} />
      </div>
    </MobileFrame>
  );
}

/* ─── Action row — Play (opens InlineAudioPanel) + Save + Regenerate ─── */

function ActionRow({
  script,
  loading,
  saved,
  audioOpen,
  onPlay,
  onSave,
  onRegenerate,
}: {
  script: string;
  loading: boolean;
  saved: boolean;
  audioOpen: boolean;
  onPlay: () => void;
  onSave: () => void;
  onRegenerate: () => void;
}) {
  const t = useT();
  const disabled = loading || !script;

  return (
    <section className="px-6 -mt-2 relative z-20">
      <div className="flex items-stretch gap-2.5">
        {/* Play — primary, large, gold. Opens the InlineAudioPanel
            in the MobileFrame floatingPanel slot. Disabled while the
            simulation is still streaming or when the panel is already
            mounted (audio is autoplaying inside it). */}
        <button
          onClick={onPlay}
          disabled={disabled || audioOpen}
          aria-label={t("attr.beginJourney")}
          className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-gradient-gold px-5 py-3.5 text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-70"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px] fill-current" />
            )}
          </span>
          <span className="text-left">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] opacity-70">
              {t("attr.begin")}
            </span>
            <span className="block text-[13px] font-semibold leading-tight">
              {t("attr.listen")}
            </span>
          </span>
        </button>

        {/* Save — wrap-friendly text for non-Latin locales (Georgian
            "შენახულია" / "ჩამოტვირთვა" used to blow past the 64px slot). */}
        <button
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? t("attr.removeFromSaved") : t("attr.saveForOffline")}
          className={`grid w-[64px] place-items-center rounded-2xl border px-1.5 py-2 transition-smooth ${
            saved
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border/70 bg-card text-foreground hover:border-primary/40"
          }`}
        >
          <span className="flex flex-col items-center gap-1">
            {saved ? (
              <BookmarkCheck className="h-4 w-4 fill-current" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
            <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] whitespace-normal break-words">
              {saved ? t("card.saved") : t("card.save")}
            </span>
          </span>
        </button>

        {/* Refresh — re-fetch from the same cache row, useful when
            the row was cleared on the server or for development cycling. */}
        <button
          onClick={onRegenerate}
          disabled={loading}
          aria-label={t("tm.refresh")}
          className="grid w-[64px] place-items-center rounded-2xl border border-border/70 bg-card text-foreground transition-smooth hover:border-primary/40 disabled:opacity-60"
        >
          <span className="flex flex-col items-center gap-1">
            <RotateCcw className="h-4 w-4" />
            <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] whitespace-normal break-words">
              {t("tm.refresh")}
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}

/* ─── Role picker (chip + dropdown) — switch character in place ─── */

function RolePicker({
  currentRole,
  isOpen,
  onToggle,
  onPick,
  currentLabelKey,
  currentEmoji,
}: {
  currentRole: string;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (newRole: string) => void;
  currentLabelKey: UiKey | undefined;
  currentEmoji: string | undefined;
}) {
  const t = useT();
  const currentLabel = currentLabelKey ? t(currentLabelKey) : currentRole;

  return (
    <section className="mt-5 px-6">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">
          {t("tm.chooseRole")}
        </span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-left text-[12px] font-semibold text-foreground transition-smooth hover:border-primary/50"
      >
        <span className="inline-flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {currentEmoji ? `${currentEmoji}  ` : ""}
            {currentLabel}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg scrollbar-hide">
          {ROLES_META.map((r) => (
            <RoleOption
              key={r.value}
              role={r}
              active={currentRole === r.value}
              onPick={() => onPick(r.value)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleOption({
  role,
  active,
  onPick,
}: {
  role: (typeof ROLES_META)[number];
  active: boolean;
  onPick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-smooth ${
        active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary/60"
      }`}
    >
      <span className="text-base leading-tight">{role.emoji}</span>
      <span className="flex flex-col items-start gap-0.5">
        <span className="text-[12px] font-semibold">{t(role.labelKey as UiKey)}</span>
        <span className="text-[10px] italic text-muted-foreground">{t(role.hintKey as UiKey)}</span>
      </span>
    </button>
  );
}

/* ─── Content sections (mirror /attraction/$id idioms) ─── */

function AboutSection({ text, loading }: { text?: string; loading: boolean }) {
  const t = useT();
  if (loading) {
    return (
      <section className="mt-8 px-6">
        <h2 className="font-display text-[20px] text-foreground">
          {t("attr.aboutWord")} <span className="italic text-primary">{t("attr.thisPlace")}</span>
        </h2>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/60" />
        </div>
      </section>
    );
  }
  if (!text || !text.trim()) return null;
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[20px] text-foreground">
        {t("attr.aboutWord")} <span className="italic text-primary">{t("attr.thisPlace")}</span>
      </h2>
      <p className="mt-4 text-[13.5px] leading-relaxed text-foreground/80">{text.trim()}</p>
    </section>
  );
}

function StorySection({ text, loading }: { text?: string; loading: boolean }) {
  const t = useT();
  const paragraphs = useMemo(
    () =>
      (text ?? "")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    [text],
  );

  if (loading) {
    return (
      <section className="mt-8 px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-[20px] text-foreground">
            {t("attr.theWord")} <span className="italic text-primary">{t("attr.story")}</span>
          </h2>
        </div>
        <LoadingMessages />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-secondary/70" />
          <div className="h-3 w-9/12 animate-pulse rounded bg-secondary/60" />
          <div className="h-3 w-10/12 animate-pulse rounded bg-secondary/60" />
        </div>
      </section>
    );
  }
  if (paragraphs.length === 0) return null;
  return (
    <section className="mt-8 px-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-display text-[20px] text-foreground">
          {t("attr.theWord")} <span className="italic text-primary">{t("attr.story")}</span>
        </h2>
      </div>
      <div className="mt-4 space-y-4 text-[15.5px] leading-[1.75] text-foreground/90">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

function EpilogueSection({ text, loading }: { text?: string; loading: boolean }) {
  if (loading) return null;
  if (!text || !text.trim()) return null;
  return (
    <section className="mt-8 px-6">
      <div className="rounded-2xl border border-border/60 bg-card/40 px-5 py-4 text-[13px] italic leading-relaxed text-foreground/80">
        {text.trim()}
      </div>
    </section>
  );
}

function SituationSection({ situation, desc }: { situation: string; desc: string }) {
  return (
    <section className="mt-8 px-6">
      <h2 className="font-display text-[16px] text-foreground/70">
        Scene <span className="italic text-primary">setup</span>
      </h2>
      <p className="mt-3 text-[12.5px] italic leading-[1.55] text-foreground/65">{situation}</p>
      <p className="mt-2 text-[11.5px] leading-[1.55] text-muted-foreground">{desc}</p>
    </section>
  );
}

function NotFoundState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[14px] text-muted-foreground">{message}</p>
      <Link
        to="/time-machine"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground transition-smooth hover:border-primary/50"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Time Machine
      </Link>
    </div>
  );
}
