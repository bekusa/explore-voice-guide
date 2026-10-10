# -*- coding: utf-8 -*-
"""Ukrainian. Section headings lifted from the existing explore/uk/ pages.

No articles, so a type is just the noun. Ukrainian declines place names and the
database stores them in Latin script, so the location is given after a colon in
the nominative and FAQ questions put the attraction name before a colon.
Numerals agree (1 / 2-4 / 5+), so the hub strings are built in code.
"""
import re as _re
SEC={'story':'Історія','facts':'Ключові факти','look':'Що шукати',
     'tips':'Практичні поради','faq':'Поширені запитання','map':'На мапі',
     'visitor':'Інформація для відвідувачів','more':'Що ще подивитися —'}
ROW={'time':'Скільки часу потрібно','audio':'Аудіогід Lokali','type':'Тип','best':'Підійде для',
     'loc':'Розташування','coord':'Координати','langs':'Мови'}
UI={'badge':'Безкоштовний аудіогід','begin':'Почати','open':'Відкрийте застосунок Lokali',
    'verified':'Перевірено в жовтні 2026 року','howwrite':'як ми пишемо ці гіди',
    'maps':'Відкрити в Google Maps','allcities':'Усі міста','editorial':'Редакційний процес',
    'guidesin':'Аудіогіди —','langval':'45 мов, у застосунку Lokali','free':'безкоштовно',
    'min':'хв','getapp':'Завантажити застосунок'}
CAT={'history':'Історія','photography':'Фотографія','authentic':'Автентичне',
     'romantic':'Романтика','family':'Родинам','editors':'Вибір редакції','nature':'Природа',
     'art':'Мистецтво','architecture':'Архітектура','food':'Їжа'}
