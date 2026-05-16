import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LegalMarkdown } from "@/components/LegalMarkdown";
import { pickLegalContent } from "@/lib/legalContent";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useT } from "@/hooks/useT";

/**
 * Privacy Policy — externally-fetchable at `https://lokali.ge/privacy`
 * (or `https://lokali-app.lovable.app/privacy` for the Lovable preview).
 * This URL is what Beka pastes into the Google Play Console and into
 * the OAuth consent screen → "App privacy policy" field; if the URL
 * 404s, those reviews fail. Keep this route stable.
 *
 * Content is bilingual (English + Georgian) and switches based on the
 * user's preferred UI language. Other locales fall back to English —
 * Beka can hand-translate to a few more priority languages later, but
 * legal text shouldn't go through Google Translate.
 */
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Lokali" },
      {
        name: "description",
        content: "How Lokali collects, uses, and protects your data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const lang = usePreferredLanguage();
  const t = useT();
  const content = pickLegalContent("privacy", lang ?? "en");

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-6 pt-safe pb-10">
        <Link
          to="/settings"
          className="mb-8 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-smooth"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("nav.back")}
        </Link>
        <LegalMarkdown source={content} />
      </div>
    </div>
  );
}
