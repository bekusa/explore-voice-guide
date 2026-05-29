import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  MapPin,
  Play,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  WifiOff,
} from "lucide-react";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useSelectedDestination } from "@/hooks/useSelectedDestination";
import { useT, useTranslated } from "@/hooks/useT";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { InlineAudioPanel } from "@/components/InlineAudioPanel";
import { MobileFrame } from "@/components/MobileFrame";
import type { UiKey } from "@/lib/i18n";
import { DESTINATIONS, type Destination } from "@/lib/destinations";
import { LANGUAGES } from "@/lib/languages";
import { HOME_CITIES } from "@/lib/cityList";
import { CityCard } from "@/components/CityCard";
import { MUSEUMS, type Museum } from "@/lib/topMuseums";
import { attractionSlug } from "@/lib/api";
import { useLazyPlacePhoto } from "@/hooks/useLazyPlacePhoto";
import {
  ATTRACTIONS as TIME_MACHINE_ATTRACTIONS,
  type Attraction as TimeMachineAttraction,
} from "@/components/TimeMachine";

/* ─────────────────────────────────────────────
 * UNIVERSAL HOME · Editorial magazine
 *
 * - Cinematic rotating hero (selected destination)
 * - "Where to next?" location chip → destinations browser
 * - Search bar (any city / landmark / vibe)
 * - Time Machine strip — top 10 immersive moments by score
 * - Featured destinations — large editorial cards
 * - Mini player + tab bar (kept consistent across the app)
 * ───────────────────────────────────────────── */

// Top 10 Time Machine attractions by score — surfaced as the home
// strip so first-time visitors can dip into a moment with one tap.
const TIME_MACHINE_TOP_10 = [...TIME_MACHINE_ATTRACTIONS]
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

// The 3 cities Beka wants surfaced as the brand carousel:
// Tbilisi (Lokali's home base), Rome (the canonical European audio-
// guide city), Istanbul (East–West crossroads). The Paris / Bangkok /
// London / Kyoto / Lisbon / Marrakech hero copy that previously sat in
// i18n.ts and the locale files as leftover entries has been removed
// — re-add the corresponding `hero.<slug>.{country,city,tagline2,blurb}`
// keys to i18n.ts plus translations in each locale file if we want to
// grow the rotation.
const HERO_ROTATION = ["tbilisi", "rome", "istanbul"]
  .map((slug) => DESTINATIONS.find((d) => d.slug === slug))
  .filter((d): d is Destination => !!d);

