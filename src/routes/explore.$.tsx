import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /explore/* legacy-path redirects.
 *
 * `public/_redirects` holds ~170 of these, and **none of them work**:
 * `_redirects` is a Cloudflare *Pages* feature and this app ships as a
 * Cloudflare *Worker* (`wrangler.jsonc` -> `main:
 * @tanstack/react-start/server-entry`). Nothing reads that file. Verified
 * live 2026-10-12: every rule in it returned 404, including the two
 * trailing-slash rules and all 162 city corrections. Those are URLs we
 * published and that other sites link to, so each one was dropping a
 * visitor on a 404 and throwing away the link equity with it.
 *
 * Two kinds of rule, both reproduced here:
 *
 *  1. `.html` is mandatory. The Worker has no directory index, so
 *     `/explore/en/istanbul` and `/explore/en/istanbul/` must both land on
 *     `/explore/en/istanbul.html`.
 *
 *  2. 162 attractions were first published under the wrong "city" - the
 *     geocoder had handed back a municipality, a region or sometimes a whole
 *     country (`australia/...`, `heraklion-municipal-unit/...`). The slug
 *     never changed, only the city, but the mapping is keyed on
 *     `<city>/<slug>` rather than on the city alone, because three old
 *     cities split across two real ones each: `australia` ->
 *     {alice-springs, canberra}, `argentina` -> {buenos-aires, el-calafate},
 *     `united-states` -> {honolulu, tumon}.
 *
 * This route only ever runs for paths that did NOT match a static file -
 * Workers serves assets first - so re-adding `.html` here is safe.
 *
 * The self-redirect guard matters: without it, a genuinely missing page
 * (`/explore/en/nowhere/nothing.html`) would strip `.html`, find no mapping,
 * re-add `.html`, and redirect to itself forever.
 */

