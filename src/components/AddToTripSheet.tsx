import { Check, Luggage, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";
import { haptic } from "@/lib/haptics";
import {
  addPlaceToTrip,
  createTrip,
  listTrips,
  type Trip,
} from "@/lib/tripsStore";

/**
 * Post-save "add to trip?" sheet (Trips Phase 2, Beka's spec).
 *
 * Design decision: this is ADDITIVE to the existing save flow, not a
 * gate in front of it. The Save tap still writes to Saved instantly
 * (offline library, audio download — none of that fragile logic is
 * touched); this sheet then floats up and OFFERS to also file the
 * place into a trip. Dismissing it loses nothing. That keeps the
 * one-tap save promise AND gives trips a natural entry point.
 *
 * Rendered only for signed-in users — the caller gates on `user`
 * (Trips is account-only per spec).
 */
export function AddToTripSheet({
  place,
  onClose,
}: {
  place: {
    slug: string;
    name: string;
    city?: string | null;
    imageUrl?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  onClose: () => void;
}) {
  const t = useT();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listTrips()
      .then((list) => {
        if (!cancelled) setTrips(list);
      })
      .catch(() => {
        // Trips unreachable (bad network) — the sheet just offers
        // "new trip"; the save itself already succeeded.
        if (!cancelled) setTrips([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addTo(trip: Trip) {
    if (busyId) return;
    setBusyId(trip.id);
    void haptic("light");
    try {
      await addPlaceToTrip(trip.id, place);
      toast.success(t("trips.addedTo").replace("{name}", trip.name));
      onClose();
    } catch (err) {
      console.warn("[AddToTripSheet] add failed", err);
      toast.error(t("trips.addFailed"));
      setBusyId(null);
    }
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || busyId) return;
    setBusyId("new");
    void haptic("medium");
    try {
      const trip = await createTrip({ name: trimmed });
      await addPlaceToTrip(trip.id, place);
      toast.success(t("trips.addedTo").replace("{name}", trip.name));
      onClose();
    } catch (err) {
      console.warn("[AddToTripSheet] create+add failed", err);
      toast.error(t("trips.addFailed"));
      setBusyId(null);
    }
  }

  return (
    // Floating card pinned above the tab bar — same visual family as
    // InlineAudioPanel. Fixed positioning keeps it above the page
    // scroll; z-index sits under toasts, over content.
    <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-24">
      <div className="mx-auto max-w-md rounded-2xl border border-primary/25 bg-card p-4 shadow-elegant backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex min-w-0 items-center gap-2 text-[13.5px] font-semibold">
            <Luggage className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{t("trips.addToTrip")}</span>
          </p>
          <button
            onClick={onClose}
            aria-label={t("trips.skip")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-smooth hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Trip chips — horizontal scroll, newest first (listTrips
            order). Busy chip shows a check while the insert runs. */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {trips === null && (
            <span className="text-[12px] text-muted-foreground">…</span>
          )}
          {trips?.map((trip) => (
            <button
              key={trip.id}
              onClick={() => void addTo(trip)}
              disabled={busyId !== null}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-[12.5px] font-semibold transition-smooth hover:border-primary/40 disabled:opacity-60"
            >
              {busyId === trip.id ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Luggage className="h-3.5 w-3.5 text-primary/70" />
              )}
              {trip.name}
            </button>
          ))}
          <button
            onClick={() => setShowNew((v) => !v)}
            disabled={busyId !== null}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-2 text-[12.5px] font-bold text-primary transition-smooth hover:bg-primary/20 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> {t("trips.new")}
          </button>
        </div>

        {showNew && (
          <form onSubmit={createAndAdd} className="mt-3 flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("trips.namePh")}
              maxLength={120}
              autoFocus
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newName.trim() || busyId !== null}
              aria-label={t("trips.create")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow transition-smooth active:scale-95 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
