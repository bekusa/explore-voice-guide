# -*- coding: utf-8 -*-
"""Simplified Chinese. Section headings lifted from the existing explore/zh-cn/ pages.

Chinese has no articles and no plural agreement, so a type is just the noun.
Slugs use the English page's slug (USE_EN_SLUG) because the existing Chinese
pages already sit on those paths and pinyin would invent a romanisation.

MAXDESC/MAXTITLE are much lower than the Latin defaults: a Chinese character is
roughly twice as wide as a Latin one, so 158 characters would run far past what
a search result shows.
"""
USE_EN_SLUG=True
MAXDESC=78
MAXTITLE=34
SEC={'story':'它的故事','facts':'关键事实','look':'看点','tips':'实用贴士',
     'faq':'常见问题','map':'地图位置','visitor':'参观信息','more':'同城其他看点'}
ROW={'time':'建议游览时长','audio':'Lokali 语音导览','type':'类型','best':'适合',
     'loc':'位置','coord':'坐标','langs':'语言'}
UI={'badge':'免费语音导览','begin':'开始','open':'打开 Lokali 应用',
    'verified':'2026 年 10 月核实','howwrite':'我们如何撰写这些导览',
    'maps':'在 Google 地图中打开','allcities':'所有城市','editorial':'编辑流程',
    'guidesin':'语音导览','langval':'45 种语言，在 Lokali 应用中','free':'免费',
    'min':'分钟','getapp':'获取应用'}
CAT={'history':'历史','photography':'摄影','authentic':'本地风味','romantic':'浪漫',
     'family':'亲子','editors':'编辑推荐','nature':'自然','art':'艺术',
     'architecture':'建筑','food':'美食'}
T={'Archaeological Site':'考古遗址','Museum':'博物馆','Mosque':'清真寺','Neighborhood':'街区',
 'Beach':'海滩','Historic Town':'历史城区','Palace':'宫殿','Waterfall':'瀑布','Viewpoint':'观景点',
 'Park':'公园','Canyon':'峡谷','Lake':'湖泊','Tower':'塔','Mountain':'山','Village':'村庄',
 'Market':'市场','Monastery':'修道院','Town':'城镇','Castle':'城堡','Neolithic Site':'新石器时代遗址',
 'Church':'教堂','Street':'街道','Sea Castle':'海上城堡','Salt Lake':'盐湖',
 'Ancient Wonder Site':'古代奇迹遗址','Monument':'纪念碑','Cable Car':'缆车',
 'Historic District':'历史街区','Beach and Ruins':'海滩与遗址','Natural Site':'自然景区',
 'Rock Formations':'岩石地貌','Islands':'群岛','Fortress':'要塞','Gorge':'峡谷',
 'Ancient Town':'古城','Square':'广场','Ancient Temple':'古神庙','Rock Fortress':'岩石要塞',
 'Island Church':'岛上教堂','Ruined City':'废城遗址','Mausoleum':'陵墓','Ancient Theater':'古剧场',
 'Highland Plateau':'高原','Sacred Pool':'圣池','Cistern':'地下水宫','Waterway':'水道',
 'Beach Valley':'海滨谷地','Region':'地区','Bathhouse':'历史浴场','Natural Phenomenon':'自然奇观',
 'Historic Village':'历史村落','Ancient Tombs':'古墓群','Underground City':'地下城',
 'City Walls':'城墙','Memorial Site':'纪念地','Rock Churches':'石窟教堂','Sunken Town':'水下古城',
 'Historic Square':'历史广场','Religious Site':'宗教场所','Cathedral':'主教座堂','Temple':'寺庙',
 'Garden':'园林','Island':'岛屿','Valley':'山谷','Bazaar':'集市','Bridge':'桥梁','Ruins':'遗址群',
 'Historic Site':'历史遗迹','Historical Site':'历史遗迹','Landmark':'地标',
 'Sunken Ruins':'水下遗址','Abandoned Village':'废弃村落','Ghost Town':'鬼城',
 'Historic Café':'老咖啡馆','Pilgrimage Site':'朝圣地','Museum Complex':'博物馆群',
 'Stadium':'体育场','Cinema':'影院','Basilica':'巴西利卡','Food Market':'美食市场',
 'Religious Complex':'宗教建筑群','Skyscraper':'摩天大楼','Shrine':'神龛'}
