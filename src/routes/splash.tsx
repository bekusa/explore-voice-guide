import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import splashBg from "@/assets/splash-bg.jpg";
import { LANGUAGES, useT, markFirstLaunched } from "@/lib/i18n";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/splash")({
  head: () => ({
    meta: [
      { title: "Welcome to Lokali" },
      { name: "description", content: "Choose your language and start exploring with AI-powered audio guides." },
    ],
  }),
  component: SplashPage,
});

function SplashPage() {
  const { t, lang, setLang } = useT();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-foreground text-card">
      <img
        src={splashBg}
        alt=""
        width={1024}
        height={1536}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-hero" />

      <div className="relative z-10 flex min-h-screen flex-col px-6 pb-10 pt-safe">
        {/* Top brand */}
        <div className="pt-16 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.4em] text-card/70">audio · stories · places</p>
          <h1 className="mt-4 font-display text-7xl text-card">Lokali</h1>
          <p className="mt-3 text-base text-card/85">{t("splashWelcome")}</p>
        </div>

        <div className="flex-1" />

        {/* Bottom panel */}
        <div className="rounded-3xl bg-card p-5 text-foreground shadow-elevated animate-float-up">
          {!picking ? (
            <>
              <h2 className="font-display text-2xl">{t("chooseLanguage")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("tagline")}</p>
              <button
                onClick={() => setPicking(true)}
                className="mt-4 flex w-full items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-left transition-colors hover:bg-secondary/80"
              >
                <span className="flex items-center gap-3">
                  <span className="text-2xl">{LANGUAGES.find((l) => l.code === lang)?.flag}</span>
                  <span>
                    <span className="block text-sm font-medium">{LANGUAGES.find((l) => l.code === lang)?.nativeName}</span>
                    <span className="block text-xs text-muted-foreground">{t("language")}</span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => {
                  markFirstLaunched();
                  navigate({ to: "/" });
                }}
                className="mt-3 w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
              >
                {t("continue")}
              </button>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl">{t("chooseLanguage")}</h2>
              <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto pr-1">
                {LANGUAGES.map((l) => {
                  const active = l.code === lang;
                  return (
                    <li key={l.code}>
                      <button
                        onClick={() => {
                          setLang(l.code);
                          setPicking(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition-colors",
                          active ? "bg-secondary" : "hover:bg-muted",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-xl leading-none">{l.flag}</span>
                          <span>
                            <span className="block text-sm font-medium">{l.nativeName}</span>
                            <span className="block text-[11px] text-muted-foreground">{l.name}</span>
                          </span>
                        </span>
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
