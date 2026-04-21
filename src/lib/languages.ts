// 37 supported languages for the audio guide.
// BCP-47 codes match SpeechSynthesisVoice.lang from the Web Speech API.

export interface Language {
  code: string;
  name: string;
  native: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
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
];

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
};

export function getPreviewPhrase(code: string): string {
  return PREVIEW_PHRASES[code] ?? PREVIEW_PHRASES["en-US"];
}
