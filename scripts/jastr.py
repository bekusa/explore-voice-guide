# -*- coding: utf-8 -*-
"""Japanese. Section headings lifted from the existing explore/ja/ pages.

No articles and no plural agreement, so a type is just the noun. Japanese writes
without spaces between sentences and ends them with 。, so SEP/STOP are set
accordingly. Slugs use the English page's slug (USE_EN_SLUG): the existing
Japanese pages already live there and romanising kanji would invent names.

MAXDESC/MAXTITLE are far below the Latin defaults because a Japanese character
is roughly twice the width of a Latin one in a search result.
"""
import re as _re
USE_EN_SLUG=True
MAXDESC=78
MAXTITLE=34
SEP=''
STOP='。'
SEC={'story':'物語','facts':'基本情報','look':'見どころ','tips':'実用的なヒント',
     'faq':'よくある質問','map':'地図で見る','visitor':'訪問情報','more':'の他の見どころ'}
ROW={'time':'所要時間','audio':'Lokali音声ガイド','type':'種類','best':'おすすめ',
     'loc':'所在地','coord':'座標','langs':'言語'}
UI={'badge':'無料音声ガイド','begin':'はじめる','open':'Lokaliアプリを開く',
    'verified':'2026年10月に確認','howwrite':'ガイドの作り方',
    'maps':'Google マップで開く','allcities':'すべての都市','editorial':'編集方針',
    'guidesin':'の音声ガイド','langval':'50+言語、Lokaliアプリで','free':'無料',
    'min':'分','getapp':'アプリを入手'}
CAT={'history':'歴史','photography':'写真','authentic':'地元の雰囲気','romantic':'ロマンティック',
     'family':'家族向け','editors':'編集部のおすすめ','nature':'自然','art':'アート',
     'architecture':'建築','food':'グルメ'}
