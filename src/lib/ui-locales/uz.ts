import type { UiKey } from "@/lib/i18n";

/**
 * Pre-translated UI strings — Uzbek (Latin script).
 *
 * Hand-written, not machine-generated (Beka 2026-10-15).
 *
 * Script choice: Latin, matching `uz-UZ` in LANGUAGES and Azure's
 * `uz-UZ-MadinaNeural` / `uz-UZ-SardorNeural`, which are Latin-script
 * voices. Uzbekistan's official alphabet is Latin and that is what
 * phones ship with; Cyrillic Uzbek would mismatch both the voice and
 * the keyboard most users have.
 *
 * Conventions: the `-ni/-ga/-da` case suffixes are kept on borrowed
 * nouns as Uzbek writes them. Brand names (Lokali, Google, Facebook,
 * Microsoft, Apple, UNESCO) and placeholders ({n}, {city}, …) stay
 * exactly as they are.
 */
export const UZ: Partial<Record<UiKey, string>> = {
  // Nav / chrome
  "nav.home": "Bosh sahifa",
  "nav.explore": "Kashf etish",
  "nav.map": "Xarita",
  "nav.saved": "Saqlangan",
  "nav.signOut": "Chiqish",
  "nav.signIn": "Kirish",
  "nav.settings": "Sozlamalar",
  "nav.notifications": "Bildirishnomalar",
  "nav.language": "Til",
  "nav.back": "Orqaga",
  "nav.profile": "Profil",
  "nav.trips": "Sayohatlar",
  // Trips
  "trips.badge": "Sayohat rejalashtiruvchi",
  "trips.title1": "Sizning",
  "trips.title2": "sayohatlaringiz",
  "trips.sub":
    "Saqlangan joylarni sayohatlarga guruhlang — kunlarni rejalang, yo'lda tinglang.",
  "trips.new": "Yangi sayohat",
  "trips.cancel": "Bekor qilish",
  "trips.namePh": "Sayohat nomi — masalan, Sentyabrda Rim",
  "trips.start": "Boshlanishi",
  "trips.end": "Tugashi",
  "trips.create": "Sayohat yaratish",
  "trips.creating": "Yaratilmoqda…",
  "trips.empty": "Hali sayohat yo'q",
  "trips.emptyDesc":
    "Birinchi sayohatingizni yarating, so'ng qidiruvdan yoki istalgan diqqatga sazovor joy sahifasidan joy qo'shing.",
  "trips.places.one": "1 ta joy",
  "trips.places.many": "{n} ta joy",
  "trips.rename": "Nomini o'zgartirish",
  "trips.renamePh": "Yangi nom",
  "trips.delete": "Sayohatni o'chirish",
  "trips.deleteConfirm":
    "Bu sayohat o'chirilsinmi? Joylarning o'zi Saqlangan kutubxonangizda qoladi.",
  "trips.signInTitle": "Sayohat rejalash uchun kiring",
  "trips.signInDesc":
    "Sayohatlar hisobingiz bilan sinxronlanadi, shuning uchun rejalaringiz har bir qurilmada siz bilan.",
  "trips.loadFailed":
    "Sayohatlaringiz yuklanmadi. Ulanishni tekshiring va qayta urinib ko'ring.",
  "trips.retry": "Qayta urinish",
  "trips.emptyTrip": "Bu sayohat bo'sh",
  "trips.emptyTripDesc":
    "Qidiruvdan joy toping va saqlashda shu sayohatga qo'shing.",
  "trips.findPlaces": "Joy topish",
  "trips.addToTrip": "Sayohatga qo'shilsinmi?",
  "trips.addedTo": "{name} ga qo'shildi",
  "trips.addFailed": "Sayohatga qo'shilmadi. Qayta urinib ko'ring.",
  "trips.skip": "Hozir emas",
  "trips.listenEstimate": "~{n} daqiqa audio",
  "trips.removeItem": "Sayohatdan olib tashlash",
  "trips.day": "{n}-kun",
  "trips.anytime": "Istalgan vaqt",
  "trips.addDay": "Kun qo'shish",
  "trips.moveToDay": "Kunga ko'chirish",
  "trips.dayEmpty": "Bu kunga hali hech narsa rejalashtirilmagan.",
  "trips.reorder": "Tartibni o'zgartirish",
  "trips.viewDays": "Kunlar",
  "trips.viewCities": "Shaharlar",
  "trips.share": "Sayohatni ulashish",
  "trips.stopShare": "Ulashishni to'xtatish",
  "trips.linkCopied": "Havola nusxalandi",
  "trips.shareHint": "Bu havolaga ega har kim sayohatni ko'ra oladi.",
  "trips.sharedTrip": "Ulashilgan sayohat",
  "trips.openInLokali": "Lokali bilan o'z sayohatingizni rejalang",
  "trips.shareGone": "Bu sayohat havolasi endi faol emas",
  "trips.shareGoneDesc": "Egasi ulashishni to'xtatdi yoki havola noto'g'ri.",
  // Map trip filter
  "map.allSaved": "Hammasi",
  // Museum highlights
  "highlights.searchPh": "Shu muzeydan qidirish…",
  "highlights.count": "{n} ta asar",
  "highlights.found": "{n} ta topildi",
  "highlights.noMatch":
    "Hech narsa mos kelmadi. Rassom, davr yoki sarlavhaning bir qismini kiriting.",
  "highlights.sortCurated": "Eng yaxshi",
  "highlights.sortAz": "A-Z",
  "highlights.sortEra": "Davr",
  "highlights.tabGuide": "Haqida",
  "highlights.tabWorks": "Asarlar",
  // Google Play banner
  "playBanner.cta": "Ilovani olish",
  "playBanner.dismiss": "Yopish",
  "profile.title": "Profil",
  "profile.account": "Hisob",
  "profile.openSettings": "Sozlamalar",
  "profile.signedInAs": "Kirgan foydalanuvchi",
  "profile.guest": "Mehmon",

  // Home
  "home.whereNext": "Keyingi manzil?",
  "home.offline": "Oflayn",
  "home.searchPlaceholder": "Davlat, shahar yoki diqqatga sazovor joy…",
  "home.search": "Qidirish",
  "home.browse": "Ko'rib chiqish",
  "home.collections.title": "Tanlangan to'plamlar",
  "home.collections.sub": "Sayohat uslubingizga mos mavzular",
  "home.timeMachine.title": "Vaqt mashinasi",
  "home.timeMachine.sub":
    "Eng yaxshi 10 ta jonli lahza — tarix ichiga qadam qo'ying",
  "home.museums.title": "Eng yaxshi muzeylar",
  "home.museums.sub": "Sivilizatsiyani belgilagan muzey to'plamlari",
  "museums.title": "Eng yaxshi muzeylar",
  "museums.subtitle": "Sivilizatsiyani belgilagan muzey to'plamlari",
  "museums.openGuide": "Qo'llanmani ochish",
  "museums.intro":
    "Inson madaniyatining tanlangan durdonalari — Luvrdan Topqapigacha va ularning orasidagi hamma narsa.",
  "highlights.title": "Albatta ko'ring",
  "highlights.subtitle": "Butun muzeyni kesib o'tishga arziydigan asarlar",
  "highlights.noLocation": "Joylashuv aniqlanmagan",
  "highlights.empty": "Bu muzey uchun hali asosiy asarlar yo'q.",
  "unesco.title": "YUNESKO Jahon merosi",
  "unesco.short": "YUNESKO",
  "home.featured.title": "Tanlangan shaharlar",
  "home.featured.sub": "Kinematik sayrlar, mahalliylar hikoyasi bilan",
  "home.seeAll": "Hammasi",
  "home.featuredBadge": "Tanlangan",
  "ai.generated": "AI yaratgan kontent",
  "report.cta": "Noto'g'ri ma'lumot haqida xabar berish",
  "report.done": "Rahmat — xabar yuborildi",
  "report.failed": "Xabar yuborilmadi",
  "home.openCity": "{city} ni ochish",
  "home.tours.one": "{n} ta sayohat",
  "home.tours.many": "{n} ta sayohat",

  // Hero rotation
  "hero.tbilisi.country": "Gruziya",
  "hero.tbilisi.city": "Tbilisi",
  "hero.tbilisi.tagline2": "Eski Tbilisi",
  "hero.tbilisi.blurb":
    "Oltingugurtli hammomlar, o'ymakor yog'och balkonlar va Sioni soborining qo'ng'iroqlari. Tbilisining eng qadimiy ko'chalari bo'ylab kinematik sayr.",
  "hero.rome.country": "Italiya",
  "hero.rome.city": "Rim",
  "hero.rome.tagline2": "Abadiy Rim",
  "hero.rome.blurb":
    "Rim forumi xarobalari, barokko favvoralari va Trastevere'dagi kechki ovqat dasturxonlari. Tarixini har kuni kiyib yuradigan shahar.",
  "hero.istanbul.country": "Turkiya",
  "hero.istanbul.city": "Istanbul",
  "hero.istanbul.tagline2": "ikki qit'a",
  "hero.istanbul.blurb":
    "Ayasofiya gumbazlari, quyosh botishidagi azon va sizni Yevropadan Osiyoga olib o'tadigan qisqa parom.",
  // City detail page
  "city.about": "Shahar haqida",
  "city.practical": "Amaliy ma'lumot",
  "city.season": "Eng yaxshi fasl",
  "city.language": "Til",
  "city.currency": "Valyuta",
  "city.timezone": "Vaqt mintaqasi",
  "city.plug": "Rozetka turi",
  "city.toExperience": "Ko'rish kerak",
  "city.topPlaces": "Eng yaxshi joylar",
  "city.loadingAttractions": "Diqqatga sazovor joylar yuklanmoqda…",
  "city.noAttractions": "Bu shahar uchun hali joylar topilmadi.",
  "city.featuredMuseums": "Tanlangan muzeylar",
  "city.museumsHead": "To'plamlar ichida",
  "city.showMore": "Ko'proq ko'rsatish",
  "city.unescoCountOne": "{n} ta obyekt",
  "city.unescoCountMany": "{n} ta obyekt",
  "city.localsLove": "Mahalliylar sevadi",
  "city.localsLoveHead": "Do'stimizga nima aytardik",
  "city.etiquette": "Sayohat eslatmalari",
  "city.etiquetteHead": "Bilish foydali",
  "city.notCovered": "Hali qo'shilmagan",
  "city.notCoveredDesc":
    "Shahar qo'llanmalarini birma-bir qo'lda tayyorlayapmiz. Qamrab olgan shaharlarimizni ko'rish uchun orqaga qayting.",

  "home.everyLang.title": "{count} tilda mavjud",
  "home.go": "O'tish",
  "home.everyLang.cta": "Tilingizni tanlang",
  "home.everyLang.sub":
    "Ko'chalar, diqqatga sazovor joylar, muzeylar va atrofingizdagi yashirin hikoyalar uchun AI audio qo'llanma.",

  // Destination screen
  "dest.currentlyIn": "Hozir shu yerda",
  "dest.featuredTour": "Tanlangan sayohat",
  "dest.beginJourney": "Sayohatni boshlash",
  "dest.firstChapter": "Birinchi bobni tinglash",
  "dest.freeMin": "Bepul · 3 daqiqa",
  "dest.searchIn": "{city} dan qidirish…",
  "dest.inside": "{city} ichida",
  "dest.insideSub": "Tanlangan to'xtash joylari, mahalliylar hikoyasi bilan",
  "dest.otherCities": "Boshqa shaharlar",
  "dest.cat.all": "Hammasi",
  "dest.cat.historic": "Tarixiy",
  "dest.cat.sacred": "Muqaddas",
  "dest.cat.culinary": "Taomlar",
  "dest.cat.hidden": "Yashirin",
  "dest.cat.fortress": "Qal'a",
  "dest.nowPlaying": "2-bob · Oltingugurt va tosh",

  // Near-you / attraction card
  "card.audioGuide": "Audio qo'llanma",
  "card.expand": "Yoyish",
  "card.collapse": "Yig'ish",
  "card.offline": "Oflayn",
  "card.stops": "{n} ta to'xtash",
  "card.save": "Saqlash",
  "card.saved": "Saqlandi",
  "card.download": "Yuklab olish",
  "card.saving": "Saqlanmoqda",
  "card.details": "Tafsilotlar",
  "card.play": "Ovozli qo'llanmani eshitish",
  "card.fallbackDesc":
    "{title} bo'ylab tanlangan sayr. To'liq ovozli qo'llanma va har bir to'xtash hikoyasi uchun “Open details” ni bosing.",

  // Attraction page
  "attr.aboutThis": "Bu joy haqida",
  "attr.theStops": "To'xtash joylari",
  "attr.chapters": "{n} ta bob",
  "attr.beginJourney": "Sayohatni boshlash",
  "attr.listenNarrated": "Ovozli qo'llanmani tinglash",
  "attr.tapBegin":
    "Bu joyning hikoyasini eshitish uchun “Sayohatni boshlash” ni bosing.",
  "attr.stopsAppear":
    "Ovozli qo'llanma tayyor bo'lgach, to'xtash joylari paydo bo'ladi.",

  // Results filters
  "filters.interests": "Qiziqishlar",
  "filters.clear": "Tozalash",
  "filters.int.editors": "Tahririyat tanlovi",
  "filters.int.history": "Tarix",
  "filters.int.photography": "Fotosurat",
  "filters.int.authentic": "Asl",
  "filters.int.family": "Oila",
  "filters.int.romantic": "Romantik",

  // Toasts
  "toast.removedFromSaved": "Saqlanganlardan olib tashlandi",
  "toast.saved": "Saqlandi",
  "toast.savedDesc":
    "Qo'llanmani oflayn saqlash uchun Yuklab olishni bosing.",
  "toast.alreadyCached": "Allaqachon saqlangan",
  "toast.alreadyCachedDesc": "Bu qo'llanma oflayn ishlaydi.",
  "toast.youreOffline": "Siz oflaynsiz",
  "toast.youreOfflineDesc":
    "Qo'llanmani yuklab olish uchun bir marta ulaning.",
  "toast.downloaded": "Oflayn uchun yuklab olindi",
  "toast.removedFromOffline": "Oflayndan olib tashlandi",
  "toast.audioReadyHint": "ovoz oflayn tayyor",
  "toast.noGuide": "Qo'llanma qaytarilmadi",
  "toast.downloadFailed": "Yuklab olinmadi",
  "toast.tryAgain": "Keyinroq urinib ko'ring.",
  "toast.langUpdated": "Til yangilandi",
  "toast.langUpdatedDesc": "Endi barcha joylar {lang} tilida hikoya qiladi.",
  "toast.langFailed": "Til o'zgartirilmadi",
  "toast.langFailedDesc": "Bir ozdan so'ng urinib ko'ring.",
  "toast.voiceUpdated": "Ovoz yangilandi",
  "toast.voiceUpdatedDesc": "Endi {voice} hikoya qiladi.",
  "toast.profileSaved": "Profil saqlandi",
  "toast.couldNotSave": "Saqlanmadi",
  "err.notFound": "Sahifa topilmadi",
  "err.notFoundDesc":
    "Siz qidirayotgan sahifa mavjud emas yoki ko'chirilgan.",
  "err.goHome": "Bosh sahifaga",
  "toast.noVoiceAvailable": "Ovoz mavjud emas",
  "toast.libCleared": "Oflayn kutubxona tozalandi",
  "toast.speechUnsupported": "Bu qurilmada nutq qo'llab-quvvatlanmaydi",
  "toast.couldNotLoadGuide": "Qo'llanma yuklanmadi",
  "toast.tryAgainPlease": "Iltimos, qayta urinib ko'ring.",
  "toast.audioUnavailableTitle": "Hozir audio mavjud emas",
  "toast.audioQuotaHint":
    "Bugungi hikoya qilish chegarasiga yetdik. Iltimos, keyinroq urinib ko'ring.",
  "toast.audioOurSideHint":
    "Bu bizning tomonimizdagi muammo — allaqachon ko'rib chiqyapmiz. Yozma qo'llanma ishlayapti.",
  "toast.voiceUnavailableTitle": "Bu til uchun hali ovoz yo'q",
  "toast.voiceUnavailableHint":
    "Ingliz tiliga yoki boshqa qo'llab-quvvatlanadigan tilga o'tib ko'ring.",
  "toast.guideOfflineDesc":
    "Bu qo'llanma hali yuklab olinmagan. Saqlash uchun bir marta ulaning.",
  "toast.couldNotLoadAttractions": "Joylar yuklanmadi",
  "toast.aiBusy": "AI vaqtincha band",
  "toast.aiBusyDesc": "Bir ozdan so'ng urinib ko'ring.",
  "toast.allSet": "Hammasi tayyor",
  "toast.allSetDesc": "Voices'ga xush kelibsiz.",
  "toast.setupFailed": "Sozlash bajarilmadi",
  "toast.signedOut": "Chiqildi",

  // Language picker
  "lang.title": "Til",
  "lang.audioGuide": "Audio qo'llanma",
  "lang.speakMy": "Mening tilimda",
  "lang.language": "gapiring",
  "lang.current": "Joriy",
  "lang.searchPlaceholder": "{count} ta tildan qidirish…",
  "lang.clearSearch": "Qidiruvni tozalash",
  "lang.tapHint":
    "Darhol almashtirish uchun tilni bosing. Hikoyachi ovozi shu til uchun birinchi mos keladiganiga qaytadi.",
  "lang.noMatches": "Mos til topilmadi",

  // Saved page
  "saved.title": "Saqlangan",
  "saved.offlineLib": "Oflayn kutubxona",
  "saved.your": "Sizning",
  "saved.placesOne": "joy",
  "saved.placesMany": "joy",
  "saved.storedHelp":
    "Shu qurilmada saqlangan — hikoya ulanishsiz ham ijro etiladi.",
  "saved.guideCached": "Qo'llanma saqlangan",
  "saved.removeAria": "{name} ni olib tashlash",
  "saved.empty": "Hech narsa saqlanmagan",
  "saved.emptyYet": "hali",
  "saved.emptyHelp":
    "Oflayn saqlash uchun istalgan joydagi xatcho'pni bosing.",
  "saved.exploreCta": "Joylarni kashf etish",
  "saved.clearConfirm":
    "Barcha saqlangan joylar tozalansinmi? Saqlangan audio o'chmaydi.",
  "saved.clear": "Tozalash",

  // Map page
  "map.title": "Xaritada",
  "map.savedOne": "{n} ta saqlangan joy",
  "map.savedMany": "{n} ta saqlangan joy",
  "map.toggleStyle": "Xarita uslubini almashtirish",
  "map.centerLoc": "Joylashuvimga markazlash",
  "map.empty": "Belgilar yo'q",
  "map.emptyYet": "hali",
  "map.emptyHelp":
    "Bosh sahifa yoki manzil sahifasidan joyni saqlang va u shu yerda xaritada paydo bo'ladi.",
  "map.findCta": "Joy topish",
  "map.loading": "Xarita yuklanmoqda…",
  "map.locAskTitle": "Sizni xaritada ko'rsataylikmi?",
  "map.locAskBody":
    "Lokali joylashuvingizdan faqat xaritani sizga markazlash va yaqin joylarni belgilash uchun foydalanadi. U hech qachon ulashilmaydi va qurilmangizdan chiqmaydi.",
  "map.locAskAllow": "Ruxsat berish",
  "map.locAskDismiss": "Hozir emas",
  "map.locDeniedTitle": "Joylashuv o'chirilgan",
  "map.locDeniedDesc":
    "Xaritani sizga markazlash uchun telefon sozlamalaridan yoqing.",
  "map.locTimeoutTitle": "Sizni topa olmadik",
  "map.locTimeoutDesc":
    "GPS juda uzoq davom etdi — tashqarida yoki deraza yonida urinib ko'ring.",
  "map.locFailedTitle": "Joylashuv mavjud emas",
  "map.locFailedDesc":
    "Joylashuvingizni o'qiy olmadik. Bir ozdan so'ng urinib ko'ring.",

  // Settings
  "set.title": "Sozlamalar",
  "set.subtitle": "Sayohatingizni sozlang",
  "set.configuration": "Konfiguratsiya",
  "set.tuneYour": "Sozlang",
  "set.journey": "sayohatingizni",
  "set.intro":
    "Til, ovoz, mavzu va oflayn xotira — Tbilisi sizga qanday pichirlashini belgilaydigan hamma narsa.",
  "set.account": "Hisob",
  "set.signedInAs": "Kirgan foydalanuvchi",
  "set.displayName": "Ko'rsatiladigan ism",
  "set.yourName": "Ismingiz",
  "set.save": "Saqlash",
  "set.audioGuide": "Audio qo'llanma",
  "set.language": "Til",
  "set.narratorVoice": "Hikoyachi ovozi",
  "set.browserDefault": "Brauzer standarti",
  "set.previewVoice": "Ovozni tinglash",
  "set.appearance": "Ko'rinish",
  "set.theme": "Mavzu",
  "set.themeDark": "Kinematik qorong'i",
  "set.themeLight": "Kunduzgi yorug'lik",
  "set.offlineMode": "Oflayn rejim",
  "set.youOnline": "Siz onlaynsiz",
  "set.youOffline": "Siz oflaynsiz",
  "set.onlineHelp":
    "Qo'llanmalarni hozir yuklab oling — signalsiz ham ishlayveradi.",
  "set.offlineHelp":
    "Saqlangan qo'llanmalar ishlayapti — qolganlari qayta ulanganingizda yuklanadi.",
  "set.savedSummaryOne": "{saved} saqlangan · {cached} qo'llanma yuklangan",
  "set.savedSummaryMany": "{saved} saqlangan · {cached} qo'llanma yuklangan",
  "set.cacheSize": "{flag} {native} · bu qurilmada ~{kb} KB",
  "set.downloadAllOne": "{n} ta qo'llanmani oflayn uchun yuklab olish",
  "set.downloadAllMany": "{n} ta qo'llanmani oflayn uchun yuklab olish",
  "set.downloading": "Yuklanmoqda… {done}/{total}",
  "set.downloadDesc":
    "Barcha saqlangan joylarni {lang} tilida xotiraga oladi",
  "set.downloadedOne": "{n} ta qo'llanma yuklab olindi",
  "set.downloadedMany": "{n} ta qo'llanma yuklab olindi",
  "set.downloadAvailable": "{lang} tilida oflayn mavjud",
  "set.downloadAvailableFailed":
    "{lang} tilida oflayn mavjud · {n} tasi bajarilmadi",
  "set.downloadFailed": "Hech bir qo'llanma yuklab olinmadi",
  "set.downloadFailedDesc":
    "Ulanishingizni tekshiring va qayta urinib ko'ring.",
  "set.clearLib": "Oflayn kutubxonani tozalash",
  "set.signOut": "Chiqish",
  "set.deleteAccount": "Hisobni o'chirish",
  "set.deleteAccountBlurb":
    "Hisobingizni va Lokali'dagi barcha ma'lumotlaringizni butunlay o'chiradi.",
  "set.deleteConfirmTitle": "Hisobingiz o'chirilsinmi?",
  "set.deleteConfirmBody":
    "Bu amalni qaytarib bo'lmaydi. Quyidagilar butunlay o'chiriladi:",
  "set.deleteConfirmBullet1": "Kirish ma'lumotlaringiz va profilingiz",
  "set.deleteConfirmBullet2":
    "Bu qurilmadagi va bulutdagi barcha saqlangan sayohatlar",
  "set.deleteConfirmBullet3":
    "Oflayn yuklab olingan barcha audio va matnlar",
  "set.deleteConfirmYes": "Hisobimni o'chirish",
  "set.deleteConfirmCancel": "Bekor qilish",
  "set.deletingAccount": "O'chirilmoqda…",
  "set.deleteFailedTitle": "Hisob o'chirilmadi",
  "set.deleteFailedDesc":
    "Nimadir noto'g'ri ketdi. Qayta urinib ko'ring yoki davom etsa qo'llab-quvvatlashga murojaat qiling.",
  "set.deleteFailedSession":
    "Sessiyangiz tugadi. Qayta kiring va yana bir marta urinib ko'ring.",
  "set.deleteSuccessTitle": "Hisob o'chirildi",
  "set.deleteSuccessDesc":
    "Hisobingiz va barcha ma'lumotlaringiz o'chirildi.",
  "set.appVersion": "Lokali · v1.0",
  "set.privacy": "Maxfiylik",
  "set.terms": "Shartlar",
  "set.searchLanguages": "Tillarni qidirish…",
  "set.noLanguagesMatch": "Mos til topilmadi",
  "set.noNativeVoice":
    "Bu til uchun ona ovozi topilmadi. Umumiy ovozdan foydalaniladi.",
  "set.noVoiceForLang":
    "Bu qurilmada {code} uchun ona ovozi topilmadi.",
  "set.installVoicesHelp":
    "Brauzer standartiga qaytamiz. Operatsion tizimingizning maxsus imkoniyatlar sozlamalaridan qo'shimcha ovozlar o'rnating.",
  "voice.onDevice": "Qurilmada",
  "voice.cloud": "Bulut",
  "voice.female": "Ayol",
  "voice.male": "Erkak",

  // Notifications
  "notif.title": "Bildirishnomalar",
  "notif.unread": "{n} ta o'qilmagan",
  "notif.allCaught": "Hammasi ko'rildi",
  "notif.empty": "Kiruvchi qutisi bo'sh",
  "notif.markAll": "Hammasini o'qilgan deb belgilash",
  "notif.clearAll": "Hammasini tozalash",
  "notif.dismiss": "Yopish",
  "notif.emptyTitle": "Bildirishnoma yo'q",
  "notif.emptyHelp":
    "Maslahatlar, sayohat yangiliklari va g'oyalar shu yerda paydo bo'ladi.",
  "notif.backHome": "Bosh sahifaga qaytish",
  "notif.now": "hozir",
  "notif.min": "d",
  "notif.hour": "s",
  "notif.day": "k",

  "results.searching": "Qidirilmoqda…",
  "loading.searching": "Ma'lumot qidirilmoqda…",
  "loading.checkingSources": "Eng so'nggi manbalar tekshirilmoqda…",
  "loading.selectingDetails": "Eng muhim tafsilotlar tanlanmoqda…",
  "loading.preparingRecommendations":
    "Siz uchun tavsiyalar tayyorlanmoqda…",
  "loading.almostReady": "Deyarli tayyor…",
  "results.countOne": "{n} ta natija —",
  "results.countMany": "{n} ta natija —",
  "results.placeholder": "Davlat, shahar yoki diqqatga sazovor joy…",
  "results.empty": "Hech narsa topilmadi",
  "results.emptyHelp":
    "“{query}” ga mos joy topa olmadik. Boshqa so'zni sinab ko'ring — joy, kayfiyat yoki davr.",
  "results.backHome": "Bosh sahifaga qaytish",
  "results.alreadyOffline": "Allaqachon oflayn",
  "results.prev": "Oldingi",
  "results.next": "Keyingi",
  "results.pageLabel": "{total} dan {n}-sahifa",
  "results.goToPage": "{n}-sahifaga o'tish",
  "results.pagination": "Sahifalash",

  // Destinations
  "dest.exploreTitle": "Kashf etish",
  "dest.chooseDest": "Manzilni tanlang",
  "dest.searchAny": "Istalgan shahar, davlat yoki diqqatga sazovor joy…",
  "dest.searchHint":
    "Lokali AI bilan dunyoning istalgan joyini kashf etish uchun Enter'ni bosing.",
  "dest.allCount": "Hammasi ({n})",
  "dest.countOne": "{n} ta manzil",
  "dest.countMany": "{n} ta manzil",
  "dest.notInList": "Hali tanlangan ro'yxatimizda yo'q",
  "dest.searchWithLokali": "{query} ni Lokali AI bilan qidirish",
  "dest.resetFilters": "Filtrlarni tiklash",
  "dest.backHome": "Bosh sahifaga qaytish",
  "dest.loadingTop": "Eng yaxshi joylar yuklanmoqda…",
  "dest.topPicks": "Eng yaxshi tanlovlar, mahalliylar hikoyasi bilan",
  "dest.insideWord": "Ichida",
  "dest.showingCurated": "Buning o'rniga tanlangan joylar ko'rsatilmoqda.",

  // Time Machine
  "tm.title": "Vaqt mashinasi",
  "tm.brand": "AI Vaqt mashinasi",
  "tm.refresh": "Yangilash",
  "tm.travelThrough": "Sayohat qiling",
  "tm.time": "vaqt bo'ylab",
  "tm.subtitle":
    "Jonli simulyatsiyalar — lahza ichiga kiring, guvoh bo'ling.",
  "tm.score": "Ball",
  "tm.scoreOver": "{n} / {max}",
  "tm.minutes": "{n} daqiqa",
  "tm.chooseRole": "Rolingizni tanlang *",
  "tm.selectChar": "Qahramonni tanlang…",
  "tm.startSim": "Simulyatsiyani boshlash",
  "tm.chooseRoleFirst": "Avval rolni tanlang",
  "tm.save": "Saqlash",
  "tm.saved": "Saqlandi",
  "tm.download": "Yuklab olish",
  "tm.saving": "Saqlanmoqda",
  "tm.offline": "Oflayn",
  "tm.details": "Tafsilotlar",
  "tm.close": "Yopish",
  "tm.backToHome": "Bosh sahifaga qaytish",
  "tm.somethingWentWrong": "Nimadir noto'g'ri ketdi",
  "tm.loading.timeFolding.title": "Vaqt bukilmoqda…",
  "tm.loading.timeFolding.sub": "davr darvozalari ochilmoqda",
  "tm.loading.historyAwakens.title": "Tarix uyg'onmoqda…",
  "tm.loading.historyAwakens.sub": "muhit shakllanmoqda",
  "tm.loading.candleLit.title": "Sham yoqildi…",
  "tm.loading.candleLit.sub": "qahramoningiz oldinga chiqmoqda",
  "tm.loading.scrollUnfolds.title": "O'ram ochilmoqda…",
  "tm.loading.scrollUnfolds.sub": "Claude simulyatsiyani yakunlamoqda",
  "tm.role.merchant.label": "Savdogar",
  "tm.role.merchant.hint": "Hamma joyda savdo qiladi, erkin yuradi",
  "tm.role.soldier.label": "Askar / Qo'riqchi",
  "tm.role.soldier.hint": "Har bir darvozada, har bir davrda bor",
  "tm.role.servant.label": "Xizmatkor",
  "tm.role.servant.hint": "Hammasini ko'radi, kam gapiradi",
  "tm.role.foreigner.label": "Chet ellik sayyoh",
  "tm.role.foreigner.hint": "Savollar tabiiy, hech narsa oddiy emas",
  "tm.role.child.label": "Bola",
  "tm.role.child.hint": "Hammasini birinchi marta ko'radi",
  "tm.role.healer.label": "Tabib",
  "tm.role.healer.hint": "Urushda ham, tinchlikda ham kerak",
  "tm.role.spy.label": "Josus / Xabarchi",
  "tm.role.spy.hint": "Hech kimga ishonmaydi, hammasini payqaydi",
  "tm.role.survivor.label": "Omon qolgan",
  "tm.role.survivor.hint": "Falokat, urush yoki yo'ldan qutulgan",

  // Auth
  "auth.welcomeBack": "Xush kelibsiz",
  "auth.beginJourney": "Sayohatingizni boshlang",
  "auth.signInCont": "Davom etish uchun kiring",
  "auth.createAcct": "Hisobingizni yarating",
  "auth.subtitle":
    "Sayohatlarni saqlang, boblarni sinxronlang va o'z tilingizda kinematik hikoyani oching.",
  "auth.name": "Ism",
  "auth.yourName": "Ismingiz",
  "auth.emailPlaceholder": "siz@misol.com",
  "auth.password": "Parol",
  "auth.signIn": "Kirish",
  "auth.signUp": "Hisob yaratish",
  "auth.noAccount": "Hali hisobingiz yo'qmi?",
  "auth.haveAccount": "Hisobingiz bormi?",
  "auth.signUpLink": "Ro'yxatdan o'tish",
  "auth.signInLink": "Kirish",
  "auth.accountCreated": "Hisob yaratildi",
  "auth.welcomeAboard": "Xush kelibsiz.",
  "auth.welcomeBackToast": "Xush kelibsiz",
  "auth.somethingWrong": "Nimadir noto'g'ri ketdi",
  "auth.signUpFailed": "Ro'yxatdan o'tish bajarilmadi",
  "auth.signInFailed": "Kirish bajarilmadi",
  "auth.alreadyRegistered":
    "Bu e-pochta allaqachon ro'yxatdan o'tgan. Kirishga urinib ko'ring.",
  "auth.continueWithGoogle": "Google bilan davom etish",
  "auth.continueWithFacebook": "Facebook bilan davom etish",
  "auth.continueWithMicrosoft": "Microsoft bilan davom etish",
  "auth.continueWithApple": "Apple bilan davom etish",
  "auth.appleComingSoon": "Apple Sign In tez orada",
  "auth.orWithEmail": "yoki e-pochta bilan",
  "auth.continueAsGuest": "Mehmon sifatida davom etish",
  "auth.guestNote":
    "Saqlangan joylar va yuklamalar shu qurilmada qoladi. Qurilmalar o'rtasida sinxronlash uchun istalgan vaqtda ro'yxatdan o'ting.",
  "auth.forgotPassword": "Parolni unutdingizmi?",
  "auth.resetPasswordTitle": "Parolingizni tiklang",
  "auth.resetPasswordSub":
    "E-pochtangizga bir bosishda tiklash havolasini yuboramiz.",
  "auth.sendResetLink": "Tiklash havolasini yuborish",
  "auth.resetEmailSent": "Tiklash xati yuborildi",
  "auth.resetEmailSentDesc":
    "Kiruvchi qutingizni tekshiring va yangi parol o'rnatish uchun havolani bosing.",
  "auth.setNewPasswordTitle": "Yangi parol o'rnating",
  "auth.newPassword": "Yangi parol",
  "auth.confirmPassword": "Parolni tasdiqlang",
  "auth.passwordsDontMatch": "Parollar mos kelmadi",
  "auth.passwordTooShort": "Parol kamida 6 belgidan iborat bo'lishi kerak",
  "auth.passwordUpdated": "Parol yangilandi",
  "auth.passwordUpdatedDesc": "Siz kirdingiz. Yaxshi sayohat tilaymiz.",
  "auth.verifyEmailTitle": "E-pochtangizni tasdiqlang",
  "auth.verifyEmailSub":
    "{email} manziliga tasdiqlash havolasini yubordik. Saqlash va oflayn yuklamalarni ochish uchun uni bosing.",
  "auth.resendEmail": "Xatni qayta yuborish",
  "auth.resendSent": "Xat qayta yuborildi",
  "auth.checkInbox": "Kiruvchi qutingizni tekshiring",
  "auth.upgradeAccount": "Sayohatlaringizni abadiy saqlang",
  "auth.upgradeSub":
    "Hozir ma'lumotlaringiz faqat shu qurilmada. Barcha telefon va planshetlaringizda sinxronlash uchun hisob yarating.",
  "auth.upgradeTitle": "Sayohatlaringizni abadiy saqlang",
  "auth.upgradeCta": "Hisobimni saqlash",
  "auth.upgradeBenefit1":
    "Saqlangan joylaringiz va oflayn yuklamalaringiz o'zgarishsiz qoladi. Hech narsa tiklanmaydi.",
  "auth.upgradeBenefit2":
    "Istalgan telefon yoki planshetda qayta kiring — kutubxonangiz siz bilan.",
  "auth.upgradeFootnote":
    "E-pochtangizga tasdiqlash havolasini yuboramiz. Uni bosmaguningizcha, tasdiqlash bannerini ko'rsatib turamiz.",
  "auth.upgradeSuccess": "Hisob saqlandi",
  "auth.upgradeSuccessDesc":
    "Tasdiqlash havolasi uchun kiruvchi qutingizni tekshiring. Sayohatlaringiz endi shu e-pochtaga bog'landi.",
  "auth.upgradeFailed": "Hisob saqlanmadi",
  "auth.guestModeBadge": "Mehmon rejimi",
  "auth.guestModeBlurb":
    "Saqlaganlaringiz shu qurilmada. Hamma joyda sinxronlanishi uchun e-pochta va parol qo'shing.",
  "auth.listenSignInTitle": "Tinglash uchun kiring",
  "auth.listenSignInDesc":
    "Ovozli hikoya kirgan tinglovchilar uchun. Davom etish uchun bosing — Mehmon rejimi ham ishlaydi.",
  "auth.listenSignInCta": "Kirish",
  "auth.saveSignInTitle": "Saqlash uchun kiring",
  "auth.saveSignInDesc":
    "Saqlangan sayohatlaringiz hisobga bog'lanishi uchun kiring (yoki mehmon sifatida davom eting).",
  "auth.downloadSignInTitle": "Yuklab olish uchun kiring",
  "auth.downloadSignInDesc":
    "Bu sayohatni oflayn saqlash uchun kiring (yoki mehmon sifatida davom eting).",

  // Onboarding
  "onb.step1": "2 dan 1-qadam",
  "onb.step2": "2 dan 2-qadam",
  "onb.chooseLang": "Tilingizni tanlang",
  "onb.pickVoice": "Ovoz tanlang",
  "onb.voiceHelp":
    "Audio qo'llanmalaringiz shu ovozda hikoya qilinadi. Ba'zi qurilmalarda tizim ovozlari boyroq.",
  "onb.searchLang": "Tillarni qidirish…",
  "onb.continue": "Davom etish",
  "onb.back": "Orqaga",
  "onb.noNativeVoice":
    "Bu qurilmada ona ovozi topilmadi. Audio qo'llanmalar zaxira ovozdan foydalanadi.",
  "onb.voiceCountOne": "Bu qurilmada {n} ta ovoz mavjud",
  "onb.voiceCountMany": "Bu qurilmada {n} ta ovoz mavjud",
  "onb.previewVoice": "Ovozni tinglash",
  "onb.beginCta": "Sayohatni boshlash",

  // Attraction page
  "attr.tilt": "Moslang",
  "attr.guide": "qo'llanmani",
  "attr.updating": "Yangilanmoqda",
  "attr.pickFocus": "nimaga e'tibor berishni tanlang.",
  /* These pairs render as `plain` + `gold italic accent`, so BOTH
   * halves must carry words — an empty string would silently delete
   * the accent the design is built around. Uzbek word order differs
   * from English, so the split lands in a different place:
   * "Bu joyning" + "hikoyasi" = "the story of this place". */
  "attr.theWord": "Bu joyning",
  "attr.story": "hikoyasi",
  "attr.stopsWord": "sayohat",
  "attr.aboutWord": "Bu joy",
  "attr.thisPlace": "haqida",
  "attr.keyFacts": "Asosiy ma'lumotlar",
  "attr.keyFactsTitle": "Asosiy ma'lumotlar",
  "attr.whatToLook": "Nimaga e'tibor berish kerak",
  "attr.tips": "maslahatlar",
  "attr.practical": "Amaliy",
  "attr.openNow": "Hozir ochiq",
  "attr.closedNow": "Yopiq",
  "attr.open24": "24 soat ochiq",
  "attr.website": "Veb-sayt",
  "attr.call": "Qo'ng'iroq",
  "rating.question": "Bu qo'llanma qanday edi?",
  "rating.stars": "{n} yulduz",
  "rating.thanks": "Rahmat!",
  "rating.commentPlaceholder": "Nimadir noto'g'ri edimi? (ixtiyoriy)",
  "rating.commentSaved": "Saqlandi",
  "attr.nearbyWord": "Yaqin",
  "attr.places": "joylar",
  "attr.onTheMap": "Xaritada",
  "attr.mapWord": "ko'rish",
  "attr.openInGmaps": "Google Maps'da ochish",
  "attr.savedNearbyOne":
    "Yaqinda {n} ta saqlangan joy — ochish uchun belgini bosing.",
  "attr.savedNearbyMany":
    "Yaqinda {n} ta saqlangan joy — ochish uchun belgini bosing.",
  "attr.tapDirections":
    "Joriy joylashuvingizdan yo'nalishni ochish uchun bosing.",
  "attr.begin": "Boshlash",
  "attr.listen": "Tinglash",
  "attr.get": "Olish",
  "attr.couldNotLoadPlace": "Bu joy yuklanmadi",
  "attr.savedForOffline": "Oflayn uchun saqlandi",
  "attr.findInSaved":
    "Uni Saqlangan bo'limidan toping — ulanishsiz ham ishlaydi.",
  "attr.savedNoAudioTitle": "Saqlandi — lekin audio yuklanmadi",
  "attr.savedNoAudioDesc":
    "Qayta ulaning va oflayn audio yuklashni takrorlash uchun Saqlashni bosing.",
  "attr.alreadyDownloaded": "Allaqachon yuklab olingan",
  "attr.removeFromSaved": "Saqlanganlardan olib tashlash",
  "attr.saveForOffline": "Oflayn uchun saqlash",
  "attr.openInGmapsAria": "{name} ni Google Maps'da ochish",
  "attr.openGuide": "Qo'llanmani ochish",
  "attr.metersAway": "{n} m uzoqlikda",
  "attr.kmAway": "{n} km uzoqlikda",
  "attr.mapOf": "{name} xaritasi",

  // Player
  "player.nowNarrating": "Hozir hikoya qilinmoqda",
  "player.audioGuide": "Audio qo'llanma",
  "player.cachedOffline": "Oflayn saqlangan",
  "player.offlineMode": "Oflayn rejim",
  "player.transcript": "Matn",
  "player.noNarration": "Bu joy uchun hali hikoya mavjud emas.",
  "player.resume": "Davom etish",
  "player.pause": "Pauza",
  "player.stop": "To'xtatish",
  "player.restart": "Qaytadan boshlash",
  "player.back10": "10 soniya orqaga",
  "player.forward10": "10 soniya oldinga",
};
