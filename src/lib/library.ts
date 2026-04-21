/** Saved/offline guide management via localStorage. */
const KEY = "lokali.library";

export interface SavedGuide {
  id: string;
  name: string;
  city: string;
  image: string;
  durationMin: number;
  savedAt: number;
}

function read(): SavedGuide[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedGuide[]) : [];
  } catch {
    return [];
  }
}

function write(items: SavedGuide[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("lokali:library-changed"));
}

export function getLibrary(): SavedGuide[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function isSaved(id: string): boolean {
  return read().some((g) => g.id === id);
}

export function saveGuide(g: Omit<SavedGuide, "savedAt">) {
  const all = read().filter((x) => x.id !== g.id);
  all.push({ ...g, savedAt: Date.now() });
  write(all);
}

export function removeGuide(id: string) {
  write(read().filter((g) => g.id !== id));
}

/* Recent searches */
const RECENT_KEY = "lokali.recent";

export function getRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addRecent(q: string) {
  if (!q.trim() || typeof window === "undefined") return;
  const all = [q, ...getRecent().filter((x) => x !== q)].slice(0, 6);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(all));
}
