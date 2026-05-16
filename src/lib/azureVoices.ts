/**
 * Curated Azure Speech neural-voice catalog.
 *
 * Why this exists: the Settings + Onboarding voice picker historically
 * pulled from `window.speechSynthesis.getVoices()` — browser/OS voices
 * that vary per device and have nothing to do with the voices Azure
 * Speech (our actual TTS provider) renders. Picking "Google US English"
 * in Settings did absolutely nothing to the audio that Azure produced
 * via n8n → Azure → mp3. Beka caught this and asked for the picker to
 * actually matter.
 *
 * Each language exposes 2 voices (one female, one male) where Azure
 * has both. Voice names are the official Azure short name format
 * `{locale}-{Voice}Neural`, which is what /api/tts sends to n8n,
 * which n8n forwards to Azure's REST API.
 *
 * Pricing note: every preview click costs Azure characters (the
 * preview phrase is ~10-15 words). The previewCache below stores blob
 * URLs by voice name so repeated clicks during a session are free.
 *
 * If you add a new language: pick voices from
 * https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
 * — only "Neural" voices (not standard / deprecated).
 */

export interface AzureVoice {
  /** Azure short name, e.g. `ka-GE-EkaNeural`. Sent verbatim to /api/tts. */
  name: string;
  /** Human-friendly display label shown in the picker — first name only. */
  display: string;
  gender: "female" | "male";
}

/**
 * BCP-47 locale → array of Azure voices, in display order (we show
 * female first by convention so the default selection feels softer for
 * narrated guides; users can switch in one tap).
 */
export const AZURE_VOICES: Record<string, AzureVoice[]> = {
  "ka-GE": [
    { name: "ka-GE-EkaNeural", display: "Eka", gender: "female" },
    { name: "ka-GE-GiorgiNeural", display: "Giorgi", gender: "male" },
  ],
  "en-US": [
    { name: "en-US-AriaNeural", display: "Aria", gender: "female" },
    { name: "en-US-GuyNeural", display: "Guy", gender: "male" },
    { name: "en-US-JennyNeural", display: "Jenny", gender: "female" },
    { name: "en-US-DavisNeural", display: "Davis", gender: "male" },
  ],
  "en-GB": [
    { name: "en-GB-SoniaNeural", display: "Sonia", gender: "female" },
    { name: "en-GB-RyanNeural", display: "Ryan", gender: "male" },
  ],
  "es-ES": [
    { name: "es-ES-ElviraNeural", display: "Elvira", gender: "female" },
    { name: "es-ES-AlvaroNeural", display: "Álvaro", gender: "male" },
  ],
  "es-MX": [
    { name: "es-MX-DaliaNeural", display: "Dalia", gender: "female" },
    { name: "es-MX-JorgeNeural", display: "Jorge", gender: "male" },
  ],
  "fr-FR": [
    { name: "fr-FR-DeniseNeural", display: "Denise", gender: "female" },
    { name: "fr-FR-HenriNeural", display: "Henri", gender: "male" },
  ],
  "de-DE": [
    { name: "de-DE-KatjaNeural", display: "Katja", gender: "female" },
    { name: "de-DE-ConradNeural", display: "Conrad", gender: "male" },
  ],
  "it-IT": [
    { name: "it-IT-ElsaNeural", display: "Elsa", gender: "female" },
    { name: "it-IT-DiegoNeural", display: "Diego", gender: "male" },
  ],
  "pt-PT": [
    { name: "pt-PT-RaquelNeural", display: "Raquel", gender: "female" },
    { name: "pt-PT-DuarteNeural", display: "Duarte", gender: "male" },
  ],
  "pt-BR": [
    { name: "pt-BR-FranciscaNeural", display: "Francisca", gender: "female" },
    { name: "pt-BR-AntonioNeural", display: "Antônio", gender: "male" },
  ],
  "nl-NL": [
    { name: "nl-NL-ColetteNeural", display: "Colette", gender: "female" },
    { name: "nl-NL-MaartenNeural", display: "Maarten", gender: "male" },
  ],
  "pl-PL": [
    { name: "pl-PL-AgnieszkaNeural", display: "Agnieszka", gender: "female" },
    { name: "pl-PL-MarekNeural", display: "Marek", gender: "male" },
  ],
  "sv-SE": [
    { name: "sv-SE-SofieNeural", display: "Sofie", gender: "female" },
    { name: "sv-SE-MattiasNeural", display: "Mattias", gender: "male" },
  ],
  "nb-NO": [
    { name: "nb-NO-PernilleNeural", display: "Pernille", gender: "female" },
    { name: "nb-NO-FinnNeural", display: "Finn", gender: "male" },
  ],
  "da-DK": [
    { name: "da-DK-ChristelNeural", display: "Christel", gender: "female" },
    { name: "da-DK-JeppeNeural", display: "Jeppe", gender: "male" },
  ],
  "fi-FI": [
    { name: "fi-FI-SelmaNeural", display: "Selma", gender: "female" },
    { name: "fi-FI-HarriNeural", display: "Harri", gender: "male" },
  ],
  "cs-CZ": [
    { name: "cs-CZ-VlastaNeural", display: "Vlasta", gender: "female" },
    { name: "cs-CZ-AntoninNeural", display: "Antonín", gender: "male" },
  ],
  "el-GR": [
    { name: "el-GR-AthinaNeural", display: "Athina", gender: "female" },
    { name: "el-GR-NestorasNeural", display: "Nestoras", gender: "male" },
  ],
  "hu-HU": [
    { name: "hu-HU-NoemiNeural", display: "Noémi", gender: "female" },
    { name: "hu-HU-TamasNeural", display: "Tamás", gender: "male" },
  ],
  "ro-RO": [
    { name: "ro-RO-AlinaNeural", display: "Alina", gender: "female" },
    { name: "ro-RO-EmilNeural", display: "Emil", gender: "male" },
  ],
  "ru-RU": [
    { name: "ru-RU-SvetlanaNeural", display: "Светлана", gender: "female" },
    { name: "ru-RU-DmitryNeural", display: "Дмитрий", gender: "male" },
  ],
  "uk-UA": [
    { name: "uk-UA-PolinaNeural", display: "Поліна", gender: "female" },
    { name: "uk-UA-OstapNeural", display: "Остап", gender: "male" },
  ],
  "tr-TR": [
    { name: "tr-TR-EmelNeural", display: "Emel", gender: "female" },
    { name: "tr-TR-AhmetNeural", display: "Ahmet", gender: "male" },
  ],
  "ar-SA": [
    { name: "ar-SA-ZariyahNeural", display: "زارية", gender: "female" },
    { name: "ar-SA-HamedNeural", display: "حامد", gender: "male" },
  ],
  "he-IL": [
    { name: "he-IL-HilaNeural", display: "הילה", gender: "female" },
    { name: "he-IL-AvriNeural", display: "אברי", gender: "male" },
  ],
  "fa-IR": [
    { name: "fa-IR-DilaraNeural", display: "دلارا", gender: "female" },
    { name: "fa-IR-FaridNeural", display: "فرید", gender: "male" },
  ],
  "hi-IN": [
    { name: "hi-IN-SwaraNeural", display: "स्वरा", gender: "female" },
    { name: "hi-IN-MadhurNeural", display: "मधुर", gender: "male" },
  ],
  "bn-IN": [
    { name: "bn-IN-TanishaaNeural", display: "তনিষা", gender: "female" },
    { name: "bn-IN-BashkarNeural", display: "ভাস্কর", gender: "male" },
  ],
  "ur-PK": [
    { name: "ur-PK-UzmaNeural", display: "عظمیٰ", gender: "female" },
    { name: "ur-PK-AsadNeural", display: "اسد", gender: "male" },
  ],
  "id-ID": [
    { name: "id-ID-GadisNeural", display: "Gadis", gender: "female" },
    { name: "id-ID-ArdiNeural", display: "Ardi", gender: "male" },
  ],
  "ms-MY": [
    { name: "ms-MY-YasminNeural", display: "Yasmin", gender: "female" },
    { name: "ms-MY-OsmanNeural", display: "Osman", gender: "male" },
  ],
  "th-TH": [
    { name: "th-TH-PremwadeeNeural", display: "เปรมวดี", gender: "female" },
    { name: "th-TH-NiwatNeural", display: "นิวัฒน์", gender: "male" },
  ],
  "vi-VN": [
    { name: "vi-VN-HoaiMyNeural", display: "Hoài My", gender: "female" },
    { name: "vi-VN-NamMinhNeural", display: "Nam Minh", gender: "male" },
  ],
  "ja-JP": [
    { name: "ja-JP-NanamiNeural", display: "ななみ", gender: "female" },
    { name: "ja-JP-KeitaNeural", display: "けいた", gender: "male" },
  ],
  "ko-KR": [
    { name: "ko-KR-SunHiNeural", display: "선희", gender: "female" },
    { name: "ko-KR-InJoonNeural", display: "인준", gender: "male" },
  ],
  "zh-CN": [
    { name: "zh-CN-XiaoxiaoNeural", display: "晓晓", gender: "female" },
    { name: "zh-CN-YunxiNeural", display: "云希", gender: "male" },
  ],
  "zh-TW": [
    { name: "zh-TW-HsiaoChenNeural", display: "曉臻", gender: "female" },
    { name: "zh-TW-YunJheNeural", display: "雲哲", gender: "male" },
  ],
};

