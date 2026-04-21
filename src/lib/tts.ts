/** Tiny wrapper around the Web Speech API. */
export function isTTSAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getVoicesForLang(bcp47: string): SpeechSynthesisVoice[] {
  if (!isTTSAvailable()) return [];
  const all = window.speechSynthesis.getVoices();
  const prefix = bcp47.split("-")[0];
  return all.filter((v) => v.lang === bcp47 || v.lang.startsWith(prefix + "-") || v.lang === prefix);
}

export interface SpeakHandle {
  stop: () => void;
}

export function speak(
  text: string,
  opts: { lang: string; rate?: number; voice?: SpeechSynthesisVoice | null; onEnd?: () => void; onBoundary?: (charIndex: number) => void },
): SpeakHandle | null {
  if (!isTTSAvailable()) return null;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang;
  u.rate = opts.rate ?? 1;
  if (opts.voice) u.voice = opts.voice;
  if (opts.onEnd) u.onend = opts.onEnd;
  if (opts.onBoundary) {
    u.onboundary = (e) => opts.onBoundary?.(e.charIndex);
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return { stop: () => window.speechSynthesis.cancel() };
}
