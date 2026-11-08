import { useEffect, useMemo, useState } from "react";
import { Clock, Globe, Phone, ChevronDown } from "lucide-react";
import { fetchPlaceDetails, type OpeningPeriod, type PlaceDetails } from "@/lib/api";
import { useT, useUiLang } from "@/hooks/useT";

/**
 * Practical visit info for an attraction — opening hours, website,
 * phone. Beka 2026-09-01.
 *
 * ── The constraint that shaped this component ─────────────────────
 * "არ გინდა დაგენერირების დაწყება, ეხლა რომ გამოიძახებ ახლიდან მარტო
 *  ეგ დატა მიამატოს ... არსებული ინფო არ დაზიანდეს"
 *
 * So: this block is PURELY ADDITIVE. It mounts alongside the guide,
 * fetches its own data from /api/place-details (Google Places, own
 * table), and renders nothing at all when there's no match. It never
 * blocks, delays, or invalidates the guide — an attraction page with
 * this component removed behaves exactly as it did before.
 *
 * ── Why the hours are rendered and not received as text ───────────
 * The server caches Google's language-NEUTRAL `periods` array (day
 * 0-6 + "HHMM"), not prose. Weekday names and clock times are
 * formatted here through Intl in the user's locale. That is what lets
 * ONE cached row serve all 45 languages — asking Google per-locale
 * would multiply both rows and API quota by 45 to get strings the
 * platform formats correctly for free, including Arabic-Indic
 * numerals, Japanese day markers, and 12- vs 24-hour conventions.
 *
 * ── "Open now" and the timezone trap ──────────────────────────────
 * The user is frequently NOT in the attraction's timezone (planning a
 * Rome trip from Tbilisi). Comparing against the device clock would
 * therefore be wrong for exactly the people this app is built for. We
 * use Google's `utcOffsetMinutes` for the place to compute local time
 * there, and simply omit the status pill when Google doesn't give us
 * an offset — better silent than confidently wrong.
 */

/** Local wall-clock at the PLACE (not the device) as {day 0-6, minutes}. */
function placeLocalNow(utcOffsetMinutes: number): { day: number; minutes: number } {
  const nowUtcMs = Date.now();
  // Shift the instant by the place's offset, then read it in UTC —
  // this yields the place's wall clock without any local-timezone
  // interference from the device.
  const shifted = new Date(nowUtcMs + utcOffsetMinutes * 60_000);
  return {
    day: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** "HHMM" → minutes since midnight. Returns null on malformed input. */
function hhmmToMinutes(hhmm: string): number | null {
  if (!/^\d{4}$/.test(hhmm)) return null;
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2));
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Format "HHMM" in the user's locale.
 *
 * The date part is a throwaway anchor — only the time is rendered —
 * but it must be a real date, so we use a fixed UTC day and force
 * timeZone: "UTC" so the device's own timezone can't shift it.
 */
function formatTime(hhmm: string, locale: string): string {
  const mins = hhmmToMinutes(hhmm);
  if (mins === null) return hhmm;
  const d = new Date(Date.UTC(2000, 0, 2, Math.floor(mins / 60), mins % 60));
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return hhmm;
  }
}

/** Localized weekday names, index 0 = Sunday to match Google's `day`. */
function weekdayNames(locale: string): string[] {
  try {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    // 2000-01-02 was a Sunday, so +i walks Sunday..Saturday.
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(Date.UTC(2000, 0, 2 + i))),
    );
  } catch {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  }
}

/**
 * True when the periods cover the whole week — Google's 24/7 answer.
 *
 * Beka 2026-11-08: this used to recognise ONE shape only, a single
 * period with no `close`. Not one of the 62 cached 24/7 places is
 * stored that way. All of them are a single week-long period that
 * closes one minute before it reopens, e.g. Pérouges:
 *     open { day 0, 00:00 } → close { day 6, 23:59 }
 * (and Hagia Sophia day 3 → day 2, Charles Bridge day 1 → day 0…).
 * So "Open 24 hours" never rendered; those places showed a one-row
 * "week" schedule instead, and an "Open now" that was always true.
 *
 * Measured by total length rather than by shape, so every encoding
 * counts: the no-close form, the wrapped week-minus-a-minute form, and
 * seven daily 00:00–23:59 periods (7 × 1439 = 10 073 minutes, which is
 * why the threshold allows a few minutes short of a full 10 080).
 */