def type_phrase(t): return T.get(t)
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','小时',s); s=re.sub(r'\bmin(utes)?\b','分钟',s)
    return s.replace(' ','')
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"{t}需要游览多久？",
        (f"多数游客在此停留{vis}。" if vis else "")+
        f"Lokali 免费语音导览时长 {mins} 分钟，可边走边听。"),
       (f"{t}有免费语音导览吗？",
        f"有。Lokali 应用以 45 种语言免费讲解，无需门票、无需跟团、无需订阅；下载后可离线使用。")]
    if lat is not None:
        o.append((f"{t}在哪里？",
          f"位于{city}（{country}），坐标 {lat}, {lng}。点击本页的地图链接即可查看路线。"))
    if tips: o.append((f"参观{t}前需要知道什么？", tips[0]))
    if kfs:  o.append((f"{t}以什么闻名？", kfs[0]))
    import re as _re
    TW=_re.compile(r'(清晨|早晨|上午|下午|傍晚|日出|日落|提早|较晚|季节|夏|冬|春|秋|周末|光线|排队|人多|人潮)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"什么时候去{t}最好？", tt[0]))
    return o
LOCALE='zh_CN'
TITLE='{t}，{city} — 免费语音导览 | Lokali'
TITLE_SHORT='{t} — 免费语音导览 | Lokali'
HUB_TITLE='{city} — {n} 个免费语音导览 | Lokali'
HUB_TITLE_SHORT='{city} — {n} 个语音导览 | Lokali'
HUB_DESC="{city}的 {n} 个 Lokali 免费语音导览：{names}。游览时长、看点与实用贴士，离线可用，无需门票。"
HUB_INTRO="Lokali 为{city}提供 {n} 个免费语音导览。每一个都支持 45 种语言，无需门票、无需跟团，下载后可离线使用。"
SENT={'is':'{t}是位于{where}的{tp}。','in':'{t}位于{where}。',
      'spend':'多数游客在此停留{vis}。',
      'runs':'Lokali 免费语音导览时长 {n} 分钟。',
      'route':'从你的位置出发前往{t}。'}
COUNTRY={'türkiye':'土耳其','greece':'希腊','italy':'意大利','france':'法国','spain':'西班牙',
 'germany':'德国','austria':'奥地利','georgia':'格鲁吉亚','india':'印度','japan':'日本',
 'china':'中国','egypt':'埃及','poland':'波兰','czechia':'捷克','united-kingdom':'英国',
 'united-states':'美国','netherlands':'荷兰','russia':'俄罗斯','thailand':'泰国','romania':'罗马尼亚',
 'israel':'以色列','morocco':'摩洛哥','mexico':'墨西哥','portugal':'葡萄牙','sweden':'瑞典',
 'denmark':'丹麦','finland':'芬兰','iceland':'冰岛','switzerland':'瑞士','hungary':'匈牙利',
 'croatia':'克罗地亚','cyprus':'塞浦路斯','jordan':'约旦','iran':'伊朗','vietnam':'越南',
 'indonesia':'印度尼西亚','singapore':'新加坡','south-korea':'韩国','malaysia':'马来西亚',
 'taiwan':'台湾','brazil':'巴西','argentina':'阿根廷','peru':'秘鲁','chile':'智利',
 'colombia':'哥伦比亚','canada':'加拿大','australia':'澳大利亚','new-zealand':'新西兰',
 'south-africa':'南非','kazakhstan':'哈萨克斯坦','madagascar':'马达加斯加','ireland':'爱尔兰',
 'belgium':'比利时','norway':'挪威','nepal':'尼泊尔','pakistan':'巴基斯坦','cambodia':'柬埔寨',
 'philippines':'菲律宾'}
def hub_faq(city,n):
    return [(f"{city}有多少个免费语音导览？",
             f"{n} 个。全部免费，支持 45 种语言，并可离线使用。"),
            (f"{city}的语音导览真的免费吗？",
             "是的。无需门票、无需跟团、无需订阅——导览在你自己的手机上播放。")]

def where(city,country):
    return f'{city}（{country}）'
SEP=''        # Chinese does not put spaces between sentences
STOP='。'
def more_heading(city): return f'{city} 的其他看点'
def guides_in(country): return f'{country}语音导览'
