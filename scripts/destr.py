# -*- coding: utf-8 -*-
"""German strings. Reconstructed verbatim from the live /explore/de/ pages after
the original module was lost, so regenerating does not change any page text."""
SEC={'story':'Die Geschichte','facts':'Fakten im Überblick','look':'Worauf du achten solltest',
     'tips':'Praktische Tipps','faq':'Häufige Fragen','map':'Auf der Karte',
     'visitor':'Besucherinfos','more':'Guides in'}
ROW={'time':'Zeitbedarf','audio':'Lokali-Audioguide','type':'Art','best':'Ideal für',
     'loc':'Ort','coord':'Koordinaten','langs':'Sprachen'}
UI={'badge':'Kostenloser Audioguide','begin':'Los','open':'Lokali-App öffnen',
    'verified':'Geprüft im Oktober 2026','howwrite':'wie wir diese Guides schreiben',
    'maps':'In Google Maps öffnen','allcities':'Alle Städte','editorial':'Redaktioneller Prozess',
    'guidesin':'Guides in','langval':'45 Sprachen, in der Lokali-App','free':'kostenlos',
    'min':'Min','getapp':'App holen'}
CAT={'history':'Geschichte','photography':'Fotografie','authentic':'Authentisch',
     'romantic':'Romantisch','family':'Familien','editors':'Redaktionsempfehlung',
     'nature':'Natur','art':'Kunst','architecture':'Architektur','food':'Essen'}
T={'Archaeological Site':('Ausgrabungsstätte','f'),'Museum':('Museum','n'),'Mosque':('Moschee','f'),
 'Neighborhood':('Viertel','n'),'Beach':('Strand','m'),'Historic Town':('historische Altstadt','f'),
 'Palace':('Palast','m'),'Waterfall':('Wasserfall','m'),'Viewpoint':('Aussichtspunkt','m'),
 'Park':('Park','m'),'Canyon':('Schlucht','f'),'Lake':('See','m'),'Tower':('Turm','m'),
 'Mountain':('Berg','m'),'Village':('Dorf','n'),'Market':('Markt','m'),'Monastery':('Kloster','n'),
 'Town':('Stadt','f'),'Castle':('Burg','f'),'Neolithic Site':('neolithische Fundstätte','f'),
 'Church':('Kirche','f'),'Street':('Straße','f'),'Sea Castle':('Seefestung','f'),
 'Salt Lake':('Salzsee','m'),'Ancient Wonder Site':('antike Weltwunderstätte','f'),
 'Monument':('Denkmal','n'),'Cable Car':('Seilbahn','f'),
 'Historic District':('historisches Viertel','n'),'Beach and Ruins':('Strand mit Ruinen','m'),
 'Natural Site':('Naturgebiet','n'),'Rock Formations':('Felsformation','f'),
 'Islands':('Inselgruppe','f'),'Fortress':('Festung','f'),'Gorge':('Schlucht','f'),
 'Ancient Town':('antike Stadt','f'),'Square':('Platz','m'),'Ancient Temple':('antiker Tempel','m'),
 'Rock Fortress':('Felsenburg','f'),'Island Church':('Inselkirche','f'),
 'Ruined City':('Ruinenstadt','f'),'Mausoleum':('Mausoleum','n'),
 'Ancient Theater':('antikes Theater','n'),'Highland Plateau':('Hochebene','f'),
 'Sacred Pool':('heiliger Teich','m'),'Cistern':('unterirdischer Wasserspeicher','m'),
 'Waterway':('Wasserweg','m'),'Beach Valley':('Strandtal','n'),'Region':('Region','f'),
 'Bathhouse':('historisches Hamam','n'),'Natural Phenomenon':('Naturphänomen','n'),
 'Historic Village':('historisches Dorf','n'),'Ancient Tombs':('antike Grabanlage','f'),
 'Underground City':('unterirdische Stadt','f'),'City Walls':('Stadtmauer','f'),
 'Memorial Site':('Gedenkstätte','f'),'Rock Churches':('Felsenkirchen-Ensemble','n'),
 'Sunken Town':('versunkene Stadt','f'),'Historic Square':('historischer Platz','m'),
 'Religious Site':('religiöse Stätte','f'),'Cathedral':('Kathedrale','f'),'Temple':('Tempel','m'),
 'Garden':('Garten','m'),'Island':('Insel','f'),'Valley':('Tal','n'),'Bazaar':('Basar','m'),
 'Bridge':('Brücke','f'),'Ruins':('Ruinenanlage','f'),
 'Historic Site':('historische Stätte','f'),'Landmark':('Wahrzeichen','n'),
 'Sunken Ruins':('versunkene Ruinenstätte','f')}
