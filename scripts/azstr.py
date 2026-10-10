# -*- coding: utf-8 -*-
"""Azerbaijani.

Like Georgian and Hindi, the existing explore/az/ pages were built by the v3
generator with their headings left in English ("The story", "Key facts"), so
nothing could be lifted from them — this chrome is written fresh. The guide
text, titles, facts and tips still come from the database untouched.

Azerbaijani marks place with a locative suffix that has to harmonise with the
preceding vowel, and the database stores city names in Latin script from other
languages, so a suffix cannot be attached safely. The location is therefore
given after a colon in the bare nominative ("Yeri: Istanbul, Türkiyə") and FAQ
questions put the attraction name before a colon. There are no articles and
numerals take a singular noun, so no article or plural tables are needed.
"""
import re as _re
SEC={'story':'Tarixi','facts':'Əsas faktlar','look':'Nəyə diqqət yetirməli',
     'tips':'Praktiki məsləhətlər','faq':'Tez-tez verilən suallar','map':'Xəritədə',
     'visitor':'Ziyarətçi məlumatı','more':'Daha nə görmək olar —'}
ROW={'time':'Nə qədər vaxt lazımdır','audio':'Lokali audio bələdçisi','type':'Növ',
     'best':'Kimlər üçün','loc':'Yeri','coord':'Koordinatlar','langs':'Dillər'}
UI={'badge':'Pulsuz audio bələdçi','begin':'Başla','open':'Lokali tətbiqini aç',
    'verified':'2026-cı ilin oktyabrında yoxlanılıb','howwrite':'bu bələdçiləri necə yazırıq',
    'maps':'Google Maps-də aç','allcities':'Bütün şəhərlər','editorial':'Redaksiya prosesi',
    'guidesin':'Audio bələdçilər —','langval':'45 dil, Lokali tətbiqində','free':'pulsuz',
    'min':'dəq','getapp':'Tətbiqi yüklə'}
CAT={'history':'Tarix','photography':'Fotoqrafiya','authentic':'Autentik','romantic':'Romantik',
     'family':'Ailələr üçün','editors':'Redaksiyanın seçimi','nature':'Təbiət','art':'İncəsənət',
     'architecture':'Memarlıq','food':'Yemək'}