export function HomeScreen() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const unread = useUnreadCount();
  const selected = useSelectedDestination();
  const t = useT();
  const lang = usePreferredLanguage();
  // Resolve the user's current language entry so the Home top bar
  // can show a flag + native name pill. Beka caught the Home pill
  // defaulting to the Saudi 🇸🇦 flag instead of English — three
  // causes lined up:
  //   1. The LANGUAGES array is sorted alphabetically by English
  //      name, so Arabic is the first entry and any "fall through
  //      to LANGUAGES[0]" branch lands there.
  //   2. The prefix match (e.g. lang="en" → l.code.split("-")[0]
  //      === "en") returns the FIRST English row in alphabetical
  //      order — "English (UK)" beats "English (US)" by ASCII.
  //   3. Anonymous users with no profile / no stored preference
  //      end up at lang="en" specifically, hitting #2.
  // Fix: when the prefix is "en" prefer en-US explicitly; the
  // absolute fallback is en-US, never LANGUAGES[0].
  const prefix = lang.split("-")[0].toLowerCase();
  const activeLang =
    LANGUAGES.find((l) => l.code.toLowerCase() === lang.toLowerCase()) ??
    (prefix === "en" ? LANGUAGES.find((l) => l.code === "en-US") : undefined) ??
    LANGUAGES.find((l) => l.code.split("-")[0].toLowerCase() === prefix) ??
    LANGUAGES.find((l) => l.code === "en-US") ??
    LANGUAGES[0];
  const [query, setQuery] = useState("");
  const [heroIdx, setHeroIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  // True while the Listen panel is open — pauses the 7-second hero
  // rotation so the city behind the playing audio doesn't swap mid-
  // narration (Beka's spec — "თუ დაჭერილია Listen ენაზე Hero უნდა
  // ჩერდებოდეს რომ არ გაწყდეს ვოისი").
  const [listening, setListening] = useState(false);
  // Set true the moment the user taps an arrow or a dot — auto-
  // rotation then stops for the rest of the session. Same UX as the
  // attraction-page photo carousel: surprise movement after someone
  // has engaged feels wrong.
  const [heroPaused, setHeroPaused] = useState(false);

  // Defer client-only state (notifications) until after hydration.
  useEffect(() => setMounted(true), []);

  // Slow rotation through featured cinematic shots. Skipped while
  // the user is listening (Listen panel open) OR has manually swiped
  // to a city via the arrows / dots — `heroPaused` locks in for the
  // rest of the visit once engaged.
  useEffect(() => {
    if (listening || heroPaused || HERO_ROTATION.length <= 1) return;
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_ROTATION.length), 7000);
    return () => clearInterval(t);
  }, [listening, heroPaused]);

  const heroDest = HERO_ROTATION[heroIdx];

  /**
   * Move the carousel to a specific index. Used by both the side
   * arrows and the bottom dots. Wraps negative / out-of-range values
   * so callers can pass `heroIdx - 1` even when at index 0. The first
   * call also flips `heroPaused` on, stopping auto-rotation for good.
   */
  const goHero = (next: number) => {
    const total = HERO_ROTATION.length;
    if (total <= 1) return;
    setHeroPaused(true);
    setHeroIdx(((next % total) + total) % total);
  };

  // Selected-destination chips still translate on the fly — selected
  // can be any of the 30+ catalog entries, so a static dict isn't
  // practical here.
  const [selectedCity, selectedCountry] = useTranslated([selected.city, selected.country]);

  // Hero rotation strings are PRE-TRANSLATED per locale (see
  // hero.<slug>.* in src/lib/i18n.ts + locales). Beka asked for this
  // so the rotation strings — country, italic tagline, blurb, city —
  // never round-trip through /api/translate. Each 7-second tick
  // would have otherwise burned five gateway calls per language for
  // the same hand-authored copy. The literal "Lokali" tagline prefix
  // stays English everywhere (brand name).
  const heroKey = heroDest.slug as "tbilisi" | "rome" | "istanbul";
  const heroCountry = t(`hero.${heroKey}.country` as UiKey);
  const heroPart1 = "Lokali";
  const heroPart2 = t(`hero.${heroKey}.tagline2` as UiKey);
  const heroBlurb = t(`hero.${heroKey}.blurb` as UiKey);
  const heroCity = t(`hero.${heroKey}.city` as UiKey);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Send the query straight to the n8n-backed /results page so any city,
    // country or landmark resolves through the Lokali Attractions workflow.
    navigate({ to: "/results", search: { q } });
  }

  // Build the InlineAudioPanel slot when the user has tapped Listen
  // on the hero. The script is the pre-translated heroBlurb for the
  // currently visible city; closing the panel resumes the rotation.
  const heroFloatingPanel = listening ? (
    <InlineAudioPanel
      name={heroCity}
      script={heroBlurb}
      language={lang}
      onClose={() => setListening(false)}
    />
  ) : null;

  return (
    <MobileFrame floatingPanel={heroFloatingPanel}>
      <div className="relative min-h-full w-full bg-background text-foreground">
        {/* ─── HERO ─── */}
        <section className="relative h-[600px] w-full overflow-hidden">
          {HERO_ROTATION.map((d, i) => (
            <img
              key={d.slug}
              src={d.hero}
              alt={`${d.city}, ${d.country}`}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
                i === heroIdx ? "scale-100 opacity-100" : "scale-105 opacity-0"
              }`}
            />
          ))}
          {/* Constant darkening layer over the photo — invisible on
              the dark theme (the body bg is already dark, so the
              hero photo reads with enough contrast) but kicks in on
              the light theme where Beka caught the photos looking
              washed-out behind the hero copy. Bumped 25% → 45% in
              the second pass after Beka caught the photos still
              reading milky on the Featured Cities row + the home
              hero. Paired with `[.light_&]:` text overrides + drop-
              shadow on the title and blurb below so they stay legible
              on the now-darker wash. */}
          <div className="pointer-events-none absolute inset-0 bg-black/0 [.light_&]:bg-black/65" />
          <div className="absolute inset-0 bg-gradient-hero" />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background/60 to-transparent" />

          {/* Hero carousel chrome — side arrows + bottom dots. Only
              renders when there are at least 2 cities to swipe between,
              so a single-city HERO_ROTATION (e.g. local dev override)
              shows no visual difference. Tapping any of the controls
              freezes auto-rotation for the rest of the visit via
              `setHeroPaused(true)` inside `goHero`. Matches the
              attraction-page photo carousel pattern (see HeroPhotoCarousel
              in attraction.$id.tsx). */}
          {HERO_ROTATION.length > 1 && (
            <>
              {/* Side arrows — glass-morphic so they read on any photo
                  exposure. 44 × 44 tap target for mobile. z-[15] keeps
                  them above the gradient overlays but below the top
                  bar's settings / language icons (z-[5] / z-[15] are
                  both fine because the arrows sit at vertical center
                  and the icons sit at the top — no overlap). */}
              <button
                type="button"
                onClick={() => goHero(heroIdx - 1)}
                aria-label={`Previous city (${HERO_ROTATION[(heroIdx - 1 + HERO_ROTATION.length) % HERO_ROTATION.length].city})`}
                className="absolute left-3 top-1/2 z-[15] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goHero(heroIdx + 1)}
                aria-label={`Next city (${HERO_ROTATION[(heroIdx + 1) % HERO_ROTATION.length].city})`}
                className="absolute right-3 top-1/2 z-[15] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              {/* Bottom dots — sit JUST ABOVE the hero copy block.
                  The hero copy is pinned at `bottom-9` (36px) and its
                  content (badge + h1 + blurb + CTA row) runs ~225px
                  upward, putting the top edge of the copy at roughly
                  bottom-[260px]. Placing the dots at bottom-[268px]
                  leaves a small breathing gap above the badge. Active
                  dot widens to `w-6` per Beka's existing dot-style
                  convention (same on /destinations/$slug carousel). */}
              <div className="pointer-events-none absolute bottom-[268px] left-1/2 z-[14] flex -translate-x-1/2 items-center gap-1.5">
                {HERO_ROTATION.map((d, i) => (
                  <button
                    key={d.slug}
                    type="button"
                    onClick={() => goHero(i)}
                    aria-label={`Go to ${d.city}`}
                    aria-current={i === heroIdx ? "true" : undefined}
                    className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                      i === heroIdx ? "w-6 bg-primary" : "w-1.5 bg-foreground/30 hover:bg-foreground/50"
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Top bar — original Row 1 layout restored (Where next +
              city on the left, Settings + Notifications icons on the
              right), with a new Row 2 BELOW that carries the wider
              language pill. Beka's spec: keep Settings + Notifications
              on top, drop the language pill to its own line so it can
              breathe at full width without crowding the city pill. */}
          {/* Canonical top spacing — mirrors `.pt-safe` in styles.css
              so the home header lines up pixel-perfectly with the
              back-arrow position on every other page. Floor was
              4rem (64 px) briefly, tightened to 2.25rem (36 px)
              when Beka caught the home top bar leaving ~30 px of
              empty space above "WHERE NEXT?" on his real Android
              device. iPhones with notches still get full clearance
              via the env() branch (env+0.75rem); the change only
              narrows top space on bezel-only / hole-punch Android
              phones, which is exactly where the empty band was
              showing up. */}
          <div
            style={{ top: "max(2.25rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
            className="absolute left-5 right-5 z-[5] flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
                  {t("home.whereNext")}
                  {!online && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[9px] tracking-[0.16em] text-accent">
                      <WifiOff className="h-2.5 w-2.5" /> {t("home.offline")}
                    </span>
                  )}
                </div>
                <Link
                  to="/destinations"
                  className="mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate text-[15px] font-semibold text-foreground transition-smooth hover:text-primary"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">
                    {selectedCity}, {selectedCountry}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                </Link>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  to="/settings"
                  aria-label={t("nav.settings")}
                  className="grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
                >
                  <SettingsIcon className="h-4 w-4" />
                </Link>
                <Link
                  to="/notifications"
                  aria-label={t("nav.notifications")}
                  className="relative grid h-10 w-10 place-items-center rounded-full border border-foreground/15 bg-background/40 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
                >
                  <Bell className="h-4 w-4" />
                  {mounted && unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
              </div>
            </div>

            {/* Row 2 — language pill on its own line, right-aligned
                so it visually sits under the icon row above. Wider
                pill with flag + native name so the user sees at a
                glance which language is active, with breathing room
                for long natives like "Português (BR)". */}
            <div className="flex justify-end">
              <Link
                to="/language"
                aria-label={t("nav.language")}
                className="inline-flex h-9 max-w-[180px] items-center gap-1.5 rounded-full border border-foreground/15 bg-background/40 px-3 text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60"
              >
                <span className="text-[14px] leading-none">{activeLang.flag}</span>
                <span className="truncate text-[11px] font-semibold leading-none">
                  {activeLang.native}
                </span>
              </Link>
            </div>
          </div>

          {/* hero copy */}
          <div className="absolute bottom-9 left-5 right-5 z-[5]">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
              <Sparkles className="h-2.5 w-2.5" />
              {t("home.featuredBadge")} · {heroCountry}
            </span>
            {/* Light-theme overrides: text flips to white with drop-
                shadow so it reads against the brighter hero photos.
                Dark theme is unchanged — `text-foreground` already
                resolves to white-ish there. */}
            <h1 className="font-display mt-4 text-[44px] font-medium leading-[0.98] tracking-[-0.025em] text-foreground [.light_&]:text-white [.light_&]:drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
              {heroPart1} <span className="italic text-primary">{heroPart2}</span>
            </h1>
            <p className="mt-4 max-w-[320px] text-[14px] leading-[1.55] text-foreground/75 [.light_&]:text-white/90 [.light_&]:drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              {heroBlurb}
            </p>
            {/* Beka noticed the "Open {city}" verb pushed the button
                wider than the gold pill in some non-English locales —
                e.g. Spanish "Abrir Roma" or German "Öffnen Rom" trim
                fine, but longer compound verbs overflow. Drop the
                verb, keep just the city name with the arrow doing
                the action signaling. */}
            {/* Hero CTA row — the original gold "Open {city}" pill
                is the primary navigation, paired with a secondary
                Listen button that fires the InlineAudioPanel with
                the heroBlurb in the user's language. While Listen is
                active the 7-second hero rotation pauses (see the
                useEffect that gates on `listening`) so the city
                doesn't change mid-sentence. */}
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {/* Hero CTA routes to the city detail page
                  (/destinations/$slug) for the 3 launch cities. Earlier
                  the link went straight to /results; Beka now wants an
                  editorial landing (intro + gallery + practical + auto
                  attractions + etiquette) before the results list. The
                  destination page handles unknown slugs gracefully so
                  if HERO_ROTATION grows past the 3 curated cities the
                  link still works (renders the "not yet covered" empty
                  state). */}
              <Link
                to="/destinations/$slug"
                params={{ slug: heroDest.slug }}
                aria-label={t("home.openCity", { city: heroCity })}
                className="inline-flex h-12 max-w-full items-center gap-2 rounded-full bg-gradient-gold px-6 text-[13px] font-bold uppercase tracking-[0.18em] text-primary-foreground shadow-glow transition-smooth active:scale-95 hover:scale-[1.03]"
              >
                <span className="truncate">{heroCity}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
              <button
                type="button"
                onClick={() => setListening(true)}
                disabled={listening}
                aria-label={t("attr.listen")}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-foreground/25 bg-background/40 px-5 text-[12px] font-bold uppercase tracking-[0.18em] text-foreground backdrop-blur-md transition-smooth active:scale-95 hover:bg-background/60 disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{t("attr.listen")}</span>
              </button>
            </div>
          </div>
        </section>

        {/* ─── SEARCH ─── */}
        <section className="-mt-6 relative z-10 px-5">
          <form
            onSubmit={submitSearch}
            className="flex h-14 items-center gap-3 rounded-full border border-border bg-card px-5 shadow-elegant transition-smooth focus-within:border-primary/60"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("home.searchPlaceholder")}
              enterKeyHint="search"
              autoComplete="off"
              // 200-char cap — same as the /results search box. Stops
              // accidental clipboard floods from going to n8n / Claude.
              maxLength={200}
              className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query.trim() ? (
              // Symbol-only submit — Beka caught the SEARCH text
              // overflowing the input pill in non-Latin locales (the
              // word translates much wider in Georgian, German, etc.).
              // The arrow inside the gold circle is universal and
              // pairs with the Search magnifier on the left for a
              // clean "type → tap arrow" flow.
              <button
                type="submit"
                aria-label={t("home.search")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground transition-smooth active:scale-95 hover:scale-105"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <Link
                to="/destinations"
                aria-label={t("home.browse")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-secondary/60 text-muted-foreground transition-smooth hover:text-foreground"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </form>

          {/* "Available in every language" benefit card — redesigned
              from the original primary-tinted alert (Beka caught it
              reading as a warning instead of a feature). New visual:
              gold gradient sparkle chip on the left + warm prose on
              the right, no uppercase / no border so it feels like a
              positive sticker rather than a notice. Same i18n keys
              (home.everyLang.title / sub) so all 34 locales still
              cover it without re-translating. */}
          <div className="mt-3.5 flex items-start gap-3 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-tight text-foreground">
                {t("home.everyLang.title")}
              </p>
              <p className="mt-1 text-[11.5px] leading-[1.5] text-muted-foreground">
                {t("home.everyLang.sub")}
              </p>
            </div>
          </div>
        </section>

        {/* ─── TOP MUSEUMS STRIP ─── */}
        {/* Beka asked to surface museums ABOVE Time Machine — both
            strips share the same shape, but real museums are the
            wider audience hook than historical-fiction roleplay,
            so they should land first. Tapping a card opens the
            existing /attraction/$id flow keyed by the museum's
            English name. */}
        <section className="mt-9">
          <div className="mb-4 flex items-end justify-between px-5">
            <div>
              <h2 className="font-display text-[22px] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {t("home.museums.title")}
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                {t("home.museums.sub")}
              </p>
            </div>
            <Link
              to="/museums"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary transition-smooth hover:opacity-80"
            >
              {t("home.seeAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
            {MUSEUMS.slice(0, 10).map((m, i) => (
              <MuseumCard key={m.id} museum={m} rank={i + 1} />
            ))}
          </div>
        </section>

        {/* ─── TIME MACHINE STRIP ─── */}
        <section className="mt-9">
          <div className="mb-4 flex items-end justify-between px-5">
            <div>
              <h2 className="font-display text-[22px] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {t("home.timeMachine.title")}
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                {t("home.timeMachine.sub")}
              </p>
            </div>
            <Link
              to="/time-machine"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary transition-smooth hover:opacity-80"
            >
              {t("home.seeAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
            {TIME_MACHINE_TOP_10.map((a, i) => (
              <TimeMachineMomentCard key={a.id} attraction={a} rank={i + 1} />
            ))}
          </div>
        </section>

        {/* ─── FEATURED DESTINATIONS ─── */}
        <section className="mt-10">
          <div className="flex items-end justify-between px-5">
            <div>
              <h2 className="font-display text-[26px] font-medium leading-tight tracking-[-0.02em] text-foreground">
                {t("home.featured.title")}
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                {t("home.featured.sub")}
              </p>
            </div>
            <Link
              to="/destinations"
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary transition-smooth hover:opacity-80"
            >
              {t("home.seeAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-5 flex flex-col gap-4 px-5">
            {HOME_CITIES.map((city) => (
              <CityCard key={city} city={city} />
            ))}
          </div>
        </section>
      </div>
    </MobileFrame>
  );
}

/* ─────────────────────────────────────────────
 * Time Machine moment card — one of the top-10 entries on Home.
 *
 * Cinematic single shot of the moment, era + year tags overlaid, rank
 * pill in the corner. Tap → /time-machine?id=<id>, where the chosen
 * card auto-expands and scrolls into view.
 * ───────────────────────────────────────────── */
/**
 * Museum card for the home strip — small enough to show several in
 * a horizontal scroll, big enough to read at a glance. Tapping it
 * goes straight to /attraction/$id with the museum's English name
 * in the search params, which is the same shape the rest of the app
 * uses for free-text attraction lookups.
 */
function MuseumCard({ museum, rank }: { museum: Museum; rank: number }) {
  const [name] = useTranslated([museum.name]);
  const slug = attractionSlug(museum.name);
  // Wikipedia-sourced photo via the shared hook. scope="artwork"
  // forces the Wikipedia-only path so Tbilisi-biased Google Places
  // results don't pollute the strip.
  const fetched = useLazyPlacePhoto(museum.name, {
    cityHint: museum.city,
    scope: "artwork",
  });
  // Wikipedia URL can 404 after the page mounts (image deleted, etc.).
  // Flip imgFailed → falls back to the LoremFlickr seed image.
  const [imgFailed, setImgFailed] = useState(false);
  // Photo-flash fix (Beka caught this on the Louvre card — it would
  // render the LoremFlickr seed for a beat, then visibly swap to the
  // Wikipedia photo). The cause: `fetched` is null on first paint
  // while Wikipedia is in flight, so `(fetched ?? museum.image)`
  // returned the seed. When Wikipedia resolved a moment later the
  // src swapped and the swap was visible.
  //
  // Fix: don't show the seed image during the brief Wikipedia round-
  // trip — render the gradient + glyph placeholder instead. The
  // LoremFlickr seed only kicks in when Wikipedia genuinely fails
  // (404, dead link). That happens rarely enough that no first-paint
  // flash is the right default.
  const photo = imgFailed ? museum.image : fetched;
  return (
    <Link
      to="/attraction/$id"
      params={{ id: slug }}
      // Pass museum.city as the city hint so the attraction page's
      // hero photo lookup falls into the right country (the Met
      // straight to New York, the Louvre to Paris, …) instead of
      // resolving to a Tbilisi-area lookalike.
      //
      // Forward the resolved card photo too — slide 1 of the
      // attraction page's hero carousel will use it, so the
      // click-through doesn't visually swap to a different angle
      // of the same museum. Beka's spec, 2026-05-20.
      search={{
        name: museum.name,
        city: museum.city,
        // Only forward the resolved Wikipedia photo — NOT the
        // LoremFlickr fallback (`museum.image`). Forwarding the
        // LoremFlickr seed would land slide 1 of the attraction
        // page on a random Flickr photo that isn't actually OF
        // the museum.
        ...(fetched && !imgFailed ? { photo: fetched } : {}),
      }}
      className="group relative h-[170px] w-[240px] flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-card transition-smooth hover:border-primary/50 active:scale-[0.98]"
    >
      {photo ? (
        <img
          src={photo}
          alt={name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
        />
      ) : (
        // Neutral placeholder while Wikipedia is in flight — avoids
        // the LoremFlickr → Wikipedia photo swap Beka caught on the
        // Louvre card. The card's own border + gradient already
        // carry enough visual weight that a brief empty image area
        // reads as "loading" rather than "broken".
        <div className="absolute inset-0 bg-gradient-to-br from-secondary to-card" />
      )}
      {/* Bottom gradient + label are LOCKED to dark/white in both
          themes — `bg-background`-based gradients washed the photo
          milky in light mode (Beka caught it on Featured Cities and
          on this Top Museums strip). Hardcoded black gradient + white
          text + drop-shadow keep the photo punchy and the label legible
          on either theme. Matches the CityCard pattern. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-black/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-primary backdrop-blur-md">
        #{rank}
      </div>
      {/* Beka asked to drop the decorative emoji from museum cards —
          the photo is doing the visual work. */}
      <div className="absolute inset-x-3.5 bottom-3.5">
        <div className="font-display text-[15px] font-medium leading-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] line-clamp-2">
          {name}
        </div>
      </div>
    </Link>
  );
}

function TimeMachineMomentCard({
  attraction,
  rank,
}: {
  attraction: TimeMachineAttraction;
  rank: number;
}) {
  // Free-form fields are translated on the fly; the era / year strings
  // live in the dataset in English so they round-trip through the
  // gateway just like destination blurbs.
  const [name, era] = useTranslated([attraction.name, attraction.era]);
  return (
    <Link
      to="/time-machine"
      search={{ id: attraction.id }}
      className="group relative h-[170px] w-[240px] flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-card transition-smooth hover:border-primary/50 active:scale-[0.98]"
    >
      <img
        src={attraction.image}
        alt={name}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
      />
      {/* Bottom gradient + labels locked dark/white in both themes —
          same fix as MuseumCard and CityCard. The previous
          `bg-background` gradient washed the photo milky in light
          theme; hardcoded black gradient + white text + drop-shadow
          keeps the photo punchy in both. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

      {/* Rank pill */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-black/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-primary backdrop-blur-md">
        <Sparkles className="h-2.5 w-2.5" /> #{rank}
      </div>

      {/* Year pill */}
      <div className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/45 px-2 py-0.5 text-[9.5px] font-semibold tracking-wide text-white/85 backdrop-blur-md">
        {attraction.year}
      </div>

      <div className="absolute inset-x-3.5 bottom-3.5">
        {/* Decorative emoji removed per Beka — same call we made on
            the museum strip; the photo + rank/year pills already
            carry the visual weight. White text + drop-shadow stays
            legible on either theme. */}
        <div className="font-display text-[15px] font-medium leading-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] line-clamp-2">
          {name}
        </div>
        <div className="mt-1 text-[10.5px] leading-snug text-white/75 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
          {era}
        </div>
      </div>
    </Link>
  );
}
