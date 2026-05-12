import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bookmark,
  BookmarkX,
  ArrowLeft,
  Clock,
  Star,
  Headphones,
  Search,
  WifiOff,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { useSavedItems } from "@/hooks/useSavedItems";
import { clearAll, removeItem, type SavedItem } from "@/lib/savedStore";
import { attractionSlug } from "@/lib/api";
import { useT, useTranslated } from "@/hooks/useT";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useLazyPlacePhoto } from "@/hooks/useLazyPlacePhoto";
import { AttractionCardShell } from "@/components/AttractionCardShell";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Saved — Lokali" },
      {
        name: "description",
        content:
          "Your offline library: saved places and narrated guides available without a connection.",
      },
      { property: "og:title", content: "Saved — Lokali" },
      {
        property: "og:description",
        content: "Your offline library of saved places and narrated guides.",
      },
    ],
  }),
  component: SavedPage,
});

function SavedPage() {
  const items = useSavedItems();
  const t = useT();
  const navigate = useNavigate();
  const [online, setOnline] = useState(true);
  const [query, setQuery] = useState("");

  // Same search-bar shape Home uses: any city / landmark / vibe →
  // /results with the typed query. Beka asked for parity so the user
  // never has to bounce back to Home just to look something up.
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    void navigate({ to: "/results", search: { q } });
  }

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        {/* Header */}
        <header className="relative z-10 flex items-center justify-between px-6 pt-12">
          <Link
            to="/"
            aria-label={t("nav.back")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {items.length > 0 && (
            <button
              onClick={() => {
                if (confirm(t("saved.clearConfirm"))) clearAll();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-smooth hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> {t("saved.clear")}
            </button>
          )}
        </header>

        <section className="px-6 pt-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
            <Bookmark className="h-3 w-3" /> {t("saved.offlineLib")}
          </span>
          <h1 className="mt-4 font-display text-[2.25rem] font-medium leading-[1.05]">
            {t("saved.your")}{" "}
            <span className="italic text-primary">{t("nav.saved").toLowerCase()}</span>{" "}
            {t("saved.placesMany")}
          </h1>
          <p className="mt-3 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
            {t("saved.storedHelp")}
          </p>

          {!online && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[11.5px] text-accent">
              <WifiOff className="h-3.5 w-3.5" />
              {t("toast.youreOffline")}
            </div>
          )}

          {/* Search — same shape and behaviour as the Home search
              pill (input + magnifier + symbol-only submit arrow), so
              the user can look up any city / landmark / vibe without
              bouncing back to Home. Submits to /results?q=… exactly
              like Home does. */}
          <form
            onSubmit={submitSearch}
            className="mt-5 flex h-12 items-center gap-3 rounded-full border border-border bg-card px-4 shadow-elegant transition-smooth focus-within:border-primary/60"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("home.searchPlaceholder")}
              enterKeyHint="search"
              autoComplete="off"
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              aria-label={t("home.search")}
              disabled={!query.trim()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground transition-smooth active:scale-95 hover:scale-105 disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>

        {/* List */}
        <section className="mt-7 px-6">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <SavedRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

/**
 * One row of the Saved list. Lifted into its own component so we can
 * call `useTranslated` per-item — Rules-of-Hooks forbids calling it
 * inside a `.map()` body. The row also handles broken thumbnails by
 * falling back to a MapPin glyph when the image URL fails to load
 * (Google Places photo links expire; Wikipedia links sometimes 404).
 */
function SavedRow({ item }: { item: SavedItem }) {
  const t = useT();
  const a = item.attraction;
  const slug = attractionSlug(item.name);
  const hasGuide = !!item.script;
  const [tName, tDuration] = useTranslated([item.name, a.duration ?? ""]);
  const [imgFailed, setImgFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const lang = usePreferredLanguage();

  // Late-bind a thumbnail if the saved item never got one.
  // Originally we relied on either `item.imageDataUrl` (the base64
  // hero snapshot recorded at save time) or `a.image_url` (whatever
  // the attractions API returned for the row). Several saved entries
  // — Beka caught it on his phone — have neither, so the row was
  // rendering just the MapPin glyph. Fetch a Wikipedia / Google
  // Places photo lazily for those rows via the shared hook.
  const fetchedUrl = useLazyPlacePhoto(item.name, {
    lang,
    skip: !!(item.imageDataUrl || a.image_url),
  });

  const resolvedSrc = item.imageDataUrl || a.image_url || fetchedUrl;
  // The shell expects a `photo: string | null`. We mirror SavedRow's
  // original "imageDataUrl || image_url || fetched" priority chain
  // and bail to null on the same conditions (no src OR onError flipped
  // imgFailed). null → shell renders the MapPin placeholder.
  const photo = !imgFailed && resolvedSrc ? resolvedSrc : null;

  return (
    <AttractionCardShell
      as="li"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      photo={photo}
      imgAlt={tName ?? item.name}
      onImgError={() => setImgFailed(true)}
      toggleLabel={{ collapse: t("card.collapse"), expand: t("card.expand") }}
      topPill={
        hasGuide ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-background/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary backdrop-blur-md">
            <Headphones className="h-2.5 w-2.5" /> {t("saved.guideCached")}
          </span>
        ) : undefined
      }
      titleContent={
        <>
          <h3 className="truncate text-[16px] font-semibold leading-tight text-foreground">
            {tName ?? item.name}
          </h3>
          {!hasGuide && (
            <p className="my-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Headphones className="h-2.5 w-2.5" /> {t("card.audioGuide")}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
            {a.duration && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> {tDuration ?? a.duration}
              </span>
            )}
            {typeof a.rating === "number" && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Star className="h-2.5 w-2.5 fill-primary" />
                {a.rating.toFixed(2)}
              </span>
            )}
          </div>
        </>
      }
      actionCount={2}
      actions={
        <>
          <button
            onClick={() => removeItem(item.id)}
            aria-label={t("saved.removeAria", { name: item.name })}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-2 py-2.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] text-muted-foreground transition-smooth hover:border-accent/50 hover:text-accent whitespace-normal break-words"
          >
            <BookmarkX className="h-4 w-4" />
            {t("saved.clear")}
          </button>

          <Link
            to="/attraction/$id"
            params={{ id: slug }}
            search={{ name: item.name }}
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-gold px-2 py-2.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.02] whitespace-normal break-words"
          >
            <Headphones className="h-4 w-4" />
            {t("card.details")}
          </Link>
        </>
      }
      body={
        <div className="border-t border-border px-4 py-4 mt-3 text-[12px] leading-[1.55] text-muted-foreground">
          {(a.outside_desc as string | undefined) ?? a.description ?? t("saved.guideCached")}
        </div>
      }
    />
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
        <Bookmark className="h-5 w-5" />
      </div>
      <h2 className="mt-5 font-display text-[20px]">
        {t("saved.empty")} <span className="italic text-primary">{t("saved.emptyYet")}</span>
      </h2>
      <p className="mt-2 max-w-[260px] text-[12.5px] leading-[1.55] text-muted-foreground">
        {t("saved.emptyHelp")}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-background transition-smooth hover:scale-[1.02]"
      >
        {t("saved.exploreCta")}
      </Link>
    </div>
  );
}