T={'Archaeological Site':'arxeoloji abidə','Museum':'muzey','Mosque':'məscid','Neighborhood':'məhəllə',
 'Beach':'çimərlik','Historic Town':'tarixi şəhər','Palace':'saray','Waterfall':'şəlalə',
 'Viewpoint':'mənzərə nöqtəsi','Park':'park','Canyon':'kanyon','Lake':'göl','Tower':'qüllə',
 'Mountain':'dağ','Village':'kənd','Market':'bazar','Monastery':'monastır','Town':'şəhər',
 'Castle':'qala','Neolithic Site':'neolit abidəsi','Church':'kilsə','Street':'küçə',
 'Sea Castle':'dəniz qalası','Salt Lake':'duzlu göl','Ancient Wonder Site':'qədim dünya möcüzəsi',
 'Monument':'abidə','Cable Car':'kanat yolu','Historic District':'tarixi məhəllə',
 'Beach and Ruins':'xarabalıqlı çimərlik','Natural Site':'təbiət abidəsi',
 'Rock Formations':'qaya formasiyaları','Islands':'adalar qrupu','Fortress':'qala',
 'Gorge':'dərə','Ancient Town':'antik şəhər','Square':'meydan','Ancient Temple':'antik məbəd',
 'Rock Fortress':'qaya qalası','Island Church':'adadakı kilsə','Ruined City':'xaraba şəhər',
 'Mausoleum':'məqbərə','Ancient Theater':'antik teatr','Highland Plateau':'yüksək yayla',
 'Sacred Pool':'müqəddəs hovuz','Cistern':'yeraltı su anbarı','Waterway':'su yolu',
 'Beach Valley':'sahil vadisi','Region':'bölgə','Bathhouse':'tarixi hamam',
 'Natural Phenomenon':'təbiət hadisəsi','Historic Village':'tarixi kənd',
 'Ancient Tombs':'antik nekropol','Underground City':'yeraltı şəhər','City Walls':'şəhər divarları',
 'Memorial Site':'memorial','Rock Churches':'qaya kilsələri','Sunken Town':'batmış şəhər',
 'Historic Square':'tarixi meydan','Religious Site':'ziyarətgah','Cathedral':'kafedral',
 'Temple':'məbəd','Garden':'bağ','Island':'ada','Valley':'vadi','Bazaar':'bazar','Bridge':'körpü',
 'Ruins':'xarabalıqlar','Historic Site':'tarixi abidə','Historical Site':'tarixi abidə',
 'Landmark':'görməli yer','Sunken Ruins':'sualtı xarabalıqlar','Abandoned Village':'tərk edilmiş kənd',
 'Ghost Town':'kabus şəhər','Historic Café':'tarixi kafe','Pilgrimage Site':'ziyarət yeri',
 'Museum Complex':'muzey kompleksi','Stadium':'stadion','Cinema':'kinoteatr','Basilica':'bazilika',
 'Food Market':'ərzaq bazarı','Religious Complex':'dini kompleks','Skyscraper':'göydələn',
 'Shrine':'ziyarətgah'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','saat',s); s=_re.sub(r'\bmin(utes)?\b','dəq',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"{t}: baxmaq üçün nə qədər vaxt lazımdır?",
        (f"Ziyarətçilərin çoxu burada {vis} keçirir. " if vis else "")+
        f"Lokali-nin pulsuz audio bələdçisi {mins} dəqiqə çəkir və gəzə-gəzə dinlənilir."),
       (f"{t}: pulsuz audio bələdçi varmı?",
        f"Bəli — Lokali tətbiqi bu yer haqqında 45 dildə pulsuz danışır. Bilet, qrup və abunə "
        f"tələb olunmur; yükləndikdən sonra oflayn da işləyir.")]
    if lat is not None:
        o.append((f"{t}: harada yerləşir?",
          f"Yeri: {city}, {country}; koordinatlar {lat}, {lng}. "
          f"Marşrutu açmaq üçün bu səhifədəki xəritə keçidinə toxunun."))
    if tips: o.append((f"{t}: ziyarətdən əvvəl nə bilmək lazımdır?", tips[0]))
    if kfs:  o.append((f"{t}: bu yer nə ilə məşhurdur?", kfs[0]))
    TW=_re.compile(r'(?i)(səhər|günorta|axşam|gün doğ|gün bat|erkən|gec|mövsüm|yay|qış|yaz|payız|'
                   r'həftə sonu|işıq|növbə|izdiham|sıx)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"{t}: nə vaxt getmək daha yaxşıdır?", tt[0]))
    return o
LOCALE='az_AZ'
TITLE='{t}, {city} — pulsuz audio bələdçi | Lokali'
TITLE_SHORT='{t} — pulsuz audio bələdçi | Lokali'
HUB_TITLE='{city} — {n} pulsuz audio bələdçi | Lokali'
HUB_TITLE_SHORT='{city} — {n} audio bələdçi | Lokali'
HUB_DESC="{city} üçün {n} pulsuz Lokali audio bələdçisi: {names}. Nə qədər vaxt lazımdır, nəyə diqqət yetirməli və praktiki məsləhətlər. Oflayn, biletsiz."
HUB_INTRO="Lokali-nin {city} üçün {n} pulsuz audio bələdçisi var. Hamısı 45 dildə səslənir, bilet və ya ekskursiya qrupu tələb etmir və yükləndikdən sonra oflayn işləyir."
SENT={'is':'{t} — {tp}. Yeri: {where}.','in':'{t}. Yeri: {where}.',
      'spend':'Ziyarətçilərin çoxu burada {vis} keçirir.',
      'runs':'Lokali-nin pulsuz audio bələdçisi {n} dəqiqə çəkir.',
      'route':'Olduğunuz yerdən marşrut — {t}.'}
COUNTRY={'türkiye':'Türkiyə','greece':'Yunanıstan','italy':'İtaliya','france':'Fransa',
 'spain':'İspaniya','germany':'Almaniya','austria':'Avstriya','georgia':'Gürcüstan',
 'india':'Hindistan','japan':'Yaponiya','china':'Çin','egypt':'Misir','poland':'Polşa',
 'czechia':'Çexiya','united-kingdom':'Böyük Britaniya','united-states':'ABŞ',
 'netherlands':'Niderland','russia':'Rusiya','thailand':'Tayland','romania':'Rumıniya',
 'israel':'İsrail','morocco':'Mərakeş','mexico':'Meksika','portugal':'Portuqaliya',
 'sweden':'İsveç','denmark':'Danimarka','finland':'Finlandiya','iceland':'İslandiya',
 'switzerland':'İsveçrə','hungary':'Macarıstan','croatia':'Xorvatiya','cyprus':'Kipr',
 'jordan':'İordaniya','iran':'İran','vietnam':'Vyetnam','indonesia':'İndoneziya',
 'singapore':'Sinqapur','south-korea':'Cənubi Koreya','malaysia':'Malayziya','taiwan':'Tayvan',
 'brazil':'Braziliya','argentina':'Argentina','peru':'Peru','chile':'Çili','colombia':'Kolumbiya',
 'canada':'Kanada','australia':'Avstraliya','new-zealand':'Yeni Zelandiya',
 'south-africa':'Cənubi Afrika','kazakhstan':'Qazaxıstan','madagascar':'Madaqaskar',
 'ireland':'İrlandiya','belgium':'Belçika','norway':'Norveç','nepal':'Nepal',
 'pakistan':'Pakistan','cambodia':'Kamboca','philippines':'Filippin'}
def hub_faq(city,n):
    return [(f"{city}: neçə pulsuz audio bələdçi var?",
             f"{n}. Hamısı pulsuzdur, 45 dildə səslənir və oflayn işləyir."),
            (f"{city}: audio bələdçi həqiqətən pulsuzdur?",
             "Bəli. Bilet, ekskursiya qrupu və abunə tələb olunmur — "
             "bələdçilər öz telefonunuzda səslənir.")]
def more_heading(city): return f'{city} — daha nə görmək olar'
def guides_in(country): return f'Audio bələdçilər — {country}'
# lib.deacc does not know the Azerbaijani schwa, and a slug cannot keep it
_AZ={'ə':'e','Ə':'e'}
def translit(s):
    return ''.join(_AZ.get(c,c) for c in (s or ''))
