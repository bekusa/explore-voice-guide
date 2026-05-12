import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Check, Play, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES, getPreviewPhrase, type Language } from "@/lib/languages";
import { useSpeechVoices, voicesForLanguage, speakWithVoice } from "@/hooks/useSpeechVoices";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Choose your language · Lokali" },
      {
        name: "description",
        content: "Pick your preferred language and narrator voice for personalized audio guides.",
      },
    ],
  }),
  component: OnboardingPage,
});

type Step = "language" | "voice";

function OnboardingPage() {
  const navigate = useNavigate();
  const voices = useSpeechVoices();
  const t = useT();

  const [step, setStep] = useState<Step>("language");
  const [query, setQuery] = useState("");
  const [selectedLang, setSelectedLang] = useState<Language | null>(null);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Guard: must be signed in; skip if profile already has a language.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }
      if (!active) return;
      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("preferred_language, preferred_voice")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profile?.preferred_language && profile?.preferred_voice) {
        navigate({ to: "/" });
        return;
      }
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const filteredLangs = useMemo(() => {
    if (!query.trim()) return LANGUAGES;
    const q = query.toLowerCase();
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [query]);

  const matchingVoices = useMemo(
    () => (selectedLang ? voicesForLanguage(voices, selectedLang.code) : []),
    [voices, selectedLang],
  );

  // Auto-select first voice when arriving at voice step.
  useEffect(() => {
    if (step === "voice" && matchingVoices.length > 0 && !selectedVoiceURI) {
      setSelectedVoiceURI(matchingVoices[0].voiceURI);
    }
  }, [step, matchingVoices, selectedVoiceURI]);

  const handleContinue = () => {
    if (!selectedLang) return;
    setStep("voice");
  };

  const handleFinish = async () => {
    if (!userId || !selectedLang) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          preferred_language: selectedLang.code,
          preferred_voice: selectedVoiceURI ?? "browser-default",
        })
        .eq("user_id", userId);

      if (error) throw error;
      toast.success(t("toast.allSet"), { description: t("toast.allSetDesc") });
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast.couldNotSave");
      toast.error(t("toast.setupFailed"), { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const previewVoice = () => {
    if (!selectedLang) return;
    const voice = matchingVoices.find((v) => v.voiceURI === selectedVoiceURI);
    if (!voice) {
      toast.info(t("toast.noVoiceAvailable"), {
        description: t("set.noNativeVoice"),
      });
      return;
    }
    speakWithVoice(getPreviewPhrase(selectedLang.code), voice);
  };

  if (checking) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 pt-12 pb-10">
        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-2">
          <span
            className={`h-1 flex-1 rounded-full transition-smooth ${
              step === "language" ? "bg-primary" : "bg-primary/40"
            }`}
          />
          <span
            className={`h-1 flex-1 rounded-full transition-smooth ${
              step === "voice" ? "bg-primary" : "bg-border"
            }`}
          />
        </div>

        {step === "language" ? (
          <LanguageStep
            query={query}
            setQuery={setQuery}
            languages={filteredLangs}
            selected={selectedLang}
            setSelected={setSelectedLang}
            onContinue={handleContinue}
            t={t}
          />
        ) : (
          <VoiceStep
            language={selectedLang!}
            voices={matchingVoices}
            selectedVoiceURI={selectedVoiceURI}
            setSelectedVoiceURI={setSelectedVoiceURI}
            onPreview={previewVoice}
            onBack={() => setStep("language")}
            onFinish={handleFinish}
            saving={saving}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Step 1: Language ---------- */

function LanguageStep({
  query,
  setQuery,
  languages,
  selected,
  setSelected,
  onContinue,
  t,
}: {
  query: string;
  setQuery: (q: string) => void;
  languages: Language[];
  selected: Language | null;
  setSelected: (l: Language) => void;
  onContinue: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <>
      <div className="mb-6">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          {t("onb.step1")}
        </span>
        <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
          {t("onb.chooseLang")}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          {t("onb.voiceHelp")}
        </p>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3">
        <Search className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("onb.searchLang")}
          className="border-0 bg-transparent shadow-none p-0 h-auto text-[13px] focus-visible:ring-0"
        />
      </div>

      <div className="-mx-2 flex-1 overflow-y-auto px-2 pb-32 scrollbar-hide">
        <ul className="flex flex-col gap-2">
          {languages.map((l) => {
            const active = selected?.code === l.code;
            return (
              <li key={l.code}>
                <button
                  onClick={() => setSelected(l)}
                  className={`group flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-smooth ${
                    active
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <span className="text-[22px] leading-none">{l.flag}</span>
                  <span className="flex flex-1 flex-col leading-tight">
                    <span className="text-[14px] font-semibold text-foreground">{l.native}</span>
                    <span className="text-[11px] text-muted-foreground">{l.name}</span>
                  </span>
                  {active && (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {languages.length === 0 && (
            <li className="py-8 text-center text-[13px] text-muted-foreground">
              {t("set.noLanguagesMatch")} "{query}"
            </li>
          )}
        </ul>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 px-6 py-4 pb-6 backdrop-blur-xl md:absolute md:rounded-b-[3rem]">
        <button
          disabled={!selected}
          onClick={onContinue}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold text-[14px] font-semibold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100"
        >
          {t("onb.continue")} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

/* ---------- Step 2: Voice ---------- */

function VoiceStep({
  language,
  voices,
  selectedVoiceURI,
  setSelectedVoiceURI,
  onPreview,
  onBack,
  onFinish,
  saving,
  t,
}: {
  language: Language;
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string | null;
  setSelectedVoiceURI: (uri: string) => void;
  onPreview: () => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
  t: ReturnType<typeof useT>;
}) {
  return (
    <>
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 self-start text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-smooth hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("onb.back")}
      </button>

      <div className="mb-6">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          {t("onb.step2")}
        </span>
        <h1 className="mt-3 font-display text-[2.25rem] font-medium leading-[1.05]">
          {t("onb.pickVoice")}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          {language.flag} {language.native} ·{" "}
          {voices.length === 1
            ? t("onb.voiceCountOne", { n: voices.length })
            : t("onb.voiceCountMany", { n: voices.length })}
        </p>
      </div>

      <div className="-mx-2 flex-1 overflow-y-auto px-2 pb-32 scrollbar-hide">
        {voices.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-[13px] text-foreground">{t("onb.noNativeVoice")}</p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              <span className="font-semibold">{language.native}</span>
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {voices.map((v) => {
              const active = selectedVoiceURI === v.voiceURI;
              return (
                <li key={v.voiceURI}>
                  <button
                    onClick={() => setSelectedVoiceURI(v.voiceURI)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-smooth ${
                      active
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <span className="flex flex-1 flex-col leading-tight">
                      <span className="text-[14px] font-semibold text-foreground">{v.name}</span>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {v.lang} · {v.localService ? t("voice.onDevice") : t("voice.cloud")}
                      </span>
                    </span>
                    {active && (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          onClick={onPreview}
          disabled={voices.length === 0}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-[13px] font-semibold text-foreground transition-smooth hover:border-primary/40 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5 fill-current" /> {t("onb.previewVoice")}
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 px-6 py-4 pb-6 backdrop-blur-xl md:absolute md:rounded-b-[3rem]">
        <button
          onClick={onFinish}
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold text-[14px] font-semibold text-primary-foreground shadow-glow transition-smooth hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onb.beginCta")}
        </button>
      </div>
    </>
  );
}
