import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Clock,
  Download,
  Headphones,
  Loader2,
  MapPin,
  Play,
  Star,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { attractionSlug, fetchGuideFresh } from "@/lib/api";
import { isSaved, removeItem, saveItem } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";
import { getCachedGuide, onGuideCacheChange } from "@/lib/guideCache";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useT } from "@/hooks/useT";

export type NearPlace = {
  id: string;
  title: string;
  subtitle: string;
  img: string;
  duration: string;
  rating: number;
  stops: number;
  distance: string;
  category: string;
  description?: string;
};

export function NearYouCard({
  place,
  expanded,
  onToggle,
}: {
  place: NearPlace;
  expanded: boolean;
  onToggle: () => void;
}) {
  const language = usePreferredLanguage();
  const online = useOnlineStatus();
  const saved = useSavedItems();
  const t = useT();
  const slug = useMemo(() => attractionSlug(place.title), [place.title]);
  const isFav = saved.some((s) => s.id === slug) || isSaved(slug);

  // Live cache state — re-renders when a download finishes / cache cleared
  const [cached, setCached] = useState(false);
  useEffect(() => {
    const refresh = () => setCached(!!getCachedGuide(place.title, language));
    refresh();
    return onGuideCacheChange(refresh);
  }, [place.title, language]);

  const [downloading, setDownloading] = useState(false);

  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFav) {
      removeItem(slug);
      toast(t("toast.removedFromSaved"));
    } else {
      saveItem({
        id: slug,
        name: place.title,
        language,
        savedAt: Date.now(),
        attraction: {
          name: place.title,
          description: place.description ?? place.subtitle,
          rating: place.rating,
          duration: place.duration,
          category: place.category,
          image_url: place.img,
        },
      });
      toast.success(t("toast.saved"), {
        description: t("toast.savedDesc"),
      });
    }
  };

  const downloadOffline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cached) {
      toast.info(t("toast.alreadyCached"), {
        description: t("toast.alreadyCachedDesc"),
      });
      return;
    }
    if (!online) {
      toast.error(t("toast.youreOffline"), {
        description: t("toast.youreOfflineDesc"),
      });
      return;
    }
    setDownloading(true);
    try {
      const script = await fetchGuideFresh(place.title, language);
      if (script) {
        toast.success(t("toast.downloaded"), {
          description: place.title,
        });
        setCached(true);
        // Also mirror into Saved if user marked favorite, so it persists there
        if (isFav) {
          saveItem({
            id: slug,
            name: place.title,
            language,
            savedAt: Date.now(),
            attraction: {
              name: place.title,
              description: place.description ?? place.subtitle,
              rating: place.rating,
              duration: place.duration,
              category: place.category,
              image_url: place.img,
            },
            script,
          });
        }
      } else {
        toast.error(t("toast.noGuide"));
      }
    } catch (err) {
      toast.error(t("toast.downloadFailed"), {
        description: err instanceof Error ? err.message : t("toast.tryAgain"),
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-card transition-smooth ${
        expanded ? "border-primary/50 shadow-elegant" : "border-border hover:border-primary/40"
      }`}
    >
      {/* Header — clickable to toggle */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl">
          <img src={place.img} alt={place.title} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold text-foreground">{place.title}</h3>
          <p className="my-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Headphones className="h-2.5 w-2.5" /> {t("card.audioGuide")}
            {cached && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[8.5px] tracking-[0.12em] text-primary">
                <Download className="h-2 w-2" /> {t("card.offline")}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {place.duration}
            </span>
            <span className="inline-flex items-center gap-1 text-primary">
              <Star className="h-2.5 w-2.5 fill-primary" /> {place.rating}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" /> {place.distance}
            </span>
          </div>
        </div>
        <span
          className={`grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-smooth ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* Expanded body */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border px-4 pb-4 pt-4">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-primary">
                {place.category}
              </span>
              <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("card.stops", { n: place.stops })}
              </span>
              <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {place.subtitle}
              </span>
            </div>

            {/* Description */}
            <p className="mt-3 text-[12.5px] leading-[1.55] text-foreground/75">
              {place.description ?? t("card.fallbackDesc", { title: place.title })}
            </p>

            {/* Action buttons */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                onClick={toggleSave}
                aria-pressed={isFav}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-smooth ${
                  isFav
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {isFav ? (
                  <BookmarkCheck className="h-4 w-4 fill-current" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
                {isFav ? t("card.saved") : t("card.save")}
              </button>

              <button
                onClick={downloadOffline}
                disabled={downloading}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-smooth ${
                  cached
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                } disabled:cursor-wait disabled:opacity-70`}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : cached ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {downloading ? t("card.saving") : cached ? t("card.offline") : t("card.download")}
              </button>

              <Link
                to="/attraction/$id"
                params={{ id: slug }}
                search={{ name: place.title }}
                onClick={(e) => e.stopPropagation()}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-gold px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.02]"
              >
                <ArrowRight className="h-4 w-4" />
                {t("card.details")}
              </Link>
            </div>

            {/* Quick play to player */}
            <Link
              to="/player"
              search={{ name: place.title }}
              onClick={(e) => e.stopPropagation()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-[11px] font-semibold text-foreground transition-smooth hover:border-primary/40"
            >
              <Play className="h-3 w-3 fill-current text-primary" />
              {t("card.play")}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
