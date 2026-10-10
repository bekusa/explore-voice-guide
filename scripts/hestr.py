# -*- coding: utf-8 -*-
"""Hebrew. Section headings lifted from the existing explore/he/ pages.

Right-to-left. No indefinite article, so a type is just the noun. Slugs borrow
the English page's slug (USE_EN_SLUG) because the existing Hebrew pages already
live there.
"""
import re as _re
USE_EN_SLUG=True
DIR='rtl'
SEC={'story':'הסיפור','facts':'עובדות מרכזיות','look':'מה לחפש',
     'tips':'טיפים מעשיים','faq':'שאלות נפוצות','map':'על המפה',
     'visitor':'מידע למבקרים','more':'מה עוד לראות ב-'}
ROW={'time':'כמה זמן צריך','audio':'מדריך האודיו של Lokali','type':'סוג','best':'מתאים ל',
     'loc':'מיקום','coord':'קואורדינטות','langs':'שפות'}
UI={'badge':'מדריך אודיו חינם','begin':'התחלה','open':'פתחו את אפליקציית Lokali',
    'verified':'נבדק באוקטובר 2026','howwrite':'איך אנחנו כותבים את המדריכים',
    'maps':'פתחו ב-Google Maps','allcities':'כל הערים','editorial':'תהליך העריכה',
    'guidesin':'מדריכי אודיו ב-','langval':'45 שפות, באפליקציית Lokali','free':'חינם',
    'min':'דק׳','getapp':'הורידו את האפליקציה'}
CAT={'history':'היסטוריה','photography':'צילום','authentic':'אווירה מקומית','romantic':'רומנטי',
     'family':'משפחות','editors':'בחירת המערכת','nature':'טבע','art':'אמנות',
     'architecture':'אדריכלות','food':'אוכל'}
