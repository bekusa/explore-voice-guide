/**
 * Local notifications store — alerts, tips, and updates surfaced inside the app.
 * Persisted to localStorage so the unread badge survives reloads and works offline.
 */

export type NotificationKind = "tip" | "guide" | "offline" | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  href?: string;
};

const KEY = "tg.notifications.v1";
const MAX_ITEMS = 50;
const EVENT = "tg:notifications-changed";
const SEED_KEY = "tg.notifications.seeded.v1";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function emit() {
  if (isBrowser()) window.dispatchEvent(new CustomEvent(EVENT));
}

export function getNotifications(): AppNotification[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: AppNotification[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    emit();
  } catch (err) {
    console.warn("Notifications store full", err);
  }
}

export function addNotification(
  n: Omit<AppNotification, "id" | "createdAt" | "read"> &
    Partial<Pick<AppNotification, "id" | "createdAt" | "read">>,
) {
  const list = getNotifications();
  const item: AppNotification = {
    id: n.id ?? `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: n.createdAt ?? Date.now(),
    read: n.read ?? false,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
  };
  list.unshift(item);
  write(list);
  return item;
}

export function markRead(id: string) {
  const list = getNotifications().map((n) =>
    n.id === id ? { ...n, read: true } : n,
  );
  write(list);
}

export function markAllRead() {
  write(getNotifications().map((n) => ({ ...n, read: true })));
}

export function removeNotification(id: string) {
  write(getNotifications().filter((n) => n.id !== id));
}

export function clearAll() {
  write([]);
}

export function unreadCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

export function onNotificationsChange(cb: () => void): () => void {
  if (!isBrowser()) return () => {};
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const custom = () => cb();
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, custom);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, custom);
  };
}

/** First-run seed so the inbox isn't empty. */
export function seedDefaultsOnce() {
  if (!isBrowser()) return;
  if (localStorage.getItem(SEED_KEY)) return;
  localStorage.setItem(SEED_KEY, "1");
  const now = Date.now();
  write([
    {
      id: "seed_welcome",
      kind: "system",
      title: "Welcome to Voices of Old Tbilisi",
      body: "Pick a place from Near You to begin a narrated journey.",
      createdAt: now,
      read: false,
    },
    {
      id: "seed_offline",
      kind: "offline",
      title: "Offline mode is ready",
      body: "Save attractions to listen without an internet connection.",
      createdAt: now - 1000 * 60 * 60,
      read: false,
      href: "/settings",
    },
    {
      id: "seed_tip",
      kind: "tip",
      title: "Try a different language",
      body: "Tap the globe in the top bar to switch the narration language.",
      createdAt: now - 1000 * 60 * 60 * 6,
      read: true,
      href: "/language",
    },
  ]);
}
