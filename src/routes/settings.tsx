import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Globe,
  Headphones,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Play,
  Search,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
  UserX,
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
import { useAuth, clearAllLocalUserData } from "@/hooks/useAuth";
import {
  azureVoicesForLanguage,
  defaultVoiceFor,
  resolveAzureVoice,
  type AzureVoice,
} from "@/lib/azureVoices";
import { clearVoicePreviewCache, playVoicePreview } from "@/lib/voicePreview";
import { LANGUAGES, getPreviewPhrase, type Language } from "@/lib/languages";
import { clearAll, getSaved, updateItem } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { fetchGuideFresh, attractionSlug } from "@/lib/api";
import { clearOfflineStore, fetchAndCacheTour } from "@/lib/offlineStore";
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
  // Azure voice NAME (e.g. "ka-GE-EkaNeural"). profiles.preferred_voice
  // historically stored a browser SpeechSynthesisVoice URI which had
  // nothing to do with the cloud audio playback. Legacy values are
  // silently ignored on load (see `activeVoice` below).
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
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
        // Only accept Azure-shaped voice names (locale prefix +
        // "Neural" suffix). Legacy browser URIs ("Google US English",
        // "Microsoft David Mobile - …", "browser-default") get
        // dropped — the language fallback below will pick the
        // language's default Azure voice instead.
        if (data.preferred_voice && /-[A-Z][A-Za-z]+Neural$/.test(data.preferred_voice)) {
          setVoiceName(data.preferred_voice);
        }
        if (data.display_name) setDisplayName(data.display_name);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Free preview blob URLs when leaving Settings.
  useEffect(() => () => clearVoicePreviewCache(), []);

  const language = useMemo<Language>(
    () =>
      LANGUAGES.find((l) => l.code === langCode) ??
      LANGUAGES.find((l) => l.code.split("-")[0] === langCode.split("-")[0]) ??
      LANGUAGES[0],
    [langCode],
  );

  const matchingVoices = useMemo<AzureVoice[]>(
    () => azureVoicesForLanguage(language.code),
    [language],
  );

  const activeVoice = useMemo<AzureVoice | undefined>(
    () =>
      matchingVoices.find((v) => v.name === voiceName) ??
      defaultVoiceFor(language.code) ??
      undefined,
    [matchingVoices, voiceName, language],
  );

  /* ─── Mutations ─── */

  const updateVoice = async (azureName: string) => {
    // Snapshot the previous voice BEFORE overwriting state so we can
    // purge orphan audio cached under the old (slug, lang, oldVoice)
    // tuple. Without this, switching voices grows the offline cache
    // forever — each save creates a new mp3 under the new voice key
    // and the old file sits on disk unreachable (Beka 2026-06-11
    // audit). The script doesn't change with voice so we keep that.
    const previousVoice = voiceName;
    setVoiceName(azureName);

    if (!user) {
      // No profile to update; still wipe orphan audio for guest users
      // who downloaded with a previous voice id this session.
      if (previousVoice && previousVoice !== azureName) {
        void clearOfflineStore().catch(() => {
          /* best-effort — orphans are wasted space, not bugs */
        });
      }
      return;
    }
    // UPSERT so a missing profile row (trigger race on a fresh
    // project) doesn't silently fail — UPDATE with no matching row
    // resolves cleanly but writes nothing, leaving Settings to lie
    // about success. UPSERT + RLS (auth.uid() = user_id on both
    // insert and update policies) closes that hole.
    const { error } = await supabase.from("profiles").upsert(
      { user_id: user.id, preferred_voice: azureName },
      { onConflict: "user_id" },
    );
    if (error) {
      type SupaErr = { message?: string; code?: string };
      const e = error as SupaErr;
      const detail = e.code ? `${e.message ?? ""} [${e.code}]` : (e.message ?? "");
      console.error("[settings] voice upsert failed", error);
      toast.error(t("toast.couldNotSave"), { description: detail });
      return;
    }
    // Voice change committed — wipe the offline audio cache so
    // future plays render with the new voice. We do this AFTER the
    // database write succeeds so a failed upsert doesn't strand the
    // user with deleted downloads + an unchanged voice setting.
    // Scripts stay (independent of voice), audio gets re-fetched on
    // next play. Marking saved items audioReady:false would be
    // ideal but is deferred — for v1.0 the "tap save again" hint
    // (set.deleteAccountBlurb pattern) is good enough.
    if (previousVoice && previousVoice !== azureName) {
      void clearOfflineStore().catch(() => {
        /* best-effort — orphans are wasted space, not bugs */
      });
    }
    toast.success(t("toast.voiceUpdated"));
    setSection("main");
  };

  const saveDisplayName = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      // UPSERT — see updateVoice above for rationale (missing row
      // race on the new Supabase project).
      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          display_name: displayName.trim() || null,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success(t("toast.profileSaved"));
    } catch (err) {
      type SupaErr = { message?: string; code?: string };
      const e = err as SupaErr;
      const detail = e?.code ? `${e.message ?? ""} [${e.code}]` : (e?.message ?? t("toast.tryAgain"));
      console.error("[settings] display name upsert failed", err);
      toast.error(t("toast.couldNotSave"), { description: detail });
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

  // Preview a specific Azure voice via /api/tts — same path the
  // narrated guides use, so what you hear in preview matches what
  // you'll hear during playback. Caches per voice (see voicePreview.ts)
  // so a/b clicks don't burn Azure characters.
  const previewVoice = async (azureName: string) => {
    setPreviewingVoice(azureName);
    try {
      await playVoicePreview({
        voice: azureName,
        language: language.code,
        phrase: getPreviewPhrase(language.code),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(t("toast.couldNotLoadGuide"), {
        description: msg || t("toast.tryAgainPlease"),
      });
    } finally {
      setPreviewingVoice(null);
    }
  };

  const clearOffline = () => {
    if (!confirm(t("saved.clearConfirm"))) return;
    clearAll();
    clearGuideCache();
    // Also nuke persisted mp3 + script blobs (the heavy stuff in
    // Filesystem / IndexedDB). Fire-and-forget — the toast fires
    // immediately for snappy feedback; if the disk wipe fails the
    // user can re-clear and we won't double-download anyway because
    // saveAudioBlob is idempotent.
    void clearOfflineStore().catch(() => {});
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
    // Resolve the user's Azure voice once outside the loop so we
    // don't redo the same profile read for every tour. voiceName is
    // already in component state (loaded by the earlier profile
    // effect); resolveAzureVoice picks the language default when
    // the user's pick is for a different language.
    const voice = resolveAzureVoice(language.code, voiceName) ?? "";
    for (const item of saved) {
      try {
        const script = await fetchGuideFresh(item.name, language.code);
        if (script) {
          // Mirror the script onto the saved item itself so the Saved page can
          // show "Guide cached" + use it directly when offline.
          updateItem(item.id, { script, language: language.code });
          // Audio: best-effort. If this fails (Azure rate-limited,
          // voice unsupported for this locale) we still count the
          // tour as "downloaded" — the script is enough to read it,
          // and the audio will lazy-fetch the next time the user
          // taps Begin journey for it online.
          if (voice) {
            void fetchAndCacheTour({
              slug: attractionSlug(item.name),
              script,
              language: language.code,
              voice,
            });
          }
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

  /* ─── Delete Account (Google Play 2024+ requirement) ─────────────
   * Two-step flow: tap → confirmation modal → confirm → server call
   * + local wipe + signOut. The confirmation is non-skippable for
   * UX safety AND Play Store: a single-tap account deletion would
   * fail the review (accidental taps).
   *
   * Server call: POST /api/account/delete with the user's access
   * token. The route runs as a Cloudflare Worker, uses Supabase
   * service-role to delete saved_tours + profiles + auth.users,
   * and returns { ok: true } on success.
   *
   * After server success we:
   *   1. Wipe every local user-data store (clearAllLocalUserData)
   *   2. supabase.auth.signOut to clear the in-memory session
   *   3. Navigate to /auth (delete flow takes the user back to a
   *      signed-out start; they're free to create a new account
   *      immediately if they wish).
   *
   * On server failure we leave the local state intact so the user
   * can retry from the same screen.
   */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // Pull the current access token from the live session — we
      // do NOT trust an externally-passed token. Without a token
      // the server refuses to act, which is by design.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error(t("set.deleteFailedTitle"), {
          description: t("set.deleteFailedSession"),
        });
        return;
      }
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("[settings] delete account failed", res.status, errText);
        toast.error(t("set.deleteFailedTitle"), {
          description: t("set.deleteFailedDesc"),
        });
        return;
      }
      // Server is happy — wipe locally and sign out.
      try {
        await clearAllLocalUserData();
      } catch (err) {
        console.warn("[settings] local wipe after delete failed", err);
      }
      try {
        await supabase.auth.signOut();
      } catch {
        /* session may already be invalid since we just deleted the user */
      }
      toast.success(t("set.deleteSuccessTitle"), {
        description: t("set.deleteSuccessDesc"),
      });
      setDeleteConfirmOpen(false);
      navigate({ to: "/auth" });
    } catch (err) {
      console.warn("[settings] delete account threw", err);
      toast.error(t("set.deleteFailedTitle"), {
        description: t("set.deleteFailedDesc"),
      });
    } finally {
      setDeleting(false);
    }
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
          selectedName={voiceName ?? activeVoice?.name ?? null}
          onPick={updateVoice}
          onPreview={previewVoice}
          previewingVoice={previewingVoice}
          languageCode={language.code}
        />
      </SubScreen>
    );
  }

  /* ─── Main settings list ─── */

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        <header className="relative z-10 flex items-center justify-between px-6 pt-safe">
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

        {/* Account — split into two visual paths.
            ▸ Anonymous (guest) users see a prominent "Save your
              account" CTA card that launches the /auth/upgrade flow.
              Their user row has no email, no display name in
              user_metadata, and no profile row, so the standard
              Account block would render mostly empty. Beka asked for
              a frictionless on-ramp from guest → permanent account
              that doesn't force a sign-out.
            ▸ Real (email/OAuth) users see the existing Account block
              with their email + editable display name. */}
        {user && user.is_anonymous && (
          <Group title={t("set.account")}>
            <Link
              to="/auth/upgrade"
              className="flex items-start gap-3 px-4 py-4 transition-smooth hover:bg-secondary/40"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {t("auth.guestModeBadge")}
                  </span>
                </div>
                <div className="mt-1 text-[14px] font-semibold leading-tight">
                  {t("auth.upgradeAccount")}
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                  {t("auth.guestModeBlurb")}
                </p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </Group>
        )}
        {/* Account section removed per Beka 2026-06-09 — the signed-in
            email + display-name editor lived here previously. Auth
            state is still accessible via the sign-out tab and the
            cloud-sync indicators elsewhere; the dedicated row was
            redundant once the bottom-nav avatar/sign-out moved in.
            Restore from git history if reintroducing user-profile
            edits in v1.1. */}

        {/* Audio guide */}
        <Group title={t("set.audioGuide")}>
          {/* Language — explicit row that opens /language. Beka asked
              for a clear in-Settings entry point because the Globe
              icon on the Home top bar is easy to miss and (per his
              report) was triggering a stale-bundle navigation crash
              on his phone. The /language route works fine when
              loaded directly, so this row gives him a reliable way
              to get there from anywhere in the app. The current
              choice + flag are echoed in the right-side value so
              the user can see at a glance which language is active
              without entering the picker. */}
          <Row
            icon={<Globe className="h-4 w-4" />}
            label={t("set.language")}
            value={`${language.flag} ${language.native}`}
            onClick={() => navigate({ to: "/language" })}
          />
          <Divider />
          <Row
            icon={<Headphones className="h-4 w-4" />}
            label={t("set.narratorVoice")}
            value={activeVoice?.display ?? t("set.browserDefault")}
            onClick={() => setSection("voice")}
          />
          {/* Preview Voice row removed per Beka — the Narrator-voice
              subsection has its own preview button on every voice
              card, so this row was duplicating an action one tap
              away. The previewVoice handler is still wired into the
              voice subsection (SubScreen) and into the per-voice
              cards there, so the feature itself isn't lost. */}
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

        {/* Danger / session — Beka 2026-06-18 spec: both buttons
            should be visually faint so casual scrolling doesn't draw
            the eye to destructive actions. We lose the cardy border
            and red-tinted backgrounds in favour of muted-foreground
            text with a thin subtle border. The hover state still
            previews the destructive intent (slight red tinge on
            border + text) so the user knows what tapping does, but
            the resting state recedes into the page. The confirmation
            modal (for Delete Account) is unchanged — strong warning
            still appears once the user taps through. */}
        {user && (
          <div className="px-6 pt-10">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-transparent px-5 py-3 text-[12px] font-medium text-muted-foreground transition-smooth hover:border-destructive/40 hover:text-destructive/80"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("set.signOut")}
            </button>
          </div>
        )}

        {/* Delete Account — Google Play 2024+ requires every app
            with account creation to provide an in-app deletion path.
            Anonymous users get hidden — there's no auth row to delete
            and their state is fully cleared by sign-out + new session
            start. Real users (email / OAuth) see the button. */}
        {user && !user.is_anonymous && (
          <div className="px-6 pt-2">
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-transparent px-5 py-3 text-[12px] font-medium text-muted-foreground transition-smooth hover:border-destructive/40 hover:text-destructive/80"
            >
              <UserX className="h-3.5 w-3.5" />
              {t("set.deleteAccount")}
            </button>
            <p className="mt-2 px-2 text-center text-[10.5px] leading-snug text-muted-foreground/70">
              {t("set.deleteAccountBlurb")}
            </p>
          </div>
        )}

        {/* Delete Account confirmation modal — separate from the
            row so the strong warning has room to breathe. */}
        {deleteConfirmOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-6 backdrop-blur-sm"
            onClick={() => {
              if (!deleting) setDeleteConfirmOpen(false);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[360px] rounded-3xl border border-destructive/40 bg-background p-6 shadow-elegant"
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2
                id="delete-account-title"
                className="mt-4 text-center font-display text-[20px] font-medium text-foreground"
              >
                {t("set.deleteConfirmTitle")}
              </h2>
              <p className="mt-3 text-center text-[13px] leading-[1.55] text-muted-foreground">
                {t("set.deleteConfirmBody")}
              </p>
              <ul className="mt-3 space-y-1.5 px-1 text-[12px] leading-[1.5] text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-destructive" />
                  <span>{t("set.deleteConfirmBullet1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-destructive" />
                  <span>{t("set.deleteConfirmBullet2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-destructive" />
                  <span>{t("set.deleteConfirmBullet3")}</span>
                </li>
              </ul>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive px-5 py-3.5 text-[13px] font-semibold text-destructive-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserX className="h-4 w-4" />
                  )}
                  {deleting ? t("set.deletingAccount") : t("set.deleteConfirmYes")}
                </button>
                <button
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3.5 text-[13px] font-semibold text-foreground transition-smooth hover:bg-secondary/50 disabled:opacity-50"
                >
                  {t("set.deleteConfirmCancel")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legal links — required for Play Store / App Store
            submission and useful for users who want to skim our
            terms. Privacy is also the canonical URL pasted into
            the Google OAuth consent screen. */}
        <div className="flex justify-center gap-4 px-6 pt-6 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
          <Link
            to="/privacy"
            className="hover:text-foreground transition-smooth"
          >
            {t("set.privacy")}
          </Link>
          <span className="opacity-40">·</span>
          <Link to="/terms" className="hover:text-foreground transition-smooth">
            {t("set.terms")}
          </Link>
        </div>

        {/* Wikimedia Commons attribution. Lokali fetches landmark and
            artwork photos from Wikimedia Commons under their various
            Creative Commons + public-domain licenses. CC-BY and
            CC-BY-SA require attribution; rather than render the
            author + license string under every photo (heavy work for
            an MVP), we cluster the attribution into a single credits
            line here and point users at commons.wikimedia.org where
            each file's individual licensing page lives. Same pattern
            Pinterest, Wikipedia mobile and a long tail of CC-using
            apps adopted before adding per-image bylines. */}
        <p className="px-6 pt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
          Photos from{" "}
          <a
            href="https://commons.wikimedia.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/80 underline-offset-2 hover:underline"
          >
            Wikimedia Commons
          </a>
          {" "}contributors under various Creative Commons and public-domain licenses.
        </p>

        <p className="px-6 pt-4 text-center text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
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
        <header className="flex items-center gap-3 px-6 pt-safe">
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
  selectedName,
  onPick,
  onPreview,
  previewingVoice,
  languageCode,
}: {
  voices: AzureVoice[];
  selectedName: string | null;
  onPick: (name: string) => void;
  onPreview: (name: string) => void | Promise<void>;
  previewingVoice: string | null;
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
    <ul className="flex flex-col gap-2">
      {voices.map((v) => {
        const isActive = selectedName === v.name;
        const isPreviewing = previewingVoice === v.name;
        return (
          <li key={v.name}>
            <div
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 transition-smooth ${
                isActive
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <button
                onClick={() => onPick(v.name)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <span className="flex flex-1 flex-col leading-tight">
                  <span className="text-[14px] font-semibold">{v.display}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {v.gender === "female" ? t("voice.female") : t("voice.male")} ·{" "}
                    {t("voice.cloud")}
                  </span>
                </span>
                {isActive && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                )}
              </button>
              {/* Per-voice preview button — Beka's request: hear the
                  actual Azure voice in-line, not a global preview that
                  needs an extra tap. Plays through /api/tts so the
                  sample matches narrated-guide playback exactly. */}
              <button
                onClick={() => onPreview(v.name)}
                disabled={isPreviewing}
                aria-label={t("set.previewVoice")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-background text-foreground transition-smooth hover:border-primary/40 disabled:opacity-60"
              >
                {isPreviewing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
