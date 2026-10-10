# -*- coding: utf-8 -*-
"""Dutch. Section headings lifted from the existing explore/nl/ pages."""
SEC={'story':'Het verhaal','facts':'Belangrijkste feiten','look':'Waar je op moet letten',
     'tips':'Praktische tips','faq':'Veelgestelde vragen','map':'Op de kaart',
     'visitor':'Bezoekersinfo','more':'Ook te zien in'}
ROW={'time':'Hoelang je nodig hebt','audio':'Lokali-audiogids','type':'Soort','best':'Ideaal voor',
     'loc':'Locatie','coord':'Coördinaten','langs':'Talen'}
UI={'badge':'Gratis audiogids','begin':'Begin','open':'Open de Lokali-app',
    'verified':'Gecontroleerd in oktober 2026','howwrite':'hoe we deze gidsen schrijven',
    'maps':'Openen in Google Maps','allcities':'Alle steden','editorial':'Redactioneel proces',
    'guidesin':'Gidsen in','langval':'45 talen, in de Lokali-app','free':'gratis',
    'min':'min','getapp':'App downloaden'}
CAT={'history':'Geschiedenis','photography':'Fotografie','authentic':'Authentiek',
     'romantic':'Romantisch','family':'Gezinnen','editors':'Redactiekeuze',
     'nature':'Natuur','art':'Kunst','architecture':'Architectuur','food':'Eten'}
# Dutch takes "een" for every gender, so no article table is needed.
T={'Archaeological Site':'archeologische vindplaats','Museum':'museum','Mosque':'moskee',
 'Neighborhood':'wijk','Beach':'strand','Historic Town':'historische stad','Palace':'paleis',
 'Waterfall':'waterval','Viewpoint':'uitzichtpunt','Park':'park','Canyon':'kloof','Lake':'meer',
 'Tower':'toren','Mountain':'berg','Village':'dorp','Market':'markt','Monastery':'klooster',
 'Town':'stad','Castle':'kasteel','Neolithic Site':'neolithische vindplaats','Church':'kerk',
 'Street':'straat','Sea Castle':'zeefort','Salt Lake':'zoutmeer',
 'Ancient Wonder Site':'antiek wereldwonder','Monument':'monument','Cable Car':'kabelbaan',
 'Historic District':'historische wijk','Beach and Ruins':'strand met ruïnes',
 'Natural Site':'natuurgebied','Rock Formations':'rotsformatie','Islands':'eilandengroep',
 'Fortress':'vesting','Gorge':'kloof','Ancient Town':'antieke stad','Square':'plein',
 'Ancient Temple':'antieke tempel','Rock Fortress':'rotsvesting','Island Church':'eilandkerk',
 'Ruined City':'ruïnestad','Mausoleum':'mausoleum','Ancient Theater':'antiek theater',
 'Highland Plateau':'hoogvlakte','Sacred Pool':'heilige vijver','Cistern':'ondergronds waterreservoir',
 'Waterway':'waterweg','Beach Valley':'kustdal','Region':'regio','Bathhouse':'historisch badhuis',
 'Natural Phenomenon':'natuurverschijnsel','Historic Village':'historisch dorp',
 'Ancient Tombs':'antieke grafheuvels','Underground City':'ondergrondse stad',
 'City Walls':'stadsmuur','Memorial Site':'gedenkplaats','Rock Churches':'rotskerken',
 'Sunken Town':'verzonken stad','Historic Square':'historisch plein',
 'Religious Site':'religieuze plek','Cathedral':'kathedraal','Temple':'tempel','Garden':'tuin',
 'Island':'eiland','Valley':'vallei','Bazaar':'bazaar','Bridge':'brug','Ruins':'ruïnecomplex',
 'Historic Site':'historische plek','Historical Site':'historische plek',
 'Landmark':'bezienswaardigheid','Sunken Ruins':'verzonken ruïnes',
 'Abandoned Village':'verlaten dorp','Ghost Town':'spookstad','Historic Café':'historisch café',
 'Pilgrimage Site':'bedevaartsoord','Museum Complex':'museumcomplex','Stadium':'stadion',
 'Cinema':'bioscoop','Basilica':'basiliek','Food Market':'voedselmarkt',
 'Religious Complex':'religieus complex','Skyscraper':'wolkenkrabber','Shrine':'heiligdom'}