function isAlwaysOpen(periods: OpeningPeriod[]): boolean {
  const WEEK = 7 * 1440;
  let total = 0;
  for (const p of periods) {
    const openMin = hhmmToMinutes(p.open.time);
    if (openMin === null) return false;
    if (!p.close) return true; // open-ended period: open from here on
    const closeMin = hhmmToMinutes(p.close.time);
    if (closeMin === null) return false;
    const start = p.open.day * 1440 + openMin;
    let end = p.close.day * 1440 + closeMin;
    if (end <= start) end += WEEK;
    total += end - start;
  }
  return total >= WEEK - 10;
}

/**
 * Is the place open at `now`?
 *
 * Handles periods that cross midnight (a bar opening Friday 20:00 and
 * closing Saturday 02:00 is stored as one period with open.day=5 and
 * close.day=6). A naive same-day comparison reports such places closed
 * for their entire actual opening window, which is the single most
 * common bug in hand-rolled opening-hours code.
 */
function isOpenAt(periods: OpeningPeriod[], now: { day: number; minutes: number }): boolean {
  if (isAlwaysOpen(periods)) return true;
  const nowAbs = now.day * 1440 + now.minutes;

  for (const p of periods) {
    const openMin = hhmmToMinutes(p.open.time);
    if (openMin === null) continue;
    if (!p.close) return true; // open-ended period
    const closeMin = hhmmToMinutes(p.close.time);
    if (closeMin === null) continue;

    let start = p.open.day * 1440 + openMin;
    let end = p.close.day * 1440 + closeMin;
    // Wrap: closing "before" opening means the period runs into the
    // next week (e.g. Sat 22:00 → Sun 02:00).
    if (end <= start) end += 7 * 1440;

    // Compare the current instant, and also its +1-week image, so a
    // period that wrapped past Saturday still matches early Sunday.
    if ((nowAbs >= start && nowAbs < end) || (nowAbs + 7 * 1440 >= start && nowAbs + 7 * 1440 < end)) {
      return true;
    }
  }
  return false;
}

/** Group periods by opening weekday for the expanded week view. */
function periodsByDay(periods: OpeningPeriod[]): Map<number, OpeningPeriod[]> {
  const map = new Map<number, OpeningPeriod[]>();
  for (const p of periods) {
    const list = map.get(p.open.day) ?? [];
    list.push(p);
    map.set(p.open.day, list);
  }
  return map;
}

