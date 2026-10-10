# -*- coding: utf-8 -*-
"""Bulgarian. Section headings lifted from the existing explore/bg/ pages.

No articles in the indefinite form, so a type is just the noun. Bulgarian has
lost its case system, so "в {city}" works with a Latin city name and no colon
construction is needed. Plural agreement is the simple singular/plural pair.
"""
import re as _re
SEC={'story':'Историята','facts':'Основни факти','look':'Какво да търсите',
     'tips':'Практични съвети','faq':'Чести въпроси','map':'На картата',
     'visitor':'Информация за посетители','more':'Какво още да видите в'}
ROW={'time':'Необходимо време','audio':'Аудио гид Lokali','type':'Вид','best':'Подходящо за',
     'loc':'Местоположение','coord':'Координати','langs':'Езици'}
UI={'badge':'Безплатен аудио гид','begin':'Започнете','open':'Отворете приложението Lokali',
    'verified':'Проверено през октомври 2026 г.','howwrite':'как пишем тези гидове',
    'maps':'Отворете в Google Maps','allcities':'Всички градове','editorial':'Редакционен процес',
    'guidesin':'Аудио гидове в','langval':'45 езика, в приложението Lokali','free':'безплатно',
    'min':'мин','getapp':'Изтеглете приложението'}
CAT={'history':'История','photography':'Фотография','authentic':'Автентично',
     'romantic':'Романтично','family':'Семейства','editors':'Избор на редакцията',
     'nature':'Природа','art':'Изкуство','architecture':'Архитектура','food':'Храна'}
