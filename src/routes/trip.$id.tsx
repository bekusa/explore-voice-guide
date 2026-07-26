import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  GripVertical,
  Headphones,
  Luggage,
  MapPin,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { TripMap } from "@/components/TripMap";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";
import { setAttractionHint } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import {
  deleteTrip,
  getTrip,
  listTripItems,
  moveTripItemToDay,
  persistDayOrder,
  removeTripItem,
  renameTrip,
  shareTrip,
  unshareTrip,
  type Trip,
  type TripItem,
} from "@/lib/tripsStore";

/**
 * /trip/$id — single trip page.
 * Phase 3: day-by-day plan. Two view modes:
 *   - DAYS (default): "Anytime" bucket (day_index 0) + Day 1..N
 *     sections. Items move between days by TAPPING their day badge
 *     and picking a target (reliable on touch), and reorder INSIDE a
 *     day via dnd-kit drag handles (single-container sortable — the
 *     robust subset of drag & drop on mobile).
 *   - CITIES: the Phase-2 read-only grouping by city.
 * Day count comes from the trip's date range when set; otherwise
 * it's max(used days, manual "Add day" presses, 1).
 */
export const Route = createFileRoute("/trip/$id")({
  head: () => ({
    meta: [{ title: "Trip — Lokali" }],
  }),
  component: TripPage,
});

const AUDIO_MIN_PER_PLACE = 8;
const MAX_DAYS = 30;

function dateDiffDays(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 1;
  return Math.min(MAX_DAYS, Math.round((b - a) / 86400000) + 1);
}

