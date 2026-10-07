# -*- coding: utf-8 -*-
SEC={'story':"L'histoire",'facts':'Faits essentiels','look':'À observer',
     'tips':'Conseils pratiques','faq':'Questions fréquentes','map':'Sur la carte',
     'visitor':'Infos visiteur','more':'À voir aussi à'}
ROW={'time':'Temps nécessaire','audio':'Audioguide Lokali','type':'Type','best':'Idéal pour',
     'loc':'Lieu','coord':'Coordonnées','langs':'Langues'}
UI={'badge':'Audioguide gratuit','begin':'Commencer','open':"Ouvrir l'appli Lokali",
    'verified':'Vérifié en octobre 2026','howwrite':'comment nous écrivons ces guides',
    'maps':'Ouvrir dans Google Maps','allcities':'Toutes les villes','editorial':'Processus éditorial',
    'guidesin':'Audioguides en','langval':"45 langues, dans l'appli Lokali",'free':'gratuit',
    'min':'min','getapp':"Obtenir l'appli"}
CAT={'history':'Histoire','photography':'Photographie','authentic':"L'authentique",
     'romantic':'Romantique','family':'Familles','editors':'Choix de la rédaction',
     'nature':'Nature','art':'Art','architecture':'Architecture','food':'Gastronomie'}
T={'Archaeological Site':('site archéologique','m'),'Museum':('musée','m'),'Mosque':('mosquée','f'),
 'Neighborhood':('quartier','m'),'Beach':('plage','f'),'Historic Town':('vieille ville','f'),
 'Palace':('palais','m'),'Waterfall':('cascade','f'),'Viewpoint':('point de vue','m'),
 'Park':('parc','m'),'Canyon':('canyon','m'),'Lake':('lac','m'),'Tower':('tour','f'),
 'Mountain':('montagne','f'),'Village':('village','m'),'Market':('marché','m'),
 'Monastery':('monastère','m'),'Town':('ville','f'),'Castle':('château','m'),
 'Neolithic Site':('site néolithique','m'),'Church':('église','f'),'Street':('rue','f'),
 'Sea Castle':('château fort maritime','m'),'Salt Lake':('lac salé','m'),
 'Ancient Wonder Site':('merveille antique','f'),'Monument':('monument','m'),
 'Cable Car':('téléphérique','m'),'Historic District':('quartier historique','m'),
 'Beach and Ruins':('plage avec ruines','f'),'Natural Site':('site naturel','m'),
 'Rock Formations':('formation rocheuse','f'),'Islands':('archipel','m'),
 'Fortress':('forteresse','f'),'Gorge':('gorge','f'),'Ancient Town':('cité antique','f'),
 'Square':('place','f'),'Ancient Temple':('temple antique','m'),
 'Rock Fortress':('forteresse troglodytique','f'),'Island Church':('église insulaire','f'),
 'Ruined City':('cité en ruines','f'),'Mausoleum':('mausolée','m'),
 'Ancient Theater':('théâtre antique','m'),'Highland Plateau':('haut plateau','m'),
 'Sacred Pool':('bassin sacré','m'),'Cistern':('citerne','f'),'Waterway':('voie d’eau','f'),
 'Beach Valley':('vallée littorale','f'),'Region':('région','f'),'Bathhouse':('bain historique','m'),
 'Natural Phenomenon':('phénomène naturel','m'),'Historic Village':('village historique','m'),
 'Ancient Tombs':('nécropole antique','f'),'Underground City':('ville souterraine','f'),
 'City Walls':('enceinte fortifiée','f'),'Memorial Site':('lieu de mémoire','m'),
 'Rock Churches':('églises rupestres','f'),'Sunken Town':('cité engloutie','f'),
 'Historic Square':('place historique','f'),'Religious Site':('lieu de culte','m'),
 'Cathedral':('cathédrale','f'),'Temple':('temple','m'),'Garden':('jardin','m'),
 'Island':('île','f'),'Valley':('vallée','f'),'Bazaar':('bazar','m'),'Bridge':('pont','m'),
 'Ruins':('ensemble de ruines','m'),'Historic Site':('site historique','m'),
 'Landmark':('site emblématique','m'),'Sunken Ruins':('ruines immergées','f')}
