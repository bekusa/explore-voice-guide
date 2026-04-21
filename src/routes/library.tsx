import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, Headphones, Compass } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getLibrary, removeGuide, type SavedGuide } from "@/lib/library";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Your library — Lokali" },
      { name: "description", content: "Your saved audio guides for offline listening." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { t } = useT();
  const [items, setItems] = useState<SavedGuide[]>([]);

  useEffect(() => {
    const refresh = () => setItems(getLibrary());
    refresh();
    window.addEventListener("lokali:library-changed", refresh);
    return () => window.removeEventListener("lokali:library-changed", refresh);
  }, []);

  const handleDelete = (id: string) => {
    removeGuide(id);
    setItems(getLibrary());
  };

  return (
    <div className="animate-slide-in pt-safe">
      <header className="px-5 pb-3 pt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lokali</p>
        <h1 className="mt-0.5 font-display text-3xl text-foreground">{t("library")}</h1>
      </header>

      {items.length === 0 ? (
        <div className="mx-5 mt-8 rounded-3xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-secondary text-primary">
            <Headphones className="h-6 w-6" />
          </div>
          <h2 className="font-display text-xl text-foreground">{t("libraryEmpty")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("libraryEmptyHint")}</p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-card"
          >
            <Compass className="h-4 w-4" />
            {t("exploreNow")}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3 p-5">
          {items.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft"
            >
              <Link
                to="/player/$id"
                params={{ id: g.id }}
                className="flex flex-1 items-center gap-3"
              >
                <img
                  src={g.image}
                  alt={g.name}
                  loading="lazy"
                  width={120}
                  height={120}
                  className="h-16 w-16 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{g.city} · {g.durationMin} min</p>
                </div>
              </Link>
              <button
                onClick={() => handleDelete(g.id)}
                className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
