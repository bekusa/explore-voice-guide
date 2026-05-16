/**
 * i18n core for Voices.
 *
 * Two layers:
 *  1) UI chrome dictionary (static keys → English source strings).
 *     Non-English locales are auto-translated on demand via /api/translate
 *     and cached in localStorage so we don't re-hit the gateway.
 *  2) Free-form `translate()` for dynamic content (destination names,
 *     blurbs, attraction descriptions). Same cache + endpoint.
 *
 * The user's preferred language is sourced from the existing
 * `usePreferredLanguage` hook (reads `profiles.preferred_language`),
 * with a localStorage mirror so anonymous browsing works too.
 */

const STORAGE_KEY = "tg.lang";
// v6 — bumped from v5 because the gateway garbage kept arriving in
// new shapes the v5 filter didn't catch: trailing bracket junk
// ("टोक्यो)) flores", "रोम]))"), and English text returned for
// non-English targets (Hindi UI showed "Gorbachev resigned on 25
// December 1991…" inside cards labelled in Devanagari). v6 cache
// pairs with a beefed-up looksLikeGatewayGarbage filter that
// rejects bracket junk and wrong-script results before they reach
// localStorage.
// v7 — bumped when api.translate switched from Anthropic Haiku to
// Google Cloud Translation. The Haiku JSON-output path occasionally
// produced garbage characters (Beka caught a Bengali "উ" prepended
// to "ნიუ იორკი" on the home-page city card). Bumping the key
// invalidates every locally-cached translation so users immediately
// pull the clean Google output instead of the stale Haiku one.
const CACHE_KEY = "tg.translations.v7";
const CHANGE_EVENT = "tg:lang-changed";
const MAX_CACHE_ENTRIES = 5000;

/* ─── Language store (reactive, browser only) ─── */

function isBrowser() {
  return typeof window !== "undefined";
}

export function getStoredLang(): string {
  if (!isBrowser()) return "en";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "en";
  } catch {
    return "en";
  }
}

export function setStoredLang(code: string) {
  if (!isBrowser()) return;
  const norm = normalizeLang(code);
  try {
    localStorage.setItem(STORAGE_KEY, norm);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: norm }));
}

export function onLangChange(cb: (lang: string) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = (e: Event) => {
    const lang = (e as CustomEvent<string>).detail ?? getStoredLang();
    cb(lang);
  };
  const storage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(getStoredLang());
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", storage);
  };
}

/** Strip region: "en-US" → "en", "zh-CN" stays "zh-CN" (kept for Chinese variants). */
export function normalizeLang(code: string): string {
  if (!code) return "en";
  const c = code.trim();
  // Keep zh-CN / zh-TW / pt-BR / pt-PT distinct — translation differs.
  if (/^(zh|pt)-/i.test(c)) return c.toLowerCase();
  return c.split("-")[0].toLowerCase();
}

/* ─── UI dictionary ─── */

/**
 * Source of truth for UI chrome. Keys are stable, values are English.
 * For non-English locales we fetch translations on first render via the
 * batch translate endpoint, then cache.
 */