T={'Archaeological Site':'遺跡','Museum':'博物館','Mosque':'モスク','Neighborhood':'街区',
 'Beach':'ビーチ','Historic Town':'歴史地区','Palace':'宮殿','Waterfall':'滝',
 'Viewpoint':'展望スポット','Park':'公園','Canyon':'峡谷','Lake':'湖','Tower':'塔','Mountain':'山',
 'Village':'村','Market':'市場','Monastery':'修道院','Town':'町','Castle':'城',
 'Neolithic Site':'新石器時代の遺跡','Church':'教会','Street':'通り','Sea Castle':'海の城塞',
 'Salt Lake':'塩湖','Ancient Wonder Site':'古代の七不思議の地','Monument':'記念建造物',
 'Cable Car':'ロープウェイ','Historic District':'歴史地区','Beach and Ruins':'遺跡のあるビーチ',
 'Natural Site':'自然景勝地','Rock Formations':'奇岩群','Islands':'群島','Fortress':'要塞',
 'Gorge':'渓谷','Ancient Town':'古代都市','Square':'広場','Ancient Temple':'古代神殿',
 'Rock Fortress':'岩山の要塞','Island Church':'島の教会','Ruined City':'廃墟都市',
 'Mausoleum':'霊廟','Ancient Theater':'古代劇場','Highland Plateau':'高原',
 'Sacred Pool':'聖なる池','Cistern':'地下貯水槽','Waterway':'水路','Beach Valley':'海辺の谷',
 'Region':'地域','Bathhouse':'歴史ある浴場','Natural Phenomenon':'自然現象',
 'Historic Village':'歴史ある村','Ancient Tombs':'古代墓地','Underground City':'地下都市',
 'City Walls':'城壁','Memorial Site':'記念施設','Rock Churches':'岩窟教会群',
 'Sunken Town':'水没都市','Historic Square':'歴史ある広場','Religious Site':'宗教施設',
 'Cathedral':'大聖堂','Temple':'寺院','Garden':'庭園','Island':'島','Valley':'渓谷',
 'Bazaar':'バザール','Bridge':'橋','Ruins':'遺跡群','Historic Site':'史跡',
 'Historical Site':'史跡','Landmark':'ランドマーク','Sunken Ruins':'水中遺跡',
 'Abandoned Village':'廃村','Ghost Town':'ゴーストタウン','Historic Café':'老舗カフェ',
 'Pilgrimage Site':'巡礼地','Museum Complex':'博物館群','Stadium':'スタジアム','Cinema':'映画館',
 'Basilica':'バシリカ','Food Market':'食品市場','Religious Complex':'宗教建築群',
 'Skyscraper':'超高層ビル','Shrine':'聖堂'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','時間',s); s=_re.sub(r'\bmin(utes)?\b','分',s)
    return s.replace(' ','')
def where(city,country): return f'{city}（{country}）'
def more_heading(city): return f'{city}の他の見どころ'
def guides_in(country): return f'{country}の音声ガイド'
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"{t}の見学にはどのくらい時間がかかりますか？",
        (f"多くの人が{vis}ほど過ごします。" if vis else "")+
        f"Lokaliの無料音声ガイドは{mins}分で、歩きながら聴けます。"),
       (f"{t}に無料の音声ガイドはありますか？",
        f"あります。Lokaliアプリが50+言語で無料で解説します。チケットもツアー参加も定期購読も不要で、"
        f"ダウンロード後はオフラインでも使えます。")]
    if lat is not None:
        o.append((f"{t}はどこにありますか？",
          f"{city}（{country}）にあり、座標は{lat}, {lng}です。"
          f"このページの地図リンクをタップすると経路が開きます。"))
    if tips: o.append((f"{t}を訪れる前に知っておくことは？", tips[0]))
    if kfs:  o.append((f"{t}は何で知られていますか？", kfs[0]))
    TW=_re.compile(r'(朝|午前|午後|夕方|日の出|日没|早め|遅め|季節|夏|冬|春|秋|週末|光|行列|混雑)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"{t}を訪れるのに最適な時間は？", tt[0]))
    return o
LOCALE='ja_JP'
TITLE='{t}（{city}）— 無料音声ガイド | Lokali'
TITLE_SHORT='{t} — 無料音声ガイド | Lokali'
HUB_TITLE='{city} — 無料音声ガイド{n}件 | Lokali'
HUB_TITLE_SHORT='{city} — 音声ガイド{n}件 | Lokali'
HUB_DESC="{city}のLokali無料音声ガイド{n}件：{names}。所要時間、見どころ、実用的なヒント。オフライン対応、チケット不要。"
HUB_INTRO="Lokaliには{city}の無料音声ガイドが{n}件あります。すべて50+言語に対応し、チケットもツアー参加も不要で、ダウンロードすればオフラインでも使えます。"
SENT={'is':'{t}は{where}の{tp}です。','in':'{t}は{where}にあります。',
      'spend':'多くの人が{vis}ほど過ごします。',
      'runs':'Lokaliの無料音声ガイドは{n}分です。',
      'route':'現在地から{t}への経路を開きます。'}
COUNTRY={'türkiye':'トルコ','greece':'ギリシャ','italy':'イタリア','france':'フランス',
 'spain':'スペイン','germany':'ドイツ','austria':'オーストリア','georgia':'ジョージア',
 'india':'インド','japan':'日本','china':'中国','egypt':'エジプト','poland':'ポーランド',
 'czechia':'チェコ','united-kingdom':'イギリス','united-states':'アメリカ',
 'netherlands':'オランダ','russia':'ロシア','thailand':'タイ','romania':'ルーマニア',
 'israel':'イスラエル','morocco':'モロッコ','mexico':'メキシコ','portugal':'ポルトガル',
 'sweden':'スウェーデン','denmark':'デンマーク','finland':'フィンランド','iceland':'アイスランド',
 'switzerland':'スイス','hungary':'ハンガリー','croatia':'クロアチア','cyprus':'キプロス',
 'jordan':'ヨルダン','iran':'イラン','vietnam':'ベトナム','indonesia':'インドネシア',
 'singapore':'シンガポール','south-korea':'韓国','malaysia':'マレーシア','taiwan':'台湾',
 'brazil':'ブラジル','argentina':'アルゼンチン','peru':'ペルー','chile':'チリ',
 'colombia':'コロンビア','canada':'カナダ','australia':'オーストラリア',
 'new-zealand':'ニュージーランド','south-africa':'南アフリカ','kazakhstan':'カザフスタン',
 'madagascar':'マダガスカル','ireland':'アイルランド','belgium':'ベルギー','norway':'ノルウェー',
 'nepal':'ネパール','pakistan':'パキスタン','cambodia':'カンボジア','philippines':'フィリピン'}
def hub_faq(city,n):
    return [(f"{city}には無料音声ガイドがいくつありますか？",
             f"{n}件です。すべて無料で、50+言語に対応し、オフラインでも使えます。"),
            (f"{city}の音声ガイドは本当に無料ですか？",
             "はい。チケットもツアー参加も定期購読も不要で、ご自身のスマートフォンで再生できます。")]