ART={'m':'un','f':'une'}
def type_phrase(t):
    if not t or t not in T: return None
    n,g=T[t]; return f"{ART[g]} {n}"
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','heures',s); s=re.sub(r'\bmin(utes)?\b','min',s)
    return s.replace('.',',')
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"Combien de temps faut-il pour visiter {t} ?",
        (f"Comptez {vis}, c'est le temps que la plupart des visiteurs y passent. " if vis else "")+
        f"L'audioguide gratuit de Lokali dure {mins} minutes et s'écoute en marchant."),
       (f"Existe-t-il un audioguide gratuit de {t} ?",
        f"Oui — l'appli Lokali raconte {t} gratuitement en 45 langues. Sans billet, sans groupe "
        f"et sans abonnement ; une fois téléchargée, elle fonctionne hors ligne.")]
    if lat is not None:
        o.append((f"Où se trouve {t} ?",
          f"{t} se trouve à {city}, {country}, aux coordonnées {lat}, {lng}. "
          f"Touchez le lien de la carte sur cette page pour ouvrir l'itinéraire."))
    if tips: o.append((f"Que faut-il savoir avant de visiter {t} ?", tips[0]))
    if kfs:  o.append((f"Pourquoi {t} est-il connu ?", kfs[0]))
    import re as _re
    TW=_re.compile(r'(?i)(matin|après-midi|soir|lever du soleil|coucher du soleil|tôt|tard|'
                   r'saison|été|hiver|printemps|automne|week-end|lumière|file|affluence|foule)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"Quel est le meilleur moment pour visiter {t} ?", tt[0]))
    return o
LOCALE='fr_FR'
TITLE='{t}, {city} — Audioguide gratuit | Lokali'
TITLE_SHORT='{t} — Audioguide gratuit | Lokali'
HUB_TITLE='{city} — {n} audioguides gratuits | Lokali'
HUB_TITLE_SHORT='{city} — {n} audioguides | Lokali'
HUB_DESC="{n} audioguides Lokali gratuits à {city} : {names}. Durée de visite, quoi observer et conseils pratiques — hors ligne, sans billet."
HUB_INTRO="Lokali propose {n} audioguides gratuits à {city}. Chacun s'écoute en 45 langues, ne demande ni billet ni groupe organisé et fonctionne hors ligne une fois téléchargé."
SENT={'is':'{t} est {tp} à {where}.','in':'{t} se trouve à {where}.',
      'spend':'La plupart des visiteurs y passent {vis}.',
      'runs':"L'audioguide gratuit de Lokali dure {n} minutes.",
      'route':"Ouvre l'itinéraire vers {t} depuis votre position."}
COUNTRY={'türkiye':'Turquie','greece':'Grèce','italy':'Italie','france':'France','spain':'Espagne',
 'germany':'Allemagne','austria':'Autriche','georgia':'Géorgie','india':'Inde','japan':'Japon',
 'china':'Chine','egypt':'Égypte','poland':'Pologne','czechia':'Tchéquie',
 'united-kingdom':'Royaume-Uni','united-states':'États-Unis','netherlands':'Pays-Bas',
 'russia':'Russie','thailand':'Thaïlande','romania':'Roumanie','israel':'Israël','morocco':'Maroc',
 'mexico':'Mexique','portugal':'Portugal','sweden':'Suède','denmark':'Danemark','finland':'Finlande',
 'iceland':'Islande','switzerland':'Suisse','hungary':'Hongrie','croatia':'Croatie','cyprus':'Chypre',
 'jordan':'Jordanie','iran':'Iran','vietnam':'Viêt Nam','indonesia':'Indonésie','singapore':'Singapour',
 'south-korea':'Corée du Sud','malaysia':'Malaisie','taiwan':'Taïwan','brazil':'Brésil',
 'argentina':'Argentine','peru':'Pérou','chile':'Chili','colombia':'Colombie','canada':'Canada',
 'australia':'Australie','new-zealand':'Nouvelle-Zélande','south-africa':'Afrique du Sud',
 'kazakhstan':'Kazakhstan','madagascar':'Madagascar','ireland':'Irlande','belgium':'Belgique',
 'norway':'Norvège','nepal':'Népal','pakistan':'Pakistan','cambodia':'Cambodge','philippines':'Philippines'}
def hub_faq(city,n):
    return [(f"Combien d'audioguides gratuits existe-t-il à {city} ?",
             f"{n}. Tous sont gratuits, s'écoutent en 45 langues et fonctionnent hors ligne."),
            (f"L'audioguide de {city} est-il vraiment gratuit ?",
             "Oui. Sans billet, sans groupe organisé et sans abonnement : les guides s'écoutent sur votre propre téléphone.")]
