# -*- coding: utf-8 -*-
"""Italian. Section headings lifted from the existing explore/it/ pages."""
SEC={'story':'La storia','facts':'Fatti essenziali','look':'Cosa osservare',
     'tips':'Consigli pratici','faq':'Domande frequenti','map':'Sulla mappa',
     'visitor':'Informazioni per i visitatori','more':'Da vedere anche a'}
ROW={'time':'Tempo necessario','audio':'Audioguida Lokali','type':'Tipo','best':'Ideale per',
     'loc':'Posizione','coord':'Coordinate','langs':'Lingue'}
UI={'badge':'Audioguida gratuita','begin':'Inizia','open':"Apri l'app Lokali",
    'verified':'Verificato a ottobre 2026','howwrite':'come scriviamo queste guide',
    'maps':'Apri in Google Maps','allcities':'Tutte le città','editorial':'Processo editoriale',
    'guidesin':'Audioguide in','langval':"45 lingue, nell'app Lokali",'free':'gratuita',
    'min':'min','getapp':"Scarica l'app"}
CAT={'history':'Storia','photography':'Fotografia','authentic':'Autentico',
     'romantic':'Romantico','family':'Famiglie','editors':'Scelta della redazione',
     'nature':'Natura','art':'Arte','architecture':'Architettura','food':'Cucina'}
T={'Archaeological Site':('sito archeologico','m'),'Museum':('museo','m'),'Mosque':('moschea','f'),
 'Neighborhood':('quartiere','m'),'Beach':('spiaggia','f'),'Historic Town':('centro storico','m'),
 'Palace':('palazzo','m'),'Waterfall':('cascata','f'),'Viewpoint':('punto panoramico','m'),
 'Park':('parco','m'),'Canyon':('canyon','m'),'Lake':('lago','m'),'Tower':('torre','f'),
 'Mountain':('montagna','f'),'Village':('villaggio','m'),'Market':('mercato','m'),
 'Monastery':('monastero','m'),'Town':('città','f'),'Castle':('castello','m'),
 'Neolithic Site':('sito neolitico','m'),'Church':('chiesa','f'),'Street':('via','f'),
 'Sea Castle':('fortezza marittima','f'),'Salt Lake':('lago salato','m'),
 'Ancient Wonder Site':('meraviglia antica','f'),'Monument':('monumento','m'),
 'Cable Car':('funivia','f'),'Historic District':('quartiere storico','m'),
 'Beach and Ruins':('spiaggia con rovine','f'),'Natural Site':('sito naturale','m'),
 'Rock Formations':('formazione rocciosa','f'),'Islands':('arcipelago','m'),
 'Fortress':('fortezza','f'),'Gorge':('gola','f'),'Ancient Town':('città antica','f'),
 'Square':('piazza','f'),'Ancient Temple':('tempio antico','m'),
 'Rock Fortress':('fortezza rupestre','f'),'Island Church':("chiesa sull'isola",'f'),
 'Ruined City':('città in rovina','f'),'Mausoleum':('mausoleo','m'),
 'Ancient Theater':('teatro antico','m'),'Highland Plateau':('altopiano','m'),
 'Sacred Pool':('vasca sacra','f'),'Cistern':('cisterna sotterranea','f'),
 'Waterway':("via d'acqua",'f'),'Beach Valley':('valle costiera','f'),'Region':('regione','f'),
 'Bathhouse':('hammam storico','m'),'Natural Phenomenon':('fenomeno naturale','m'),
 'Historic Village':('borgo storico','m'),'Ancient Tombs':('necropoli antica','f'),
 'Underground City':('città sotterranea','f'),'City Walls':('cinta muraria','f'),
 'Memorial Site':('luogo della memoria','m'),'Rock Churches':('complesso di chiese rupestri','m'),
 'Sunken Town':('città sommersa','f'),'Historic Square':('piazza storica','f'),
 'Religious Site':('luogo di culto','m'),'Cathedral':('cattedrale','f'),'Temple':('tempio','m'),
 'Garden':('giardino','m'),'Island':('isola','f'),'Valley':('valle','f'),'Bazaar':('bazar','m'),
 'Bridge':('ponte','m'),'Ruins':('complesso di rovine','m'),'Historic Site':('sito storico','m'),
 'Historical Site':('sito storico','m'),'Landmark':('luogo simbolo','m'),
 'Sunken Ruins':('sito sommerso','m'),'Abandoned Village':('villaggio abbandonato','m'),
 'Ghost Town':('città fantasma','f'),'Historic Café':('caffè storico','m'),
 'Pilgrimage Site':('luogo di pellegrinaggio','m'),'Museum Complex':('complesso museale','m'),
 'Stadium':('stadio','m'),'Cinema':('cinema','m'),'Basilica':('basilica','f'),
 'Food Market':('mercato alimentare','m'),'Religious Complex':('complesso religioso','m'),
 'Skyscraper':('grattacielo','m'),'Shrine':('santuario','m')}