T={'Archaeological Site':'археологически обект','Museum':'музей','Mosque':'джамия',
 'Neighborhood':'квартал','Beach':'плаж','Historic Town':'исторически град','Palace':'дворец',
 'Waterfall':'водопад','Viewpoint':'панорамна площадка','Park':'парк','Canyon':'каньон',
 'Lake':'езеро','Tower':'кула','Mountain':'планина','Village':'село','Market':'пазар',
 'Monastery':'манастир','Town':'град','Castle':'замък','Neolithic Site':'неолитен обект',
 'Church':'църква','Street':'улица','Sea Castle':'морска крепост','Salt Lake':'солено езеро',
 'Ancient Wonder Site':'чудо на древния свят','Monument':'паметник','Cable Car':'въжена линия',
 'Historic District':'исторически квартал','Beach and Ruins':'плаж с руини',
 'Natural Site':'природен обект','Rock Formations':'скални образувания','Islands':'архипелаг',
 'Fortress':'крепост','Gorge':'дефиле','Ancient Town':'античен град','Square':'площад',
 'Ancient Temple':'античен храм','Rock Fortress':'скална крепост',
 'Island Church':'църква на остров','Ruined City':'град в руини','Mausoleum':'мавзолей',
 'Ancient Theater':'античен театър','Highland Plateau':'високопланинско плато',
 'Sacred Pool':'свещен водоем','Cistern':'подземен водоем','Waterway':'воден път',
 'Beach Valley':'крайбрежна долина','Region':'регион','Bathhouse':'историческа баня',
 'Natural Phenomenon':'природно явление','Historic Village':'историческо село',
 'Ancient Tombs':'античен некропол','Underground City':'подземен град',
 'City Walls':'крепостни стени','Memorial Site':'мемориал','Rock Churches':'скални църкви',
 'Sunken Town':'потънал град','Historic Square':'исторически площад',
 'Religious Site':'религиозен обект','Cathedral':'катедрала','Temple':'храм','Garden':'градина',
 'Island':'остров','Valley':'долина','Bazaar':'базар','Bridge':'мост','Ruins':'руини',
 'Historic Site':'исторически обект','Historical Site':'исторически обект',
 'Landmark':'забележителност','Sunken Ruins':'подводни руини',
 'Abandoned Village':'изоставено село','Ghost Town':'град призрак',
 'Historic Café':'историческо кафене','Pilgrimage Site':'поклонническо място',
 'Museum Complex':'музеен комплекс','Stadium':'стадион','Cinema':'кино','Basilica':'базилика',
 'Food Market':'хранителен пазар','Religious Complex':'религиозен комплекс',
 'Skyscraper':'небостъргач','Shrine':'светилище'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','ч',s); s=_re.sub(r'\bmin(utes)?\b','мин',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"Колко време отнема {t}?",
        (f"Повечето посетители прекарват {vis}. " if vis else "")+
        f"Безплатният аудио гид на Lokali е {mins} мин и се слуша в движение."),
       (f"Има ли безплатен аудио гид за {t}?",
        f"Да — приложението Lokali разказва за {t} безплатно на 45 езика. Без билет, "
        f"без група и без абонамент; след изтегляне работи и офлайн.")]
    if lat is not None:
        o.append((f"Къде се намира {t}?",
          f"{t} се намира в {city}, {country}, на координати {lat}, {lng}. "
          f"Докоснете връзката към картата на тази страница, за да отворите маршрута."))
    if tips: o.append((f"Какво да знаете преди посещение на {t}?", tips[0]))
    if kfs:  o.append((f"С какво е известно {t}?", kfs[0]))
    TW=_re.compile(r'(сутрин|следобед|вечер|изгрев|залез|рано|късно|сезон|лято|зима|пролет|'
                   r'есен|уикенд|светлина|опашк|тълп|многолюд)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"Кога е най-добре да посетите {t}?", tt[0]))
    return o
LOCALE='bg_BG'
TITLE='{t}, {city} — безплатен аудио гид | Lokali'
TITLE_SHORT='{t} — безплатен аудио гид | Lokali'
HUB_TITLE='{city} — {n} безплатни аудио гида | Lokali'
HUB_TITLE_SHORT='{city} — {n} аудио гида | Lokali'
HUB_DESC="{n} безплатни аудио гида на Lokali в {city}: {names}."
HUB_INTRO="Lokali има {n} безплатни аудио гида в {city}."
SENT={'is':'{t} е {tp} в {where}.','in':'{t} се намира в {where}.',
      'spend':'Повечето посетители прекарват {vis}.',
      'runs':'Безплатният аудио гид на Lokali е {n} мин.',
      'route':'Маршрут до {t} от вашето местоположение.'}
COUNTRY={'türkiye':'Турция','greece':'Гърция','italy':'Италия','france':'Франция','spain':'Испания',
 'germany':'Германия','austria':'Австрия','georgia':'Грузия','india':'Индия','japan':'Япония',
 'china':'Китай','egypt':'Египет','poland':'Полша','czechia':'Чехия',
 'united-kingdom':'Великобритания','united-states':'САЩ','netherlands':'Нидерландия',
 'russia':'Русия','thailand':'Тайланд','romania':'Румъния','israel':'Израел','morocco':'Мароко',
 'mexico':'Мексико','portugal':'Португалия','sweden':'Швеция','denmark':'Дания','finland':'Финландия',
 'iceland':'Исландия','switzerland':'Швейцария','hungary':'Унгария','croatia':'Хърватия',
 'cyprus':'Кипър','jordan':'Йордания','iran':'Иран','vietnam':'Виетнам','indonesia':'Индонезия',
 'singapore':'Сингапур','south-korea':'Южна Корея','malaysia':'Малайзия','taiwan':'Тайван',
 'brazil':'Бразилия','argentina':'Аржентина','peru':'Перу','chile':'Чили','colombia':'Колумбия',
 'canada':'Канада','australia':'Австралия','new-zealand':'Нова Зеландия',
 'south-africa':'Южна Африка','kazakhstan':'Казахстан','madagascar':'Мадагаскар',
 'ireland':'Ирландия','belgium':'Белгия','norway':'Норвегия','nepal':'Непал',
 'pakistan':'Пакистан','cambodia':'Камбоджа','philippines':'Филипини'}
def hub_text(city,n,names):
    g='безплатен аудио гид' if n==1 else 'безплатни аудио гида'
    has='има' if n==1 else 'има'
    t=f'{city} — {n} {g} | Lokali'
    d=(f'{n} {g} на Lokali в {city}: {names}. Необходимо време, какво да търсите '
       f'и практични съвети. Офлайн, без билет.')
    i=(f'Lokali {has} {n} {g} в {city}. Всички звучат на 45 езика, не изискват билет '
       f'или екскурзоводска група и след изтегляне работят офлайн.')
    return t,d,i
def hub_text_short(city,n):
    return f'{city} — {n} {"аудио гид" if n==1 else "аудио гида"} | Lokali'
def hub_faq(city,n):
    g='безплатен аудио гид' if n==1 else 'безплатни аудио гида'
    return [(f'Колко безплатни аудио гида има в {city}?',
             f'{n}. Всички са безплатни, звучат на 45 езика и работят офлайн.'),
            (f'Наистина ли аудио гидът за {city} е безплатен?',
             'Да. Без билет, без екскурзоводска група и без абонамент — '
             'гидовете се слушат на вашия телефон.')]
# Cyrillic -> Latin for URL slugs (official Bulgarian transliteration, 2009).
_C={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k',
 'л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h',
 'ц':'ts','ч':'ch','ш':'sh','щ':'sht','ъ':'a','ь':'y','ю':'yu','я':'ya'}
def translit(s):
    o=[]
    for c in (s or ''):
        l=c.lower(); o.append(_C[l] if l in _C else c)
    return ''.join(o)
