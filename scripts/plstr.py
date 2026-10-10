# -*- coding: utf-8 -*-
"""Polish. Section headings lifted from the existing explore/pl/ pages.

Two things shape the wording. Polish has no articles, so a type is just the
noun. And Polish declines place names, which we cannot do for the Latin city
names the database stores, so the location is given after a colon in the
nominative ("Lokalizacja: Istanbul, Turcja") rather than inside the sentence.
"""
SEC={'story':'Historia','facts':'Najważniejsze fakty','look':'Na co zwrócić uwagę',
     'tips':'Praktyczne wskazówki','faq':'Najczęstsze pytania','map':'Na mapie',
     'visitor':'Informacje dla zwiedzających','more':'Zobacz także w mieście'}
ROW={'time':'Ile czasu potrzeba','audio':'Audioprzewodnik Lokali','type':'Rodzaj',
     'best':'Idealne dla','loc':'Lokalizacja','coord':'Współrzędne','langs':'Języki'}
UI={'badge':'Bezpłatny audioprzewodnik','begin':'Zacznij','open':'Otwórz aplikację Lokali',
    'verified':'Zweryfikowano w październiku 2026','howwrite':'jak powstają nasze przewodniki',
    'maps':'Otwórz w Mapach Google','allcities':'Wszystkie miasta','editorial':'Proces redakcyjny',
    'guidesin':'Przewodniki w kraju','langval':'45 języków, w aplikacji Lokali','free':'bezpłatnie',
    'min':'min','getapp':'Pobierz aplikację'}
CAT={'history':'Historia','photography':'Fotografia','authentic':'Autentyczne',
     'romantic':'Romantyczne','family':'Rodziny','editors':'Wybór redakcji','nature':'Przyroda',
     'art':'Sztuka','architecture':'Architektura','food':'Jedzenie'}
T={'Archaeological Site':'stanowisko archeologiczne','Museum':'muzeum','Mosque':'meczet',
 'Neighborhood':'dzielnica','Beach':'plaża','Historic Town':'zabytkowe miasto','Palace':'pałac',
 'Waterfall':'wodospad','Viewpoint':'punkt widokowy','Park':'park','Canyon':'kanion','Lake':'jezioro',
 'Tower':'wieża','Mountain':'góra','Village':'wieś','Market':'targ','Monastery':'klasztor',
 'Town':'miasto','Castle':'zamek','Neolithic Site':'stanowisko neolityczne','Church':'kościół',
 'Street':'ulica','Sea Castle':'twierdza morska','Salt Lake':'słone jezioro',
 'Ancient Wonder Site':'cud starożytnego świata','Monument':'pomnik','Cable Car':'kolej linowa',
 'Historic District':'zabytkowa dzielnica','Beach and Ruins':'plaża z ruinami',
 'Natural Site':'obszar przyrodniczy','Rock Formations':'formacja skalna','Islands':'archipelag',
 'Fortress':'twierdza','Gorge':'wąwóz','Ancient Town':'starożytne miasto','Square':'plac',
 'Ancient Temple':'starożytna świątynia','Rock Fortress':'twierdza skalna',
 'Island Church':'kościół na wyspie','Ruined City':'miasto w ruinie','Mausoleum':'mauzoleum',
 'Ancient Theater':'starożytny teatr','Highland Plateau':'wyżynny płaskowyż',
 'Sacred Pool':'święty staw','Cistern':'podziemny zbiornik wodny','Waterway':'szlak wodny',
 'Beach Valley':'nadmorska dolina','Region':'region','Bathhouse':'zabytkowa łaźnia',
 'Natural Phenomenon':'zjawisko przyrodnicze','Historic Village':'zabytkowa wieś',
 'Ancient Tombs':'starożytna nekropolia','Underground City':'podziemne miasto',
 'City Walls':'mury miejskie','Memorial Site':'miejsce pamięci','Rock Churches':'kościoły skalne',
 'Sunken Town':'zatopione miasto','Historic Square':'zabytkowy plac',
 'Religious Site':'miejsce kultu','Cathedral':'katedra','Temple':'świątynia','Garden':'ogród',
 'Island':'wyspa','Valley':'dolina','Bazaar':'bazar','Bridge':'most','Ruins':'zespół ruin',
 'Historic Site':'zabytek','Historical Site':'zabytek','Landmark':'charakterystyczny obiekt',
 'Sunken Ruins':'zatopione ruiny','Abandoned Village':'opuszczona wieś',
 'Ghost Town':'miasto duchów','Historic Café':'zabytkowa kawiarnia',
 'Pilgrimage Site':'miejsce pielgrzymek','Museum Complex':'kompleks muzealny','Stadium':'stadion',
 'Cinema':'kino','Basilica':'bazylika','Food Market':'targ spożywczy',
 'Religious Complex':'kompleks sakralny','Skyscraper':'wieżowiec','Shrine':'sanktuarium'}
def type_phrase(t): return T.get(t)
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','godz.',s); s=re.sub(r'\bmin(utes)?\b','min',s)
    return s
