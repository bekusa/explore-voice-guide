/**
 * Returns the user's preferred language code (e.g. "ka", "en") from
 * the SAME source useT/useUiLang reads, so menu language and content
 * language stay in lock-step. Beka: "მხოლოდ 1 ენის ცვლილება დავტოვეთ —
 * ადრე 2 იყო, მენიუ და ტექსტის ენა" — one picker should drive both.
 *
 * Backed by `tg.lang` in localStorage (with Supabase `profiles.preferred_language`
 * mirrored in for signed-in users via useUiLang). Reactive: changes
 * propagate same-tab (custom event) and cross-tab (storage event) so
 * picking a new language on /language updates the open attraction page
 * without a manual refresh.
 *
 * The previous implementation read ONLY from Supabase profiles and
 * defaulted to hardcoded "ka". It missed the localStorage path entirely,
 * so anonymous browsing couldn't change content language and the
 * language picker only updated menus, not attraction text.
 */
import { useUiLang } from "@/hooks/useT";

export function usePreferredLanguage(): string {
  return useUiLang();
}
