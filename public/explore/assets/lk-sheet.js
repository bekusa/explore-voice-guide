/* lk-sheet.js v5 — the "get the app" card on every /explore/ page, in every language.
 *
 * ── ONE PLACE TO EDIT ────────────────────────────────────────────────────────
 * Everything you may want to change is in SETTINGS and TEXT right below.
 * Every page loads this file as /explore/assets/lk-sheet.js with no ?v=, so an
 * edit here reaches all pages with the next GitHub push. Nothing else to touch.
 *   - switch the card off everywhere:        SETTINGS.enabled = false
 *   - only on attraction pages:              SETTINGS.showOn.city / .country = false
 *   - show it sooner / later:                SETTINGS.showAfterSeconds, engagedAfterSeconds
 *   - nearby places in the card:             SETTINGS.nearbyMaxKm, nearbyCount, cityLine
 *   - wording in a language:                 TEXT.<lang> (missing keys fall back to TEXT.en)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Desktop: cream card bottom-right — title, line, app screenshot, QR + Google Play badge.
 * Mobile:  compact bar (~20% of the screen, Google's intrusive-interstitial guidance);
 *          tapping it opens the full card.
 * Shows once the visitor is engaged (scrolled past SETTINGS.engagedScroll after
 * engagedAfterSeconds, or after showAfterSeconds), never inside the Android app,
 * and not again for hideForDays after it is closed. ?lksheet=1 shows it at once for
 * testing and skips tracking. Events go to usage_events: sheet_shown / sheet_expand /
 * sheet_click / sheet_close.
 */
var LK_SHEET_SETTINGS = {
  enabled: true,
  showOn: { attraction: true, city: true, country: true },
  showAfterSeconds: 25,      // show anyway after this long
  engagedAfterSeconds: 10,   // ...or earlier, once this long has passed AND
  engagedScroll: 0.5,        // ...the visitor has scrolled past this share of the page
  hideForDays: 7,            // after "×", stay hidden this long
  nearbyMaxKm: 3,            // "Nearby: …" lists places at most this far (from the page's own Nearby list)
  nearbyCount: 3,            // ...and at most this many of them
  cityLine: true,            // no place that close -> "{city}: more free audio guides in the app." instead
  playUrl: "https://play.google.com/store/apps/details?id=app.lokali.travel",
  appScreens: { tbilisi: 1, rome: 1, istanbul: 1, paris: 1 }, // cities with their own app screenshot in assets/app/
  webLinkLangs: { en: 1 }    // "Listen in your browser" deep link only where the page name is the app's name
};

/* {place} = the page's h1, {near} = up to nearbyCount nearest places with distances ("Abanotubani 200 m · Metekhi Church 300 m"),
 * {city} = the page's city as the page itself writes it. <b>…</b> is allowed. */
