import { useEffect, useState } from "react";
import { Star, Check, Send } from "lucide-react";
import { useT } from "@/hooks/useT";
import { getMyRating, guideRatingKey, submitRating } from "@/lib/ratingsStore";
import { noteGuideRated } from "@/lib/reviewPrompt";

/**
 * "How was this guide?" — a 1-5 star row at the end of an attraction's
 * guide. Beka 2026-09-19.
 *
 * WHY IT EXISTS
 *   13,704 cached guides, zero feedback on any of them. Every quality
 *   problem so far was found by Beka reading one by hand. This makes
 *   guide quality measurable: the bad ones surface themselves, and a
 *   prompt change can be judged by whether the average moves.
 *
 * IT RATES THE GUIDE, NOT THE PLACE
 *   The heading says so explicitly, because "rate this" next to the
 *   Louvre would obviously read as rating the Louvre. The key is the
 *   guide's cache identity (name + city + language), so a weak
 *   Georgian guide for a place whose English guide is fine shows up
 *   as exactly that.
 *
 * DESIGN
 *  - One tap submits. No "Submit" button — an extra step here loses
 *    most of the responses, and the whole value is in volume.
 *  - The comment box appears only AFTER a rating lands, and is
 *    optional. Asking for prose up front suppresses the star too.
 *  - The comment, unlike the star, DOES need a press to send (Beka
 *    2026-10-31). A star is one tap and unambiguous; prose is not
 *    finished until the writer says it is. Icon-only button, so it
 *    needs no translation in 51 locales.
 *  - Failure is silent. A rating that doesn't save must never
 *    interrupt reading; the UI just doesn't show the thank-you.
 *  - Works for anonymous users (the app signs guests in anonymously),
 *    so we are not throwing away the majority of travellers.
 */
export function GuideRating({
  name,
  city,
  language,
}: {
  name: string;
  city?: string | null;
  language: string;
}) {
  const t = useT();
  const [stars, setStars] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [saved, setSaved] = useState(false);
  const [comment, setComment] = useState("");
  const [commentSaved, setCommentSaved] = useState(false);
  /** Last value actually persisted — lets the send button know there
   *  is something new to send, and disable itself when there isn't. */
  const [savedComment, setSavedComment] = useState("");
  const [sending, setSending] = useState(false);

  const key = guideRatingKey({ name, city, language });

  // Pre-fill with the user's own earlier verdict so a returning
  // reader sees their stars rather than an empty widget (and cannot
  // accidentally "re-rate" from scratch).
  useEffect(() => {
    let cancelled = false;
    getMyRating(key).then((existing) => {
      if (cancelled || !existing) return;
      setStars(existing.stars);
      setComment(existing.comment ?? "");
      // Mirror it into savedComment too, so the send button starts
      // disabled for a returning reader who changes nothing.
      setSavedComment(existing.comment ?? "");
      setSaved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  async function pick(value: number) {
    // Optimistic: the stars fill immediately. If the write fails we
    // leave them filled but never show the confirmation — reverting
    // under the user's finger is worse than a silently unsaved vote.
    setStars(value);
    const ok = await submitRating({
      guideKey: key,
      stars: value,
      comment: comment || null,
      attractionName: name,
      city: city ?? null,
      language,
    });
    if (ok) {
      setSaved(true);
      // Feed the Play Store review prompt. Only a HIGH rating counts
      // as a positive signal — see reviewPrompt.ts for why we never
      // gate the store dialog on it directly.
      noteGuideRated(value);
    }
  }

  /**
   * Send the written comment. Beka 2026-10-31: "კომენტარს რომ
   * მაწერინებს, შენახვის ღილაკი უნდა ჰქონდეს."
   *
   * This replaced a 1200 ms debounced auto-save. The debounce worked,
   * but it never told the user their words had been taken — the
   * confirmation appeared on its own a beat after they stopped typing,
   * which reads like the app doing something behind your back rather
   * than you having finished. An explicit press is the whole point of
   * a comment: the user decides when it is done.
   *
   * It also removes a real failure mode: pausing mid-sentence saved
   * half a thought, and every pause after that overwrote it.
   */
  async function sendComment() {
    const text = comment.trim();
    if (stars < 1 || sending || text === savedComment) return;
    setSending(true);
    const ok = await submitRating({
      guideKey: key,
      stars,
      comment: text || null,
      attractionName: name,
      city: city ?? null,
      language,
    });
    setSending(false);
    if (ok) {
      setSavedComment(text);
      setCommentSaved(true);
    }
    // On failure: nothing. The button simply becomes pressable again,
    // so the user can retry. Per this component's rule, feedback must
    // never interrupt reading with an error.
  }

  const shown = hover || stars;

  return (
    <section className="mt-8 px-5">
      <div className="rounded-2xl border border-border bg-card px-4 py-4">
        <p className="text-[13px] font-semibold text-foreground">
          {t("rating.question")}
        </p>

        <div
          className="mt-3 flex items-center gap-1.5"
          onMouseLeave={() => setHover(0)}
          role="radiogroup"
          aria-label={t("rating.question")}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={t("rating.stars", { n })}
              onClick={() => pick(n)}
              onMouseEnter={() => setHover(n)}
              className="p-1 transition-transform active:scale-90 hover:scale-110"
            >
              <Star
                className={`h-7 w-7 ${
                  n <= shown
                    ? "fill-primary text-primary"
                    : "fill-transparent text-muted-foreground/50"
                }`}
              />
            </button>
          ))}

          {saved && (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
              <Check className="h-3.5 w-3.5" />
              {t("rating.thanks")}
            </span>
          )}
        </div>

        {/* Comment appears only after a star lands — asking for prose
            up front measurably suppresses the rating itself. */}
        {saved && (
          <div className="mt-3">
            <div className="relative">
              <textarea
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setCommentSaved(false);
                }}
                placeholder={t("rating.commentPlaceholder")}
                rows={2}
                maxLength={280}
                /* pr-12 keeps the typed text clear of the send button
                   sitting in the bottom-right corner. */
                className="w-full resize-none rounded-xl border border-border bg-background/60 py-2 pl-3 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
              />
              {/* ICON ONLY, no label — Beka 2026-10-31: "ღილაკს არ
                  დააწერო ტექსტი. იყოს იკონკა."
                  A paper plane is the near-universal "send what I
                  wrote" affordance, so it needs no word.
                  aria-label reuses the existing `set.save` key rather
                  than adding a new one: it is already translated in
                  all 51 locales, and an icon-only control still has to
                  announce itself to a screen reader. */}
              <button
                type="button"
                onClick={sendComment}
                disabled={sending || comment.trim() === savedComment}
                aria-label={t("set.save")}
                title={t("set.save")}
                className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground transition-smooth active:scale-90 hover:scale-105 disabled:scale-100 disabled:bg-none disabled:bg-secondary/70 disabled:text-muted-foreground"
              >
                {commentSaved && comment.trim() === savedComment ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Send className={`h-4 w-4 ${sending ? "animate-pulse" : ""}`} />
                )}
              </button>
            </div>
            {commentSaved && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("rating.commentSaved")}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
