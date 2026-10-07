# -*- coding: utf-8 -*-
SEC={'story':'История','facts':'Ключевые факты','look':'На что обратить внимание',
     'tips':'Практические советы','faq':'Частые вопросы','map':'На карте',
     'visitor':'Информация для посетителей','more':'Что ещё посмотреть в'}
ROW={'time':'Сколько времени нужно','audio':'Аудиогид Lokali','type':'Тип','best':'Подойдёт для',
     'loc':'Расположение','coord':'Координаты','langs':'Языки'}
UI={'badge':'Бесплатный аудиогид','begin':'Начать','open':'Открыть приложение Lokali',
    'verified':'Проверено в октябре 2026 года','howwrite':'как мы пишем эти гиды',
    'maps':'Открыть в Google Maps','allcities':'Все города','editorial':'Редакционный процесс',
    'guidesin':'Аудиогиды в','langval':'45 языков, в приложении Lokali','free':'бесплатно',
    'min':'мин','getapp':'Скачать приложение'}
CAT={'history':'История','photography':'Фотография','authentic':'Аутентичное',
     'romantic':'Романтика','family':'Семьям','editors':'Выбор редакции',
     'nature':'Природа','art':'Искусство','architecture':'Архитектура','food':'Еда'}
# Russian needs no articles, so only the noun is required; gender is unused.
T={'Archaeological Site':('археологический памятник','m'),'Museum':('музей','m'),
 'Mosque':('мечеть','f'),'Neighborhood':('район','m'),'Beach':('пляж','m'),
 'Historic Town':('исторический город','m'),'Palace':('дворец','m'),'Waterfall':('водопад','m'),
 'Viewpoint':('смотровая площадка','f'),'Park':('парк','m'),'Canyon':('каньон','m'),
 'Lake':('озеро','n'),'Tower':('башня','f'),'Mountain':('гора','f'),'Village':('деревня','f'),
 'Market':('рынок','m'),'Monastery':('монастырь','m'),'Town':('город','m'),'Castle':('замок','m'),
 'Neolithic Site':('памятник неолита','m'),'Church':('церковь','f'),'Street':('улица','f'),
 'Sea Castle':('морская крепость','f'),'Salt Lake':('солёное озеро','n'),
 'Ancient Wonder Site':('чудо древнего мира','n'),'Monument':('памятник','m'),
 'Cable Car':('фуникулёр','m'),'Historic District':('исторический район','m'),
 'Beach and Ruins':('пляж с античными руинами','m'),'Natural Site':('природный памятник','m'),
 'Rock Formations':('скальные образования','p'),'Islands':('архипелаг','m'),
 'Fortress':('крепость','f'),'Gorge':('ущелье','n'),'Ancient Town':('античный город','m'),
 'Square':('площадь','f'),'Ancient Temple':('античный храм','m'),
 'Rock Fortress':('скальная крепость','f'),'Island Church':('церковь на острове','f'),
 'Ruined City':('город-руина','m'),'Mausoleum':('мавзолей','m'),
 'Ancient Theater':('античный театр','m'),'Highland Plateau':('высокогорное плато','n'),
 'Sacred Pool':('священный водоём','m'),'Cistern':('水','m'),'Waterway':('водный путь','m'),
 'Beach Valley':('пляжная долина','f'),'Region':('регион','m'),'Bathhouse':('историческая баня','f'),
 'Natural Phenomenon':('природное явление','n'),'Historic Village':('историческая деревня','f'),
 'Ancient Tombs':('античный некрополь','m'),'Underground City':('подземный город','m'),
 'City Walls':('городские стены','p'),'Memorial Site':('мемориал','m'),
 'Rock Churches':('скальные церкви','p'),'Sunken Town':('затонувший город','m'),
 'Historic Square':('историческая площадь','f'),'Religious Site':('религиозный памятник','m'),
 'Cathedral':('собор','m'),'Temple':('храм','m'),'Garden':('сад','m'),'Island':('остров','m'),
 'Valley':('долина','f'),'Bazaar':('базар','m'),'Bridge':('мост','m'),'Ruins':('руины','p'),
 'Historic Site':('исторический памятник','m'),'Landmark':('достопримечательность','f'),
 'Sunken Ruins':('затонувшие руины','p')}
