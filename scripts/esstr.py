# -*- coding: utf-8 -*-
SEC={'story':'La historia','facts':'Datos clave','look':'Qué mirar','tips':'Consejos prácticos',
     'faq':'Preguntas frecuentes','map':'En el mapa','visitor':'Información para la visita',
     'more':'Más que ver en'}
ROW={'time':'Tiempo necesario','audio':'Audioguía Lokali','type':'Tipo','best':'Ideal para',
     'loc':'Ubicación','coord':'Coordenadas','langs':'Idiomas'}
UI={'badge':'Audioguía gratuita','begin':'Empezar','open':'Abrir la app Lokali',
    'verified':'Verificado en octubre de 2026','howwrite':'cómo escribimos estas guías',
    'maps':'Abrir en Google Maps','allcities':'Todas las ciudades','editorial':'Proceso editorial',
    'guidesin':'Audioguías en','langval':'45 idiomas, en la app Lokali','free':'gratis','min':'min',
    'getapp':'Descargar la app'}
CAT={'history':'Historia','photography':'Fotografía','authentic':'Lo auténtico',
     'romantic':'Romántico','family':'Familias','editors':'Selección del editor',
     'nature':'Naturaleza','art':'Arte','architecture':'Arquitectura','food':'Gastronomía'}
# noun + gender -> indefinite article
T={'Archaeological Site':('yacimiento arqueológico','m'),'Museum':('museo','m'),
 'Mosque':('mezquita','f'),'Neighborhood':('barrio','m'),'Beach':('playa','f'),
 'Historic Town':('casco histórico','m'),'Park':('parque','m'),'Waterfall':('cascada','f'),
 'Viewpoint':('mirador','m'),'Street':('calle','f'),'Palace':('palacio','m'),
 'Canyon':('cañón','m'),'Lake':('lago','m'),'Tower':('torre','f'),'Mountain':('montaña','f'),
 'Gorge':('desfiladero','m'),'Village':('pueblo','m'),'Market':('mercado','m'),
 'Monastery':('monasterio','m'),'Town':('ciudad','f'),'Castle':('castillo','m'),
 'Neolithic Site':('yacimiento neolítico','m'),'Church':('iglesia','f'),
 'Sea Castle':('castillo marino','m'),'Salt Lake':('lago salado','m'),
 'Ancient Wonder Site':('antigua maravilla','f'),'Monument':('monumento','m'),
 'Cable Car':('teleférico','m'),'Historic District':('barrio histórico','m'),
 'Beach and Ruins':('playa con ruinas','f'),'Natural Site':('paraje natural','m'),
 'Rock Formations':('formación rocosa','f'),'Islands':('archipiélago','m'),
 'Fortress':('fortaleza','f'),'Ancient Town':('ciudad antigua','f'),'Square':('plaza','f'),
 'Ancient Temple':('templo antiguo','m'),'Rock Fortress':('fortaleza rupestre','f'),
 'Island Church':('iglesia insular','f'),'Ruined City':('ciudad en ruinas','f'),
 'Mausoleum':('mausoleo','m'),'Ancient Theater':('teatro antiguo','m'),
 'Highland Plateau':('meseta','f'),'Sacred Pool':('estanque sagrado','m'),
 'Cistern':('cisterna','f'),'Waterway':('canal','m'),'Beach Valley':('valle costero','m'),
 'Region':('región','f'),'Bathhouse':('baño histórico','m'),'Cathedral':('catedral','f'),
 'Temple':('templo','m'),'Garden':('jardín','m'),'Island':('isla','f'),'Valley':('valle','m'),
 'Bazaar':('bazar','m'),'Bridge':('puente','m'),'Underground City':('ciudad subterránea','f'),
 'Ruins':('conjunto de ruinas','m'),'Historic Site':('enclave histórico','m'),
 'Memorial Site':('lugar conmemorativo','m'),'Natural Phenomenon':('fenómeno natural','m'),
 'Landmark':('lugar emblemático','m'),'Historic Square':('plaza histórica','f'),
 'Sunken Ruins':('ruinas sumergidas','f'),'Ancient Tombs':('necrópolis antigua','f')}
