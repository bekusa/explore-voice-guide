import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Moon, Languages, Mic2, Info, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { getVoicesForLang, isTTSAvailable } from "@/lib/tts";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Lokali" },
      { name: "description", content: "Choose your language, voice, and theme." },
    ],
  }),
  component: SettingsPage,
});

const VOICE_KEY = "lokali.voice";
const THEME_KEY = "lokali.theme";

function SettingsPage() {
  const { t, meta } = useT();
  const [dark, setDark] = useState(false);
  const [voiceName, setVoiceName] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const v = window.localStorage.getItem(THEME_KEY) === "dark";
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    setVoiceName(window.localStorage.getItem(VOICE_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (!isTTSAvailable()) return;
    const refresh = () => setVoices(getVoicesForLang(meta.bcp47));
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [meta.bcp47]);

  const toggleDark = (v: boolean) => {
    setDark(v);
    window.localStorage.setItem(THEME_KEY, v ? "dark" : "light");
    document.documentElement.classList.toggle("dark", v);
  };

  const pickVoice = (name: string) => {
    setVoiceName(name);
    window.localStorage.setItem(VOICE_KEY, name);
  };

  return (
    <div className="animate-slide-in pt-safe">
      <header className="px-5 pb-3 pt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lokali</p>
        <h1 className="mt-0.5 font-display text-3xl text-foreground">{t("settings")}</h1>
      </header>

      <section className="mx-5 mt-2 space-y-2 rounded-2xl bg-card p-2 shadow-soft">
        {/* Language */}
        <LanguageSelector
          trigger={
            <button className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted">
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary">
                  <Languages className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">{t("language")}</span>
                  <span className="block text-xs text-muted-foreground">{meta.flag} {meta.nativeName}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          }
        />

        {/* Voice */}
        <Drawer>
          <DrawerTrigger asChild>
            <button className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted">
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary">
                  <Mic2 className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">{t("voice")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {voiceName || (voices[0]?.name ?? t("noVoice"))}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="font-display text-2xl">{t("voice")}</DrawerTitle>
            </DrawerHeader>
            <ul className="max-h-[55vh] overflow-y-auto px-2 pb-6">
              {voices.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noVoice")}</li>
              ) : (
                voices.map((v) => (
                  <li key={v.name}>
                    <button
                      onClick={() => pickVoice(v.name)}
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span>
                        <span className="block font-medium text-foreground">{v.name}</span>
                        <span className="block text-xs text-muted-foreground">{v.lang}</span>
                      </span>
                      {voiceName === v.name && <span className="text-primary">●</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </DrawerContent>
        </Drawer>

        {/* Dark mode */}
        <div className="flex items-center justify-between rounded-xl px-3 py-3">
          <span className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary">
              <Moon className="h-4 w-4" />
            </span>
            <span className="block text-sm font-medium text-foreground">{t("darkMode")}</span>
          </span>
          <Switch checked={dark} onCheckedChange={toggleDark} />
        </div>
      </section>

      <section className="mx-5 mt-4 rounded-2xl bg-card p-2 shadow-soft">
        <div className="flex items-center gap-3 rounded-xl px-3 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary">
            <Info className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-medium text-foreground">{t("about")}</span>
            <span className="block text-xs text-muted-foreground">Lokali · {t("version")} 1.0.0</span>
          </span>
        </div>
      </section>
    </div>
  );
}
