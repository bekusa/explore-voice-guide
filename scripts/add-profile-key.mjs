#!/usr/bin/env node
/**
 * One-off helper: insert nav.profile + profile.* keys into all 34
 * ui-locales files. Run from repo root with `node scripts/add-profile-key.mjs`.
 *
 * Translations are hand-curated by native-speaker convention (Profile
 * is one of the most stable internationalised words — it's cognate
 * across most European languages, and the non-European targets use
 * the loanword in everyday UI).
 *
 * Re-running is idempotent: if `nav.profile` is already in a file we
 * skip it.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "src", "lib", "ui-locales");

// Translations of: Profile, Account, Settings (already exists as
// nav.settings — repeated as profile.openSettings for clarity),
// "Signed in as", Guest
const TRANSLATIONS = {
  ar:    { profile: "الملف الشخصي", account: "الحساب", settings: "الإعدادات", signedInAs: "تم تسجيل الدخول باسم", guest: "زائر" },
  bn:    { profile: "প্রোফাইল",         account: "অ্যাকাউন্ট",   settings: "সেটিংস",        signedInAs: "লগ ইন করেছেন",      guest: "অতিথি" },
  cs:    { profile: "Profil",          account: "Účet",        settings: "Nastavení",     signedInAs: "Přihlášen jako",   guest: "Host" },
  da:    { profile: "Profil",          account: "Konto",       settings: "Indstillinger", signedInAs: "Logget ind som",   guest: "Gæst" },
  de:    { profile: "Profil",          account: "Konto",       settings: "Einstellungen", signedInAs: "Angemeldet als",   guest: "Gast" },
  el:    { profile: "Προφίλ",          account: "Λογαριασμός", settings: "Ρυθμίσεις",     signedInAs: "Συνδεδεμένος ως",  guest: "Επισκέπτης" },
  es:    { profile: "Perfil",          account: "Cuenta",      settings: "Ajustes",       signedInAs: "Sesión iniciada como", guest: "Invitado" },
  fa:    { profile: "نمایه",            account: "حساب",        settings: "تنظیمات",       signedInAs: "وارد شده با نام",   guest: "مهمان" },
  fi:    { profile: "Profiili",        account: "Tili",        settings: "Asetukset",     signedInAs: "Kirjautunut nimellä", guest: "Vieras" },
  fr:    { profile: "Profil",          account: "Compte",      settings: "Paramètres",    signedInAs: "Connecté en tant que", guest: "Invité" },
  he:    { profile: "פרופיל",           account: "חשבון",       settings: "הגדרות",        signedInAs: "מחובר בתור",        guest: "אורח" },
  hi:    { profile: "प्रोफ़ाइल",          account: "खाता",         settings: "सेटिंग्स",         signedInAs: "के रूप में साइन इन",   guest: "अतिथि" },
  hu:    { profile: "Profil",          account: "Fiók",        settings: "Beállítások",   signedInAs: "Bejelentkezve mint", guest: "Vendég" },
  id:    { profile: "Profil",          account: "Akun",        settings: "Pengaturan",    signedInAs: "Masuk sebagai",     guest: "Tamu" },
  it:    { profile: "Profilo",         account: "Account",     settings: "Impostazioni",  signedInAs: "Connesso come",    guest: "Ospite" },
  ja:    { profile: "プロフィール",        account: "アカウント",       settings: "設定",           signedInAs: "サインイン中:",      guest: "ゲスト" },
  ka:    { profile: "პროფილი",          account: "ანგარიში",     settings: "პარამეტრები",   signedInAs: "შესული ხართ როგორც", guest: "სტუმარი" },
  ko:    { profile: "프로필",            account: "계정",          settings: "설정",           signedInAs: "다음으로 로그인됨:",    guest: "게스트" },
  ms:    { profile: "Profil",          account: "Akaun",       settings: "Tetapan",       signedInAs: "Log masuk sebagai",  guest: "Tetamu" },
  nb:    { profile: "Profil",          account: "Konto",       settings: "Innstillinger", signedInAs: "Logget inn som",    guest: "Gjest" },
  nl:    { profile: "Profiel",         account: "Account",     settings: "Instellingen",  signedInAs: "Aangemeld als",     guest: "Gast" },
  pl:    { profile: "Profil",          account: "Konto",       settings: "Ustawienia",    signedInAs: "Zalogowano jako",   guest: "Gość" },
  "pt-br": { profile: "Perfil",        account: "Conta",       settings: "Configurações", signedInAs: "Conectado como",    guest: "Convidado" },
  "pt-pt": { profile: "Perfil",        account: "Conta",       settings: "Definições",    signedInAs: "Sessão iniciada como", guest: "Convidado" },
  ro:    { profile: "Profil",          account: "Cont",        settings: "Setări",        signedInAs: "Conectat ca",       guest: "Invitat" },
  ru:    { profile: "Профиль",         account: "Аккаунт",     settings: "Настройки",     signedInAs: "Вошли как",        guest: "Гость" },
  sv:    { profile: "Profil",          account: "Konto",       settings: "Inställningar", signedInAs: "Inloggad som",      guest: "Gäst" },
  th:    { profile: "โปรไฟล์",          account: "บัญชี",          settings: "การตั้งค่า",       signedInAs: "เข้าสู่ระบบในชื่อ",     guest: "ผู้เยี่ยมชม" },
  tr:    { profile: "Profil",          account: "Hesap",       settings: "Ayarlar",       signedInAs: "Şu kullanıcıyla oturum açıldı", guest: "Misafir" },
  uk:    { profile: "Профіль",         account: "Обліковий запис", settings: "Налаштування", signedInAs: "Увійшли як",     guest: "Гість" },
  ur:    { profile: "پروفائل",          account: "اکاؤنٹ",       settings: "ترتیبات",       signedInAs: "بطور لاگ ان",       guest: "مہمان" },
  vi:    { profile: "Hồ sơ",           account: "Tài khoản",   settings: "Cài đặt",       signedInAs: "Đã đăng nhập với",  guest: "Khách" },
  "zh-cn": { profile: "个人资料",       account: "账户",         settings: "设置",           signedInAs: "已登录为",          guest: "访客" },
  "zh-tw": { profile: "個人資料",       account: "帳戶",         settings: "設定",           signedInAs: "已登入為",          guest: "訪客" },
};

let modified = 0;
let skipped = 0;

for (const [locale, t] of Object.entries(TRANSLATIONS)) {
  const file = join(LOCALES_DIR, `${locale}.ts`);
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    console.warn(`[skip] ${locale}.ts not found`);
    continue;
  }

  if (content.includes('"nav.profile"')) {
    skipped++;
    continue;
  }

  // Insert after "nav.back" line (kept consistent across all files).
  const navBackRegex = /(\s*"nav\.back":\s*"[^"]*",\n)/;
  if (!navBackRegex.test(content)) {
    console.warn(`[skip] ${locale}.ts has no nav.back anchor`);
    continue;
  }

  const insertion =
    `  "nav.profile": "${t.profile}",\n` +
    `  "profile.title": "${t.profile}",\n` +
    `  "profile.account": "${t.account}",\n` +
    `  "profile.openSettings": "${t.settings}",\n` +
    `  "profile.signedInAs": "${t.signedInAs}",\n` +
    `  "profile.guest": "${t.guest}",\n`;

  const updated = content.replace(navBackRegex, (match) => match + insertion);
  await writeFile(file, updated, "utf8");
  modified++;
}

console.log(`[add-profile-key] modified ${modified} locales, skipped ${skipped} (already had it)`);