ART={'m':'un','f':'una'}
def type_phrase(t):
    if not t or t not in T: return None
    n,g=T[t]; return f"{ART[g]} {n}"
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','horas',s); s=re.sub(r'\bmin(utes)?\b','min',s)
    return s.replace('.',',')
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"¿Cuánto tiempo hace falta para ver {t}?",
        (f"La mayoría de los visitantes dedica {vis}. " if vis else "")+
        f"La audioguía gratuita de Lokali dura {mins} minutos y está pensada para escucharla mientras caminas."),
       (f"¿Hay una audioguía gratuita de {t}?",
        f"Sí: la app de Lokali narra {t} gratis en 45 idiomas. Sin entrada, sin grupo organizado "
        f"y sin suscripción; una vez descargada funciona sin conexión.")]
    if lat is not None:
        o.append((f"¿Dónde está {t}?",
          f"{t} está en {city}, {country}, en {lat}, {lng}. "
          f"Toca el enlace del mapa de esta página para abrir la ruta."))
    if tips: o.append((f"¿Qué conviene saber antes de visitar {t}?", tips[0]))
    if kfs:  o.append((f"¿Por qué destaca {t}?", kfs[0]))
    import re as _re
    TW=_re.compile(r'(?i)(mañana|tarde|noche|amanecer|atardecer|temprano|pronto|'
                   r'temporada|verano|invierno|primavera|otoño|fin de semana|luz|cola|gentío|multitud)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"¿Cuál es el mejor momento para visitar {t}?", tt[0]))
    return o

LOCALE='es_ES'
TITLE='{t}, {city} — Audioguía gratuita | Lokali'
TITLE_SHORT='{t} — Audioguía gratuita | Lokali'
HUB_TITLE='{city} — {n} audioguías gratuitas | Lokali'
HUB_TITLE_SHORT='{city} — {n} audioguías | Lokali'
HUB_DESC='{n} audioguías gratuitas de Lokali en {city}: {names}. Duración de la visita, qué mirar y consejos prácticos — sin conexión y sin entrada.'
HUB_INTRO='Lokali tiene {n} audioguías gratuitas de {city}. Cada una suena en 45 idiomas, no necesita entrada ni grupo organizado y funciona sin conexión una vez descargada.'
SENT={'is':'{t} es {tp} en {where}.','in':'{t} está en {where}.',
      'spend':'La mayoría de los visitantes dedica {vis}.',
      'runs':'La audioguía gratuita de Lokali dura {n} minutos.',
      'route':'Abre la ruta hasta {t} desde tu ubicación.'}
COUNTRY={'türkiye':'Turquía','greece':'Grecia','italy':'Italia','france':'Francia','spain':'España',
 'germany':'Alemania','austria':'Austria','georgia':'Georgia','india':'India','japan':'Japón',
 'china':'China','egypt':'Egipto','poland':'Polonia','czechia':'Chequia',
 'united-kingdom':'Reino Unido','united-states':'Estados Unidos','netherlands':'Países Bajos',
 'russia':'Rusia','thailand':'Tailandia','romania':'Rumanía','israel':'Israel','morocco':'Marruecos',
 'mexico':'México','portugal':'Portugal','sweden':'Suecia','denmark':'Dinamarca','finland':'Finlandia',
 'iceland':'Islandia','switzerland':'Suiza','hungary':'Hungría','croatia':'Croacia','cyprus':'Chipre',
 'jordan':'Jordania','iran':'Irán','vietnam':'Vietnam','indonesia':'Indonesia','singapore':'Singapur',
 'south-korea':'Corea del Sur','malaysia':'Malasia','taiwan':'Taiwán','brazil':'Brasil',
 'argentina':'Argentina','peru':'Perú','chile':'Chile','colombia':'Colombia','canada':'Canadá',
 'australia':'Australia','new-zealand':'Nueva Zelanda','south-africa':'Sudáfrica',
 'kazakhstan':'Kazajistán','madagascar':'Madagascar','ireland':'Irlanda','belgium':'Bélgica',
 'norway':'Noruega','nepal':'Nepal','pakistan':'Pakistán','cambodia':'Camboya','philippines':'Filipinas'}
def hub_faq(city,n):
    return [(f"¿Cuántas audioguías gratuitas hay de {city}?",
             f"{n}. Todas son gratuitas, suenan en 45 idiomas y funcionan sin conexión."),
            (f"¿La audioguía de {city} es realmente gratis?",
             "Sí. Sin entrada, sin grupo organizado y sin suscripción: las guías suenan en tu propio móvil.")]