ART={'m':'ein','f':'eine','n':'ein'}
def type_phrase(t):
    if not t or t not in T: return None
    n,g=T[t]; return f"{ART[g]} {n}"
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','Stunden',s); s=re.sub(r'\bmin(utes)?\b','Min',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"Wie viel Zeit sollte man für {t} einplanen?",
        (f"Die meisten Besucher bleiben {vis} hier. " if vis else "")+
        f"Der kostenlose Lokali-Audioguide dauert {mins} Minuten und ist zum Hören beim Gehen gemacht."),
       (f"Gibt es einen kostenlosen Audioguide für {t}?",
        f"Ja — die Lokali-App erzählt {t} kostenlos in 45 Sprachen. Kein Ticket, keine Reisegruppe "
        f"und kein Abo; nach dem Download funktioniert sie auch offline.")]
    if lat is not None:
        o.append((f"Wo liegt {t}?",
          f"{t} liegt in {city}, {country}, bei {lat}, {lng}. "
          f"Tippe auf den Kartenlink auf dieser Seite, um die Route zu öffnen."))
    if tips: o.append((f"Was sollte man vor dem Besuch von {t} wissen?", tips[0]))
    if kfs:  o.append((f"Wofür ist {t} bekannt?", kfs[0]))
    import re as _re
    TW=_re.compile(r'(?i)(morgen|vormittag|nachmittag|abend|sonnenaufgang|sonnenuntergang|früh|spät|'
                   r'saison|sommer|winter|frühling|herbst|wochenende|licht|schlange|andrang|menschenmenge)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"Wann besucht man {t} am besten?", tt[0]))
    return o
LOCALE='de_DE'
TITLE='{t}, {city} — Kostenloser Audioguide | Lokali'
TITLE_SHORT='{t} — Kostenloser Audioguide | Lokali'
HUB_TITLE='{city} Audioguide — {n} kostenlose Touren | Lokali'
HUB_TITLE_SHORT='{city} — {n} kostenlose Audioguides | Lokali'
HUB_DESC="{n} kostenlose Lokali-Audioguides für {city}: {names}. Besuchszeiten, worauf man achten sollte und praktische Tipps — offline, ohne Ticket."
HUB_INTRO="Lokali hat {n} kostenlose Audioguides für {city}. Jeder läuft in 45 Sprachen, braucht kein Ticket und keine Reisegruppe und funktioniert nach dem Download offline."
SENT={'is':'{t} ist {tp} in {where}.','in':'{t} liegt in {where}.',
      'spend':'Die meisten Besucher bleiben {vis} hier.',
      'runs':'Der kostenlose Lokali-Audioguide dauert {n} Minuten.',
      'route':'Route zu {t} von deinem Standort öffnen.'}
COUNTRY={'türkiye':'Türkei','greece':'Griechenland','italy':'Italien','france':'Frankreich',
 'spain':'Spanien','germany':'Deutschland','austria':'Österreich','georgia':'Georgien',
 'india':'Indien','japan':'Japan','china':'China','egypt':'Ägypten','poland':'Polen',
 'czechia':'Tschechien','united-kingdom':'Vereinigtes Königreich','united-states':'USA',
 'netherlands':'Niederlande','russia':'Russland','thailand':'Thailand','romania':'Rumänien',
 'israel':'Israel','morocco':'Marokko','mexico':'Mexiko','portugal':'Portugal','sweden':'Schweden',
 'denmark':'Dänemark','finland':'Finnland','iceland':'Island','switzerland':'Schweiz',
 'hungary':'Ungarn','croatia':'Kroatien','cyprus':'Zypern','jordan':'Jordanien','iran':'Iran',
 'vietnam':'Vietnam','indonesia':'Indonesien','singapore':'Singapur','south-korea':'Südkorea',
 'malaysia':'Malaysia','taiwan':'Taiwan','brazil':'Brasilien','argentina':'Argentinien',
 'peru':'Peru','chile':'Chile','colombia':'Kolumbien','canada':'Kanada','australia':'Australien',
 'new-zealand':'Neuseeland','south-africa':'Südafrika','kazakhstan':'Kasachstan',
 'madagascar':'Madagaskar','ireland':'Irland','belgium':'Belgien','norway':'Norwegen',
 'nepal':'Nepal','pakistan':'Pakistan','cambodia':'Kambodscha','philippines':'Philippinen'}
def hub_faq(city,n):
    return [(f"Wie viele kostenlose Audioguides gibt es für {city}?",
             f"{n}. Alle sind kostenlos, laufen in 45 Sprachen und funktionieren offline."),
            (f"Ist der {city}-Audioguide wirklich kostenlos?",
             "Ja. Kein Ticket, keine Reisegruppe, kein Abo — die Guides laufen auf deinem eigenen Handy.")]