T={'Archaeological Site':'археологічна пам’ятка','Museum':'музей','Mosque':'мечеть',
 'Neighborhood':'район','Beach':'пляж','Historic Town':'історичне місто','Palace':'палац',
 'Waterfall':'водоспад','Viewpoint':'оглядовий майданчик','Park':'парк','Canyon':'каньйон',
 'Lake':'озеро','Tower':'вежа','Mountain':'гора','Village':'село','Market':'ринок',
 'Monastery':'монастир','Town':'місто','Castle':'замок','Neolithic Site':'неолітична пам’ятка',
 'Church':'церква','Street':'вулиця','Sea Castle':'морська фортеця','Salt Lake':'солоне озеро',
 'Ancient Wonder Site':'диво стародавнього світу','Monument':'пам’ятник',
 'Cable Car':'канатна дорога','Historic District':'історичний район',
 'Beach and Ruins':'пляж із руїнами','Natural Site':'природна пам’ятка',
 'Rock Formations':'скельні утворення','Islands':'архіпелаг','Fortress':'фортеця',
 'Gorge':'ущелина','Ancient Town':'античне місто','Square':'площа',
 'Ancient Temple':'античний храм','Rock Fortress':'скельна фортеця',
 'Island Church':'церква на острові','Ruined City':'місто-руїна','Mausoleum':'мавзолей',
 'Ancient Theater':'античний театр','Highland Plateau':'високогірне плато',
 'Sacred Pool':'священна водойма','Cistern':'підземне водосховище','Waterway':'водний шлях',
 'Beach Valley':'прибережна долина','Region':'регіон','Bathhouse':'історична лазня',
 'Natural Phenomenon':'природне явище','Historic Village':'історичне село',
 'Ancient Tombs':'античний некрополь','Underground City':'підземне місто',
 'City Walls':'міські мури','Memorial Site':'меморіал','Rock Churches':'печерні церкви',
 'Sunken Town':'затоплене місто','Historic Square':'історична площа',
 'Religious Site':'місце поклоніння','Cathedral':'собор','Temple':'храм','Garden':'сад',
 'Island':'острів','Valley':'долина','Bazaar':'базар','Bridge':'міст','Ruins':'руїни',
 'Historic Site':'історична пам’ятка','Historical Site':'історична пам’ятка',
 'Landmark':'визначна пам’ятка','Sunken Ruins':'підводні руїни',
 'Abandoned Village':'покинуте село','Ghost Town':'місто-привид','Historic Café':'історична кав’ярня',
 'Pilgrimage Site':'місце паломництва','Museum Complex':'музейний комплекс','Stadium':'стадіон',
 'Cinema':'кінотеатр','Basilica':'базиліка','Food Market':'продуктовий ринок',
 'Religious Complex':'релігійний комплекс','Skyscraper':'хмарочос','Shrine':'святиня'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','год',s); s=_re.sub(r'\bmin(utes)?\b','хв',s)
    return s
def _pl(n,one,few,many):
    if n%10==1 and n%100!=11: return one
    if n%10 in (2,3,4) and n%100 not in (12,13,14): return few
    return many
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"{t}: скільки часу потрібно на огляд?",
        (f"Більшість відвідувачів проводить тут {vis}. " if vis else "")+
        f"Безкоштовний аудіогід Lokali триває {mins} хв і слухається на ходу."),
       (f"{t}: чи є безкоштовний аудіогід?",
        f"Так — застосунок Lokali розповідає про це місце безкоштовно 45 мовами. Без квитка, "
        f"без групи та без підписки; після завантаження працює офлайн.")]
    if lat is not None:
        o.append((f"{t}: де розташовано?",
          f"Розташування: {city}, {country}; координати {lat}, {lng}. "
          f"Натисніть посилання на мапу на цій сторінці, щоб побудувати маршрут."))
    if tips: o.append((f"{t}: що варто знати перед візитом?", tips[0]))
    if kfs:  o.append((f"{t}: чим відоме це місце?", kfs[0]))
    TW=_re.compile(r'(вранці|ранок|вдень|увечері|світанок|захід сонця|рано|пізно|сезон|літ|зим|'
                   r'весн|осін|вихідн|світл|черг|натовп|людно)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"{t}: коли найкраще приходити?", tt[0]))
    return o
LOCALE='uk_UA'
TITLE='{t}, {city} — безкоштовний аудіогід | Lokali'
TITLE_SHORT='{t} — безкоштовний аудіогід | Lokali'
HUB_TITLE='{city} — {n} безкоштовних аудіогідів | Lokali'
HUB_TITLE_SHORT='{city} — {n} аудіогідів | Lokali'
HUB_DESC="{n} безкоштовних аудіогідів Lokali — {city}: {names}."
HUB_INTRO="Lokali має {n} безкоштовних аудіогідів у місті {city}."
SENT={'is':'{t} — {tp}. Розташування: {where}.','in':'{t}. Розташування: {where}.',
      'spend':'Більшість відвідувачів проводить тут {vis}.',
      'runs':'Безкоштовний аудіогід Lokali триває {n} хв.',
      'route':'Маршрут від вашого місця — {t}.'}
COUNTRY={'türkiye':'Туреччина','greece':'Греція','italy':'Італія','france':'Франція',
 'spain':'Іспанія','germany':'Німеччина','austria':'Австрія','georgia':'Грузія','india':'Індія',
 'japan':'Японія','china':'Китай','egypt':'Єгипет','poland':'Польща','czechia':'Чехія',
 'united-kingdom':'Велика Британія','united-states':'США','netherlands':'Нідерланди',
 'russia':'Росія','thailand':'Таїланд','romania':'Румунія','israel':'Ізраїль','morocco':'Марокко',
 'mexico':'Мексика','portugal':'Португалія','sweden':'Швеція','denmark':'Данія','finland':'Фінляндія',
 'iceland':'Ісландія','switzerland':'Швейцарія','hungary':'Угорщина','croatia':'Хорватія',
 'cyprus':'Кіпр','jordan':'Йорданія','iran':'Іран','vietnam':'В’єтнам','indonesia':'Індонезія',
 'singapore':'Сінгапур','south-korea':'Південна Корея','malaysia':'Малайзія','taiwan':'Тайвань',
 'brazil':'Бразилія','argentina':'Аргентина','peru':'Перу','chile':'Чилі','colombia':'Колумбія',
 'canada':'Канада','australia':'Австралія','new-zealand':'Нова Зеландія',
 'south-africa':'Південна Африка','kazakhstan':'Казахстан','madagascar':'Мадагаскар',
 'ireland':'Ірландія','belgium':'Бельгія','norway':'Норвегія','nepal':'Непал',
 'pakistan':'Пакистан','cambodia':'Камбоджа','philippines':'Філіппіни'}
def hub_text(city,n,names):
    g=_pl(n,'безкоштовний аудіогід','безкоштовні аудіогіди','безкоштовних аудіогідів')
    has=_pl(n,'є','є','є')
    t=f'{city} — {n} {g} | Lokali'
    d=(f'{n} {g} Lokali — {city}: {names}. Скільки часу потрібно, що шукати '
       f'та практичні поради. Офлайн, без квитка.')
    i=(f'У місті {city} {has} {n} {g} від Lokali. Усі звучать 45 мовами, не потребують квитка '
       f'чи екскурсійної групи та після завантаження працюють офлайн.')
    return t,d,i
def hub_text_short(city,n):
    return f'{city} — {n} {_pl(n,"аудіогід","аудіогіди","аудіогідів")} | Lokali'
def hub_faq(city,n):
    g=_pl(n,'безкоштовний аудіогід','безкоштовні аудіогіди','безкоштовних аудіогідів')
    return [(f'{city}: скільки безкоштовних аудіогідів доступно?',
             f'{n}. Усі безкоштовні, звучать 45 мовами і працюють офлайн.'),
            (f'{city}: аудіогід справді безкоштовний?',
             'Так. Без квитка, без екскурсійної групи та без підписки — '
             'гіди слухаються на вашому власному телефоні.')]
def more_heading(city): return f'{city} — що ще подивитися'
def guides_in(country): return f'Аудіогіди — {country}'
# Cyrillic -> Latin for URL slugs (Ukrainian national romanisation, 2010).
_C={'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh','з':'z','и':'y',
 'і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s',
 'т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu',
 'я':'ia','’':'','ʼ':"",'ʼ':''}
def translit(s):
    o=[]
    for c in (s or ''):
        l=c.lower()
        o.append(_C[l] if l in _C else c)
    return ''.join(o)