export const UI_STRINGS = {
  // Nav / chrome
  "nav.home": "Home",
  "nav.explore": "Explore",
  "nav.map": "Map",
  "nav.saved": "Saved",
  "nav.signOut": "Sign out",
  "nav.signIn": "Sign in",
  "nav.settings": "Settings",
  "nav.notifications": "Notifications",
  "nav.language": "Language",
  "nav.back": "Back",

  // Home
  "home.whereNext": "Where next?",
  "home.offline": "Offline",
  "home.searchPlaceholder": "Country, city, or landmark…",
  "home.search": "Search",
  "home.browse": "Browse",
  "home.collections.title": "Curated collections",
  "home.collections.sub": "Themes for the way you travel",
  "home.timeMachine.title": "Time Machine",
  "home.timeMachine.sub": "Top 10 immersive moments — step inside history",
  "home.museums.title": "Top Museums",
  "home.museums.sub": "20 collections that define a civilisation",
  "museums.title": "Top Museums",
  "museums.subtitle": "20 collections that define a civilisation",
  "museums.openGuide": "Open guide",
  "museums.intro":
    "Hand-picked masterworks of human culture — from the Louvre to the Topkapı, with everything in between.",
  // Museum-highlights section on the attraction page (only renders
  // when the attraction matches one of the curated MUSEUMS).
  "highlights.title": "Must-see",
  "highlights.subtitle": "Top 30 highlights — paginated 10 per page",
  "highlights.noLocation": "Location TBD",
  "highlights.empty": "No highlights yet for this museum.",
  "unesco.title": "UNESCO World Heritage",
  "unesco.short": "UNESCO",
  "home.featured.title": "Featured cities",
  "home.featured.sub": "Cinematic walks, narrated by locals",
  "home.seeAll": "See all",
  "home.featuredBadge": "Featured",
  // AI Generated Content fineprint shown at the bottom of every
  // MobileFrame-wrapped page. Transparency note for the LLM-authored
  // place blurbs, narrated scripts, museum highlights, and Time
  // Machine simulations.
  "ai.generated": "AI Generated Content",
  "home.openCity": "Open {city}",
  "home.tours.one": "{n} tour",
  "home.tours.many": "{n} tours",

  // Hero rotation copy — pre-translated for the five featured cities
  // on Home (tbilisi / rome / kyoto / lisbon / marrakech). Static keys
  // mean we don't burn an /api/translate call per visitor for content
  // we author and can lock in. Each city contributes 4 keys: country,
  // tagline2 (the italic word/phrase after "Lokali |"), blurb, city.
  // The literal "Lokali" tagline prefix stays English everywhere —
  // it's a brand name, not copy.
  "hero.tbilisi.country": "Georgia",
  "hero.tbilisi.city": "Tbilisi",
  "hero.tbilisi.tagline2": "Old Tbilisi",
  "hero.tbilisi.blurb":
    "From sulfur baths and crooked balconies to the chants of Sioni — a cinematic walk through the soul of the old town.",
  "hero.paris.country": "France",
  "hero.paris.city": "Paris",
  "hero.paris.tagline2": "the Seine",
  "hero.paris.blurb":
    "Haussmann boulevards, the river at dusk, and the long flâneur shadow of every café terrace — Paris reads itself aloud if you slow down.",
  "hero.rome.country": "Italy",
  "hero.rome.city": "Rome",
  "hero.rome.tagline2": "Eternal Rome",
  "hero.rome.blurb":
    "Through the Forum's ghosts, baroque fountains and trastevere supper tables — the city that never quite stops being itself.",
  "hero.bangkok.country": "Thailand",
  "hero.bangkok.city": "Bangkok",
  "hero.bangkok.tagline2": "the City of Angels",
  "hero.bangkok.blurb":
    "Khlong canals and gilded temple spires, street-side woks throwing sparks, and the Chao Phraya glowing past the long-tail boats at dusk.",
  "hero.london.country": "United Kingdom",
  "hero.london.city": "London",
  "hero.london.tagline2": "the Thames",
  "hero.london.blurb":
    "Black cabs in the rain, Sunday bells at Westminster, and centuries of empire stacked along a river that still pulls everything together.",
  // Kyoto / Lisbon / Marrakech kept in the dictionary as harmless
  // leftovers — they're not in HERO_ROTATION today but a future
  // rotation tweak (or seasonal carousel) can re-enable them
  // without re-adding the strings.
  "hero.kyoto.country": "Japan",
  "hero.kyoto.city": "Kyoto",
  "hero.kyoto.tagline2": "Old Kyoto",
  "hero.kyoto.blurb":
    "Lantern-lit alleys of Gion, mossy temples, and the ten thousand vermillion gates of Fushimi — Japan's quiet old soul.",
  "hero.lisbon.country": "Portugal",
  "hero.lisbon.city": "Lisbon",
  "hero.lisbon.tagline2": "the Tagus",
  "hero.lisbon.blurb":
    "Saudade, fado, and tile-clad hills tipping toward the Atlantic — Lisbon sings its melancholy in azulejo blue.",
  "hero.marrakech.country": "Morocco",
  "hero.marrakech.city": "Marrakech",
  "hero.marrakech.tagline2": "the Red City",
  "hero.marrakech.blurb":
    "Lantern-lit medinas, riad courtyards, and the trance-drum theatre of Jemaa el-Fnaa — sensory overload, in the best way.",

  // "Available in every language" badge under the search bar on Home.
  // Beka asked for a confidence-building line that surfaces Lokali's
  // multi-language story right above the fold. Static so we don't
  // round-trip through the translator for tagline copy.
  "home.everyLang.title": "Available in every language",
  "home.everyLang.sub":
    "AI audio guide for streets, landmarks, museums, and hidden stories around you.",

  // Destination screen
  "dest.currentlyIn": "Currently in",
  "dest.featuredTour": "Featured Tour",
  "dest.beginJourney": "Begin journey",
  "dest.firstChapter": "Listen to first chapter",
  "dest.freeMin": "Free · 3 min",
  "dest.searchIn": "Search {city}…",
  "dest.inside": "Inside {city}",
  "dest.insideSub": "Curated stops, narrated by locals",
  "dest.otherCities": "Other cities",
  "dest.cat.all": "All",
  "dest.cat.historic": "Historic",
  "dest.cat.sacred": "Sacred",
  "dest.cat.culinary": "Culinary",
  "dest.cat.hidden": "Hidden",
  "dest.cat.fortress": "Fortress",
  "dest.nowPlaying": "Chapter 2 · Sulfur & Stone",

  // Near-you / attraction card
  "card.audioGuide": "Audio guide",
  // aria-labels for the chevron toggle on the museum-highlight-
  // style cards (/results, /saved). Previously hardcoded English.
  "card.expand": "Expand",
  "card.collapse": "Collapse",
  "card.offline": "Offline",
  "card.stops": "{n} stops",
  "card.save": "Save",
  "card.saved": "Saved",
  "card.download": "Download",
  "card.saving": "Saving",
  "card.details": "Details",
  "card.play": "Play narrated guide",
  "card.fallbackDesc":
    "A curated walk through {title}. Tap “Open details” for the full narrated guide and stop-by-stop story.",

  // Attraction page
  "attr.aboutThis": "About this place",
  "attr.theStops": "The stops",
  "attr.chapters": "{n} chapters",
  "attr.beginJourney": "Begin journey",
  "attr.listenNarrated": "Listen to narrated guide",
  "attr.tapBegin": "Tap “Begin journey” to hear the narrated story of this place.",
  "attr.stopsAppear": "Stops appear once the narrated guide is generated.",

  // Results filters
  "filters.interests": "Interests",
  "filters.clear": "Clear",
  "filters.int.editors": "Editor's Pick",
  "filters.int.history": "History",
  "filters.int.photography": "Photography",
  "filters.int.authentic": "Authentic",
  "filters.int.family": "Family",
  "filters.int.romantic": "Romantic",

  // Toasts
  "toast.removedFromSaved": "Removed from Saved",
  "toast.saved": "Saved",
  "toast.savedDesc": "Tap Download to keep the guide for offline.",
  "toast.alreadyCached": "Already cached",
  "toast.alreadyCachedDesc": "This guide plays offline.",
  "toast.youreOffline": "You're offline",
  "toast.youreOfflineDesc": "Connect once to download the guide.",
  "toast.downloaded": "Downloaded for offline",
  "toast.noGuide": "No guide returned",
  "toast.downloadFailed": "Download failed",
  "toast.tryAgain": "Try again later.",
  "toast.langUpdated": "Language updated",
  "toast.langUpdatedDesc": "All places will narrate in {lang} from now.",
  "toast.langFailed": "Couldn't change language",
  "toast.langFailedDesc": "Try again in a moment.",
  "toast.voiceUpdated": "Voice updated",
  "toast.voiceUpdatedDesc": "{voice} will narrate from now.",
  "toast.profileSaved": "Profile saved",
  "toast.couldNotSave": "Couldn't save",
  // 404 / NotFoundComponent strings — surfaced when the user lands
  // on a non-existent route (typo'd URL, stale deep link, deleted
  // /destination/$slug after the cluster removal). Previously
  // hardcoded English; translated for App Store + a11y compliance.
  "err.notFound": "Page not found",
  "err.notFoundDesc": "The page you're looking for doesn't exist or has been moved.",
  "err.goHome": "Go home",
  "toast.noVoiceAvailable": "No voice available",
  "toast.libCleared": "Offline library cleared",
  "toast.speechUnsupported": "Speech not supported on this device",
  "toast.couldNotLoadGuide": "Couldn't load the guide",
  "toast.tryAgainPlease": "Please try again.",
  // Surfaced when the TTS upstream rejects the request because the
  // chosen language has no voice configured (e.g., Azure ka-GE not
  // enabled in n8n). Hint points the user to switch language as a
  // workaround until the voice is wired up.
  "toast.voiceUnavailableTitle": "Voice not available for this language yet",
  "toast.voiceUnavailableHint": "Try switching to English or another supported language.",
  "toast.guideOfflineDesc": "This guide isn't downloaded yet. Connect once to cache it.",
  "toast.couldNotLoadAttractions": "Couldn't load attractions",
  "toast.allSet": "All set",
  "toast.allSetDesc": "Welcome to Voices.",
  "toast.setupFailed": "Setup failed",
  "toast.signedOut": "Signed out",

  // Language picker
  "lang.title": "Language",
  "lang.audioGuide": "Audio guide",
  "lang.speakMy": "Speak my",
  "lang.language": "language",
  "lang.current": "Current",
  "lang.searchPlaceholder": "Search 37 languages…",
  "lang.tapHint":
    "Tap a language to switch instantly. Your narrator voice will reset to the first match for that locale.",
  "lang.noMatches": "No languages match",

  // Saved page
  "saved.title": "Saved",
  "saved.offlineLib": "Offline library",
  "saved.your": "Your",
  "saved.placesOne": "place",
  "saved.placesMany": "places",
  "saved.storedHelp": "Stored on this device — narration plays without a connection.",
  "saved.guideCached": "Guide cached",
  "saved.removeAria": "Remove {name}",
  "saved.empty": "Nothing saved",
  "saved.emptyYet": "yet",
  "saved.emptyHelp": "Tap the bookmark on any place to keep it for offline.",
  "saved.exploreCta": "Explore places",
  "saved.clearConfirm": "Clear all saved places? This won't delete cached audio.",
  "saved.clear": "Clear",

  // Map page
  "map.title": "On the map",
  "map.savedOne": "{n} saved place",
  "map.savedMany": "{n} saved places",
  "map.toggleStyle": "Toggle map style",
  "map.centerLoc": "Center on my location",
  "map.empty": "No pins",
  "map.emptyYet": "yet",
  "map.emptyHelp":
    "Save a place from the home or destination page and it will appear here on the map.",
  "map.findCta": "Find places",
  "map.loading": "Loading map…",

  // Settings
  "set.title": "Settings",
  "set.subtitle": "Tune your journey",
  "set.configuration": "Configuration",
  "set.tuneYour": "Tune your",
  "set.journey": "journey",
  "set.intro":
    "Language, voice, theme, and offline storage — everything that shapes how Tbilisi whispers back to you.",
  "set.account": "Account",
  "set.signedInAs": "Signed in as",
  "set.displayName": "Display name",
  "set.yourName": "Your name",
  "set.save": "Save",
  "set.audioGuide": "Audio guide",
  "set.language": "Language",
  "set.narratorVoice": "Narrator voice",
  "set.browserDefault": "Browser default",
  "set.previewVoice": "Preview voice",
  "set.appearance": "Appearance",
  "set.theme": "Theme",
  "set.themeDark": "Cinematic dark",
  "set.themeLight": "Daylight",
  "set.offlineMode": "Offline mode",
  "set.youOnline": "You're online",
  "set.youOffline": "You're offline",
  "set.onlineHelp": "Download guides now so they keep playing without signal.",
  "set.offlineHelp": "Cached guides keep working — others will load when you reconnect.",
  "set.savedSummaryOne": "{saved} saved · {cached} guide cached",
  "set.savedSummaryMany": "{saved} saved · {cached} guides cached",
  "set.cacheSize": "{flag} {native} · ~{kb} KB on this device",
  "set.downloadAllOne": "Download {n} guide for offline",
  "set.downloadAllMany": "Download {n} guides for offline",
  "set.downloading": "Downloading… {done}/{total}",
  "set.downloadDesc": "Caches all saved places in {lang}",
  "set.downloadedOne": "Downloaded {n} guide",
  "set.downloadedMany": "Downloaded {n} guides",
  "set.downloadAvailable": "Available offline in {lang}",
  "set.downloadAvailableFailed": "Available offline in {lang} · {n} failed",
  "set.downloadFailed": "Couldn't download any guides",
  "set.downloadFailedDesc": "Check your connection and try again.",
  "set.clearLib": "Clear offline library",
  "set.signOut": "Sign out",
  "set.appVersion": "Lokali · v1.0",
  "set.searchLanguages": "Search languages…",
  "set.noLanguagesMatch": "No languages match",
  "set.noNativeVoice": "No native voice found for this language. Speech will use a generic voice.",
  "set.noVoiceForLang": "No native voice found on this device for {code}.",
  "set.installVoicesHelp":
    "We'll fall back to the browser default. Install additional voices in your operating system's accessibility settings.",
  "voice.onDevice": "On-device",
  "voice.cloud": "Cloud",

  // Notifications
  "notif.title": "Notifications",
  "notif.unread": "{n} unread",
  "notif.allCaught": "All caught up",
  "notif.empty": "Inbox empty",
  "notif.markAll": "Mark all as read",
  "notif.clearAll": "Clear all",
  "notif.dismiss": "Dismiss",
  "notif.emptyTitle": "No notifications",
  "notif.emptyHelp": "Tips, journey updates, and travel ideas will appear here.",
  "notif.backHome": "Back to home",
  "notif.now": "now",
  "notif.min": "m",
  "notif.hour": "h",
  "notif.day": "d",

  "results.searching": "Searching…",
  // Rotating loading messages — shown while the LLM is generating a
  // fresh attractions list or guide. Cache hits skip these entirely.
  // The component cycles through them every ~3s in order, so order
  // matters: each step should feel like progress toward the next.
  "loading.searching": "Searching for information…",
  "loading.checkingSources": "Checking the latest sources…",
  "loading.selectingDetails": "Picking the most telling details…",
  "loading.preparingRecommendations": "Preparing recommendations just for you…",
  "loading.almostReady": "Almost ready…",
  "results.countOne": "{n} result for",
  "results.countMany": "{n} results for",
  "results.placeholder": "Country, city, or landmark…",
  "results.empty": "Nothing found",
  "results.emptyHelp":
    "We couldn't find places matching “{query}”. Try a different word — a place, a feeling, or an era.",
  "results.backHome": "Back to home",
  "results.alreadyOffline": "Already offline",
  // Pagination — 10 per page, capped at 3 pages (= 30 results max).
  // The cap matches what the n8n /webhook/attractions prompt is asked
  // to return; everything past that is ignored on the client and never
  // hits the cache key, so this label set is the source of truth for
  // "how big a result set the user can ever see for one query".
  "results.prev": "Previous",
  "results.next": "Next",
  "results.pageLabel": "Page {n} of {total}",
  // Per-button aria-label on the pagination strip. Previously
  // hardcoded English ("Go to page 3"); translated for the App
  // Store / Play Store accessibility review pass.
  "results.goToPage": "Go to page {n}",
  "results.pagination": "Pagination",

  // Destinations
  "dest.exploreTitle": "Explore",
  "dest.chooseDest": "Choose a destination",
  "dest.searchAny": "Any city, country, or landmark…",
  "dest.searchHint": "Press Enter to discover anywhere on Earth with Lokali AI.",
  "dest.allCount": "All ({n})",
  "dest.countOne": "{n} destination",
  "dest.countMany": "{n} destinations",
  "dest.notInList": "Not in our curated list yet",
  "dest.searchWithLokali": "Search {query} with Lokali AI",
  "dest.resetFilters": "Reset filters",
  "dest.backHome": "Back to home",
  "dest.loadingTop": "Loading top attractions…",
  "dest.topPicks": "Top picks, narrated by locals",
  "dest.insideWord": "Inside",
  "dest.showingCurated": "Showing curated picks instead.",

  // Time Machine
  "tm.title": "Time Machine",
  // Hero eyebrow on the simulation page — short and brand-light per
  // Beka. Previously "Lokali · Time Machine"; now just "AI Time
  // Machine" so the chip doesn't read as a corporate tag.
  "tm.brand": "AI Time Machine",
  "tm.refresh": "Refresh",
  "tm.travelThrough": "Travel through",
  "tm.time": "time",
  "tm.subtitle": "Immersive simulations — step inside the moment, become the witness.",
  "tm.score": "Score",
  "tm.scoreOver": "{n} / {max}",
  "tm.minutes": "{n} min",
  "tm.chooseRole": "Choose your role *",
  "tm.selectChar": "Select a character…",
  "tm.startSim": "Start simulation",
  "tm.chooseRoleFirst": "Choose a role first",
  "tm.save": "Save",
  "tm.saved": "Saved",
  "tm.download": "Download",
  "tm.saving": "Saving",
  "tm.offline": "Offline",
  "tm.details": "Details",
  "tm.close": "Close",
  "tm.backToHome": "Back to home",
  "tm.somethingWentWrong": "Something went wrong",
  "tm.loading.timeFolding.title": "Time is folding…",
  "tm.loading.timeFolding.sub": "opening the gates of the era",
  "tm.loading.historyAwakens.title": "History awakens…",
  "tm.loading.historyAwakens.sub": "shaping the atmosphere",
  "tm.loading.candleLit.title": "The candle is lit…",
  "tm.loading.candleLit.sub": "your character steps forward",
  "tm.loading.scrollUnfolds.title": "The scroll unfolds…",
  "tm.loading.scrollUnfolds.sub": "Claude is finishing the simulation",
  "tm.role.merchant.label": "Merchant",
  "tm.role.merchant.hint": "Trades everywhere, moves freely",
  "tm.role.soldier.label": "Soldier / Guard",
  "tm.role.soldier.hint": "Present at every gate, every era",
  "tm.role.servant.label": "Servant",
  "tm.role.servant.hint": "Sees everything, says little",
  "tm.role.foreigner.label": "Foreign Traveler",
  "tm.role.foreigner.hint": "Questions are natural, nothing ordinary",
  "tm.role.child.label": "Child",
  "tm.role.child.hint": "Sees everything for the first time",
  "tm.role.healer.label": "Healer",
  "tm.role.healer.hint": "Needed in war and peace alike",
  "tm.role.spy.label": "Spy / Informant",
  "tm.role.spy.hint": "Trusts no one, notices everything",
  "tm.role.survivor.label": "Survivor",
  "tm.role.survivor.hint": "Escaped disaster, war, or the road",

  // Auth
  "auth.welcomeBack": "Welcome back",
  "auth.beginJourney": "Begin your journey",
  "auth.signInCont": "Sign in to continue",
  "auth.createAcct": "Create your account",
  "auth.subtitle": "Save tours, sync chapters, and unlock cinematic narration in your language.",
  "auth.name": "Name",
  "auth.yourName": "Your name",
  "auth.emailPlaceholder": "you@example.com",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signUp": "Create account",
  "auth.noAccount": "No account yet?",
  "auth.haveAccount": "Already have an account?",
  "auth.signUpLink": "Sign up",
  "auth.signInLink": "Sign in",
  "auth.accountCreated": "Account created",
  "auth.welcomeAboard": "Welcome aboard.",
  "auth.welcomeBackToast": "Welcome back",
  "auth.somethingWrong": "Something went wrong",
  "auth.signUpFailed": "Sign up failed",
  "auth.signInFailed": "Sign in failed",
  "auth.alreadyRegistered": "This email is already registered. Try signing in.",
  // OAuth providers
  "auth.continueWithGoogle": "Continue with Google",
  "auth.continueWithApple": "Continue with Apple",
  "auth.appleComingSoon": "Apple Sign In coming soon",
  "auth.orWithEmail": "or with email",
  // Anonymous mode
  "auth.continueAsGuest": "Continue as guest",
  "auth.guestNote": "Saved places and downloads stay on this device. Sign up anytime to sync across devices.",
  // Password reset
  "auth.forgotPassword": "Forgot password?",
  "auth.resetPasswordTitle": "Reset your password",
  "auth.resetPasswordSub": "We'll send a one-click reset link to your email.",
  "auth.sendResetLink": "Send reset link",
  "auth.resetEmailSent": "Reset email sent",
  "auth.resetEmailSentDesc": "Check your inbox and click the link to set a new password.",
  "auth.setNewPasswordTitle": "Set a new password",
  "auth.newPassword": "New password",
  "auth.confirmPassword": "Confirm password",
  "auth.passwordsDontMatch": "Passwords don't match",
  "auth.passwordTooShort": "Password must be at least 6 characters",
  "auth.passwordUpdated": "Password updated",
  "auth.passwordUpdatedDesc": "You're signed in. Have a great trip.",
  // Email verification gate
  "auth.verifyEmailTitle": "Verify your email",
  "auth.verifyEmailSub": "We sent a confirmation link to {email}. Click it to unlock saving + offline downloads.",
  "auth.resendEmail": "Resend email",
  "auth.resendSent": "Email re-sent",
  "auth.checkInbox": "Check your inbox",
  // Anonymous upgrade
  "auth.upgradeAccount": "Save your tours forever",
  "auth.upgradeSub": "Right now your data lives only on this device. Create an account to sync it across all your phones + tablets.",

  // Onboarding
  "onb.step1": "Step 1 of 2",
  "onb.step2": "Step 2 of 2",
  "onb.chooseLang": "Choose your language",
  "onb.pickVoice": "Pick a voice",
  "onb.voiceHelp":
    "Your audio guides will be narrated in this voice. Some devices have richer system voices than others.",
  "onb.searchLang": "Search languages…",
  "onb.continue": "Continue",
  "onb.back": "Back",
  "onb.noNativeVoice":
    "No native voice found on this device. Audio guides will use a fallback voice.",
  "onb.voiceCountOne": "{n} voice available on this device",
  "onb.voiceCountMany": "{n} voices available on this device",
  "onb.previewVoice": "Preview voice",
  "onb.beginCta": "Begin journey",

  // Attraction page
  "attr.tilt": "Tilt the",
  "attr.guide": "guide",
  "attr.updating": "Updating",
  "attr.pickFocus": "pick what to focus on.",
  "attr.theWord": "The",
  "attr.story": "story",
  "attr.stopsWord": "tour",
  "attr.aboutWord": "About",
  "attr.thisPlace": "this place",
  "attr.keyFacts": "Key facts",
  "attr.keyFactsTitle": "Key facts",
  "attr.whatToLook": "What to look for",
  "attr.tips": "tips",
  "attr.practical": "Practical",
  "attr.nearbyWord": "Nearby",
  "attr.places": "places",
  "attr.onTheMap": "On the",
  "attr.mapWord": "map",
  "attr.openInGmaps": "Open in Google Maps",
  "attr.savedNearbyOne": "{n} saved place nearby — tap a pin to open.",
  "attr.savedNearbyMany": "{n} saved places nearby — tap a pin to open.",
  "attr.tapDirections": "Tap to open directions from your current location.",
  "attr.begin": "Begin",
  "attr.listen": "Listen",
  "attr.get": "Get",
  "attr.couldNotLoadPlace": "Couldn't load this place",
  "attr.savedForOffline": "Saved for offline",
  "attr.findInSaved": "Find it in the Saved tab — works without a connection.",
  "attr.alreadyDownloaded": "Already downloaded",
  "attr.removeFromSaved": "Remove from saved",
  "attr.saveForOffline": "Save for offline",
  "attr.openInGmapsAria": "Open {name} in Google Maps",
  "attr.openGuide": "Open guide",
  "attr.metersAway": "{n} m away",
  "attr.kmAway": "{n} km away",
  "attr.mapOf": "Map of {name}",

  // Player
  "player.nowNarrating": "Now narrating",
  "player.audioGuide": "Audio guide",
  "player.cachedOffline": "Cached offline",
  "player.offlineMode": "Offline mode",
  "player.transcript": "Transcript",
  "player.noNarration": "No narration available yet for this place.",
  "player.resume": "Resume",
  "player.pause": "Pause",
  "player.stop": "Stop",
  // Transport extras — Beka asked for restart-from-beginning and
  // ±10s skip buttons alongside Play/Pause/Stop. Aria labels only;
  // the buttons themselves render icons (no text).
  "player.restart": "Restart",
  "player.back10": "Skip back 10 seconds",
  "player.forward10": "Skip forward 10 seconds",
} as const;

