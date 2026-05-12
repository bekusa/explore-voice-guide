import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Headphones,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Play,
  Search,
  Sun,
  Trash2,
  User as UserIcon,
  Volume2,
  Download,
  WifiOff,
  Wifi,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { speakWithVoice, useSpeechVoices, voicesForLanguage } from "@/hooks/useSpeechVoices";
import { LANGUAGES, getPreviewPhrase, type Language } from "@/lib/languages";
import { clearAll, getSaved, updateItem } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { fetchGuideFresh } from "@/lib/api";
import {
  clearGuideCache,
  guideCacheCount,
  guideCacheSize,
  onGuideCacheChange,
} from "@/lib/guideCache";
import { useT } from "@/hooks/useT";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Lokali" },
      {
        name: "description",
        content: "Configure your language, narrator voice, theme, and offline library.",
      },
      { property: "og:title", content: "Settings — Lokali" },
      {
        property: "og:description",
        content: "Configure language, voice, theme and offline data.",
      },
    ],
  }),
  component: SettingsPage,
});

type Section = "main" | "voice";

function SettingsPage() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const voices = useSpeechVoices();
  const saved = useSavedItems();
  const t = useT();

  const [section, setSection] = useState<Section>("main");
  // Initialise from the global preferred language so anonymous users
  // (no Supabase profile to read) still see their *current* UI
  // language reflected in the Narrator-Voice row instead of the
  // hardcoded "ka" default. Beka caught the row showing
  // "🇬🇪 ქართული · 0 voices" while he was browsing in English; this
  // was the cause — the langCode local state never picked up the
  // user's actual choice for unauthed sessions.
  const preferredLang = usePreferredLanguage();
  const [langCode, setLangCode] = useState<string>(preferredLang || "en");
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Load profile + theme
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("tg.theme") : null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.classList.toggle("light", stored === "light");
    }
  }, []);

  // Keep langCode in lock-step with the global preferred language —
  // useT/useUiLang are reactive (storage events + custom events on
  // /language picks), so settings should follow without a refresh.
  // This runs in addition to the Supabase load below: anonymous
  // users have no profile row, so the global hook is the only
  // source; signed-in users get the same value via both paths.
  useEffect(() => {
    if (preferredLang) setLangCode(preferredLang);
  }, [preferredLang]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("preferred_language, preferred_voice, display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.preferred_language) setLangCode(data.preferred_language);
        if (data.preferred_voice && data.preferred_voice !== "browser-default")
          setVoiceURI(data.preferred_voice);
        if (data.display_name) setDisplayName(data.display_name);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const language = useMemo<Language>(
    () =>
      LANGUAGES.find((l) => l.code === langCode) ??
      LANGUAGES.find((l) => l.code.split("-")[0] === langCode.split("-")[0]) ??
      LANGUAGES[0],
    [langCode],
  );

  const matchingVoices = useMemo(
    () => voicesForLanguage(voices, language.code),
    [voices, language],
  );

  const activeVoice = useMemo(
    () => matchingVoices.find((v) => v.voiceURI === voiceURI) ?? matchingVoices[0],
    [matchingVoices, voiceURI],
  );

  /* ─── Mutations ─── */

  const updateVoice = async (uri: string) => {
    setVoiceURI(uri);
    if (!user) return;
    await supabase.from("profiles").update({ preferred_voice: uri }).eq("user_id", user.id);
    toast.success(t("toast.voiceUpdated"));
    setSection("main");
  };

  const saveDisplayName = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() || null })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success(t("toast.profileSaved"));
    } catch (err) {
      toast.error(t("toast.couldNotSave"), {
        description: err instanceof Error ? err.message : t("toast.tryAgain"),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    localStorage.setItem("tg.theme", next);
  };

  const previewVoice = () => {
    if (activeVoice) {
      speakWithVoice(getPreviewPhrase(language.code), activeVoice);
    } else {
      toast.info(t("toast.noVoiceAvailable"), {
        description: t("set.noNativeVoice"),
      });
    }
  };

  const clearOffline = () => {
    if (!confirm(t("saved.clearConfirm"))) return;
    clearAll();
    clearGuideCache();
    toast.success(t("toast.libCleared"));
  };

  /* ─── Offline guide cache (live-updating count + size) ─── */
  const [cacheStats, setCacheStats] = useState({ count: 0, bytes: 0 });
  useEffect(() => {
    const refresh = () => setCacheStats({ count: guideCacheCount(), bytes: guideCacheSize() });
    refresh();
    return onGuideCacheChange(refresh);
  }, []);

  const online = useOnlineStatus();
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });

  const downloadAllForOffline = async () => {
    if (!online) {
      toast.error(t("toast.youreOffline"), {
        description: t("toast.youreOfflineDesc"),
      });
      return;
    }
    if (saved.length === 0) {
      toast.info(t("saved.empty"), {
        description: t("saved.emptyHelp"),
      });
      return;
    }
    setDownloading(true);
    setDownloadProgress({ done: 0, total: saved.length });
    let ok = 0;
    let failed = 0;
    for (const item of saved) {
      try {
        const script = await fetchGuideFresh(item.name, language.code);
        if (script) {
          // Mirror the script onto the saved item itself so the Saved page can
          // show "Guide cached" + use it directly when offline.
          updateItem(item.id, { script, language: language.code });
          ok++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      setDownloadProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setDownloading(false);
    if (ok > 0) {
      toast.success(
        ok === 1 ? t("set.downloadedOne", { n: ok }) : t("set.downloadedMany", { n: ok }),
        {
          description: failed
            ? t("set.downloadAvailableFailed", { lang: language.native, n: failed })
            : t("set.downloadAvailable", { lang: language.native }),
        },
      );
    } else {
      toast.error(t("set.downloadFailed"), {
        description: t("set.downloadFailedDesc"),
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  if (loading) {
    return (
      <MobileFrame>
        <div className="grid h-full place-items-center bg-background text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </MobileFrame>
    );
  }

  /* ─── Sub-screens ─── */

  if (section === "voice") {
    return (
      <SubScreen
        title={t("set.narratorVoice")}
        subtitle={`${language.flag} ${language.native} · ${
          matchingVoices.length === 1
            ? t("onb.voiceCountOne", { n: matchingVoices.length })
            : t("onb.voiceCountMany", { n: matchingVoices.length })
        }`}
        onBack={() => setSection("main")}
      >
        <VoiceList
          voices={matchingVoices}
          selectedURI={voiceURI ?? activeVoice?.voiceURI ?? null}
          onPick={updateVoice}
          onPreview={previewVoice}
          languageCode={language.code}
        />
      </SubScreen>
    );
  }

  /* ─── Main settings list ─── */

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        <header className="relative z-10 flex items-center justify-between px-6 pt-12">
          <Link
            to="/"
            aria-label={t("nav.back")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </header>

        <section className="px-6 pt-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {t("set.configuration")}
          </span>
          {/* Single-key title — translating "Tune your" + "journey"
              separately produced broken word order and font-mixing in
              non-English locales (Playfair Display has no Georgian /
              Arabic / CJK glyphs, so the italic span fell back to a
              different font than the regular run, looking like random
              chunks). One key keeps the translated sentence whole. */}
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05] text-primary">
            {t("set.subtitle")}
          </h1>
          <p className="mt-3 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
            {t("set.intro")}
          </p>
        </section>

        {/* Account */}
        {user && (
          <Group title={t("set.account")}>
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
                <UserIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Mail className="h-2.5 w-2.5" /> {t("set.signedInAs")}
                </div>
                <div className="truncate text-[13px] font-semibold">{user.email}</div>
              </div>
            </div>
            <Divider />
            <div className="flex flex-col gap-2 px-4 py-4">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("set.displayName")}
              </label>
              <div className="flex gap-2">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("set.yourName")}
                  className="h-10 rounded-xl border-border bg-background text-[13px]"
                />
                <button
                  onClick={saveDisplayName}
                  disabled={savingProfile}
                  className="rounded-xl bg-foreground px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-background transition-smooth hover:scale-[1.02] disabled:opacity-50"
                >
                  {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("set.save")}
                </button>
              </div>
            </div>
          </Group>
        )}

        {/* Voice (language is on Home only) */}
        <Group title={t("set.audioGuide")}>
          <Row
            icon={<Headphones className="h-4 w-4" />}
            label={t("set.narratorVoice")}
            value={activeVoice?.name ?? t("set.browserDefault")}
            onClick={() => setSection("voice")}
          />
          <Divider />
          <button
            onClick={previewVoice}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-smooth hover:bg-secondary/40"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground">
              <Volume2 className="h-4 w-4" />
            </span>
            <span className="flex-1 text-[13px] font-semibold">{t("set.previewVoice")}</span>
            <Play className="h-3.5 w-3.5 fill-current text-primary" />
          </button>
        </Group>

        {/* Appearance */}
        <Group title={t("set.appearance")}>
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-smooth hover:bg-secondary/40"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-semibold">{t("set.theme")}</span>
              <span className="block text-[11px] text-muted-foreground">
                {theme === "dark" ? t("set.themeDark") : t("set.themeLight")}
              </span>
            </span>
            <span
              className={`relative h-6 w-11 rounded-full transition-smooth ${
                theme === "dark" ? "bg-primary" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-background shadow transition-smooth ${
                  theme === "dark" ? "left-[22px]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </Group>

        {/* Offline mode */}
        <Group title={t("set.offlineMode")}>
          <div className="flex items-center gap-3 px-4 py-4">
            <span
              className={`grid h-9 w-9 place-items-center rounded-full ${
                online ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"
              }`}
            >
              {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            </span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">
                {online ? t("set.youOnline") : t("set.youOffline")}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {online ? t("set.onlineHelp") : t("set.offlineHelp")}
              </div>
            </div>
          </div>
          <Divider />

          {/* The "Saved Guides Cached" summary row used to live
              here, but Beka caught it duplicating the count info
              already surfaced by the Download CTA right below — two
              rows, same numbers. Removed for the cleaner one-row
              layout: status (online/offline) + download action. */}

          <button
            onClick={downloadAllForOffline}
            disabled={downloading || saved.length === 0 || !online}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-smooth hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : downloadProgress.done > 0 && downloadProgress.done === downloadProgress.total ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-semibold">
                {downloading
                  ? t("set.downloading", {
                      done: downloadProgress.done,
                      total: downloadProgress.total,
                    })
                  : saved.length === 1
                    ? t("set.downloadAllOne", { n: saved.length })
                    : t("set.downloadAllMany", { n: saved.length })}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {t("set.downloadDesc", { lang: language.native })}
              </span>
            </span>
            {downloading && downloadProgress.total > 0 && (
              <span className="font-mono text-[10px] text-primary">
                {Math.round((downloadProgress.done / downloadProgress.total) * 100)}%
              </span>
            )}
          </button>
          <Divider />

          <button
            onClick={clearOffline}
            disabled={saved.length === 0 && cacheStats.count === 0}
            className="flex w-full items-center gap-3 px-4 py-4 text-left text-destructive transition-smooth hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/15">
              <Trash2 className="h-4 w-4" />
            </span>
            <span className="flex-1 text-[13px] font-semibold">{t("set.clearLib")}</span>
          </button>
        </Group>

        {/* Danger / session */}
        {user && (
          <div className="px-6 pt-8">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3.5 text-[13px] font-semibold text-foreground transition-smooth hover:border-destructive/50 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              {t("set.signOut")}
            </button>
          </div>
        )}

        <p className="px-6 pt-6 text-center text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {t("set.appVersion")}
        </p>
      </div>
    </MobileFrame>
  );
}

/* ─────────────────────────────────────────────
 * Helpers / sub-components
 * ───────────────────────────────────────────── */

function estimateBytes() {
  try {
    return new Blob([JSON.stringify(getSaved())]).size;
  } catch {
    return 0;
  }
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-6 pt-7">
      <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-border" />;
}

function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-4 text-left transition-smooth hover:bg-secondary/40"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{value}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function SubScreen({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        <header className="flex items-center gap-3 px-6 pt-12">
          <button
            onClick={onBack}
            aria-label={t("nav.back")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">
              {t("set.title")}
            </span>
            <h1 className="font-display text-[22px] leading-tight">{title}</h1>
          </div>
        </header>
        {subtitle && <p className="mt-3 px-6 text-[12px] text-muted-foreground">{subtitle}</p>}
        <div className="px-6 pt-6">{children}</div>
      </div>
    </MobileFrame>
  );
}

function VoiceList({
  voices,
  selectedURI,
  onPick,
  onPreview,
  languageCode,
}: {
  voices: SpeechSynthesisVoice[];
  selectedURI: string | null;
  onPick: (uri: string) => void;
  onPreview: () => void;
  languageCode: string;
}) {
  const t = useT();
  if (voices.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-[13px]">
        <p className="text-foreground">{t("set.noVoiceForLang", { code: languageCode })}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">{t("set.installVoicesHelp")}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {voices.map((v) => {
          const isActive = selectedURI === v.voiceURI;
          return (
            <li key={v.voiceURI}>
              <button
                onClick={() => onPick(v.voiceURI)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-smooth ${
                  isActive
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <span className="flex flex-1 flex-col leading-tight">
                  <span className="text-[14px] font-semibold">{v.name}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {v.lang} · {v.localService ? t("voice.onDevice") : t("voice.cloud")}
                  </span>
                </span>
                {isActive && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        onClick={onPreview}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-[13px] font-semibold transition-smooth hover:border-primary/40"
      >
        <Play className="h-3.5 w-3.5 fill-current" /> {t("set.previewVoice")}
      </button>
    </>
  );
}
