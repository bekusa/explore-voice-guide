import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { LegalMarkdown } from "@/components/LegalMarkdown";
import { pickLegalContent } from "@/lib/legalContent";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { useT } from "@/hooks/useT";

/**
 * Terms of Service — paired with /privacy and served at the same
 * level of stability. The Play Store Developer Console and the
 * Google OAuth consent screen both ask for this URL; pasting a 404
 * fails review.
 *
 * Bilingual (EN + KA) via usePreferredLanguage, same fallback rules
 * as the privacy route.
 */
export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service · Lokali" },
      {
        name: "description",
        content: "The rules and disclaimers that govern your use of Lokali.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const lang = usePreferredLanguage();
  const t = useT();
  const content = pickLegalContent("terms", lang ?? "en");

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