T['Cistern']=('水хранилище','m')  # placeholder, fixed below
T['Cistern']=('подземное водохранилище','n')
def type_phrase(t):
    if not t or t not in T: return None
    return T[t][0]
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','ч',s); s=re.sub(r'\bmin(utes)?\b','мин',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    # Nominative-safe: the attraction name never has to be declined.
    o=[(f"{t}: сколько времени нужно на осмотр?",
        (f"Большинство посетителей проводит здесь {vis}. " if vis else "")+
        f"Бесплатный аудиогид Lokali длится {mins} минут и слушается на ходу."),
       (f"{t}: есть ли бесплатный аудиогид?",
        f"Да — приложение Lokali рассказывает об этом месте бесплатно на 45 языках. "
        f"Без билетов, без групп и без подписки; после загрузки работает офлайн.")]
    if lat is not None:
        o.append((f"{t}: где находится?",
          f"Расположение — {city}, {country}; координаты {lat}, {lng}. "
          f"Нажмите ссылку на карту на этой странице, чтобы построить маршрут."))
    if tips: o.append((f"{t}: что стоит знать перед посещением?", tips[0]))
    if kfs:  o.append((f"{t}: чем примечательно это место?", kfs[0]))
    import re as _re
    TW=_re.compile(r'(?i)(утр|днём|вечер|рассвет|закат|рано|поздно|сезон|лет|зим|весн|осен|'
                   r'выходн|свет|очеред|толп|наплыв)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"{t}: когда лучше приходить?", tt[0]))
    return o
LOCALE='ru_RU'
TITLE='{t}, {city} — бесплатный аудиогид | Lokali'
TITLE_SHORT='{t} — бесплатный аудиогид | Lokali'
HUB_TITLE='{city} — {n} бесплатных аудиогидов | Lokali'
HUB_TITLE_SHORT='{city} — {n} аудиогидов | Lokali'
HUB_DESC="{n} бесплатных аудиогидов Lokali — {city}: {names}. Сколько времени нужно, на что обратить внимание и практические советы. Офлайн, без билетов."
HUB_INTRO="У Lokali есть {n} бесплатных аудиогидов по городу {city}. Каждый доступен на 45 языках, не требует билета или экскурсионной группы и после загрузки работает офлайн."
SENT={'is':'{t} — {tp}. Расположение: {where}.','in':'{t}. Расположение: {where}.',
      'spend':'Большинство посетителей проводит здесь {vis}.',
      'runs':'Бесплатный аудиогид Lokali длится {n} минут.',
      'route':'Маршрут от вашего местоположения — {t}.'}
COUNTRY={'türkiye':'Турция','greece':'Греция','italy':'Италия','france':'Франция','spain':'Испания',
 'germany':'Германия','austria':'Австрия','georgia':'Грузия','india':'Индия','japan':'Япония',
 'china':'Китай','egypt':'Египет','poland':'Польша','czechia':'Чехия',
 'united-kingdom':'Великобритания','united-states':'США','netherlands':'Нидерланды',
 'russia':'Россия','thailand':'Таиланд','romania':'Румыния','israel':'Израиль','morocco':'Марокко',
 'mexico':'Мексика','portugal':'Португалия','sweden':'Швеция','denmark':'Дания','finland':'Финляндия',
 'iceland':'Исландия','switzerland':'Швейцария','hungary':'Венгрия','croatia':'Хорватия','cyprus':'Кипр',
 'jordan':'Иордания','iran':'Иран','vietnam':'Вьетнам','indonesia':'Индонезия','singapore':'Сингапур',
 'south-korea':'Южная Корея','malaysia':'Малайзия','taiwan':'Тайвань','brazil':'Бразилия',
 'argentina':'Аргентина','peru':'Перу','chile':'Чили','colombia':'Колумбия','canada':'Канада',
 'australia':'Австралия','new-zealand':'Новая Зеландия','south-africa':'Южная Африка',
 'kazakhstan':'Казахстан','madagascar':'Мадагаскар','ireland':'Ирландия','belgium':'Бельгия',
 'norway':'Норвегия','nepal':'Непал','pakistan':'Пакистан','cambodia':'Камбоджа','philippines':'Филиппины'}
def hub_faq(city,n):
    return [(f"{city}: сколько бесплатных аудиогидов доступно?",
             f"{n}. Все бесплатные, доступны на 45 языках и работают офлайн."),
            (f"{city}: аудиогид действительно бесплатный?",
             "Да. Без билетов, без экскурсионных групп и без подписки — гиды слушаются на вашем телефоне.")]

# Cyrillic -> Latin for URL slugs (BGN/PCGN-style). Without it slug() strips the
# whole title and every Russian page in a city lands on the same empty filename.
_C={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i',
 'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
 'ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e',
 'ю':'yu','я':'ya','ї':'i','і':'i','є':'ye','ґ':'g'}
def translit(s):
    o=[]
    for c in (s or ''):
        l=c.lower()
        o.append(_C.get(l,c) if l in _C else c)
    return ''.join(o)

def _pl(n,one,few,many):
    if n%10==1 and n%100!=11: return one
    if n%10 in (2,3,4) and n%100 not in (12,13,14): return few
    return many
def hub_text(city,n,names):
    g=_pl(n,'бесплатный аудиогид','бесплатных аудиогида','бесплатных аудиогидов')
    t=f'{city} — {n} {g} | Lokali'
    d=(f'{n} {g} Lokali — {city}: {names}. Сколько времени нужно, на что обратить '
       f'внимание и практические советы. Офлайн, без билетов.')
    dost=_pl(n,'доступен','доступны','доступны')
    i=(f'В городе {city} {dost} {n} {g} от Lokali. '
       f'Все они звучат на 45 языках, не требуют билета или экскурсионной группы '
       f'и после загрузки работают офлайн.')
    return t,d,i
def hub_text_short(city,n):
    return f'{city} — {n} {_pl(n,"аудиогид","аудиогида","аудиогидов")} | Lokali'
def hub_faq(city,n):
    g=_pl(n,'бесплатный аудиогид','бесплатных аудиогида','бесплатных аудиогидов')
    return [(f'{city}: сколько бесплатных аудиогидов доступно?',
             f'{n}. Все бесплатные, доступны на 45 языках и работают офлайн.'),
            (f'{city}: аудиогид действительно бесплатный?',
             'Да. Без билетов, без экскурсионных групп и без подписки — '
             'гиды слушаются на вашем телефоне.')]
