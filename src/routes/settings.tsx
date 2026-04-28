import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Globe2,
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
} from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  speakWithVoice,
  useSpeechVoices,
  voicesForLanguage,
} from "@/hooks/useSpeechVoices";
import { LANGUAGES, getPreviewPhrase, type Language } from "@/lib/languages";
import { clearAll, getSaved } from "@/lib/savedStore";
import { useSavedItems } from "@/hooks/useSavedItems";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Whispers of Old Tbilisi" },
      {
        name: "description",
        content:
          "Configure your language, narrator voice, theme, and offline library.",
      },
      { property: "og:title", content: "Settings — Whispers of Old Tbilisi" },
      {
        property: "og:description",
        content: "Configure language, voice, theme and offline data.",
      },
    ],
  }),
  component: SettingsPage,
});

type Section = "main" | "language" | "voice";

function SettingsPage() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const voices = useSpeechVoices();
  const saved = useSavedItems();

  const [section, setSection] = useState<Section>("main");
  const [langCode, setLangCode] = useState<string>("ka");
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

  const updateLanguage = async (lang: Language) => {
    setLangCode(lang.code);
    setVoiceURI(null); // clear voice — must rechoose
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ preferred_language: lang.code, preferred_voice: "browser-default" })
      .eq("user_id", user.id);
    toast.success("Language updated", { description: lang.native });
    setSection("main");
  };

  const updateVoice = async (uri: string) => {
    setVoiceURI(uri);
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ preferred_voice: uri })
      .eq("user_id", user.id);
    toast.success("Voice updated");
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
      toast.success("Profile saved");
    } catch (err) {
      toast.error("Couldn't save", {
        description: err instanceof Error ? err.message : "Try again later.",
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
      toast.info("No voice available", {
        description: "This device has no installed voice for this language.",
      });
    }
  };

  const clearOffline = () => {
    if (!confirm(`Clear ${saved.length} saved place${saved.length === 1 ? "" : "s"}?`))
      return;
    clearAll();
    toast.success("Offline library cleared");
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

  if (section === "language") {
    return (
      <SubScreen title="Language" onBack={() => setSection("main")}>
        <LanguageList active={langCode} onPick={updateLanguage} />
      </SubScreen>
    );
  }

  if (section === "voice") {
    return (
      <SubScreen
        title="Narrator voice"
        subtitle={`${language.flag} ${language.native} · ${matchingVoices.length} available`}
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
            aria-label="Back"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </header>

        <section className="px-6 pt-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            Configuration
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
            Tune your <span className="italic text-primary">journey</span>
          </h1>
          <p className="mt-3 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
            Language, voice, theme, and offline storage — everything that shapes
            how Tbilisi whispers back to you.
          </p>
        </section>

        {/* Account */}
        {user && (
          <Group title="Account">
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
                <UserIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Mail className="h-2.5 w-2.5" /> Signed in as
                </div>
                <div className="truncate text-[13px] font-semibold">{user.email}</div>
              </div>
            </div>
            <Divider />
            <div className="flex flex-col gap-2 px-4 py-4">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Display name
              </label>
              <div className="flex gap-2">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="h-10 rounded-xl border-border bg-background text-[13px]"
                />
                <button
                  onClick={saveDisplayName}
                  disabled={savingProfile}
                  className="rounded-xl bg-foreground px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-background transition-smooth hover:scale-[1.02] disabled:opacity-50"
                >
                  {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          </Group>
        )}

        {/* Voice & language */}
        <Group title="Audio guide">
          <Row
            icon={<Globe2 className="h-4 w-4" />}
            label="Language"
            value={`${language.flag} ${language.native}`}
            onClick={() => setSection("language")}
          />
          <Divider />
          <Row
            icon={<Headphones className="h-4 w-4" />}
            label="Narrator voice"
            value={activeVoice?.name ?? "Browser default"}
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
            <span className="flex-1 text-[13px] font-semibold">Preview voice</span>
            <Play className="h-3.5 w-3.5 fill-current text-primary" />
          </button>
        </Group>

        {/* Appearance */}
        <Group title="Appearance">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-smooth hover:bg-secondary/40"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground">
              {theme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-semibold">Theme</span>
              <span className="block text-[11px] text-muted-foreground">
                {theme === "dark" ? "Cinematic dark" : "Daylight"}
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

        {/* Offline */}
        <Group title="Offline library">
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-foreground">
              <Headphones className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">
                {saved.length} saved {saved.length === 1 ? "place" : "places"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                ~{Math.max(1, Math.round(estimateBytes() / 1024))} KB on this device
              </div>
            </div>
          </div>
          <Divider />
          <button
            onClick={clearOffline}
            disabled={saved.length === 0}
            className="flex w-full items-center gap-3 px-4 py-4 text-left text-destructive transition-smooth hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/15">
              <Trash2 className="h-4 w-4" />
            </span>
            <span className="flex-1 text-[13px] font-semibold">
              Clear offline library
            </span>
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
              Sign out
            </button>
          </div>
        )}

        <p className="px-6 pt-6 text-center text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Whispers of Old Tbilisi · v1.0
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
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {children}
      </div>
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
        <span className="block truncate text-[11px] text-muted-foreground">
          {value}
        </span>
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
  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        <header className="flex items-center gap-3 px-6 pt-12">
          <button
            onClick={onBack}
            aria-label="Back"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">
              Settings
            </span>
            <h1 className="font-display text-[22px] leading-tight">{title}</h1>
          </div>
        </header>
        {subtitle && (
          <p className="mt-3 px-6 text-[12px] text-muted-foreground">{subtitle}</p>
        )}
        <div className="px-6 pt-6">{children}</div>
      </div>
    </MobileFrame>
  );
}

function LanguageList({
  active,
  onPick,
}: {
  active: string;
  onPick: (l: Language) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return LANGUAGES;
    const q = query.toLowerCase();
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <>
      <div className="mb-3 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3">
        <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search languages…"
          className="h-auto border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
        />
      </div>
      <ul className="flex flex-col gap-2">
        {filtered.map((l) => {
          const isActive = active === l.code;
          return (
            <li key={l.code}>
              <button
                onClick={() => onPick(l)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-smooth ${
                  isActive
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <span className="text-[22px] leading-none">{l.flag}</span>
                <span className="flex flex-1 flex-col leading-tight">
                  <span className="text-[14px] font-semibold">{l.native}</span>
                  <span className="text-[11px] text-muted-foreground">{l.name}</span>
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
        {filtered.length === 0 && (
          <li className="py-8 text-center text-[13px] text-muted-foreground">
            No languages match "{query}"
          </li>
        )}
      </ul>
    </>
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
  if (voices.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-[13px]">
        <p className="text-foreground">
          No native voice found on this device for{" "}
          <span className="font-semibold">{languageCode}</span>.
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          We'll fall back to the browser default. Install additional voices in
          your operating system's accessibility settings.
        </p>
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
                    {v.lang} · {v.localService ? "On-device" : "Cloud"}
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
        <Play className="h-3.5 w-3.5 fill-current" /> Preview voice
      </button>
    </>
  );
}
