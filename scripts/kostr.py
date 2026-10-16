# -*- coding: utf-8 -*-
"""Korean. Section headings lifted from the existing explore/ko/ pages.

No articles and no plural agreement, so a type is just the noun. Korean uses
spaces and a Latin full stop, so SEP/STOP stay at their defaults. Slugs use the
English page's slug (USE_EN_SLUG): the existing Korean pages already live there
and romanising Hangul would invent names. The length budgets sit between the
Latin and Japanese ones because Hangul is wide but spaced.
"""
import re as _re
USE_EN_SLUG=True
MAXDESC=92
MAXTITLE=38
SEC={'story':'이야기','facts':'핵심 정보','look':'놓치지 말아야 할 것',
     'tips':'실용 팁','faq':'자주 묻는 질문','map':'지도에서 보기',
     'visitor':'방문 정보','more':'같은 도시의 다른 명소 —'}
ROW={'time':'소요 시간','audio':'Lokali 오디오 가이드','type':'유형','best':'추천 대상',
     'loc':'위치','coord':'좌표','langs':'언어'}
UI={'badge':'무료 오디오 가이드','begin':'시작하기','open':'Lokali 앱 열기',
    'verified':'2026년 10월 확인','howwrite':'가이드 제작 방식',
    'maps':'Google 지도에서 열기','allcities':'모든 도시','editorial':'편집 원칙',
    'guidesin':'오디오 가이드 —','langval':'50+개 언어, Lokali 앱에서','free':'무료',
    'min':'분','getapp':'앱 받기'}
CAT={'history':'역사','photography':'사진','authentic':'현지 분위기','romantic':'로맨틱',
     'family':'가족','editors':'편집자 추천','nature':'자연','art':'예술',
     'architecture':'건축','food':'음식'}
