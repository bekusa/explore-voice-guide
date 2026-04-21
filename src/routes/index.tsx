import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, MapPin, Sparkles, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT, hasFirstLaunched } from "@/lib/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { AttractionCard } from "@/components/AttractionCard";
import { CardSkeleton } from "@/components/CardSkeleton";
import { listAttractions, FEATURED_CITIES, type Attraction } from "@/lib/mockApi";
import { getRecent, addRecent } from "@/lib/library";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lokali — Discover audio guides worldwide" },
      { name: "description", content: "Browse featured destinations and generate AI audio guides in 37 languages." },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Attraction[] | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  // First-launch redirect
  useEffect(() => {
    if (!hasFirstLaunched()) {
      navigate({ to: "/splash" });
    }
  }, [navigate]);

  useEffect(() => {
    listAttractions().then(setItems);
    setRecent(getRecent());
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    addRecent(q.trim());
    navigate({ to: "/results", search: { q: q.trim() } });
  };

  return (
    <div className="animate-slide-in pt-safe">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pb-3 pt-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lokali</p>
          <h1 className="mt-0.5 font-display text-3xl leading-tight text-foreground">{t("greeting")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <button
            aria-label="notifications"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground shadow-soft"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Search */}
      <form onSubmit={submit} className="px-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-12 rounded-full border-border bg-card pl-11 text-sm shadow-soft"
            />
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/results", search: { q: "near" } })}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-card"
            aria-label={t("useGPS")}
          >
            <MapPin className="h-5 w-5" />
          </button>
        </div>
      </form>

      {/* Featured chips */}
      <section className="mt-6">
        <h2 className="mb-3 px-5 text-sm font-semibold text-foreground">{t("featured")}</h2>
        <div className="scrollbar-hide flex gap-2 overflow-x-auto px-5 pb-1">
          {FEATURED_CITIES.map((c) => (
            <Link
              key={c.city}
              to="/results"
              search={{ q: c.city }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-soft transition-smooth hover:border-primary"
            >
              <span>{c.flag}</span>
              <span>{c.city}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent */}
      {recent.length > 0 && (
        <section className="mt-6 px-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t("recent")}</h2>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r}>
                <Link
                  to="/results"
                  search={{ q: r }}
                  className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm shadow-soft"
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{r}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Trending grid */}
      <section className="mt-8 px-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Trending</h2>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {items === null
            ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
            : items.slice(0, 6).map((a, i) => <AttractionCard key={a.id} attr={a} priority={i === 0} />)}
        </div>
      </section>
    </div>
  );
}
