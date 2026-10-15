// 37 supported languages for the audio guide.
// BCP-47 codes match SpeechSynthesisVoice.lang from the Web Speech API.

export interface Language {
  code: string;
  name: string;
  native: string;
  flag: string;
}

// Source list — order in this array doesn't matter, the export at the
// bottom sorts alphabetically by English name. Beka asked for the
// /language picker to be A-Z so users can find their language by
// scanning instead of hunting through Beka's hand-rolled order.
const LANGUAGES_RAW: Language[] = [
  { code: "ka-GE", name: "Georgian", native: "ქართული", flag: "🇬🇪" },
  { code: "en-US", name: "English (US)", native: "English", flag: "🇺🇸" },
  { code: "en-GB", name: "English (UK)", native: "English", flag: "🇬🇧" },
  { code: "es-ES", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "es-MX", name: "Spanish (MX)", native: "Español", flag: "🇲🇽" },
  { code: "fr-FR", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "de-DE", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "it-IT", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "pt-PT", name: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "pt-BR", name: "Portuguese (BR)", native: "Português", flag: "🇧🇷" },
  { code: "nl-NL", name: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "pl-PL", name: "Polish", native: "Polski", flag: "🇵🇱" },
  { code: "sv-SE", name: "Swedish", native: "Svenska", flag: "🇸🇪" },
  { code: "nb-NO", name: "Norwegian", native: "Norsk", flag: "🇳🇴" },
  { code: "da-DK", name: "Danish", native: "Dansk", flag: "🇩🇰" },
  { code: "fi-FI", name: "Finnish", native: "Suomi", flag: "🇫🇮" },
  { code: "cs-CZ", name: "Czech", native: "Čeština", flag: "🇨🇿" },
  { code: "el-GR", name: "Greek", native: "Ελληνικά", flag: "🇬🇷" },
  { code: "hu-HU", name: "Hungarian", native: "Magyar", flag: "🇭🇺" },
  { code: "ro-RO", name: "Romanian", native: "Română", flag: "🇷🇴" },
  { code: "ru-RU", name: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "uk-UA", name: "Ukrainian", native: "Українська", flag: "🇺🇦" },
  { code: "tr-TR", name: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "ar-SA", name: "Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "he-IL", name: "Hebrew", native: "עברית", flag: "🇮🇱" },
  { code: "fa-IR", name: "Persian", native: "فارسی", flag: "🇮🇷" },
  { code: "hi-IN", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "bn-IN", name: "Bengali", native: "বাংলা", flag: "🇮🇳" },
  { code: "ur-PK", name: "Urdu", native: "اردو", flag: "🇵🇰" },
  { code: "id-ID", name: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ms-MY", name: "Malay", native: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "th-TH", name: "Thai", native: "ไทย", flag: "🇹🇭" },
  { code: "vi-VN", name: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ja-JP", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko-KR", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "zh-CN", name: "Chinese (Simplified)", native: "简体中文", flag: "🇨🇳" },
  { code: "zh-TW", name: "Chinese (Traditional)", native: "繁體中文", flag: "🇹🇼" },
  // ── 2026-06-22: market expansion batch (Tbilisi tourism + S.Asia +
  // E.Europe + Africa). UI strings auto-translate on demand via
  // /api/translate; each just needs an Azure neural voice (azureVoices.ts)
  // and a Wikipedia-photo locale (api.photo.ts ALLOWED_WIKI_LANGS).
  { code: "hy-AM", name: "Armenian", native: "Հայերեն", flag: "🇦🇲" },
  { code: "az-AZ", name: "Azerbaijani", native: "Azərbaycanca", flag: "🇦🇿" },
  // CIS expansion 2026-08-08 (Beka). Azure voices verified live
  // against /api/tts before shipping — all four returned audio/mpeg.
  { code: "uz-UZ", name: "Uzbek", native: "Oʻzbekcha", flag: "🇺🇿" },
  { code: "kk-KZ", name: "Kazakh", native: "Қазақша", flag: "🇰🇿" },
  { code: "bg-BG", name: "Bulgarian", native: "Български", flag: "🇧🇬" },
  { code: "hr-HR", name: "Croatian", native: "Hrvatski", flag: "🇭🇷" },
  { code: "sr-RS", name: "Serbian", native: "Српски", flag: "🇷🇸" },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  { code: "te-IN", name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  { code: "mr-IN", name: "Marathi", native: "मराठी", flag: "🇮🇳" },
  { code: "sw-KE", name: "Swahili", native: "Kiswahili", flag: "🇰🇪" },
  { code: "af-ZA", name: "Afrikaans", native: "Afrikaans", flag: "🇿🇦" },
  /* 2026-10-15 — five languages to reach 50. Every voice name below
   * was read directly from Microsoft's own voice table (the
   * `includes/language-support/tts.md` source file), not guessed:
   * /api/tts rejects an unknown voice with 400, so a wrong name would
   * mean the guide generates but never speaks.
   *
   * Slovak and Slovenian were the obvious European candidates and are
   * deliberately NOT here — that source file truncates at `pt-BR`, so
   * their voices could not be confirmed, and third-party voice
   * listings are not good enough for a name that must match exactly.
   * The Baltic pair is arguably the better pick anyway: a Slovak
   * speaker is served reasonably by Czech (we have it), a Latvian by
   * nothing we ship. */
  { code: "fil-PH", name: "Filipino", native: "Filipino", flag: "🇵🇭" },
  { code: "lt-LT", name: "Lithuanian", native: "Lietuvių", flag: "🇱🇹" },
  { code: "lv-LV", name: "Latvian", native: "Latviešu", flag: "🇱🇻" },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം", flag: "🇮🇳" },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
];

/**
 * How many DISTINCT languages we speak — not how many options the
 * picker shows. Four languages ship two regional variants each
 * (en-US/en-GB, es-ES/es-MX, pt-PT/pt-BR, zh-CN/zh-TW), so counting
 * rows would overstate it by four.
 */
export const DISTINCT_LANGUAGE_COUNT = new Set(
  LANGUAGES.map((l) => l.code.split("-")[0].toLowerCase()),
).size;

/**
 * The number we SAY in public — "50+", not "51".
 *
 * Beka 2026-10-15: "ყოველი ენის დამატებისას აღარ მინდა მთელი
 * მარკეტინგული თუ სხვა სახის კომუნიკაციის ცვლილებები."
 *
 * Rounding DOWN to the nearest ten and adding "+" makes the claim
 * true by construction and stable across additions: 51 languages and
 * 58 languages both read "50+", so nothing needs rewriting until we
 * genuinely cross 60 — and then it updates itself.
 *
 * This is the single source for every public mention. The count used
 * to be hand-written into seven SEO strings as "45 languages", which
 * is exactly the drift this replaces: those had been wrong since the
 * catalog passed 45.
 */
export const LANGUAGE_COUNT_LABEL = `${Math.floor(DISTINCT_LANGUAGE_COUNT / 10) * 10}+`;

/**
 * Public LANGUAGES list — alphabetised by English name. We sort once
 * at module load (cheap, ~37 entries) and freeze the array so
 * downstream consumers can't reorder it accidentally. The locale
 * argument forces an English collation so non-Latin natives like
 * "ქართული" still slot in by their English label ("Georgian" → G).
 */
export const LANGUAGES: Language[] = [...LANGUAGES_RAW].sort((a, b) =>
  a.name.localeCompare(b.name, "en"),
);

// Sample preview phrase per language (for voice preview on onboarding).
export const PREVIEW_PHRASES: Record<string, string> = {
  "ka-GE": "გამარჯობა! მე ვიქნები თქვენი გზამკვლევი.",
  "en-US": "Hello! I'll be your guide today.",
  "en-GB": "Hello! I'll be your guide today.",
  "es-ES": "¡Hola! Yo seré tu guía hoy.",
  "es-MX": "¡Hola! Yo seré tu guía hoy.",
  "fr-FR": "Bonjour ! Je serai votre guide aujourd'hui.",
  "de-DE": "Hallo! Ich werde heute Ihr Reiseführer sein.",
  "it-IT": "Ciao! Sarò la tua guida oggi.",
  "pt-PT": "Olá! Serei o seu guia hoje.",
  "pt-BR": "Olá! Serei o seu guia hoje.",
  "nl-NL": "Hallo! Ik zal vandaag je gids zijn.",
  "pl-PL": "Cześć! Dziś będę twoim przewodnikiem.",
  "sv-SE": "Hej! Jag är din guide idag.",
  "nb-NO": "Hei! Jeg er guiden din i dag.",
  "da-DK": "Hej! Jeg er din guide i dag.",
  "fi-FI": "Hei! Olen oppaasi tänään.",
  "cs-CZ": "Ahoj! Dnes budu vaším průvodcem.",
  "el-GR": "Γεια σας! Σήμερα θα είμαι ο ξεναγός σας.",
  "hu-HU": "Helló! Ma én leszek az idegenvezetőd.",
  "ro-RO": "Bună! Astăzi voi fi ghidul tău.",
  "ru-RU": "Привет! Сегодня я буду вашим гидом.",
  "uk-UA": "Привіт! Сьогодні я буду вашим гідом.",
  "tr-TR": "Merhaba! Bugün rehberiniz olacağım.",
  "ar-SA": "مرحبًا! سأكون مرشدك اليوم.",
  "he-IL": "שלום! אהיה המדריך שלך היום.",
  "fa-IR": "سلام! امروز راهنمای شما خواهم بود.",
  "hi-IN": "नमस्ते! आज मैं आपका मार्गदर्शक रहूँगा।",
  "bn-IN": "নমস্কার! আজ আমি আপনার গাইড হব।",
  "ur-PK": "السلام علیکم! آج میں آپ کا گائیڈ بنوں گا۔",
  "id-ID": "Halo! Saya akan menjadi pemandu Anda hari ini.",
  "ms-MY": "Hai! Saya akan menjadi pemandu anda hari ini.",
  "th-TH": "สวัสดี! วันนี้ฉันจะเป็นไกด์ของคุณ",
  "vi-VN": "Xin chào! Hôm nay tôi sẽ là hướng dẫn viên của bạn.",
  "ja-JP": "こんにちは！本日はガイドを務めます。",
  "ko-KR": "안녕하세요! 오늘 가이드를 맡겠습니다.",
  "zh-CN": "你好！今天由我为您导览。",
  "zh-TW": "你好！今天由我為您導覽。",
  "hy-AM": "Բարև՜ Այսօր ես կլինեմ ձեր ուղեկցորդը։",
  "az-AZ": "Salam! Bu gün sizin bələdçiniz olacağam.",
  "uz-UZ": "Salom! Bugun men sizning yoʻlboshchingiz boʻlaman.",
  "kk-KZ": "Сәлеметсіз бе! Бүгін мен сіздің гидіңіз боламын.",
  "bg-BG": "Здравейте! Днес аз ще бъда вашият водач.",
  "hr-HR": "Bok! Danas ću biti vaš vodič.",
  "sr-RS": "Здраво! Данас ћу бити ваш водич.",
  "ta-IN": "வணக்கம்! இன்று நான் உங்கள் வழிகாட்டியாக இருப்பேன்.",
  "te-IN": "నమస్తే! ఈ రోజు నేను మీ గైడ్‌గా ఉంటాను.",
  "mr-IN": "नमस्कार! आज मी तुमचा मार्गदर्शक असेन.",
  "sw-KE": "Habari! Leo nitakuwa mwongozo wako.",
  "af-ZA": "Hallo! Ek sal vandag jou gids wees.",
  "fil-PH": "Kumusta! Ako ang inyong gabay ngayong araw.",
  "lt-LT": "Sveiki! Šiandien būsiu jūsų gidas.",
  "lv-LV": "Sveiki! Šodien es būšu jūsu gids.",
  "gu-IN": "નમસ્તે! આજે હું તમારો માર્ગદર્શક બનીશ.",
  "ml-IN": "നമസ്കാരം! ഇന്ന് ഞാൻ നിങ്ങളുടെ ഗൈഡ് ആയിരിക്കും.",
  "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਅੱਜ ਮੈਂ ਤੁਹਾਡਾ ਗਾਈਡ ਬਣਾਂਗਾ।",
};

export function getPreviewPhrase(code: string): string {
  return PREVIEW_PHRASES[code] ?? PREVIEW_PHRASES["en-US"];
}