/**
 * Get Azure voices for a BCP-47 code with a base-language fallback —
 * so `en` resolves to en-US, `pt` resolves to pt-PT, etc. The fallback
 * mirrors what we do in `voicesForLanguage` for browser voices.
 */
export function azureVoicesForLanguage(langCode: string): AzureVoice[] {
  if (AZURE_VOICES[langCode]) return AZURE_VOICES[langCode];
  const base = langCode.split("-")[0].toLowerCase();
  const candidate = Object.keys(AZURE_VOICES).find((k) =>
    k.toLowerCase().startsWith(base),
  );
  return candidate ? AZURE_VOICES[candidate] : [];
}

/**
 * Default voice for a language — first entry (female, by our ordering
 * convention). Used when the user lands without a saved preference, or
 * when their saved preference is for a different language than the one
 * they're currently listening to.
 */
export function defaultVoiceFor(langCode: string): AzureVoice | null {
  const list = azureVoicesForLanguage(langCode);
  return list[0] ?? null;
}

/**
 * Resolve the voice name to send to /api/tts for a given language +
 * preference string. Handles three cases:
 *  - Saved preference is a valid Azure voice for THIS language → use it
 *  - Saved preference is for a different language (user switched
 *    language since picking) → fall back to default for current lang
 *  - No preference (or legacy browser-voice URI like "Google US
 *    English") → fall back to default for current lang
 */
export function resolveAzureVoice(
  langCode: string,
  preferredVoice: string | null | undefined,
): string | null {
  const list = azureVoicesForLanguage(langCode);
  if (list.length === 0) return null;
  if (preferredVoice) {
    const match = list.find((v) => v.name === preferredVoice);
    if (match) return match.name;
  }
  return list[0].name;
}