var LK_SHEET_TEXT = {
  en: { tag: "Free audio guide", title: "{place} is just the start.", titleHub: "{place} — free audio guides in your language.",
    near: "Nearby: {near}.", city: "{city}: more free audio guides in the app.", sub: "Hear the full story with Lokali&rsquo;s <b>free audio guide</b> — in your language, offline.",
    subHub: "Every place on this page has a <b>free audio guide</b> in the Lokali app — in your language, offline.",
    offline: "offline", more: "More", scan: "Scan with your Android phone", cam: "Open your camera to get Lokali on Google Play.",
    pts: "50+ languages|Works offline|No ads", web: "Listen in your browser", close: "Close", label: "Get the Lokali app" },
  af: { tag: "Gratis oudiogids", title: "{place} is net die begin.", titleHub: "{place} — gratis oudiogidse in jou taal.", near: "Naby: {near}.", city: "{city}: nog gratis oudiogidse in die toep.",
    sub: "Hoor die hele storie met Lokali se <b>gratis oudiogids</b> — in jou taal, vanlyn.", subHub: "Elke plek op hierdie bladsy het 'n <b>gratis oudiogids</b> in die Lokali-toep — in jou taal, vanlyn.",
    offline: "vanlyn", more: "Meer", scan: "Skandeer met jou Android-foon", cam: "Maak jou kamera oop om Lokali op Google Play te kry.",
    pts: "50+ tale|Werk vanlyn|Geen advertensies", web: "Luister in jou blaaier", close: "Maak toe", label: "Kry die Lokali-toep" },
  ar: { tag: "دليل صوتي مجاني", title: "{place} ليس سوى البداية.", titleHub: "{place} — أدلة صوتية مجانية بلغتك.", near: "بالقرب: {near}.", city: "{city}: المزيد من الأدلة الصوتية المجانية في التطبيق.",
    sub: "استمع إلى القصة كاملة مع <b>الدليل الصوتي المجاني</b> من Lokali — بلغتك ودون اتصال.", subHub: "لكل مكان في هذه الصفحة <b>دليل صوتي مجاني</b> في تطبيق Lokali — بلغتك ودون اتصال.",
    offline: "دون اتصال", more: "المزيد", scan: "امسح الرمز بهاتف Android", cam: "افتح الكاميرا للحصول على Lokali من Google Play.",
    pts: "أكثر من 50 لغة|يعمل دون اتصال|بلا إعلانات", web: "استمع في المتصفح", close: "إغلاق", label: "احصل على تطبيق Lokali" },
  az: { tag: "Pulsuz audio bələdçi", title: "{place} yalnız başlanğıcdır.", titleHub: "{place} — öz dilinizdə pulsuz audio bələdçilər.", near: "Yaxınlıqda: {near}.", city: "{city}: tətbiqdə daha çox pulsuz audio bələdçi.",
    sub: "Lokali-nin <b>pulsuz audio bələdçisi</b> ilə bütün hekayəni dinləyin — öz dilinizdə, oflayn.", subHub: "Bu səhifədəki hər yerin Lokali tətbiqində <b>pulsuz audio bələdçisi</b> var — öz dilinizdə, oflayn.",
    offline: "oflayn", more: "Ətraflı", scan: "Android telefonunuzla skan edin", cam: "Lokali-ni Google Play-dən yükləmək üçün kameranı açın.",
    pts: "50+ dil|Oflayn işləyir|Reklamsız", web: "Brauzerdə dinləyin", close: "Bağla", label: "Lokali tətbiqini yükləyin" },
  bg: { tag: "Безплатен аудиогид", title: "{place} е само началото.", titleHub: "{place} — безплатни аудиогидове на вашия език.", near: "Наблизо: {near}.", city: "{city}: още безплатни аудиогидове в приложението.",
    sub: "Чуйте цялата история с <b>безплатния аудиогид</b> на Lokali — на вашия език, офлайн.", subHub: "Всяко място на тази страница има <b>безплатен аудиогид</b> в приложението Lokali — на вашия език, офлайн.",
    offline: "офлайн", more: "Още", scan: "Сканирайте с телефона си с Android", cam: "Отворете камерата, за да изтеглите Lokali от Google Play.",
    pts: "50+ езика|Работи офлайн|Без реклами", web: "Слушайте в браузъра", close: "Затвори", label: "Изтеглете приложението Lokali" },
  bn: { tag: "ফ্রি অডিও গাইড", title: "{place} শুধু শুরু।", titleHub: "{place} — আপনার ভাষায় ফ্রি অডিও গাইড।", near: "কাছেই: {near}।", city: "{city}: অ্যাপে আরও ফ্রি অডিও গাইড।",
    sub: "Lokali-র <b>ফ্রি অডিও গাইডে</b> পুরো গল্প শুনুন — আপনার ভাষায়, অফলাইনে।", subHub: "এই পাতার প্রতিটি জায়গার জন্য Lokali অ্যাপে <b>ফ্রি অডিও গাইড</b> আছে — আপনার ভাষায়, অফলাইনে।",
    offline: "অফলাইন", more: "আরও", scan: "আপনার Android ফোন দিয়ে স্ক্যান করুন", cam: "Google Play থেকে Lokali পেতে ক্যামেরা খুলুন।",
    pts: "50+ ভাষা|অফলাইনে চলে|বিজ্ঞাপন নেই", web: "ব্রাউজারে শুনুন", close: "বন্ধ করুন", label: "Lokali অ্যাপ নিন" },
  cs: { tag: "Audioprůvodce zdarma", title: "{place} je jen začátek.", titleHub: "{place} — audioprůvodci zdarma ve vašem jazyce.", near: "Nedaleko: {near}.", city: "{city}: další audioprůvodci zdarma v aplikaci.",
    sub: "Poslechněte si celý příběh s <b>audioprůvodcem zdarma</b> od Lokali — ve vašem jazyce, offline.", subHub: "Každé místo na této stránce má v aplikaci Lokali <b>audioprůvodce zdarma</b> — ve vašem jazyce, offline.",
    offline: "offline", more: "Více", scan: "Naskenujte telefonem s Androidem", cam: "Otevřete fotoaparát a stáhněte Lokali z Google Play.",
    pts: "50+ jazyků|Funguje offline|Bez reklam", web: "Poslouchat v prohlížeči", close: "Zavřít", label: "Stáhněte aplikaci Lokali" },
  da: { tag: "Gratis lydguide", title: "{place} er kun begyndelsen.", titleHub: "{place} — gratis lydguides på dit sprog.", near: "I nærheden: {near}.", city: "{city}: flere gratis lydguides i appen.",
    sub: "Hør hele historien med Lokalis <b>gratis lydguide</b> — på dit sprog, offline.", subHub: "Alle steder på denne side har en <b>gratis lydguide</b> i Lokali-appen — på dit sprog, offline.",
    offline: "offline", more: "Mere", scan: "Scan med din Android-telefon", cam: "Åbn kameraet for at hente Lokali på Google Play.",
    pts: "50+ sprog|Virker offline|Ingen reklamer", web: "Lyt i browseren", close: "Luk", label: "Hent Lokali-appen" },
  de: { tag: "Kostenloser Audioguide", title: "{place} ist erst der Anfang.", titleHub: "{place} — kostenlose Audioguides in deiner Sprache.", near: "In der Nähe: {near}.", city: "{city}: weitere kostenlose Audioguides in der App.",
    sub: "Hör die ganze Geschichte mit dem <b>kostenlosen Audioguide</b> von Lokali — in deiner Sprache, offline.", subHub: "Jeder Ort auf dieser Seite hat einen <b>kostenlosen Audioguide</b> in der Lokali-App — in deiner Sprache, offline.",
    offline: "offline", more: "Mehr", scan: "Mit dem Android-Handy scannen", cam: "Öffne die Kamera, um Lokali bei Google Play zu holen.",
    pts: "50+ Sprachen|Funktioniert offline|Keine Werbung", web: "Im Browser anhören", close: "Schließen", label: "Lokali-App holen" },
  el: { tag: "Δωρεάν ηχητικός οδηγός", title: "{place}: μόνο η αρχή.", titleHub: "{place} — δωρεάν ηχητικοί οδηγοί στη γλώσσα σας.", near: "Κοντά: {near}.", city: "{city}: περισσότεροι δωρεάν ηχητικοί οδηγοί στην εφαρμογή.",
    sub: "Ακούστε όλη την ιστορία με τον <b>δωρεάν ηχητικό οδηγό</b> του Lokali — στη γλώσσα σας, εκτός σύνδεσης.", subHub: "Κάθε μέρος σε αυτή τη σελίδα έχει <b>δωρεάν ηχητικό οδηγό</b> στην εφαρμογή Lokali — στη γλώσσα σας, εκτός σύνδεσης.",
    offline: "εκτός σύνδεσης", more: "Περισσότερα", scan: "Σαρώστε με το Android κινητό σας", cam: "Ανοίξτε την κάμερα για να κατεβάσετε το Lokali από το Google Play.",
    pts: "50+ γλώσσες|Λειτουργεί εκτός σύνδεσης|Χωρίς διαφημίσεις", web: "Ακούστε στο πρόγραμμα περιήγησης", close: "Κλείσιμο", label: "Κατεβάστε την εφαρμογή Lokali" },
  es: { tag: "Audioguía gratis", title: "{place} es solo el principio.", titleHub: "{place}: audioguías gratis en tu idioma.", near: "Cerca: {near}.", city: "{city}: más audioguías gratis en la app.",
    sub: "Escucha toda la historia con la <b>audioguía gratis</b> de Lokali, en tu idioma y sin conexión.", subHub: "Cada lugar de esta página tiene una <b>audioguía gratis</b> en la app Lokali, en tu idioma y sin conexión.",
    offline: "sin conexión", more: "Más", scan: "Escanea con tu móvil Android", cam: "Abre la cámara para descargar Lokali en Google Play.",
    pts: "50+ idiomas|Funciona sin conexión|Sin anuncios", web: "Escuchar en el navegador", close: "Cerrar", label: "Descarga la app Lokali" },
  fa: { tag: "راهنمای صوتی رایگان", title: "{place} تازه آغاز راه است.", titleHub: "{place} — راهنماهای صوتی رایگان به زبان شما.", near: "در نزدیکی: {near}.", city: "{city}: راهنماهای صوتی رایگان بیشتر در اپلیکیشن.",
    sub: "کل داستان را با <b>راهنمای صوتی رایگان</b> Lokali بشنوید — به زبان خودتان و آفلاین.", subHub: "هر مکان در این صفحه در اپلیکیشن Lokali <b>راهنمای صوتی رایگان</b> دارد — به زبان خودتان و آفلاین.",
    offline: "آفلاین", more: "بیشتر", scan: "با گوشی اندروید خود اسکن کنید", cam: "دوربین را باز کنید تا Lokali را از Google Play بگیرید.",
    pts: "بیش از ۵۰ زبان|کار به‌صورت آفلاین|بدون تبلیغ", web: "در مرورگر گوش دهید", close: "بستن", label: "اپلیکیشن Lokali را بگیرید" },
  fi: { tag: "Ilmainen ääniopas", title: "{place} on vasta alkua.", titleHub: "{place} — ilmaisia ääniopastuksia omalla kielelläsi.", near: "Lähellä: {near}.", city: "{city}: lisää ilmaisia ääniopastuksia sovelluksessa.",
    sub: "Kuuntele koko tarina Lokalin <b>ilmaisella ääniopastuksella</b> — omalla kielelläsi, offline.", subHub: "Jokaisella tämän sivun kohteella on <b>ilmainen ääniopas</b> Lokali-sovelluksessa — omalla kielelläsi, offline.",
    offline: "offline", more: "Lisää", scan: "Skannaa Android-puhelimellasi", cam: "Avaa kamera ja lataa Lokali Google Playsta.",
    pts: "50+ kieltä|Toimii offline|Ei mainoksia", web: "Kuuntele selaimessa", close: "Sulje", label: "Lataa Lokali-sovellus" },
  fr: { tag: "Audioguide gratuit", title: "{place}, ce n'est que le début.", titleHub: "{place} : audioguides gratuits dans votre langue.", near: "À proximité : {near}.", city: "{city} : d'autres audioguides gratuits dans l'appli.",
    sub: "Écoutez toute l'histoire avec l'<b>audioguide gratuit</b> Lokali — dans votre langue, hors ligne.", subHub: "Chaque lieu de cette page a un <b>audioguide gratuit</b> dans l'appli Lokali — dans votre langue, hors ligne.",
    offline: "hors ligne", more: "Plus", scan: "Scannez avec votre téléphone Android", cam: "Ouvrez l'appareil photo pour obtenir Lokali sur Google Play.",
    pts: "50+ langues|Fonctionne hors ligne|Sans publicité", web: "Écouter dans le navigateur", close: "Fermer", label: "Obtenir l'appli Lokali" },
  he: { tag: "מדריך קולי חינם", title: "{place} — זו רק ההתחלה.", titleHub: "{place} — מדריכים קוליים חינם בשפה שלכם.", near: "בקרבת מקום: {near}.", city: "{city}: עוד מדריכים קוליים חינם באפליקציה.",
    sub: "האזינו לסיפור המלא עם <b>המדריך הקולי החינמי</b> של Lokali — בשפה שלכם, גם בלי חיבור.", subHub: "לכל מקום בעמוד הזה יש <b>מדריך קולי חינם</b> באפליקציית Lokali — בשפה שלכם, גם בלי חיבור.",
    offline: "בלי חיבור", more: "עוד", scan: "סרקו עם טלפון אנדרואיד", cam: "פתחו את המצלמה כדי להוריד את Lokali מ-Google Play.",
    pts: "יותר מ-50 שפות|עובד בלי חיבור|בלי פרסומות", web: "האזינו בדפדפן", close: "סגירה", label: "הורידו את אפליקציית Lokali" },
  hi: { tag: "मुफ़्त ऑडियो गाइड", title: "{place} तो बस शुरुआत है।", titleHub: "{place} — आपकी भाषा में मुफ़्त ऑडियो गाइड।", near: "पास में: {near}।", city: "{city}: ऐप में और भी मुफ़्त ऑडियो गाइड।",
    sub: "Lokali के <b>मुफ़्त ऑडियो गाइड</b> के साथ पूरी कहानी सुनें — आपकी भाषा में, ऑफ़लाइन।", subHub: "इस पेज की हर जगह के लिए Lokali ऐप में <b>मुफ़्त ऑडियो गाइड</b> है — आपकी भाषा में, ऑफ़लाइन।",
    offline: "ऑफ़लाइन", more: "और", scan: "अपने Android फ़ोन से स्कैन करें", cam: "Google Play से Lokali पाने के लिए कैमरा खोलें।",
    pts: "50+ भाषाएँ|ऑफ़लाइन चलता है|कोई विज्ञापन नहीं", web: "ब्राउज़र में सुनें", close: "बंद करें", label: "Lokali ऐप पाएँ" },
  hr: { tag: "Besplatni audiovodič", title: "{place} samo je početak.", titleHub: "{place} — besplatni audiovodiči na vašem jeziku.", near: "U blizini: {near}.", city: "{city}: još besplatnih audiovodiča u aplikaciji.",
    sub: "Poslušajte cijelu priču uz Lokalijev <b>besplatni audiovodič</b> — na vašem jeziku, izvanmrežno.", subHub: "Svako mjesto na ovoj stranici ima <b>besplatni audiovodič</b> u aplikaciji Lokali — na vašem jeziku, izvanmrežno.",
    offline: "izvanmrežno", more: "Više", scan: "Skenirajte Android mobitelom", cam: "Otvorite kameru i preuzmite Lokali s Google Playa.",
    pts: "50+ jezika|Radi izvanmrežno|Bez oglasa", web: "Slušajte u pregledniku", close: "Zatvori", label: "Preuzmite aplikaciju Lokali" },
  hu: { tag: "Ingyenes audioguide", title: "{place} csak a kezdet.", titleHub: "{place} — ingyenes audioguide-ok a saját nyelveden.", near: "A közelben: {near}.", city: "{city}: további ingyenes audioguide-ok az alkalmazásban.",
    sub: "Hallgasd meg a teljes történetet a Lokali <b>ingyenes audioguide-jával</b> — a saját nyelveden, offline.", subHub: "Az oldal minden helyéhez van <b>ingyenes audioguide</b> a Lokali alkalmazásban — a saját nyelveden, offline.",
    offline: "offline", more: "Több", scan: "Olvasd be Android telefonnal", cam: "Nyisd meg a kamerát, és töltsd le a Lokalit a Google Playről.",
    pts: "50+ nyelv|Offline is működik|Nincs reklám", web: "Hallgasd a böngészőben", close: "Bezárás", label: "Töltsd le a Lokali alkalmazást" },
  hy: { tag: "Անվճար աուդիոգիդ", title: "{place} — սա միայն սկիզբն է։", titleHub: "{place} — անվճար աուդիոգիդեր ձեր լեզվով։", near: "Մոտակայքում՝ {near}։", city: "{city}՝ ավելի շատ անվճար աուդիոգիդեր հավելվածում։",
    sub: "Լսեք ամբողջ պատմությունը Lokali-ի <b>անվճար աուդիոգիդով</b>՝ ձեր լեզվով, առանց ինտերնետի։", subHub: "Այս էջի ամեն վայր Lokali հավելվածում ունի <b>անվճար աուդիոգիդ</b>՝ ձեր լեզվով, առանց ինտերնետի։",
    offline: "առանց ինտերնետի", more: "Ավելին", scan: "Սկանավորեք Android հեռախոսով", cam: "Բացեք տեսախցիկը՝ Lokali-ն Google Play-ից ներբեռնելու համար։",
    pts: "50+ լեզու|Աշխատում է առանց ինտերնետի|Առանց գովազդի", web: "Լսեք բրաուզերում", close: "Փակել", label: "Ներբեռնեք Lokali հավելվածը" },
  id: { tag: "Pemandu audio gratis", title: "{place} baru permulaan.", titleHub: "{place} — pemandu audio gratis dalam bahasamu.", near: "Di dekat sini: {near}.", city: "{city}: lebih banyak pemandu audio gratis di aplikasi.",
    sub: "Dengarkan kisah lengkapnya dengan <b>pemandu audio gratis</b> Lokali — dalam bahasamu, tanpa internet.", subHub: "Setiap tempat di halaman ini punya <b>pemandu audio gratis</b> di aplikasi Lokali — dalam bahasamu, tanpa internet.",
    offline: "tanpa internet", more: "Lainnya", scan: "Pindai dengan ponsel Android", cam: "Buka kamera untuk mendapatkan Lokali di Google Play.",
    pts: "50+ bahasa|Bisa tanpa internet|Tanpa iklan", web: "Dengarkan di browser", close: "Tutup", label: "Dapatkan aplikasi Lokali" },
  it: { tag: "Audioguida gratuita", title: "{place} è solo l'inizio.", titleHub: "{place}: audioguide gratuite nella tua lingua.", near: "Nei dintorni: {near}.", city: "{city}: altre audioguide gratuite nell'app.",
    sub: "Ascolta tutta la storia con l'<b>audioguida gratuita</b> di Lokali, nella tua lingua e offline.", subHub: "Ogni luogo di questa pagina ha un'<b>audioguida gratuita</b> nell'app Lokali, nella tua lingua e offline.",
    offline: "offline", more: "Altro", scan: "Scansiona con il tuo telefono Android", cam: "Apri la fotocamera per scaricare Lokali da Google Play.",
    pts: "50+ lingue|Funziona offline|Senza pubblicità", web: "Ascolta nel browser", close: "Chiudi", label: "Scarica l'app Lokali" },
  ja: { tag: "無料オーディオガイド", title: "{place}は、ほんの始まり。", titleHub: "{place} — あなたの言語で聞ける無料オーディオガイド", near: "近く：{near}。", city: "{city}：アプリでさらに無料オーディオガイドを。",
    sub: "Lokaliの<b>無料オーディオガイド</b>で、物語のすべてを。あなたの言語で、オフラインでも。", subHub: "このページのすべての場所に、Lokaliアプリの<b>無料オーディオガイド</b>があります。あなたの言語で、オフラインでも。",
    offline: "オフライン", more: "詳しく", scan: "Androidスマホでスキャン", cam: "カメラを開いて、Google PlayからLokaliを入手。",
    pts: "50以上の言語|オフラインで使える|広告なし", web: "ブラウザで聴く", close: "閉じる", label: "Lokaliアプリを入手" },
  ka: { tag: "უფასო აუდიოგიდი", title: "{place} — მხოლოდ დასაწყისია.", titleHub: "{place} — უფასო აუდიოგიდები თქვენს ენაზე.", near: "ახლოს: {near}.", city: "{city}: კიდევ ბევრი უფასო აუდიოგიდი აპში.",
    sub: "მოისმინეთ მთელი ისტორია Lokali-ს <b>უფასო აუდიოგიდით</b> — თქვენს ენაზე, ინტერნეტის გარეშე.", subHub: "ამ გვერდზე ყველა ადგილს Lokali-ს აპში <b>უფასო აუდიოგიდი</b> აქვს — თქვენს ენაზე, ინტერნეტის გარეშე.",
    offline: "ოფლაინ", more: "მეტი", scan: "დაასკანერეთ Android ტელეფონით", cam: "გახსენით კამერა და ჩამოტვირთეთ Lokali Google Play-დან.",
    pts: "50+ ენა|მუშაობს ოფლაინ|რეკლამის გარეშე", web: "მოუსმინეთ ბრაუზერში", close: "დახურვა", label: "ჩამოტვირთეთ Lokali" },
  ko: { tag: "무료 오디오 가이드", title: "{place}, 이제 시작일 뿐입니다.", titleHub: "{place} — 내 언어로 듣는 무료 오디오 가이드", near: "근처: {near}.", city: "{city}: 앱에서 더 많은 무료 오디오 가이드를 만나보세요.",
    sub: "Lokali <b>무료 오디오 가이드</b>로 모든 이야기를 들어 보세요. 내 언어로, 오프라인에서도.", subHub: "이 페이지의 모든 장소에 Lokali 앱 <b>무료 오디오 가이드</b>가 있습니다. 내 언어로, 오프라인에서도.",
    offline: "오프라인", more: "더 보기", scan: "Android 휴대폰으로 스캔하세요", cam: "카메라를 열어 Google Play에서 Lokali를 받으세요.",
    pts: "50개 이상 언어|오프라인 지원|광고 없음", web: "브라우저에서 듣기", close: "닫기", label: "Lokali 앱 받기" },
  mr: { tag: "मोफत ऑडिओ गाइड", title: "{place} ही तर फक्त सुरुवात आहे.", titleHub: "{place} — तुमच्या भाषेत मोफत ऑडिओ गाइड.", near: "जवळ: {near}.", city: "{city}: ॲपमध्ये आणखी मोफत ऑडिओ गाइड.",
    sub: "Lokali च्या <b>मोफत ऑडिओ गाइड</b>सह संपूर्ण कथा ऐका — तुमच्या भाषेत, ऑफलाइन.", subHub: "या पानावरील प्रत्येक ठिकाणासाठी Lokali अॅपमध्ये <b>मोफत ऑडिओ गाइड</b> आहे — तुमच्या भाषेत, ऑफलाइन.",
    offline: "ऑफलाइन", more: "अधिक", scan: "तुमच्या Android फोनने स्कॅन करा", cam: "Google Play वरून Lokali मिळवण्यासाठी कॅमेरा उघडा.",
    pts: "50+ भाषा|ऑफलाइन चालते|जाहिराती नाहीत", web: "ब्राउझरमध्ये ऐका", close: "बंद करा", label: "Lokali अॅप मिळवा" },
  ms: { tag: "Panduan audio percuma", title: "{place} hanyalah permulaan.", titleHub: "{place} — panduan audio percuma dalam bahasa anda.", near: "Berdekatan: {near}.", city: "{city}: lebih banyak panduan audio percuma dalam aplikasi.",
    sub: "Dengar kisah penuh dengan <b>panduan audio percuma</b> Lokali — dalam bahasa anda, luar talian.", subHub: "Setiap tempat di halaman ini mempunyai <b>panduan audio percuma</b> dalam aplikasi Lokali — dalam bahasa anda, luar talian.",
    offline: "luar talian", more: "Lagi", scan: "Imbas dengan telefon Android anda", cam: "Buka kamera untuk mendapatkan Lokali di Google Play.",
    pts: "50+ bahasa|Berfungsi luar talian|Tiada iklan", web: "Dengar dalam pelayar", close: "Tutup", label: "Dapatkan aplikasi Lokali" },
  nb: { tag: "Gratis lydguide", title: "{place} er bare begynnelsen.", titleHub: "{place} — gratis lydguider på ditt språk.", near: "I nærheten: {near}.", city: "{city}: flere gratis lydguider i appen.",
    sub: "Hør hele historien med Lokalis <b>gratis lydguide</b> — på ditt språk, offline.", subHub: "Alle steder på denne siden har en <b>gratis lydguide</b> i Lokali-appen — på ditt språk, offline.",
    offline: "offline", more: "Mer", scan: "Skann med Android-telefonen din", cam: "Åpne kameraet for å laste ned Lokali fra Google Play.",
    pts: "50+ språk|Fungerer offline|Ingen reklame", web: "Lytt i nettleseren", close: "Lukk", label: "Last ned Lokali-appen" },
  nl: { tag: "Gratis audiotour", title: "{place} is nog maar het begin.", titleHub: "{place} — gratis audiotours in jouw taal.", near: "In de buurt: {near}.", city: "{city}: meer gratis audiotours in de app.",
    sub: "Hoor het hele verhaal met de <b>gratis audiotour</b> van Lokali — in jouw taal, offline.", subHub: "Elke plek op deze pagina heeft een <b>gratis audiotour</b> in de Lokali-app — in jouw taal, offline.",
    offline: "offline", more: "Meer", scan: "Scan met je Android-telefoon", cam: "Open je camera om Lokali te downloaden via Google Play.",
    pts: "50+ talen|Werkt offline|Geen advertenties", web: "Luister in je browser", close: "Sluiten", label: "Download de Lokali-app" },
  pl: { tag: "Darmowy audioprzewodnik", title: "{place} to dopiero początek.", titleHub: "{place} — darmowe audioprzewodniki w twoim języku.", near: "W pobliżu: {near}.", city: "{city}: więcej darmowych audioprzewodników w aplikacji.",
    sub: "Posłuchaj całej historii z <b>darmowym audioprzewodnikiem</b> Lokali — w twoim języku, offline.", subHub: "Każde miejsce na tej stronie ma <b>darmowy audioprzewodnik</b> w aplikacji Lokali — w twoim języku, offline.",
    offline: "offline", more: "Więcej", scan: "Zeskanuj telefonem z Androidem", cam: "Otwórz aparat, aby pobrać Lokali z Google Play.",
    pts: "50+ języków|Działa offline|Bez reklam", web: "Słuchaj w przeglądarce", close: "Zamknij", label: "Pobierz aplikację Lokali" },
  "pt-br": { tag: "Audioguia grátis", title: "{place} é só o começo.", titleHub: "{place}: audioguias grátis no seu idioma.", near: "Perto: {near}.", city: "{city}: mais audioguias grátis no app.",
    sub: "Ouça a história completa com o <b>audioguia grátis</b> da Lokali — no seu idioma, offline.", subHub: "Cada lugar desta página tem um <b>audioguia grátis</b> no app Lokali — no seu idioma, offline.",
    offline: "offline", more: "Mais", scan: "Escaneie com seu celular Android", cam: "Abra a câmera para baixar a Lokali no Google Play.",
    pts: "50+ idiomas|Funciona offline|Sem anúncios", web: "Ouça no navegador", close: "Fechar", label: "Baixe o app Lokali" },
  "pt-pt": { tag: "Audioguia gratuito", title: "{place} é só o começo.", titleHub: "{place}: audioguias gratuitos na sua língua.", near: "Perto: {near}.", city: "{city}: mais audioguias gratuitos na aplicação.",
    sub: "Ouça a história completa com o <b>audioguia gratuito</b> da Lokali — na sua língua, offline.", subHub: "Cada local desta página tem um <b>audioguia gratuito</b> na app Lokali — na sua língua, offline.",
    offline: "offline", more: "Mais", scan: "Digitalize com o seu telemóvel Android", cam: "Abra a câmara para descarregar a Lokali no Google Play.",
    pts: "50+ línguas|Funciona offline|Sem anúncios", web: "Ouça no navegador", close: "Fechar", label: "Descarregue a app Lokali" },
  ro: { tag: "Ghid audio gratuit", title: "{place} este doar începutul.", titleHub: "{place} — ghiduri audio gratuite în limba ta.", near: "În apropiere: {near}.", city: "{city}: mai multe ghiduri audio gratuite în aplicație.",
    sub: "Ascultă toată povestea cu <b>ghidul audio gratuit</b> Lokali — în limba ta, offline.", subHub: "Fiecare loc de pe această pagină are un <b>ghid audio gratuit</b> în aplicația Lokali — în limba ta, offline.",
    offline: "offline", more: "Mai mult", scan: "Scanează cu telefonul Android", cam: "Deschide camera ca să descarci Lokali din Google Play.",
    pts: "50+ de limbi|Funcționează offline|Fără reclame", web: "Ascultă în browser", close: "Închide", label: "Descarcă aplicația Lokali" },
  ru: { tag: "Бесплатный аудиогид", title: "{place} — только начало.", titleHub: "{place} — бесплатные аудиогиды на вашем языке.", near: "Рядом: {near}.", city: "{city}: ещё больше бесплатных аудиогидов в приложении.",
    sub: "Послушайте всю историю с <b>бесплатным аудиогидом</b> Lokali — на вашем языке, офлайн.", subHub: "У каждого места на этой странице есть <b>бесплатный аудиогид</b> в приложении Lokali — на вашем языке, офлайн.",
    offline: "офлайн", more: "Подробнее", scan: "Отсканируйте телефоном на Android", cam: "Откройте камеру, чтобы скачать Lokali в Google Play.",
    pts: "50+ языков|Работает офлайн|Без рекламы", web: "Слушать в браузере", close: "Закрыть", label: "Скачать приложение Lokali" },
  sr: { tag: "Бесплатни аудио-водич", title: "{place} је само почетак.", titleHub: "{place} — бесплатни аудио-водичи на вашем језику.", near: "У близини: {near}.", city: "{city}: још бесплатних аудио-водича у апликацији.",
    sub: "Послушајте целу причу уз <b>бесплатни аудио-водич</b> Lokali — на вашем језику, офлајн.", subHub: "Свако место на овој страници има <b>бесплатни аудио-водич</b> у апликацији Lokali — на вашем језику, офлајн.",
    offline: "офлајн", more: "Више", scan: "Скенирајте Android телефоном", cam: "Отворите камеру да преузмете Lokali са Google Play-а.",
    pts: "50+ језика|Ради офлајн|Без реклама", web: "Слушајте у прегледачу", close: "Затвори", label: "Преузмите апликацију Lokali" },
  sv: { tag: "Gratis ljudguide", title: "{place} är bara början.", titleHub: "{place} — gratis ljudguider på ditt språk.", near: "I närheten: {near}.", city: "{city}: fler gratis ljudguider i appen.",
    sub: "Hör hela historien med Lokalis <b>gratis ljudguide</b> — på ditt språk, offline.", subHub: "Varje plats på den här sidan har en <b>gratis ljudguide</b> i Lokali-appen — på ditt språk, offline.",
    offline: "offline", more: "Mer", scan: "Skanna med din Android-telefon", cam: "Öppna kameran för att hämta Lokali på Google Play.",
    pts: "50+ språk|Fungerar offline|Ingen reklam", web: "Lyssna i webbläsaren", close: "Stäng", label: "Hämta Lokali-appen" },
  sw: { tag: "Mwongozo wa sauti bure", title: "{place} ni mwanzo tu.", titleHub: "{place} — miongozo ya sauti bure kwa lugha yako.", near: "Karibu: {near}.", city: "{city}: miongozo zaidi ya sauti bure kwenye programu.",
    sub: "Sikiliza hadithi nzima kwa <b>mwongozo wa sauti bure</b> wa Lokali — kwa lugha yako, bila intaneti.", subHub: "Kila mahali kwenye ukurasa huu pana <b>mwongozo wa sauti bure</b> kwenye programu ya Lokali — kwa lugha yako, bila intaneti.",
    offline: "bila intaneti", more: "Zaidi", scan: "Changanua kwa simu yako ya Android", cam: "Fungua kamera upate Lokali kwenye Google Play.",
    pts: "Lugha 50+|Inafanya kazi bila intaneti|Hakuna matangazo", web: "Sikiliza kwenye kivinjari", close: "Funga", label: "Pata programu ya Lokali" },
  ta: { tag: "இலவச ஆடியோ வழிகாட்டி", title: "{place} ஒரு தொடக்கம் மட்டுமே.", titleHub: "{place} — உங்கள் மொழியில் இலவச ஆடியோ வழிகாட்டிகள்.", near: "அருகில்: {near}.", city: "{city}: செயலியில் மேலும் இலவச ஆடியோ வழிகாட்டிகள்.",
    sub: "Lokali-யின் <b>இலவச ஆடியோ வழிகாட்டி</b>யுடன் முழுக் கதையையும் கேளுங்கள் — உங்கள் மொழியில், ஆஃப்லைனில்.", subHub: "இந்தப் பக்கத்தில் உள்ள ஒவ்வொரு இடத்திற்கும் Lokali செயலியில் <b>இலவச ஆடியோ வழிகாட்டி</b> உள்ளது — உங்கள் மொழியில், ஆஃப்லைனில்.",
    offline: "ஆஃப்லைன்", more: "மேலும்", scan: "உங்கள் Android போனில் ஸ்கேன் செய்யுங்கள்", cam: "Google Play-இல் Lokali-ஐப் பெற கேமராவைத் திறக்கவும்.",
    pts: "50+ மொழிகள்|ஆஃப்லைனில் இயங்கும்|விளம்பரங்கள் இல்லை", web: "உலாவியில் கேளுங்கள்", close: "மூடு", label: "Lokali செயலியைப் பெறுங்கள்" },
  te: { tag: "ఉచిత ఆడియో గైడ్", title: "{place} కేవలం ఆరంభం మాత్రమే.", titleHub: "{place} — మీ భాషలో ఉచిత ఆడియో గైడ్‌లు.", near: "సమీపంలో: {near}.", city: "{city}: యాప్‌లో మరిన్ని ఉచిత ఆడియో గైడ్‌లు.",
    sub: "Lokali <b>ఉచిత ఆడియో గైడ్</b>తో పూర్తి కథ వినండి — మీ భాషలో, ఆఫ్‌లైన్‌లో.", subHub: "ఈ పేజీలోని ప్రతి ప్రదేశానికి Lokali యాప్‌లో <b>ఉచిత ఆడియో గైడ్</b> ఉంది — మీ భాషలో, ఆఫ్‌లైన్‌లో.",
    offline: "ఆఫ్‌లైన్", more: "మరిన్ని", scan: "మీ Android ఫోన్‌తో స్కాన్ చేయండి", cam: "Google Play నుండి Lokali పొందడానికి కెమెరా తెరవండి.",
    pts: "50+ భాషలు|ఆఫ్‌లైన్‌లో పనిచేస్తుంది|ప్రకటనలు లేవు", web: "బ్రౌజర్‌లో వినండి", close: "మూసివేయి", label: "Lokali యాప్ పొందండి" },
  th: { tag: "ไกด์เสียงฟรี", title: "{place} เป็นเพียงจุดเริ่มต้น", titleHub: "{place} — ไกด์เสียงฟรีในภาษาของคุณ", near: "ใกล้เคียง: {near}", city: "{city}: ไกด์เสียงฟรีอีกมากมายในแอป",
    sub: "ฟังเรื่องราวทั้งหมดด้วย<b>ไกด์เสียงฟรี</b>ของ Lokali — ในภาษาของคุณ ใช้งานออฟไลน์ได้", subHub: "ทุกสถานที่ในหน้านี้มี<b>ไกด์เสียงฟรี</b>ในแอป Lokali — ในภาษาของคุณ ใช้งานออฟไลน์ได้",
    offline: "ออฟไลน์", more: "เพิ่มเติม", scan: "สแกนด้วยโทรศัพท์ Android", cam: "เปิดกล้องเพื่อดาวน์โหลด Lokali จาก Google Play",
    pts: "50+ ภาษา|ใช้งานออฟไลน์ได้|ไม่มีโฆษณา", web: "ฟังในเบราว์เซอร์", close: "ปิด", label: "ดาวน์โหลดแอป Lokali" },
  tr: { tag: "Ücretsiz sesli rehber", title: "{place} sadece bir başlangıç.", titleHub: "{place} — kendi dilinizde ücretsiz sesli rehberler.", near: "Yakında: {near}.", city: "{city}: uygulamada daha fazla ücretsiz sesli rehber.",
    sub: "Lokali'nin <b>ücretsiz sesli rehberiyle</b> hikâyenin tamamını dinleyin — kendi dilinizde, çevrimdışı.", subHub: "Bu sayfadaki her yerin Lokali uygulamasında <b>ücretsiz sesli rehberi</b> var — kendi dilinizde, çevrimdışı.",
    offline: "çevrimdışı", more: "Daha fazla", scan: "Android telefonunuzla tarayın", cam: "Lokali'yi Google Play'den indirmek için kameranızı açın.",
    pts: "50+ dil|Çevrimdışı çalışır|Reklamsız", web: "Tarayıcıda dinleyin", close: "Kapat", label: "Lokali uygulamasını indirin" },
  uk: { tag: "Безкоштовний аудіогід", title: "{place} — лише початок.", titleHub: "{place} — безкоштовні аудіогіди вашою мовою.", near: "Поруч: {near}.", city: "{city}: ще більше безкоштовних аудіогідів у застосунку.",
    sub: "Послухайте всю історію з <b>безкоштовним аудіогідом</b> Lokali — вашою мовою, офлайн.", subHub: "Кожне місце на цій сторінці має <b>безкоштовний аудіогід</b> у застосунку Lokali — вашою мовою, офлайн.",
    offline: "офлайн", more: "Більше", scan: "Відскануйте телефоном на Android", cam: "Відкрийте камеру, щоб завантажити Lokali з Google Play.",
    pts: "50+ мов|Працює офлайн|Без реклами", web: "Слухати в браузері", close: "Закрити", label: "Завантажити застосунок Lokali" },
  ur: { tag: "مفت آڈیو گائیڈ", title: "{place} تو بس آغاز ہے۔", titleHub: "{place} — آپ کی زبان میں مفت آڈیو گائیڈز۔", near: "قریب: {near}۔", city: "{city}: ایپ میں مزید مفت آڈیو گائیڈز۔",
    sub: "Lokali کی <b>مفت آڈیو گائیڈ</b> کے ساتھ پوری کہانی سنیں — آپ کی زبان میں، آف لائن۔", subHub: "اس صفحے کی ہر جگہ کے لیے Lokali ایپ میں <b>مفت آڈیو گائیڈ</b> موجود ہے — آپ کی زبان میں، آف لائن۔",
    offline: "آف لائن", more: "مزید", scan: "اپنے Android فون سے اسکین کریں", cam: "Google Play سے Lokali حاصل کرنے کے لیے کیمرا کھولیں۔",
    pts: "50+ زبانیں|آف لائن چلتی ہے|کوئی اشتہار نہیں", web: "براؤزر میں سنیں", close: "بند کریں", label: "Lokali ایپ حاصل کریں" },
  vi: { tag: "Hướng dẫn âm thanh miễn phí", title: "{place} mới chỉ là khởi đầu.", titleHub: "{place} — hướng dẫn âm thanh miễn phí bằng ngôn ngữ của bạn.", near: "Gần đây: {near}.", city: "{city}: thêm nhiều hướng dẫn âm thanh miễn phí trong ứng dụng.",
    sub: "Nghe toàn bộ câu chuyện với <b>hướng dẫn âm thanh miễn phí</b> của Lokali — bằng ngôn ngữ của bạn, ngoại tuyến.", subHub: "Mọi địa điểm trên trang này đều có <b>hướng dẫn âm thanh miễn phí</b> trong ứng dụng Lokali — bằng ngôn ngữ của bạn, ngoại tuyến.",
    offline: "ngoại tuyến", more: "Thêm", scan: "Quét bằng điện thoại Android", cam: "Mở camera để tải Lokali trên Google Play.",
    pts: "50+ ngôn ngữ|Dùng ngoại tuyến|Không quảng cáo", web: "Nghe trên trình duyệt", close: "Đóng", label: "Tải ứng dụng Lokali" },
  "zh-cn": { tag: "免费语音导览", title: "{place}，只是开始。", titleHub: "{place}——用你的语言收听免费语音导览", near: "附近：{near}。", city: "{city}：应用里还有更多免费语音导览。",
    sub: "用 Lokali 的<b>免费语音导览</b>听完整故事——支持你的语言，可离线使用。", subHub: "本页每个地点在 Lokali 应用中都有<b>免费语音导览</b>——支持你的语言，可离线使用。",
    offline: "离线", more: "更多", scan: "用安卓手机扫码", cam: "打开相机，在 Google Play 获取 Lokali。",
    pts: "50+ 种语言|可离线使用|无广告", web: "在浏览器中收听", close: "关闭", label: "获取 Lokali 应用" },
  "zh-tw": { tag: "免費語音導覽", title: "{place}，只是開始。", titleHub: "{place}——用你的語言收聽免費語音導覽", near: "附近：{near}。", city: "{city}：App 裡還有更多免費語音導覽。",
    sub: "用 Lokali 的<b>免費語音導覽</b>聽完整故事——支援你的語言，可離線使用。", subHub: "本頁每個地點在 Lokali App 中都有<b>免費語音導覽</b>——支援你的語言，可離線使用。",
    offline: "離線", more: "更多", scan: "用 Android 手機掃描", cam: "開啟相機，在 Google Play 取得 Lokali。",
    pts: "50+ 種語言|可離線使用|無廣告", web: "在瀏覽器中收聽", close: "關閉", label: "取得 Lokali App" }
};
LK_SHEET_TEXT.pt = LK_SHEET_TEXT["pt-br"];
LK_SHEET_TEXT.zh = LK_SHEET_TEXT["zh-cn"];

