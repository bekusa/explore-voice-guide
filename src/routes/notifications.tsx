import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  Lightbulb,
  Headphones,
  WifiOff,
  Sparkles,
} from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { useNotifications } from "@/hooks/useNotifications";
import {
  clearAll,
  markAllRead,
  markRead,
  removeNotification,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notificationsStore";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Whispers of Old Tbilisi" },
      {
        name: "description",
        content: "Tips, updates, and offline status for your audio journeys.",
      },
      { property: "og:title", content: "Notifications — Whispers of Old Tbilisi" },
      {
        property: "og:description",
        content: "Tips, updates, and offline status for your audio journeys.",
      },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const items = useNotifications();
  const navigate = useNavigate();
  const unread = items.filter((n) => !n.read).length;

  const open = (n: AppNotification) => {
    markRead(n.id);
    if (n.href) navigate({ to: n.href });
  };

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-24 text-foreground">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-border/40 bg-background/85 backdrop-blur-xl">
          <div className="flex items-center justify-between px-5 pt-12 pb-4">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                aria-label="Back"
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/60 transition-smooth hover:bg-background"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="font-display text-[20px] leading-none">
                  Notifications
                </h1>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {unread > 0
                    ? `${unread} unread`
                    : items.length > 0
                      ? "All caught up"
                      : "Inbox empty"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={markAllRead}
                disabled={unread === 0}
                aria-label="Mark all as read"
                className="grid h-9 w-9 place-items-center rounded-full border border-foreground/15 bg-background/60 transition-smooth hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
              <button
                onClick={clearAll}
                disabled={items.length === 0}
                aria-label="Clear all"
                className="grid h-9 w-9 place-items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive transition-smooth hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* List */}
        <section className="px-5 pt-5">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={`group relative flex w-full gap-3 rounded-2xl border p-4 text-left transition-smooth ${
                      n.read
                        ? "border-border/40 bg-card/40 hover:border-border/70"
                        : "border-primary/35 bg-primary/[0.06] hover:border-primary/55"
                    }`}
                  >
                    <KindIcon kind={n.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="truncate text-[13.5px] font-semibold text-foreground">
                          {n.title}
                        </h3>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                        {n.body}
                      </p>
                    </div>
                    {!n.read && (
                      <span
                        aria-hidden
                        className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary"
                      />
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(n.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          removeNotification(n.id);
                        }
                      }}
                      aria-label="Dismiss"
                      className="invisible absolute bottom-2 right-2 grid h-7 w-7 cursor-pointer place-items-center rounded-full text-muted-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive group-hover:visible"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  const map = {
    tip: { Icon: Lightbulb, tone: "bg-accent/15 text-accent" },
    guide: { Icon: Headphones, tone: "bg-primary/15 text-primary" },
    offline: { Icon: WifiOff, tone: "bg-secondary text-foreground/80" },
    system: { Icon: Sparkles, tone: "bg-primary/10 text-primary" },
  } as const;
  const { Icon, tone } = map[kind];
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone}`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-secondary">
        <BellOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mt-5 font-display text-[20px]">No notifications</h2>
      <p className="mt-2 max-w-[260px] text-[12.5px] leading-relaxed text-muted-foreground">
        Tips, journey updates, and offline-cache reminders will land here.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-5 py-2.5 text-[12px] font-semibold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.02]"
      >
        <Bell className="h-3.5 w-3.5" />
        Back to home
      </Link>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString();
}