import re as _re
_UNO=_re.compile(r'^(s[^aeiouàèéìòù]|z|gn|ps|x|y|pn)',_re.I)
def type_phrase(t):
    if t not in T: return None
    n,g=T[t]
    if g=='m': return ('uno ' if _UNO.match(n) else 'un ')+n
    return ("un'" if n[0].lower() in 'aeiou' else 'una ')+n
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','ore',s); s=_re.sub(r'\bmin(utes)?\b','min',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"Quanto tempo serve per visitare {t}?",
        (f"La maggior parte dei visitatori si ferma {vis}. " if vis else "")+
        f"L'audioguida gratuita di Lokali dura {mins} minuti e si ascolta camminando."),
       (f"Esiste un'audioguida gratuita di {t}?",
        f"Sì — l'app Lokali racconta {t} gratuitamente in 45 lingue. Niente biglietto, niente "
        f"gruppo e nessun abbonamento; una volta scaricata funziona anche offline.")]
    if lat is not None:
        o.append((f"Dove si trova {t}?",
          f"{t} si trova a {city}, {country}, alle coordinate {lat}, {lng}. "
          f"Tocca il link alla mappa in questa pagina per aprire il percorso."))
    if tips: o.append((f"Cosa sapere prima di visitare {t}?", tips[0]))
    if kfs:  o.append((f"Per cosa è famoso {t}?", kfs[0]))
    TW=_re.compile(r'(?i)(mattin|pomeriggio|sera|alba|tramonto|presto|tardi|stagion|estate|'
                   r'inverno|primavera|autunno|weekend|luce|fila|coda|affoll)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"Qual è il momento migliore per visitare {t}?", tt[0]))
    return o
LOCALE='it_IT'
TITLE='{t}, {city} — Audioguida gratuita | Lokali'
TITLE_SHORT='{t} — Audioguida gratuita | Lokali'
HUB_TITLE='{city} — {n} audioguide gratuite | Lokali'
HUB_TITLE_SHORT='{city} — {n} audioguide | Lokali'
HUB_DESC="{n} audioguide Lokali gratuite a {city}: {names}. Tempo di visita, cosa osservare e consigli pratici — offline, senza biglietto."
HUB_INTRO="Lokali ha {n} audioguide gratuite a {city}. Ognuna si ascolta in 45 lingue, non richiede biglietto né gruppo organizzato e funziona offline dopo il download."
SENT={'is':'{t} è {tp} a {where}.','in':'{t} si trova a {where}.',
      'spend':'La maggior parte dei visitatori si ferma {vis}.',
      'runs':"L'audioguida gratuita di Lokali dura {n} minuti.",
      'route':'Apri il percorso verso {t} dalla tua posizione.'}
COUNTRY={'türkiye':'Turchia','greece':'Grecia','italy':'Italia','france':'Francia','spain':'Spagna',
 'germany':'Germania','austria':'Austria','georgia':'Georgia','india':'India','japan':'Giappone',
 'china':'Cina','egypt':'Egitto','poland':'Polonia','czechia':'Cechia',
 'united-kingdom':'Regno Unito','united-states':'Stati Uniti','netherlands':'Paesi Bassi',
 'russia':'Russia','thailand':'Thailandia','romania':'Romania','israel':'Israele',
 'morocco':'Marocco','mexico':'Messico','portugal':'Portogallo','sweden':'Svezia',
 'denmark':'Danimarca','finland':'Finlandia','iceland':'Islanda','switzerland':'Svizzera',
 'hungary':'Ungheria','croatia':'Croazia','cyprus':'Cipro','jordan':'Giordania','iran':'Iran',
 'vietnam':'Vietnam','indonesia':'Indonesia','singapore':'Singapore','south-korea':'Corea del Sud',
 'malaysia':'Malesia','taiwan':'Taiwan','brazil':'Brasile','argentina':'Argentina','peru':'Perù',
 'chile':'Cile','colombia':'Colombia','canada':'Canada','australia':'Australia',
 'new-zealand':'Nuova Zelanda','south-africa':'Sudafrica','kazakhstan':'Kazakistan',
 'madagascar':'Madagascar','ireland':'Irlanda','belgium':'Belgio','norway':'Norvegia',
 'nepal':'Nepal','pakistan':'Pakistan','cambodia':'Cambogia','philippines':'Filippine'}
def hub_text(city,n,names):
    g='audioguida gratuita' if n==1 else 'audioguide gratuite'
    t=f'{city} — {n} {g} | Lokali'
    d=(f'{n} {g} Lokali a {city}: {names}. Tempo di visita, cosa osservare e '
       f'consigli pratici — offline, senza biglietto.')
    i=(f'Lokali ha {n} {g} a {city}. '
       f'Ognuna si ascolta in 45 lingue, non richiede biglietto né gruppo organizzato '
       f'e funziona offline dopo il download.')
    return t,d,i
def hub_text_short(city,n):
    return f'{city} — {n} {"audioguida" if n==1 else "audioguide"} | Lokali'
def hub_faq(city,n):
    g='audioguida gratuita' if n==1 else 'audioguide gratuite'
    return [(f"Quante audioguide gratuite ci sono a {city}?",
             f"{n}. Tutte gratuite, in 45 lingue e funzionano offline."),
            (f"L'audioguida di {city} è davvero gratuita?",
             "Sì. Niente biglietto, niente gruppo organizzato e nessun abbonamento — "
             "le guide si ascoltano sul tuo telefono.")]