export type UiKey = keyof typeof UI_STRINGS;

/* ─── Translation cache (per-language, free-form strings) ─── */

type CacheShape = Record<string /* lang */, Record<string /* sourceText */, string>>;

function readCache(): CacheShape {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : {};
  } catch {
    return {};
  }
}

function writeCache(map: CacheShape) {
  if (!isBrowser()) return;
  try {
    // crude trim to avoid blowing 5MB budget
    const flatCount = Object.values(map).reduce((n, byLang) => n + Object.keys(byLang).length, 0);
    if (flatCount > MAX_CACHE_ENTRIES) {
      // drop the language with the most entries until under cap
      const sorted = Object.entries(map).sort(
        (a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length,
      );
      while (
        sorted.length > 0 &&
        Object.values(Object.fromEntries(sorted)).reduce((n, b) => n + Object.keys(b).length, 0) >
          MAX_CACHE_ENTRIES
      ) {
        sorted.shift();
      }
      map = Object.fromEntries(sorted);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* quota — silently drop */
  }
}

export function getCachedTranslation(text: string, lang: string): string | null {
  const l = normalizeLang(lang);
  if (l === "en") return text;
  const map = readCache();
  return map[l]?.[text] ?? null;
}

export function setCachedTranslations(pairs: { source: string; text: string }[], lang: string) {
  const l = normalizeLang(lang);
  if (l === "en") return;
  const map = readCache();
  if (!map[l]) map[l] = {};
  for (const { source, text } of pairs) {
    if (text) map[l][source] = text;
  }
  writeCache(map);
}

/* ─── Network: batch translate via server route ─── */

const inflight = new Map<string, Promise<string[]>>();

export async function translateBatch(texts: string[], lang: string): Promise<string[]> {
  const l = normalizeLang(lang);
  if (l === "en" || texts.length === 0) return texts;

  const key = l + "::" + texts.join("\u0001");
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, target: l }),
    });
    if (!res.ok) throw new Error(`translate failed: ${res.status}`);
    const data = (await res.json()) as { translations?: string[] };
    const out = data.translations ?? texts;
    // Identity guard: if the gateway echoed the source back unchanged
    // (typical when LOVABLE_API_KEY is missing — /api/translate
    // degrades to "return source"), do NOT cache that pair. Caching
    // would pin English under the target-lang key and `t()` would
    // never re-attempt. Only persist genuine translations.
    const cacheable = texts
      .map((s, i) => ({ source: s, text: out[i] ?? s }))
      .filter(({ source, text }) => text.trim().length > 0 && text !== source);
    if (cacheable.length > 0) setCachedTranslations(cacheable, l);
    return out;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/* ─── Format helpers ─── */

export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