/** old "<city>/<slug>" -> correct "<city>/<slug>" (language-independent) */
const CITY_FIX: Record<string, string> = {
  "agios-nikolaos-municipal-unit/kritsa-village": "crete/kritsa-village",
  "agios-nikolaos/spinalonga-fortress": "crete/spinalonga-fortress",
  "akureyrarbær/akureyri-church": "akureyri/akureyri-church",
  "akureyrarbær/botanical-garden-akureyri": "akureyri/botanical-garden-akureyri",
  "al-bateen/qasr-al-watan": "abu-dhabi/qasr-al-watan",
  "al-hisn/emirates-palace": "abu-dhabi/emirates-palace",
  "al-muzoun/sheikh-zayed-grand-mosque": "abu-dhabi/sheikh-zayed-grand-mosque",
  "alberndorf-in-der-riedmark/strahov-monastery": "prague/strahov-monastery",
  "algeria/beys-palace": "oran/beys-palace",
  "algeria/hassan-pasha-mosque": "oran/hassan-pasha-mosque",
  "algeria/spanish-fort-fort-santa-cruz": "oran/spanish-fort-fort-santa-cruz",
  "amaravati/undavalli-caves": "vijayawada/undavalli-caves",
  "antiguo-cuscatlán/parque-cuscatlán": "san-salvador/parque-cuscatlán",
  "argentina/dorrego-square": "buenos-aires/dorrego-square",
  "argentina/lago-argentino": "el-calafate/lago-argentino",
  "argentina/parque-lezama": "buenos-aires/parque-lezama",
  "argentina/perito-moreno-glacier": "el-calafate/perito-moreno-glacier",
  "asten/saint-vitus-cathedral": "prague/saint-vitus-cathedral",
  "australia/alice-springs-desert-park": "alice-springs/alice-springs-desert-park",
  "australia/alice-springs-telegraph-station": "alice-springs/alice-springs-telegraph-station",
  "australia/australian-institute-of-sport": "canberra/australian-institute-of-sport",
  "australia/royal-flying-doctor-service-visitor-centre": "alice-springs/royal-flying-doctor-service-visitor-centre",
  "australia/todd-river-dry-bed": "alice-springs/todd-river-dry-bed",
  "ban-pong/wat-phra-that-doi-suthep": "chiang-mai/wat-phra-that-doi-suthep",
  "bang-rak-noi-subdistrict/khlong-lat-mayom-floating-market": "bangkok/khlong-lat-mayom-floating-market",
  "baqiao-district/big-wild-goose-pagoda": "xi-an/big-wild-goose-pagoda",
  "baqiao-district/city-wall": "xi-an/city-wall",
  "baqiao-district/shaanxi-history-museum": "xi-an/shaanxi-history-museum",
  "barbados/st-nicholas-abbey": "bridgetown/st-nicholas-abbey",
  "botswana/makgadikgadi-pans": "maun/makgadikgadi-pans",
  "botswana/moremi-game-reserve": "maun/moremi-game-reserve",
  "botswana/okavango-delta": "maun/okavango-delta",
  "brazil/praia-da-ferradura": "buzios/praia-da-ferradura",
  "brazil/praia-da-tartaruga": "buzios/praia-da-tartaruga",
  "canada/scarborough-bluffs": "toronto/scarborough-bluffs",
  "chania-regional-unit/elafonissi-beach": "crete/elafonissi-beach",
  "chania/agia-triada-beach": "crete/agia-triada-beach",
  "chiang-mai-city-municipality/chiang-mai-city-arts-and-cultural-centre": "chiang-mai/chiang-mai-city-arts-and-cultural-centre",
  "chiang-mai-city-municipality/chiang-mai-night-bazaar": "chiang-mai/chiang-mai-night-bazaar",
  "chiang-mai-city-municipality/old-city": "chiang-mai/old-city",
  "chiang-mai-city-municipality/three-kings-monument": "chiang-mai/three-kings-monument",
  "chiang-mai-city-municipality/warorot-market": "chiang-mai/warorot-market",
  "chiang-mai-city-municipality/wat-chedi-luang": "chiang-mai/wat-chedi-luang",
  "chiang-mai-city-municipality/wat-chiang-man": "chiang-mai/wat-chiang-man",
  "chiang-mai-city-municipality/wat-phra-singh": "chiang-mai/wat-phra-singh",
  "china/basilica-of-our-lady-of-guadalupe": "mexico-city/basilica-of-our-lady-of-guadalupe",
  "chitral/shandur-top": "gilgit/shandur-top",
  "chiyoda/imperial-palace-east-gardens": "tokyo/imperial-palace-east-gardens",
  "chuncheon-si/garden-of-morning-calm": "seoul/garden-of-morning-calm",
  "danyor-tehsil/naltar-valley": "gilgit/naltar-valley",
  "distrito-de-panamá/casco-viejo": "panama-city/casco-viejo",
  "duggirala/kondapalli-fort": "vijayawada/kondapalli-fort",
  "ekerö-kommun/drottningholm-palace": "stockholm/drottningholm-palace",
  "ethiopia/bet-maryam": "lalibela/bet-maryam",
  "ethiopia/church-of-saint-gabriel-and-saint-raphael": "lalibela/church-of-saint-gabriel-and-saint-raphael",
  "ethiopia/church-of-saint-george": "lalibela/church-of-saint-george",
  "ethiopia/church-of-the-saviour-of-the-world": "lalibela/church-of-the-saviour-of-the-world",
  "etmadpur/mehtab-bagh": "agra/mehtab-bagh",
  "eyüpsultan/pierre-loti-café": "istanbul/pierre-loti-café",
  "gapyeong-eup/gapyeong-rail-park": "seoul/gapyeong-rail-park",
  "gortyna-municipal-unit/gortyn-archaeological-site": "crete/gortyn-archaeological-site",
  "gusu-district/tiger-hill": "suzhou/tiger-hill",
  "haliliye/göbekli-tepe": "şanlıurfa/göbekli-tepe",
  "heraklion-municipal-unit/heraklion-archaeological-museum": "crete/heraklion-archaeological-museum",
  "heraklion-municipal-unit/knossos-palace": "crete/knossos-palace",
  "heraklion-municipal-unit/minoan-palaces-trail": "crete/minoan-palaces-trail",
  "india/crawford-market": "mumbai/crawford-market",
  "india/elephanta-caves": "mumbai/elephanta-caves",
  "india/gateway-of-india": "mumbai/gateway-of-india",
  "india/taj-mahal-palace-hotel": "mumbai/taj-mahal-palace-hotel",
  "juglot-tehsil/kargah-buddha": "gilgit/kargah-buddha",
  "jundiping/zhangjiajie-glass-bridge": "zhangjiajie/zhangjiajie-glass-bridge",
  "kadıköy/kadıköy": "istanbul/kadıköy",
  "khoni-municipality/white-bridge": "kutaisi/white-bridge",
  "kiraoli/fatehpur-sikri": "agra/fatehpur-sikri",
  "kâhta/mount-nemrut": "adıyaman/mount-nemrut",
  "lalitpur/patan-durbar-square": "patan/patan-durbar-square",
  "lantian-county/giant-wild-goose-pagoda": "xi-an/giant-wild-goose-pagoda",
  "lintong-district/huaqing-palace": "xi-an/huaqing-palace",
  "lintong-district/terracotta-army": "xi-an/terracotta-army",
  "lintong-district/terracotta-army-museum": "xi-an/terracotta-army-museum",
  "los-angeles-county/universal-studios-hollywood": "los-angeles/universal-studios-hollywood",
  "los-cabos-municipality/estuary-and-lagoon": "san-jose-del-cabo/estuary-and-lagoon",
  "los-cabos-municipality/iglesia-san-jose-del-cabo": "san-jose-del-cabo/iglesia-san-jose-del-cabo",
  "los-cabos-municipality/san-jose-del-cabo-art-district": "san-jose-del-cabo/san-jose-del-cabo-art-district",
  "los-cabos-municipality/san-jose-del-cabo-town-square": "san-jose-del-cabo/san-jose-del-cabo-town-square",
  "machupicchu/machu-picchu": "cusco/machu-picchu",
  "malaysia/kuala-lumpur-bird-park": "kuala-lumpur/kuala-lumpur-bird-park",
  "malaysia/masjid-negara": "kuala-lumpur/masjid-negara",
  "malaysia/merdeka-square": "kuala-lumpur/merdeka-square",
  "malaysia/thean-hou-temple": "kuala-lumpur/thean-hou-temple",
  "malia-municipal-unit/lato-archaeological-site": "crete/lato-archaeological-site",
  "mexico/mundaca-fortress": "cancun/mundaca-fortress",
  "mexico/playa-norte": "cancun/playa-norte",
  "mexico/punta-sur-eco-park": "cancun/punta-sur-eco-park",
  "mexico/turtle-farm-granja-de-tortugas": "cancun/turtle-farm-granja-de-tortugas",
  "mtskheta-municipality/jvari-monastery": "tbilisi/jvari-monastery",
  "mtskheta-municipality/mtskheta": "tbilisi/mtskheta",
  "mueang-sukhothai-district/ramkhamhaeng-national-museum": "sukhothai/ramkhamhaeng-national-museum",
  "mueang-sukhothai-district/wat-phra-phai-luang": "sukhothai/wat-phra-phai-luang",
  "mueang-sukhothai-district/wat-saphan-hin": "sukhothai/wat-saphan-hin",
  "mueang-sukhothai-district/wat-si-chum": "sukhothai/wat-si-chum",
  "multan-district/mausoleum-of-shah-rukn-e-alam": "multan/mausoleum-of-shah-rukn-e-alam",
  "multan-district/shrine-of-shah-shams-tabriz": "multan/shrine-of-shah-shams-tabriz",
  "municipality-of-kissamos/balos-lagoon": "crete/balos-lagoon",
  "municipality-of-rethymnon/arkadi-monastery": "crete/arkadi-monastery",
  "municipality-of-sfakia/samaria-gorge": "crete/samaria-gorge",
  "municipality-of-sfakia/samaria-gorge-national-park-visitor-centre": "crete/samaria-gorge-national-park-visitor-centre",
  "nagar-khas-tehsil/attabad-lake": "hunza/attabad-lake",
  "namibia/dune-7": "swakopmund/dune-7",
  "new-delhi/india-gate": "delhi/india-gate",
  "north-jakarta/sunda-kelapa-harbor": "jakarta/sunda-kelapa-harbor",
  "orange-county/gatorland": "orlando/gatorland",
  "orange-county/seaworld-orlando": "orlando/seaworld-orlando",
  "petra-sub-district/royal-tombs": "petra/royal-tombs",
  "petra-sub-district/siq": "petra/siq",
  "petra-sub-district/treasury": "petra/treasury",
  "phra-nakhon-si-ayutthaya-city-municipality/wat-mahathat": "bangkok/wat-mahathat",
  "plentzia/guggenheim-museum-bilbao": "bilbao/guggenheim-museum-bilbao",
  "prince-islands/princes-islands": "istanbul/princes-islands",
  "queenstown-lakes-district/arrowtown": "queenstown/arrowtown",
  "run-ta-aek-techo-sen/banteay-srei-temple": "siem-reap/banteay-srei-temple",
  "sagarejo-municipality/david-gareja-monastery-complex": "tbilisi/david-gareja-monastery-complex",
  "saint-gilles-sint-gillis/mini-europe": "brussels/mini-europe",
  "saint-lucy/animal-flower-cave": "speightstown/animal-flower-cave",
  "salé/mausoleum-of-muhammad-v": "rabat/mausoleum-of-muhammad-v",
  "sant-boi-de-llobregat/montjuïc-castle": "barcelona/montjuïc-castle",
  "sant-julià-de-vilatorta/tiber-island": "rome/tiber-island",
  "santa-monica/santa-monica-pier": "los-angeles/santa-monica-pier",
  "sarıyer/rumeli-fortress": "istanbul/rumeli-fortress",
  "seminole-county/wekiwa-springs-state-park": "orlando/wekiwa-springs-state-park",
  "serik/aspendos-theatre": "antalya/aspendos-theatre",
  "shounter-tehsil/fairy-meadows": "gilgit/fairy-meadows",
  "spain/las-canteras-beach": "las-palmas-de-gran-canaria/las-canteras-beach",
  "spain/museo-canario": "las-palmas-de-gran-canaria/museo-canario",
  "stara-gadka/manufaktura": "lodz/manufaktura",
  "suan-luang/damnoen-saduak-floating-market": "bangkok/damnoen-saduak-floating-market",
  "sundays-river-valley-local-municipality/addo-elephant-national-park": "port-elizabeth/addo-elephant-national-park",
  "suthep-town-municipality/doi-suthep-pui-national-park": "chiang-mai/doi-suthep-pui-national-park",
  "suthep-town-municipality/wat-ched-yod": "chiang-mai/wat-ched-yod",
  "suthep-town-municipality/wat-umong": "chiang-mai/wat-umong",
  "swartland-local-municipality/table-mountain": "cape-town/table-mountain",
  "tetritskaro-municipality/nunnery-of-st-nino": "mtskheta/nunnery-of-st-nino",
  "thep-krasatti/wat-chalong": "phuket/wat-chalong",
  "tskaltubo-municipality/gelati-monastery": "kutaisi/gelati-monastery",
  "tskaltubo-municipality/motsameta-monastery": "kutaisi/motsameta-monastery",
  "tybakio-municipal-unit/matala-beach": "crete/matala-beach",
  "tybakio-municipal-unit/palace-of-phaistos": "crete/palace-of-phaistos",
  "uijeongbu-si/nami-island": "seoul/nami-island",
  "uijeongbu-si/petite-france": "seoul/petite-france",
  "united-states/chamorro-village": "tumon/chamorro-village",
  "united-states/diamond-head": "honolulu/diamond-head",
  "united-states/guam-museum": "tumon/guam-museum",
  "united-states/tumon-bay": "tumon/tumon-bay",
  "united-states/two-lovers-point": "tumon/two-lovers-point",
  "woluwe-saint-lambert-sint-lambrechts-woluwe/european-parliament-building": "brussels/european-parliament-building",
  "yanta-district/small-wild-goose-pagoda": "xi-an/small-wild-goose-pagoda",
  "zolsky-district/mestia-towers": "mestia/mestia-towers",
  "zolsky-district/shdugra-waterfall": "mestia/shdugra-waterfall",
  "zolsky-district/svaneti-museum-of-history-and-ethnography": "mestia/svaneti-museum-of-history-and-ethnography",
  "zolsky-district/ushguli": "mestia/ushguli",
  "þingeyjarsveit/goðafoss-waterfall": "akureyri/goðafoss-waterfall",
};

export const Route = createFileRoute("/explore/$")({
  beforeLoad: ({ params }) => {
    const raw = (params as { _splat?: string })._splat ?? "";
    const incoming = "/explore/" + raw;

    // normalise: drop a trailing slash and a trailing .html, remember the rest
    let p = raw.replace(/\/+$/, "");
    p = p.replace(/\.html$/i, "");
    if (!p) return;

    const seg = p.split("/");
    // lang/city/slug -> fixable; lang/city -> only needs .html
    if (seg.length >= 3) {
      const [lang, ...rest] = seg;
      const key = rest.slice(-2).join("/");
      const fixed = CITY_FIX[key];
      if (fixed) p = lang + "/" + fixed;
    }

    const target = "/explore/" + p + ".html";
    if (target === incoming) return; // nothing to do - let it 404 honestly
    throw redirect({ href: target, statusCode: 301 });
  },
});