/* ───────────────────────── nothing below needs editing ───────────────────────── */
(function () {
  var S = LK_SHEET_SETTINGS, KEY = "lk_sheet_closed_at", A = "/explore/assets/";
  var SB = "https://dwyajguhgyjbgkpzjaln.supabase.co/rest/v1/usage_events";
  var PK = "sb_publishable_9e0MpAV3FKmVGhMLw8u2ig_FL5ZqzHd";
  var demo = /[?&]lksheet=1/.test(location.search);

  if (!S.enabled || window.Capacitor) return;
  try { var t = +localStorage.getItem(KEY); if (!demo && t && Date.now() - t < S.hideForDays * 864e5) return; } catch (e) {}

  // /explore/<lang>/<city>/<slug>.html = attraction, /explore/<lang>/<city>.html = city hub,
  // /explore/<lang>/country/<x>.html = country hub. Anything else (index, assets) gets no card.
  var parts = location.pathname.replace(/\/index\.html$/, ".html").replace(/\/$/, ".html").split("/").filter(Boolean);
  if (parts[0] !== "explore" || parts.length < 3 || parts.length > 4) return;
  var lang = parts[1].toLowerCase();
  var kind = parts.length === 4 ? (parts[2] === "country" ? "country" : "attraction") : "city";
  if (!S.showOn[kind]) return;
  var hub = kind !== "attraction";
  var slug = parts[parts.length - 1].replace(/\.html$/, "");
  var city = hub ? slug : parts[2];

  var h1 = document.querySelector(".hero h1"); if (!h1) return;
  var here = h1.textContent.trim();
  var T = LK_SHEET_TEXT[lang] || LK_SHEET_TEXT[lang.split("-")[0]] || LK_SHEET_TEXT.en;
  function tx(k, v) {
    var s = T[k] != null ? T[k] : LK_SHEET_TEXT.en[k];
    return s.replace(/\{(\w+)\}/g, function (_, n) { return v && v[n] != null ? v[n] : ""; });
  }
  var rtl = document.documentElement.dir === "rtl" || /^(ar|he|fa|ur)$/.test(lang);
  var crumbs = document.querySelectorAll(".crumbs a");
  var cityName = crumbs.length ? crumbs[crumbs.length - 1].textContent.trim() : "";
  var desk = window.matchMedia("(min-width: 900px)").matches;

  function km(s) { var m = /([\d.]+)\s*km/.exec(s || ""); return m ? parseFloat(m[1]) : 99; }
  var near = hub ? [] : [].slice.call(document.querySelectorAll(".rail .pcard")).map(function (a) {
    var b = a.querySelector("b"), sm = a.querySelector("small");
    return { name: b ? b.textContent.trim() : "", km: km(sm && sm.textContent) };
  }).filter(function (n) { return n.name && n.name !== here && n.km <= S.nearbyMaxKm; }).sort(function (a, b) { return a.km - b.km; })
    .filter(function (n, i, all) { for (var j = 0; j < i; j++) if (all[j].name.toLowerCase() === n.name.toLowerCase()) return false; return true; })
    .slice(0, S.nearbyCount || 1);
  // city as the page writes it: JSON-LD addressLocality, else the last breadcrumb link
  var cityShown = "";
  [].slice.call(document.querySelectorAll('script[type="application/ld+json"]')).some(function (sc) {
    var m = /"addressLocality"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(sc.textContent);
    if (m) { try { cityShown = JSON.parse('"' + m[1] + '"'); } catch (e) { cityShown = m[1]; } }
    return !!cityShown;
  });
  cityShown = (cityShown || cityName).trim();
  if (cityShown === here) cityShown = "";

  function dist(k) { return k < 1 ? Math.round(k * 1000 / 50) * 50 + " m" : k.toFixed(1) + " km"; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function anon() { try { var a = localStorage.getItem("lokali_anon_id"); if (!a) { a = crypto.randomUUID(); localStorage.setItem("lokali_anon_id", a); } return a; } catch (e) { return null; } }
  function track(ev, extra) {
    if (demo) return;
    try {
      var p = { page: slug, city: city, lang: lang, kind: kind, layout: desk ? "desktop" : "mobile", nearby: near.length, v: 5 };
      for (var k in extra || {}) p[k] = extra[k];
      fetch(SB, { method: "POST", keepalive: true, headers: { apikey: PK, Authorization: "Bearer " + PK, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ event: ev, anon_id: anon(), props: p }) });
    } catch (e) {}
  }

  var playUrl = S.playUrl + "&utm_source=seo&utm_medium=" + (desk ? "qr" : "sheet") + "&utm_campaign=" + lang + "&utm_content=" + encodeURIComponent(slug);
  var webUrl = !hub && S.webLinkLangs[lang] ? "https://lokali.travel/attraction/" + encodeURIComponent(here.toLowerCase().replace(/\s+/g, "-")) +
    "?name=" + encodeURIComponent(here) + (cityName ? "&city=" + encodeURIComponent(cityName) : "") +
    "&utm_source=seo&utm_medium=sheet&utm_content=" + encodeURIComponent(slug) : "";
  var shot = A + "app/" + (S.appScreens[city] ? city : "cities") + ".webp";

  var P = esc(here);
  var title = tx(hub ? "titleHub" : "title", { place: P });
  var nearList = near.map(function (n) { return esc(n.name) + "&nbsp;" + dist(n.km); }).join(" &middot; ");
  var nearTxt = near.length ? tx("near", { near: nearList }) + " "
    : (!hub && S.cityLine && cityShown ? tx("city", { city: esc(cityShown) }) + " " : "");
  var sub = hub ? tx("subHub") : nearTxt + tx("sub");
  var line = "<b>" + tx("tag") + "</b> &middot; " + (near.length ? esc(near[0].name) + " " + dist(near[0].km) : tx("offline"));
  var pts = tx("pts").split("|").join("<br>");
  var badge = '<a class="lks-badge" href="' + playUrl + '" rel="nofollow" target="_blank"><img src="' + A +
    'google-play-badge.png" alt="Get it on Google Play" width="200" height="77"></a>';

  function full() {
    return '<button class="lks-x" aria-label="' + tx("close") + '">&times;</button><span class="lks-tag">&#9654; ' + tx("tag") + '</span><b class="lks-h">' + title +
      '</b><p class="lks-p">' + sub + '</p><div class="lks-body"><div class="lks-shot"><img src="' + shot + '" alt="Lokali" width="320" height="622"></div><div class="lks-side">' +
      (desk
        ? '<div class="lks-qr"><img src="' + A + 'lk-qr.svg" alt="QR — Lokali, Google Play" width="196" height="196"></div><b class="lks-scan">' + tx("scan") + '</b><p class="lks-cam">' + tx("cam") + '</p>' + badge
        : '<p class="lks-pts">' + pts + '</p>' + badge + (webUrl ? '<a class="lks-web" href="' + webUrl + '">' + tx("web") + '</a>' : "")) +
      "</div></div>";
  }
  function compact() {
    return '<button class="lks-x" aria-label="' + tx("close") + '">&times;</button><div class="lks-row" role="button" tabindex="0" aria-label="' + tx("more") + '">' +
      '<img class="lks-thumb" src="' + shot + '" alt="" width="44" height="86"><div class="lks-mid">' +
      '<b class="lks-h">' + title + '</b><span class="lks-line">' + line + ' <u class="lks-more">' + tx("more") + '</u></span></div></div>' +
      '<a class="lks-go" href="' + playUrl + '" rel="nofollow" target="_blank"><img src="' + A + 'google-play-badge.png" alt="Get it on Google Play" width="140" height="54"></a>';
  }

  var css = ".lks{position:fixed;left:8px;right:8px;bottom:8px;z-index:80;background:#f6efe2;color:#1d1712;border-radius:16px;padding:12px;box-shadow:0 14px 50px rgba(0,0,0,.55);transform:translateY(130%);transition:transform .32s ease;max-width:520px;margin:0 auto;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;text-align:left}" +
    ".lks.on{transform:none}.lks-x{position:absolute;right:6px;top:4px;background:none;border:0;color:#1d1712;font-size:26px;line-height:1;cursor:pointer;padding:6px 10px}" +
    ".lks-tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#7a4a0c;background:#f5c97b;border-radius:99px;padding:3px 9px;margin-bottom:6px}" +
    ".lks-h{display:block;font-family:inherit;font-size:16px;font-weight:700;line-height:1.3;padding-right:30px;color:#1d1712}.lks-p{font-size:13px;color:#4a3f35;line-height:1.45;margin:5px 0 0}.lks-p b{color:#1d1712;font-weight:700}" +
    ".lks-row{display:flex;gap:10px;align-items:center;cursor:pointer;padding-right:26px}.lks-thumb{flex:none;width:44px;height:86px;object-fit:cover;object-position:top;border-radius:8px;box-shadow:0 0 0 2px #1d1712;background:#110c08}" +
    ".lks-mid{min-width:0;flex:1}.lks-mid .lks-h{font-size:15px;padding-right:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".lks-line{display:block;font-size:12.5px;color:#4a3f35;margin-top:3px;line-height:1.4}.lks-line b{color:#7a4a0c}.lks-more{color:#7a5418;white-space:nowrap}" +
    ".lks-go{display:block;margin:8px auto 0;width:140px}.lks-go img{display:block;width:140px;height:auto}" +
    ".lks-body{display:flex;gap:14px;margin-top:10px;align-items:stretch}.lks-shot{flex:none;width:96px;border-radius:14px;overflow:hidden;background:#110c08;box-shadow:0 0 0 3px #1d1712}" +
    ".lks-shot img{display:block;width:100%;height:auto}.lks-side{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:10px}" +
    ".lks-pts{font-size:12.5px;font-weight:600;color:#1d1712;line-height:1.6;margin:0}.lks-badge img{display:block;width:150px;height:auto}" +
    ".lks-web{font-size:13px;color:#7a5418;font-weight:600;text-decoration:underline}" +
    ".lks.lks-desk{left:auto;right:24px;bottom:24px;width:560px;max-width:none;padding:20px 20px 18px;border-radius:18px}.lks-desk .lks-h{font-size:19px}.lks-desk .lks-p{font-size:14px}" +
    ".lks-desk .lks-shot{width:190px}.lks-qr{background:#fff;padding:10px;border-radius:6px}.lks-qr img{display:block;width:196px;height:196px}" +
    ".lks-scan{font-family:inherit;font-size:15px;font-weight:700;line-height:1.3;color:#1d1712}.lks-cam{font-size:13px;color:#4a3f35;line-height:1.4;margin:-4px 0 0}.lks-desk .lks-badge img{width:200px}" +
    ".lks[dir=rtl]{text-align:right}.lks[dir=rtl] .lks-x{right:auto;left:6px}.lks[dir=rtl] .lks-h{padding-right:0;padding-left:30px}.lks[dir=rtl] .lks-row{padding-right:0;padding-left:26px}" +
    ".lks.lks-desk[dir=rtl]{right:auto;left:24px}";

  var el, shown = false;
  function show() {
    if (shown) return; shown = true;
    if (!document.getElementById("lks-css")) { var st = document.createElement("style"); st.id = "lks-css"; st.textContent = css; document.head.appendChild(st); }
    el = document.createElement("aside");
    el.className = "lks" + (desk ? " lks-desk" : " lks-mini");
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", tx("label")); el.setAttribute("lang", lang);
    if (rtl) el.setAttribute("dir", "rtl");
    el.innerHTML = desk ? full() : compact();
    el.addEventListener("click", onClick);
    document.body.appendChild(el);
    var gpb = document.getElementById("gpb"); if (gpb) gpb.classList.remove("show");
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("on"); }); });
    track("sheet_shown");
  }
  function expand() { el.classList.remove("lks-mini"); el.innerHTML = full(); track("sheet_expand"); }
  function close() {
    el.classList.remove("on"); setTimeout(function () { el.remove(); }, 350);
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    track("sheet_close");
  }
  function onClick(e) {
    if (e.target.closest(".lks-x")) { close(); return; }
    var a = e.target.closest("a");
    if (a) { track("sheet_click", { target: a.className.replace("lks-", ""), href: a.href }); return; }
    if (e.target.closest(".lks-row")) expand();
  }

  if (demo) { setTimeout(show, 600); return; }
  var t0 = Date.now();
  setTimeout(show, S.showAfterSeconds * 1000);
  window.addEventListener("scroll", function () {
    if (Date.now() - t0 < S.engagedAfterSeconds * 1000) return;
    var h = document.documentElement;
    if ((h.scrollTop + innerHeight) / h.scrollHeight > S.engagedScroll) show();
  }, { passive: true });
})();