def _pl(n,one,few,many):
    if n==1: return one
    if n%10 in (2,3,4) and n%100 not in (12,13,14): return few
    return many
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"{t}: ile czasu trzeba na zwiedzanie?",
        (f"Większość zwiedzających spędza tu {vis}. " if vis else "")+
        f"Bezpłatny audioprzewodnik Lokali trwa {mins} min i słucha się go w marszu."),
       (f"{t}: czy jest bezpłatny audioprzewodnik?",
        f"Tak — aplikacja Lokali opowiada o tym miejscu bezpłatnie w 45 językach. Bez biletu, "
        f"bez grupy i bez abonamentu; po pobraniu działa offline.")]
    if lat is not None:
        o.append((f"{t}: gdzie się znajduje?",
          f"Lokalizacja: {city}, {country}; współrzędne {lat}, {lng}. "
          f"Dotknij linku do mapy na tej stronie, aby wyznaczyć trasę."))
    if tips: o.append((f"{t}: co warto wiedzieć przed wizytą?", tips[0]))
    if kfs:  o.append((f"{t}: z czego słynie to miejsce?", kfs[0]))
    import re as _re
    TW=_re.compile(r'(?i)(rano|poranek|popołudni|wieczor|wschód|zachód|wcześnie|późn|sezon|'
                   r'lat[oa]|zim[ąa]|wiosn|jesien|weekend|światł|kolejk|tłum)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"{t}: kiedy najlepiej przyjść?", tt[0]))
    return o
LOCALE='pl_PL'
TITLE='{t}, {city} — bezpłatny audioprzewodnik | Lokali'
TITLE_SHORT='{t} — bezpłatny audioprzewodnik | Lokali'
HUB_TITLE='{city} — {n} bezpłatnych audioprzewodników | Lokali'
HUB_TITLE_SHORT='{city} — {n} audioprzewodników | Lokali'
HUB_DESC="{n} bezpłatnych audioprzewodników Lokali — {city}: {names}. Ile czasu potrzeba, na co zwrócić uwagę i praktyczne wskazówki. Offline, bez biletu."
HUB_INTRO="Lokali ma {n} bezpłatnych audioprzewodników po mieście {city}."
SENT={'is':'{t} — {tp}. Lokalizacja: {where}.','in':'{t}. Lokalizacja: {where}.',
      'spend':'Większość zwiedzających spędza tu {vis}.',
      'runs':'Bezpłatny audioprzewodnik Lokali trwa {n} min.',
      'route':'Trasa do celu: {t}.'}
COUNTRY={'türkiye':'Turcja','greece':'Grecja','italy':'Włochy','france':'Francja','spain':'Hiszpania',
 'germany':'Niemcy','austria':'Austria','georgia':'Gruzja','india':'Indie','japan':'Japonia',
 'china':'Chiny','egypt':'Egipt','poland':'Polska','czechia':'Czechy',
 'united-kingdom':'Wielka Brytania','united-states':'USA','netherlands':'Holandia','russia':'Rosja',
 'thailand':'Tajlandia','romania':'Rumunia','israel':'Izrael','morocco':'Maroko','mexico':'Meksyk',
 'portugal':'Portugalia','sweden':'Szwecja','denmark':'Dania','finland':'Finlandia',
 'iceland':'Islandia','switzerland':'Szwajcaria','hungary':'Węgry','croatia':'Chorwacja',
 'cyprus':'Cypr','jordan':'Jordania','iran':'Iran','vietnam':'Wietnam','indonesia':'Indonezja',
 'singapore':'Singapur','south-korea':'Korea Południowa','malaysia':'Malezja','taiwan':'Tajwan',
 'brazil':'Brazylia','argentina':'Argentyna','peru':'Peru','chile':'Chile','colombia':'Kolumbia',
 'canada':'Kanada','australia':'Australia','new-zealand':'Nowa Zelandia','south-africa':'RPA',
 'kazakhstan':'Kazachstan','madagascar':'Madagaskar','ireland':'Irlandia','belgium':'Belgia',
 'norway':'Norwegia','nepal':'Nepal','pakistan':'Pakistan','cambodia':'Kambodża',
 'philippines':'Filipiny'}
def hub_text(city,n,names):
    g=_pl(n,'bezpłatny audioprzewodnik','bezpłatne audioprzewodniki','bezpłatnych audioprzewodników')
    t=f'{city} — {n} {g} | Lokali'
    d=(f'{n} {g} Lokali — {city}: {names}. Ile czasu potrzeba, na co zwrócić uwagę '
       f'i praktyczne wskazówki. Offline, bez biletu.')
    i=(f'Lokali ma {n} {g} po mieście {city}. Wszystkie brzmią w 45 językach, nie wymagają '
       f'biletu ani grupy z przewodnikiem i po pobraniu działają offline.')
    return t,d,i
def hub_text_short(city,n):
    return f'{city} — {n} {_pl(n,"audioprzewodnik","audioprzewodniki","audioprzewodników")} | Lokali'
def hub_faq(city,n):
    g=_pl(n,'bezpłatny audioprzewodnik','bezpłatne audioprzewodniki','bezpłatnych audioprzewodników')
    return [(f'{city}: ile jest bezpłatnych audioprzewodników?',
             f'{n}. Wszystkie są bezpłatne, brzmią w 45 językach i działają offline.'),
            (f'{city}: czy audioprzewodnik jest naprawdę bezpłatny?',
             'Tak. Bez biletu, bez grupy z przewodnikiem i bez abonamentu — '
             'przewodniki odtwarzasz na własnym telefonie.')]
