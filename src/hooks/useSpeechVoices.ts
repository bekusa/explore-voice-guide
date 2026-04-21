import { useEffect, useState } from "react";

/**
 * Returns the list of SpeechSynthesisVoice objects available in the browser.
 * Voices load asynchronously in some browsers (notably Chrome), so we
 * subscribe to `voiceschanged` until they appear.
 */
export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const update = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);

  return voices;
}

/** Filter voices by BCP-47 language code, falling back to base language match. */
export function voicesForLanguage(
  voices: SpeechSynthesisVoice[],
  langCode: string,
): SpeechSynthesisVoice[] {
  const base = langCode.split("-")[0].toLowerCase();
  const exact = voices.filter((v) => v.lang.toLowerCase() === langCode.toLowerCase());
  if (exact.length > 0) return exact;
  return voices.filter((v) => v.lang.toLowerCase().startsWith(base));
}

/** Speak a phrase using the given voice. Cancels any in-progress utterance first. */
export function speakWithVoice(text: string, voice: SpeechSynthesisVoice) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}