T={'Archaeological Site':'유적지','Museum':'박물관','Mosque':'모스크','Neighborhood':'동네',
 'Beach':'해변','Historic Town':'역사 지구','Palace':'궁전','Waterfall':'폭포',
 'Viewpoint':'전망대','Park':'공원','Canyon':'협곡','Lake':'호수','Tower':'탑','Mountain':'산',
 'Village':'마을','Market':'시장','Monastery':'수도원','Town':'도시','Castle':'성',
 'Neolithic Site':'신석기 유적','Church':'교회','Street':'거리','Sea Castle':'해상 요새',
 'Salt Lake':'염호','Ancient Wonder Site':'고대 불가사의 유적','Monument':'기념물',
 'Cable Car':'케이블카','Historic District':'역사 지구','Beach and Ruins':'유적이 있는 해변',
 'Natural Site':'자연 명소','Rock Formations':'기암 지대','Islands':'군도','Fortress':'요새',
 'Gorge':'협곡','Ancient Town':'고대 도시','Square':'광장','Ancient Temple':'고대 신전',
 'Rock Fortress':'암벽 요새','Island Church':'섬 교회','Ruined City':'폐허 도시',
 'Mausoleum':'영묘','Ancient Theater':'고대 극장','Highland Plateau':'고원',
 'Sacred Pool':'성스러운 연못','Cistern':'지하 저수조','Waterway':'수로',
 'Beach Valley':'해안 계곡','Region':'지역','Bathhouse':'역사적 목욕탕',
 'Natural Phenomenon':'자연 현상','Historic Village':'역사 마을','Ancient Tombs':'고대 무덤군',
 'Underground City':'지하 도시','City Walls':'성벽','Memorial Site':'기념 장소',
 'Rock Churches':'암굴 교회군','Sunken Town':'수몰 도시','Historic Square':'역사 광장',
 'Religious Site':'종교 유적','Cathedral':'대성당','Temple':'사원','Garden':'정원',
 'Island':'섬','Valley':'계곡','Bazaar':'바자르','Bridge':'다리','Ruins':'유적군',
 'Historic Site':'사적지','Historical Site':'사적지','Landmark':'랜드마크',
 'Sunken Ruins':'수중 유적','Abandoned Village':'버려진 마을','Ghost Town':'유령 도시',
 'Historic Café':'오래된 카페','Pilgrimage Site':'순례지','Museum Complex':'박물관 단지',
 'Stadium':'경기장','Cinema':'영화관','Basilica':'바실리카','Food Market':'식료품 시장',
 'Religious Complex':'종교 복합 단지','Skyscraper':'마천루','Shrine':'사당'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','시간',s); s=_re.sub(r'\bmin(utes)?\b','분',s)
    s=s.replace('-','~').replace(' 시간','시간').replace(' 분','분')
    return s

def _p(word,with_final,without_final):
    """Korean particles depend on whether the preceding syllable ends in a
    consonant. Writing "은(는)" everywhere is the mark of an untranslated
    template, and the rule is deterministic for Hangul, so apply it."""
    if not word: return without_final
    c=word.strip()[-1]
    if '\uac00'<=c<='\ud7a3':
        return with_final if (ord(c)-0xac00)%28 else without_final
    if c.isdigit() or c.isascii():
        return without_final
    return without_final
EUN=lambda w:_p(w,'은','는')
I_GA=lambda w:_p(w,'이','가')
EUL=lambda w:_p(w,'을','를')
def where(city,country): return f'{city}({country})'
def more_heading(city): return f'{city}의 다른 명소'
def guides_in(country): return f'오디오 가이드 — {country}'
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"{t} 관람에 얼마나 걸리나요?",
        (f"대부분의 방문객은 {vis} 정도 머뭅니다. " if vis else "")+
        f"Lokali 무료 오디오 가이드는 {mins}분이며 걸으면서 들을 수 있습니다."),
       (f"{t}에 무료 오디오 가이드가 있나요?",
        f"있습니다. Lokali 앱이 50+개 언어로 무료 해설을 제공합니다. 티켓도, 단체 투어도, "
        f"구독도 필요 없으며 내려받으면 오프라인에서도 사용할 수 있습니다.")]
    if lat is not None:
        o.append((f"{t}{EUN(t)} 어디에 있나요?",
          f"위치는 {city}({country}), 좌표는 {lat}, {lng}입니다. "
          f"이 페이지의 지도 링크를 누르면 경로가 열립니다."))
    if tips: o.append((f"{t} 방문 전에 알아둘 점은?", tips[0]))
    if kfs:  o.append((f"{t}{EUN(t)} 무엇으로 유명한가요?", kfs[0]))
    TW=_re.compile(r'(아침|오전|오후|저녁|일출|일몰|이른|늦은|계절|여름|겨울|봄|가을|주말|빛|줄|혼잡|붐)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"{t} 방문하기 좋은 시간은?", tt[0]))
    return o
LOCALE='ko_KR'
TITLE='{t}, {city} — 무료 오디오 가이드 | Lokali'
TITLE_SHORT='{t} — 무료 오디오 가이드 | Lokali'
HUB_TITLE='{city} — 무료 오디오 가이드 {n}개 | Lokali'
HUB_TITLE_SHORT='{city} — 오디오 가이드 {n}개 | Lokali'
HUB_DESC="{city}의 Lokali 무료 오디오 가이드 {n}개: {names}. 소요 시간, 놓치지 말아야 할 것, 실용 팁. 오프라인 지원, 티켓 불필요."
HUB_INTRO="Lokali에는 {city}의 무료 오디오 가이드가 {n}개 있습니다. 모두 50+개 언어를 지원하며 티켓이나 단체 투어 없이 이용할 수 있고, 내려받으면 오프라인에서도 작동합니다."
SENT={'is':'{t}{eun} {where}에 있는 {tp}입니다.','in':'{t}{eun} {where}에 있습니다.',
      'spend':'대부분의 방문객은 {vis} 정도 머뭅니다.',
      'runs':'Lokali 무료 오디오 가이드는 {n}분입니다.',
      'route':'현재 위치에서 {t}까지의 경로를 엽니다.'}
COUNTRY={'türkiye':'튀르키예','greece':'그리스','italy':'이탈리아','france':'프랑스',
 'spain':'스페인','germany':'독일','austria':'오스트리아','georgia':'조지아','india':'인도',
 'japan':'일본','china':'중국','egypt':'이집트','poland':'폴란드','czechia':'체코',
 'united-kingdom':'영국','united-states':'미국','netherlands':'네덜란드','russia':'러시아',
 'thailand':'태국','romania':'루마니아','israel':'이스라엘','morocco':'모로코','mexico':'멕시코',
 'portugal':'포르투갈','sweden':'스웨덴','denmark':'덴마크','finland':'핀란드',
 'iceland':'아이슬란드','switzerland':'스위스','hungary':'헝가리','croatia':'크로아티아',
 'cyprus':'키프로스','jordan':'요르단','iran':'이란','vietnam':'베트남','indonesia':'인도네시아',
 'singapore':'싱가포르','south-korea':'대한민국','malaysia':'말레이시아','taiwan':'대만',
 'brazil':'브라질','argentina':'아르헨티나','peru':'페루','chile':'칠레','colombia':'콜롬비아',
 'canada':'캐나다','australia':'호주','new-zealand':'뉴질랜드','south-africa':'남아프리카공화국',
 'kazakhstan':'카자흐스탄','madagascar':'마다가스카르','ireland':'아일랜드','belgium':'벨기에',
 'norway':'노르웨이','nepal':'네팔','pakistan':'파키스탄','cambodia':'캄보디아',
 'philippines':'필리핀'}
def hub_faq(city,n):
    return [(f"{city}에는 무료 오디오 가이드가 몇 개 있나요?",
             f"{n}개입니다. 모두 무료이며 50+개 언어를 지원하고 오프라인에서도 작동합니다."),
            (f"{city} 오디오 가이드는 정말 무료인가요?",
             "네. 티켓도, 단체 투어도, 구독도 필요 없이 본인의 휴대폰에서 재생됩니다.")]