export function PracticalInfo({
  name,
  city,
  lat,
  lng,
}: {
  name: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const t = useT();
  const locale = useUiLang();
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    // Deliberately un-awaited by any render path: the guide must never
    // wait on this. A failure resolves to null and the block simply
    // doesn't appear.
    fetchPlaceDetails(name, city, lat, lng).then((d) => {
      if (!cancelled) setDetails(d);
    });
    return () => {
      cancelled = true;
    };
  }, [name, city, lat, lng]);

  const days = useMemo(() => weekdayNames(locale), [locale]);

  const periods = details?.periods ?? null;
  /* "Open 24 hours" every day is treated as NO hours. Beka 2026-11-08:
   * "Medieval city of Pérouges არასწორადაა სამუშაო საათები. თუ არ იცი
   * ზუსტად საერთოდ არ აჩვენო!"
   *
   * Google answered Pérouges with Open 24 hours × 7. So did 61 other
   * cached places, and they split into two kinds — neither of which
   * should be shown:
   *   - open-air places where hours mean nothing: Charles Bridge,
   *     Chinatown, Batumi Boulevard, a village square in Pérouges
   *   - plain WRONG answers: Hagia Sophia (a working mosque, closed to
   *     visitors at prayer times), Burj Khalifa (the observation deck
   *     keeps hours), Spinalonga (ticketed, seasonal). The text search
   *     takes Google's first result, and for these it landed on the
   *     surrounding square or area rather than the monument.
   * A 24/7 answer therefore never tells a visitor anything true they
   * can act on, and sometimes tells them something false. Hiding it is
   * the "if you don't know it exactly, don't show it" rule applied to
   * the one shape we can recognise for certain. Website and phone still
   * render; only the hours row goes. The cached rows are untouched, so
   * this is reversible here alone. */
  const hasHours = Array.isArray(periods) && periods.length > 0 && !isAlwaysOpen(periods);

  // Only computed when Google gave us the place's UTC offset — see the
  // timezone note in the component header.
  const openNow = useMemo(() => {
    if (!hasHours || typeof details?.utcOffsetMinutes !== "number") return null;
    return isOpenAt(periods, placeLocalNow(details.utcOffsetMinutes));
  }, [hasHours, periods, details?.utcOffsetMinutes]);

  const byDay = useMemo<Map<number, OpeningPeriod[]>>(
    () => (hasHours ? periodsByDay(periods) : new Map()),
    [hasHours, periods],
  );

  // Nothing worth showing → render nothing. No empty card, no skeleton
  // that never resolves, no "information unavailable" noise.
  const hasAnything = hasHours || details?.website || details?.phone;
  if (!details || !hasAnything) return null;

  // Order the week starting from the place's own today when we know
  // it, otherwise plain Sunday-first.
  const todayIdx =
    typeof details.utcOffsetMinutes === "number"
      ? placeLocalNow(details.utcOffsetMinutes).day
      : null;
  const weekOrder = Array.from({ length: 7 }, (_, i) => ((todayIdx ?? 0) + i) % 7);

  return (
    <section className="mt-8 px-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
        {t("attr.practical")}
      </h2>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
        {hasHours && (
          <div className="border-b border-border/60">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-smooth active:scale-[0.995]"
            >
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                {/* The "Open 24 hours" label that used to head this
                    ternary is gone with the 24/7 rule above: such
                    places never reach this row now. attr.open24 stays
                    in the locales in case the rule is ever reversed. */}
                {openNow === null ? (
                  // No offset from Google → show the schedule, but no
                  // status claim we can't stand behind.
                  <span className="text-[13px] font-semibold text-foreground">
                    {days[todayIdx ?? 0]}
                  </span>
                ) : (
                  <span
                    className={`text-[13px] font-semibold ${
                      openNow ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {openNow ? t("attr.openNow") : t("attr.closedNow")}
                  </span>
                )}
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {expanded && (
              <div className="px-4 pb-3.5">
                {weekOrder.map((dayIdx) => {
                  const list = byDay.get(dayIdx) ?? [];
                  return (
                    <div
                      key={dayIdx}
                      className={`flex items-baseline justify-between gap-4 py-1 text-[12.5px] ${
                        dayIdx === todayIdx ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span className={dayIdx === todayIdx ? "font-semibold" : ""}>
                        {days[dayIdx]}
                      </span>
                      <span className="text-right">
                        {list.length === 0
                          ? t("attr.closedNow")
                          : list
                              .map((p) =>
                                p.close
                                  ? `${formatTime(p.open.time, locale)} – ${formatTime(p.close.time, locale)}`
                                  : t("attr.open24"),
                              )
                              .join(", ")}
                      </span>
                    </div>
                  );
                })}
                {/* Google's own English lines, shown only when the
                    structured periods are absent but the text isn't —
                    covers seasonal / by-appointment schedules that the
                    periods model can't express. */}
                {byDay.size === 0 && details.weekdayText?.length ? (
                  <div className="pt-1 text-[12.5px] text-muted-foreground">
                    {details.weekdayText.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {details.website && (
          <a
            href={details.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 transition-smooth hover:bg-secondary/40 last:border-b-0"
          >
            <Globe className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
              {t("attr.website")}
            </span>
          </a>
        )}

        {details.phone && (
          // tel: opens the dialer on Android/iOS and is harmless on
          // desktop. The number itself is shown because travellers
          // often need to copy it rather than tap it.
          <a
            href={`tel:${details.phone.replace(/[^\d+]/g, "")}`}
            className="flex items-center gap-3 px-4 py-3.5 transition-smooth hover:bg-secondary/40"
          >
            <Phone className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
              {t("attr.call")}
            </span>
            <span dir="ltr" className="shrink-0 text-[12.5px] text-muted-foreground">
              {details.phone}
            </span>
          </a>
        )}
      </div>
    </section>
  );
}