def type_phrase(t):
    n=T.get(t)
    return f'een {n}' if n else None
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','uur',s); s=re.sub(r'\bmin(utes)?\b','min',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"Hoeveel tijd heb je nodig voor {t}?",
        (f"De meeste bezoekers blijven {vis}. " if vis else "")+
        f"De gratis Lokali-audiogids duurt {mins} minuten en luister je al wandelend."),
       (f"Is er een gratis audiogids voor {t}?",
        f"Ja — de Lokali-app vertelt {t} gratis in 45 talen. Geen ticket, geen groep en geen "
        f"abonnement; na het downloaden werkt de app ook offline.")]
    if lat is not None:
        o.append((f"Waar ligt {t}?",
          f"{t} ligt in {city}, {country}, op {lat}, {lng}. "
          f"Tik op de kaartlink op deze pagina om de route te openen."))
    if tips: o.append((f"Wat moet je weten voor een bezoek aan {t}?", tips[0]))
    if kfs:  o.append((f"Waar staat {t} om bekend?", kfs[0]))
    import re as _re
    TW=_re.compile(r'(?i)(ochtend|middag|avond|zonsopgang|zonsondergang|vroeg|laat|seizoen|'
                   r'zomer|winter|lente|herfst|weekend|licht|rij|drukte|menigte)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"Wanneer kun je {t} het beste bezoeken?", tt[0]))
    return o
LOCALE='nl_NL'
TITLE='{t}, {city} — Gratis audiogids | Lokali'
TITLE_SHORT='{t} — Gratis audiogids | Lokali'
HUB_TITLE='{city} — {n} gratis audiogidsen | Lokali'
HUB_TITLE_SHORT='{city} — {n} audiogidsen | Lokali'
HUB_DESC="{n} gratis Lokali-audiogidsen voor {city}: {names}. Bezoekduur, waar je op moet letten en praktische tips — offline, zonder ticket."
HUB_INTRO="Lokali heeft {n} gratis audiogidsen voor {city}. Elke gids klinkt in 45 talen, vraagt geen ticket en geen reisgroep en werkt offline na het downloaden."
SENT={'is':'{t} is {tp} in {where}.','in':'{t} ligt in {where}.',
      'spend':'De meeste bezoekers blijven {vis}.',
      'runs':'De gratis Lokali-audiogids duurt {n} minuten.',
      'route':'Open de route naar {t} vanaf je locatie.'}
COUNTRY={'türkiye':'Turkije','greece':'Griekenland','italy':'Italië','france':'Frankrijk',
 'spain':'Spanje','germany':'Duitsland','austria':'Oostenrijk','georgia':'Georgië','india':'India',
 'japan':'Japan','china':'China','egypt':'Egypte','poland':'Polen','czechia':'Tsjechië',
 'united-kingdom':'Verenigd Koninkrijk','united-states':'Verenigde Staten','netherlands':'Nederland',
 'russia':'Rusland','thailand':'Thailand','romania':'Roemenië','israel':'Israël','morocco':'Marokko',
 'mexico':'Mexico','portugal':'Portugal','sweden':'Zweden','denmark':'Denemarken','finland':'Finland',
 'iceland':'IJsland','switzerland':'Zwitserland','hungary':'Hongarije','croatia':'Kroatië',
 'cyprus':'Cyprus','jordan':'Jordanië','iran':'Iran','vietnam':'Vietnam','indonesia':'Indonesië',
 'singapore':'Singapore','south-korea':'Zuid-Korea','malaysia':'Maleisië','taiwan':'Taiwan',
 'brazil':'Brazilië','argentina':'Argentinië','peru':'Peru','chile':'Chili','colombia':'Colombia',
 'canada':'Canada','australia':'Australië','new-zealand':'Nieuw-Zeeland','south-africa':'Zuid-Afrika',
 'kazakhstan':'Kazachstan','madagascar':'Madagaskar','ireland':'Ierland','belgium':'België',
 'norway':'Noorwegen','nepal':'Nepal','pakistan':'Pakistan','cambodia':'Cambodja',
 'philippines':'Filipijnen'}
def hub_faq(city,n):
    return [(f"Hoeveel gratis audiogidsen zijn er voor {city}?",
             f"{n}. Allemaal gratis, in 45 talen, en ze werken offline."),
            (f"Is de audiogids van {city} echt gratis?",
             "Ja. Geen ticket, geen reisgroep, geen abonnement — de gidsen spelen op je eigen telefoon.")]