T={'Archaeological Site':'אתר ארכיאולוגי','Museum':'מוזיאון','Mosque':'מסגד','Neighborhood':'שכונה',
 'Beach':'חוף','Historic Town':'עיר היסטורית','Palace':'ארמון','Waterfall':'מפל',
 'Viewpoint':'נקודת תצפית','Park':'פארק','Canyon':'קניון','Lake':'אגם','Tower':'מגדל','Mountain':'הר',
 'Village':'כפר','Market':'שוק','Monastery':'מנזר','Town':'עיר','Castle':'טירה',
 'Neolithic Site':'אתר ניאוליתי','Church':'כנסייה','Street':'רחוב','Sea Castle':'מצודת ים',
 'Salt Lake':'אגם מלח','Ancient Wonder Site':'פלא מהעולם העתיק','Monument':'אנדרטה',
 'Cable Car':'רכבל','Historic District':'רובע היסטורי','Beach and Ruins':'חוף עם חורבות',
 'Natural Site':'אתר טבע','Rock Formations':'מבנֵי סלע','Islands':'ארכיפלג','Fortress':'מבצר',
 'Gorge':'ערוץ','Ancient Town':'עיר עתיקה','Square':'כיכר','Ancient Temple':'מקדש עתיק',
 'Rock Fortress':'מבצר סלע','Island Church':'כנסייה על אי','Ruined City':'עיר חרבה',
 'Mausoleum':'מאוזוליאום','Ancient Theater':'תיאטרון עתיק','Highland Plateau':'רמה גבוהה',
 'Sacred Pool':'בריכה מקודשת','Cistern':'בור מים תת-קרקעי','Waterway':'נתיב מים',
 'Beach Valley':'עמק חופי','Region':'אזור','Bathhouse':'בית מרחץ היסטורי',
 'Natural Phenomenon':'תופעת טבע','Historic Village':'כפר היסטורי','Ancient Tombs':'קברים עתיקים',
 'Underground City':'עיר תת-קרקעית','City Walls':'חומות העיר','Memorial Site':'אתר הנצחה',
 'Rock Churches':'כנסיות סלע','Sunken Town':'עיר טבועה','Historic Square':'כיכר היסטורית',
 'Religious Site':'אתר דתי','Cathedral':'קתדרלה','Temple':'מקדש','Garden':'גן','Island':'אי',
 'Valley':'עמק','Bazaar':'בזאר','Bridge':'גשר','Ruins':'חורבות','Historic Site':'אתר היסטורי',
 'Historical Site':'אתר היסטורי','Landmark':'ציון דרך','Sunken Ruins':'חורבות טבועות',
 'Abandoned Village':'כפר נטוש','Ghost Town':'עיר רפאים','Historic Café':'בית קפה היסטורי',
 'Pilgrimage Site':'אתר עלייה לרגל','Museum Complex':'מתחם מוזיאונים','Stadium':'אצטדיון',
 'Cinema':'בית קולנוע','Basilica':'בזיליקה','Food Market':'שוק מזון',
 'Religious Complex':'מתחם דתי','Skyscraper':'גורד שחקים','Shrine':'מקום קדוש'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','שעות',s); s=_re.sub(r'\bmin(utes)?\b','דק׳',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"כמה זמן לוקח הביקור ב{t}?",
        (f"רוב המבקרים שוהים {vis}. " if vis else "")+
        f"מדריך האודיו החינמי של Lokali נמשך {mins} דקות ואפשר להאזין לו תוך כדי הליכה."),
       (f"יש מדריך אודיו חינם ל{t}?",
        f"כן — אפליקציית Lokali מספרת על המקום בחינם ב-45 שפות. בלי כרטיס, בלי קבוצה "
        f"ובלי מנוי; אחרי ההורדה היא עובדת גם במצב לא מקוון.")]
    if lat is not None:
        o.append((f"איפה נמצא {t}?",
          f"מיקום: {city}, {country}; קואורדינטות {lat}, {lng}. "
          f"הקישו על קישור המפה בעמוד הזה כדי לפתוח מסלול."))
    if tips: o.append((f"מה כדאי לדעת לפני ביקור ב{t}?", tips[0]))
    if kfs:  o.append((f"במה {t} מפורסם?", kfs[0]))
    TW=_re.compile(r'(בוקר|צהריים|אחר הצהריים|ערב|זריחה|שקיעה|מוקדם|מאוחר|עונה|קיץ|חורף|אביב|'
                   r'סתיו|סוף שבוע|אור|תור|עומס|צפוף)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"מתי הכי כדאי לבקר ב{t}?", tt[0]))
    return o
LOCALE='he_IL'
TITLE='{t}, {city} — מדריך אודיו חינם | Lokali'
TITLE_SHORT='{t} — מדריך אודיו חינם | Lokali'
HUB_TITLE='{city} — {n} מדריכי אודיו חינם | Lokali'
HUB_TITLE_SHORT='{city} — {n} מדריכי אודיו | Lokali'
HUB_DESC="{n} מדריכי אודיו חינם של Lokali ב-{city}: {names}. כמה זמן צריך, מה לחפש וטיפים מעשיים. עובד לא מקוון, בלי כרטיס."
HUB_INTRO="ל-Lokali יש {n} מדריכי אודיו חינם ב-{city}. כולם ב-45 שפות, בלי כרטיס ובלי קבוצה מאורגנת, ואחרי ההורדה הם עובדים גם לא מקוון."
SENT={'is':'{t} הוא {tp} ב-{where}.','in':'{t} נמצא ב-{where}.',
      'spend':'רוב המבקרים שוהים {vis}.',
      'runs':'מדריך האודיו החינמי של Lokali נמשך {n} דקות.',
      'route':'פתחו מסלול אל {t} מהמיקום שלכם.'}
COUNTRY={'türkiye':'טורקיה','greece':'יוון','italy':'איטליה','france':'צרפת','spain':'ספרד',
 'germany':'גרמניה','austria':'אוסטריה','georgia':'גאורגיה','india':'הודו','japan':'יפן',
 'china':'סין','egypt':'מצרים','poland':'פולין','czechia':'צ׳כיה','united-kingdom':'בריטניה',
 'united-states':'ארצות הברית','netherlands':'הולנד','russia':'רוסיה','thailand':'תאילנד',
 'romania':'רומניה','israel':'ישראל','morocco':'מרוקו','mexico':'מקסיקו','portugal':'פורטוגל',
 'sweden':'שוודיה','denmark':'דנמרק','finland':'פינלנד','iceland':'איסלנד','switzerland':'שווייץ',
 'hungary':'הונגריה','croatia':'קרואטיה','cyprus':'קפריסין','jordan':'ירדן','iran':'איראן',
 'vietnam':'וייטנאם','indonesia':'אינדונזיה','singapore':'סינגפור','south-korea':'קוריאה הדרומית',
 'malaysia':'מלזיה','taiwan':'טייוואן','brazil':'ברזיל','argentina':'ארגנטינה','peru':'פרו',
 'chile':'צ׳ילה','colombia':'קולומביה','canada':'קנדה','australia':'אוסטרליה',
 'new-zealand':'ניו זילנד','south-africa':'דרום אפריקה','kazakhstan':'קזחסטן',
 'madagascar':'מדגסקר','ireland':'אירלנד','belgium':'בלגיה','norway':'נורווגיה','nepal':'נפאל',
 'pakistan':'פקיסטן','cambodia':'קמבודיה','philippines':'הפיליפינים'}
def hub_faq(city,n):
    return [(f"כמה מדריכי אודיו חינם יש ב-{city}?",
             f"{n}. כולם בחינם, ב-45 שפות, ועובדים גם לא מקוון."),
            (f"מדריך האודיו של {city} באמת חינם?",
             "כן. בלי כרטיס, בלי קבוצה מאורגנת ובלי מנוי — המדריכים מתנגנים בטלפון שלכם.")]

def more_heading(city): return f"מה עוד לראות ב-{city}"
def guides_in(country): return f"מדריכי אודיו ב-{country}"