/** "Day 3 · 14 Sep" label when the trip has a start date. */
function dayDateLabel(start: string | null, day: number): string | null {
  if (!start) return null;
  const d = new Date(`${start}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (day - 1));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function TripPage() {
  const { id } = Route.useParams();
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [items, setItems] = useState<TripItem[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [view, setView] = useState<"days" | "cities">("days");
  const [extraDays, setExtraDays] = useState(0);
  /** Item id whose day-picker chip row is open, or null. */
  const [movePickFor, setMovePickFor] = useState<string | null>(null);

  const sensors = useSensors(
    // distance/delay guards keep taps and page scrolling working — a
    // drag only starts after a deliberate 6px pull (pointer) or a
    // 180ms hold (touch), so the drag handle never hijacks scroll.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const refresh = useCallback(async () => {
    try {
      const [t0, list] = await Promise.all([getTrip(id), listTripItems(id)]);
      setTrip(t0);
      setItems(list);
    } catch (err) {
      console.warn("[trip] load failed", err);
      setTrip(null);
      setItems(null);
    }
  }, [id]);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || !trip) return;
    void haptic("light");
    try {
      await renameTrip(trip.id, trimmed);
      setTrip({ ...trip, name: trimmed });
    } catch (err) {
      console.warn("[trip] rename failed", err);
    }
    setRenaming(false);
  }

  /**
   * Share (Phase 5). First tap enables sharing + hands the link to
   * the OS share sheet (navigator.share on mobile) or the clipboard.
   * The link row under the header then shows the active link with a
   * copy-again tap and a stop-sharing control.
   */
  async function onShare() {
    if (!trip) return;
    void haptic("light");
    try {
      const sid = await shareTrip(trip.id);
      setTrip({ ...trip, share_id: sid });
      await handOffShareLink(sid);
    } catch (err) {
      console.warn("[trip] share failed", err);
    }
  }

  async function handOffShareLink(sid: string) {
    const url = `https://lokali.travel/t/${sid}`;
    // navigator.share opens the native share sheet inside the
    // Capacitor WebView and on mobile browsers; the clipboard path
    // covers desktop. Both are best-effort.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: { title?: string; url: string }) => Promise<void> }).share(
          { title: trip?.name, url },
        );
        return;
      } catch {
        /* user dismissed the sheet, or share unsupported — fall through */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("trips.linkCopied"));
    } catch {
      /* clipboard blocked — the visible link row still shows the URL */
    }
  }

  async function onUnshare() {
    if (!trip) return;
    void haptic("light");
    try {
      await unshareTrip(trip.id);
      setTrip({ ...trip, share_id: null });
    } catch (err) {
      console.warn("[trip] unshare failed", err);
    }
  }

  async function onDelete() {
    if (!trip) return;
    if (!confirm(t("trips.deleteConfirm"))) return;
    void haptic("medium");
    try {
      await deleteTrip(trip.id);
      void navigate({ to: "/trips" });
    } catch (err) {
      console.warn("[trip] delete failed", err);
    }
  }

  async function onRemoveItem(item: TripItem) {
    void haptic("light");
    setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    try {
      await removeTripItem(item.id);
    } catch (err) {
      console.warn("[trip] remove item failed", err);
      void refresh();
    }
  }

  function openItem(item: TripItem) {
    void haptic("light");
    setAttractionHint(item.attraction_slug, {
      name: item.name,
      ...(item.city ? { city: item.city } : {}),
    });
    void navigate({ to: "/attraction/$id", params: { id: item.attraction_slug } });
  }

  /** Move an item to a target day — optimistic, then persist. */
  async function moveToDay(item: TripItem, day: number) {
    setMovePickFor(null);
    if (item.day_index === day) return;
    void haptic("light");
    const targetCount = (items ?? []).filter(
      (i) => i.day_index === day && i.id !== item.id,
    ).length;
    setItems((prev) =>
      prev
        ? prev.map((i) =>
            i.id === item.id ? { ...i, day_index: day, position: targetCount } : i,
          )
        : prev,
    );
    try {
      await moveTripItemToDay(item.id, day, targetCount);
    } catch (err) {
      console.warn("[trip] move failed", err);
      void refresh();
    }
  }

  /** Reorder inside one day after a drag ends. */
  function onDayDragEnd(day: number, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !items) return;
    const dayItems = items.filter((i) => i.day_index === day);
    const from = dayItems.findIndex((i) => i.id === active.id);
    const to = dayItems.findIndex((i) => i.id === over.id);
    if (from === -1 || to === -1) return;
    void haptic("light");
    const reordered = arrayMove(dayItems, from, to);
    const orderedIds = reordered.map((i) => i.id);
    // Optimistic: rewrite positions locally in one pass.
    setItems((prev) =>
      prev
        ? prev.map((i) =>
            i.day_index === day ? { ...i, position: orderedIds.indexOf(i.id) } : i,
          )
        : prev,
    );
    void persistDayOrder(orderedIds).catch((err) => {
      console.warn("[trip] order persist failed", err);
      void refresh();
    });
  }

  const count = items?.length ?? trip?.itemCount ?? 0;

  // Day count: dates win; otherwise grow with usage / manual adds.
  const dayCount = useMemo(() => {
    const fromDates =
      trip?.start_date && trip?.end_date
        ? dateDiffDays(trip.start_date, trip.end_date)
        : 0;
    const maxUsed = (items ?? []).reduce((m, i) => Math.max(m, i.day_index), 0);
    return Math.min(MAX_DAYS, Math.max(fromDates, maxUsed, 1, 1 + extraDays));
  }, [trip?.start_date, trip?.end_date, items, extraDays]);

  const sortByPos = (a: TripItem, b: TripItem) => a.position - b.position;
  const anytime = (items ?? []).filter((i) => i.day_index === 0).sort(sortByPos);

  // City view groups (Phase 2 behaviour, kept as a secondary lens).
  const cityGroups: Array<{ city: string; items: TripItem[] }> = [];
  if (items) {
    const index = new Map<string, number>();
    for (const item of items) {
      const key = item.city?.trim() || "—";
      let gi = index.get(key);
      if (gi === undefined) {
        gi = cityGroups.length;
        index.set(key, gi);
        cityGroups.push({ city: key, items: [] });
      }
      cityGroups[gi].items.push(item);
    }
  }

  /** One item row — shared between the day view and city view. */
  function ItemRow({
    item,
    draggable,
  }: {
    item: TripItem;
    draggable: boolean;
  }) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3 transition-smooth hover:border-primary/40">
        <button
          onClick={() => openItem(item)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div
            className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/20 to-primary/5"
            style={
              item.image_url
                ? {
                    backgroundImage: `url('${item.image_url}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            {!item.image_url && <MapPin className="h-4 w-4 text-primary/60" />}
          </div>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold leading-tight">
              {item.name}
            </span>
            {item.city && (
              <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                {item.city}
              </span>
            )}
          </span>
        </button>
        {draggable && (
          <button
            onClick={() =>
              setMovePickFor((cur) => (cur === item.id ? null : item.id))
            }
            aria-label={t("trips.moveToDay")}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] transition-smooth ${
              movePickFor === item.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-3 w-3" />
            {item.day_index === 0
              ? t("trips.anytime")
              : t("trips.day").replace("{n}", String(item.day_index))}
          </button>
        )}
        <button
          onClick={() => void onRemoveItem(item)}
          aria-label={t("trips.removeItem")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-smooth hover:border-destructive/40 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  /** Sortable wrapper — drag handle + transform plumbing. */
  function SortableItemRow({ item }: { item: TripItem }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
      useSortable({ id: item.id });
    return (
      <li
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        className={`flex items-center gap-1.5 ${isDragging ? "z-10 opacity-80" : ""}`}
      >
        <button
          {...attributes}
          {...listeners}
          aria-label={t("trips.reorder")}
          className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <ItemRow item={item} draggable />
        </div>
      </li>
    );
  }

  /** Chip row shown under an item when its day badge is tapped. */
  function DayPicker({ item }: { item: TripItem }) {
    return (
      <div className="ml-8 mt-1.5 flex flex-wrap gap-1.5">
        <button
          onClick={() => void moveToDay(item, 0)}
          className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-smooth ${
            item.day_index === 0
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("trips.anytime")}
        </button>
        {Array.from({ length: dayCount }, (_, d) => d + 1).map((d) => (
          <button
            key={d}
            onClick={() => void moveToDay(item, d)}
            className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-smooth ${
              item.day_index === d
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("trips.day").replace("{n}", String(d))}
          </button>
        ))}
        {dayCount < MAX_DAYS && !trip?.end_date && (
          <button
            onClick={() => {
              setExtraDays((v) => Math.max(v, dayCount));
              void moveToDay(item, dayCount + 1);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11.5px] font-bold text-primary transition-smooth hover:bg-primary/20"
          >
            <Plus className="h-3 w-3" /> {t("trips.addDay")}
          </button>
        )}
      </div>
    );
  }

  /** One day section with its own sortable context. */
  function DaySection({ day }: { day: number }) {
    const dayItems = (items ?? [])
      .filter((i) => i.day_index === day)
      .sort(sortByPos);
    const dateLabel = day > 0 ? dayDateLabel(trip?.start_date ?? null, day) : null;
    return (
      <div className="mt-6">
        <div className="mb-2.5 flex items-baseline gap-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {day === 0
              ? t("trips.anytime")
              : t("trips.day").replace("{n}", String(day))}
          </p>
          {dateLabel && (
            <span className="text-[11px] text-muted-foreground/60">{dateLabel}</span>
          )}
        </div>
        {dayItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 px-4 py-3 text-[12px] text-muted-foreground/60">
            {t("trips.dayEmpty")}
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => onDayDragEnd(day, e)}
          >
            <SortableContext
              items={dayItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {dayItems.map((item) => (
                  <div key={item.id}>
                    <SortableItemRow item={item} />
                    {movePickFor === item.id && <DayPicker item={item} />}
                  </div>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    );
  }

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        <header className="relative z-10 flex items-center justify-between px-6 pt-safe">
          <Link
            to="/trips"
            aria-label={t("nav.back")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {trip && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void onShare()}
                aria-label={t("trips.share")}
                className={`grid h-10 w-10 place-items-center rounded-full border transition-smooth ${
                  trip.share_id
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setNewName(trip.name);
                  setRenaming((v) => !v);
                }}
                aria-label={t("trips.rename")}
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-smooth hover:text-foreground"
              >
                {renaming ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              </button>
              <button
                onClick={() => void onDelete()}
                aria-label={t("trips.delete")}
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-smooth hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </header>

        <section className="px-6 pt-6">
          {!user && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-[15px] font-semibold">{t("trips.signInTitle")}</p>
              <Link
                to="/auth"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-gradient-gold px-6 py-2.5 text-[13px] font-bold text-primary-foreground shadow-glow transition-smooth active:scale-95"
              >
                {t("nav.signIn")}
              </Link>
            </div>
          )}
          {user && trip === null && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-[13px] text-muted-foreground">{t("trips.loadFailed")}</p>
              <Link
                to="/trips"
                className="mt-4 inline-flex items-center justify-center rounded-full border border-primary/40 px-5 py-2 text-[12px] font-bold text-primary transition-smooth hover:bg-primary/10"
              >
                {t("nav.back")}
              </Link>
            </div>
          )}

          {user && trip && (
            <>
              {renaming ? (
                <form onSubmit={submitRename} className="mt-2 flex items-center gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={120}
                    autoFocus
                    placeholder={t("trips.renamePh")}
                    className="min-w-0 flex-1 rounded-xl border border-primary/40 bg-background px-4 py-3 font-display text-[22px] text-foreground focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newName.trim()}
                    aria-label={t("trips.rename")}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow transition-smooth active:scale-95 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <h1 className="font-display text-[2rem] font-medium leading-[1.08]">
                  {trip.name}
                </h1>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {count === 1
                    ? t("trips.places.one")
                    : t("trips.places.many").replace("{n}", String(count))}
                </span>
                {count > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Headphones className="h-3.5 w-3.5" />
                    {t("trips.listenEstimate").replace(
                      "{n}",
                      String(count * AUDIO_MIN_PER_PLACE),
                    )}
                  </span>
                )}
                {trip.start_date && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {trip.start_date}
                    {trip.end_date && trip.end_date !== trip.start_date
                      ? ` – ${trip.end_date}`
                      : ""}
                  </span>
                )}
              </div>

              {/* Active share-link row (Phase 5) — tap link to re-copy,
                  X to stop sharing (the /t/ page 404s within ~a minute
                  thanks to the endpoint's short CDN cache). */}
              {trip.share_id && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                  <button
                    onClick={() => void handOffShareLink(trip.share_id as string)}
                    className="min-w-0 flex-1 truncate text-left text-[11.5px] text-primary"
                  >
                    lokali.travel/t/{trip.share_id}
                  </button>
                  <button
                    onClick={() => void onUnshare()}
                    aria-label={t("trips.stopShare")}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-smooth hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {trip.share_id && (
                <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">
                  {t("trips.shareHint")}
                </p>
              )}

              {items && items.length > 0 && <TripMap items={items} />}

              {items && items.length === 0 && (
                <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
                  <Luggage className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-3 text-[15px] font-semibold">{t("trips.emptyTrip")}</p>
                  <p className="mx-auto mt-2 max-w-[280px] text-[12.5px] leading-[1.5] text-muted-foreground">
                    {t("trips.emptyTripDesc")}
                  </p>
                  <Link
                    to="/"
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-2.5 text-[13px] font-bold text-primary-foreground shadow-glow transition-smooth active:scale-95"
                  >
                    <Search className="h-4 w-4" /> {t("trips.findPlaces")}
                  </Link>
                </div>
              )}

              {items && items.length > 0 && (
                <>
                  {/* Days / Cities view toggle */}
                  <div className="mt-6 inline-flex rounded-full border border-border bg-card p-1">
                    {(["days", "cities"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setView(mode)}
                        className={`rounded-full px-4 py-1.5 text-[11.5px] font-bold transition-smooth ${
                          view === mode
                            ? "bg-gradient-gold text-primary-foreground shadow-glow"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode === "days" ? t("trips.viewDays") : t("trips.viewCities")}
                      </button>
                    ))}
                  </div>

                  {view === "days" && (
                    <>
                      {anytime.length > 0 && <DaySection day={0} />}
                      {Array.from({ length: dayCount }, (_, d) => d + 1).map((d) => (
                        <DaySection key={d} day={d} />
                      ))}
                      {dayCount < MAX_DAYS && !trip.end_date && (
                        <button
                          onClick={() => {
                            void haptic("light");
                            setExtraDays((v) => Math.max(v + 1, dayCount));
                          }}
                          className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[12px] font-bold text-primary transition-smooth hover:bg-primary/20"
                        >
                          <Plus className="h-3.5 w-3.5" /> {t("trips.addDay")}
                        </button>
                      )}
                    </>
                  )}

                  {view === "cities" &&
                    cityGroups.map((group) => (
                      <div key={group.city} className="mt-6">
                        {(cityGroups.length > 1 || group.city !== "—") && (
                          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            {group.city}
                          </p>
                        )}
                        <ul className="flex flex-col gap-2">
                          {group.items.map((item) => (
                            <li key={item.id}>
                              <ItemRow item={item} draggable={false} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}
