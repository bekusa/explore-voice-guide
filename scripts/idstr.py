# -*- coding: utf-8 -*-
"""Indonesian. Section headings lifted from the existing explore/id/ pages.
No articles and no plural agreement, so a type is simply the noun."""
import re as _re
SEC={'story':'Kisahnya','facts':'Fakta penting','look':'Apa yang perlu diamati',
     'tips':'Tips praktis','faq':'Pertanyaan umum','map':'Di peta',
     'visitor':'Informasi pengunjung','more':'Lihat juga di'}
ROW={'time':'Waktu yang dibutuhkan','audio':'Panduan audio Lokali','type':'Jenis',
     'best':'Cocok untuk','loc':'Lokasi','coord':'Koordinat','langs':'Bahasa'}
UI={'badge':'Panduan audio gratis','begin':'Mulai','open':'Buka aplikasi Lokali',
    'verified':'Diverifikasi Oktober 2026','howwrite':'cara kami menulis panduan ini',
    'maps':'Buka di Google Maps','allcities':'Semua kota','editorial':'Proses redaksi',
    'guidesin':'Panduan audio di','langval':'45 bahasa, di aplikasi Lokali','free':'gratis',
    'min':'mnt','getapp':'Unduh aplikasi'}
CAT={'history':'Sejarah','photography':'Fotografi','authentic':'Autentik','romantic':'Romantis',
     'family':'Keluarga','editors':'Pilihan redaksi','nature':'Alam','art':'Seni',
     'architecture':'Arsitektur','food':'Kuliner'}
T={'Archaeological Site':'situs arkeologi','Museum':'museum','Mosque':'masjid',
 'Neighborhood':'kawasan','Beach':'pantai','Historic Town':'kota bersejarah','Palace':'istana',
 'Waterfall':'air terjun','Viewpoint':'titik pandang','Park':'taman','Canyon':'ngarai',
 'Lake':'danau','Tower':'menara','Mountain':'gunung','Village':'desa','Market':'pasar',
 'Monastery':'biara','Town':'kota','Castle':'kastil','Neolithic Site':'situs neolitikum',
 'Church':'gereja','Street':'jalan','Sea Castle':'benteng laut','Salt Lake':'danau garam',
 'Ancient Wonder Site':'situs keajaiban kuno','Monument':'monumen','Cable Car':'kereta gantung',
 'Historic District':'kawasan bersejarah','Beach and Ruins':'pantai dengan reruntuhan',
 'Natural Site':'kawasan alam','Rock Formations':'formasi batuan','Islands':'gugusan pulau',
 'Fortress':'benteng','Gorge':'ngarai','Ancient Town':'kota kuno','Square':'alun-alun',
 'Ancient Temple':'kuil kuno','Rock Fortress':'benteng batu','Island Church':'gereja di pulau',
 'Ruined City':'kota reruntuhan','Mausoleum':'mausoleum','Ancient Theater':'teater kuno',
 'Highland Plateau':'dataran tinggi','Sacred Pool':'kolam suci','Cistern':'waduk bawah tanah',
 'Waterway':'jalur air','Beach Valley':'lembah pantai','Region':'wilayah',
 'Bathhouse':'pemandian bersejarah','Natural Phenomenon':'fenomena alam',
 'Historic Village':'desa bersejarah','Ancient Tombs':'makam kuno',
 'Underground City':'kota bawah tanah','City Walls':'tembok kota','Memorial Site':'situs peringatan',
 'Rock Churches':'gereja batu','Sunken Town':'kota tenggelam','Historic Square':'alun-alun bersejarah',
 'Religious Site':'tempat ibadah','Cathedral':'katedral','Temple':'kuil','Garden':'taman',
 'Island':'pulau','Valley':'lembah','Bazaar':'pasar','Bridge':'jembatan',
 'Ruins':'kompleks reruntuhan','Historic Site':'situs bersejarah','Historical Site':'situs bersejarah',
 'Landmark':'markah tanah','Sunken Ruins':'reruntuhan bawah air',
 'Abandoned Village':'desa terbengkalai','Ghost Town':'kota hantu','Historic Café':'kafe bersejarah',
 'Pilgrimage Site':'tempat ziarah','Museum Complex':'kompleks museum','Stadium':'stadion',
 'Cinema':'bioskop','Basilica':'basilika','Food Market':'pasar kuliner',
 'Religious Complex':'kompleks keagamaan','Skyscraper':'pencakar langit','Shrine':'tempat pemujaan'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','jam',s); s=_re.sub(r'\bmin(utes)?\b','mnt',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"Berapa lama waktu yang dibutuhkan untuk {t}?",
        (f"Sebagian besar pengunjung menghabiskan {vis}. " if vis else "")+
        f"Panduan audio gratis Lokali berdurasi {mins} menit dan bisa didengarkan sambil berjalan."),
       (f"Apakah ada panduan audio gratis untuk {t}?",
        f"Ada — aplikasi Lokali menceritakan {t} secara gratis dalam 45 bahasa. Tanpa tiket, "
        f"tanpa rombongan dan tanpa langganan; setelah diunduh bisa dipakai offline.")]
    if lat is not None:
        o.append((f"Di mana letak {t}?",
          f"{t} berada di {city}, {country}, pada koordinat {lat}, {lng}. "
          f"Ketuk tautan peta di halaman ini untuk membuka rutenya."))
    if tips: o.append((f"Apa yang perlu diketahui sebelum mengunjungi {t}?", tips[0]))
    if kfs:  o.append((f"{t} terkenal karena apa?", kfs[0]))
    TW=_re.compile(r'(?i)(pagi|siang|sore|senja|matahari terbit|matahari terbenam|lebih awal|'
                   r'larut|musim|akhir pekan|cahaya|antre|antri|ramai|padat)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"Kapan waktu terbaik mengunjungi {t}?", tt[0]))
    return o
LOCALE='id_ID'
TITLE='{t}, {city} — Panduan audio gratis | Lokali'
TITLE_SHORT='{t} — Panduan audio gratis | Lokali'
HUB_TITLE='{city} — {n} panduan audio gratis | Lokali'
HUB_TITLE_SHORT='{city} — {n} panduan audio | Lokali'
HUB_DESC="{n} panduan audio Lokali gratis di {city}: {names}. Lama kunjungan, apa yang perlu diamati dan tips praktis — offline, tanpa tiket."
HUB_INTRO="Lokali punya {n} panduan audio gratis di {city}. Semuanya tersedia dalam 45 bahasa, tidak perlu tiket atau rombongan, dan bisa dipakai offline setelah diunduh."
SENT={'is':'{t} adalah {tp} di {where}.','in':'{t} berada di {where}.',
      'spend':'Sebagian besar pengunjung menghabiskan {vis}.',
      'runs':'Panduan audio gratis Lokali berdurasi {n} menit.',
      'route':'Buka rute ke {t} dari lokasi Anda.'}
COUNTRY={'türkiye':'Turki','greece':'Yunani','italy':'Italia','france':'Prancis','spain':'Spanyol',
 'germany':'Jerman','austria':'Austria','georgia':'Georgia','india':'India','japan':'Jepang',
 'china':'Tiongkok','egypt':'Mesir','poland':'Polandia','czechia':'Ceko',
 'united-kingdom':'Britania Raya','united-states':'Amerika Serikat','netherlands':'Belanda',
 'russia':'Rusia','thailand':'Thailand','romania':'Rumania','israel':'Israel','morocco':'Maroko',
 'mexico':'Meksiko','portugal':'Portugal','sweden':'Swedia','denmark':'Denmark','finland':'Finlandia',
 'iceland':'Islandia','switzerland':'Swiss','hungary':'Hungaria','croatia':'Kroasia','cyprus':'Siprus',
 'jordan':'Yordania','iran':'Iran','vietnam':'Vietnam','indonesia':'Indonesia','singapore':'Singapura',
 'south-korea':'Korea Selatan','malaysia':'Malaysia','taiwan':'Taiwan','brazil':'Brasil',
 'argentina':'Argentina','peru':'Peru','chile':'Cile','colombia':'Kolombia','canada':'Kanada',
 'australia':'Australia','new-zealand':'Selandia Baru','south-africa':'Afrika Selatan',
 'kazakhstan':'Kazakhstan','madagascar':'Madagaskar','ireland':'Irlandia','belgium':'Belgia',
 'norway':'Norwegia','nepal':'Nepal','pakistan':'Pakistan','cambodia':'Kamboja',
 'philippines':'Filipina'}
def hub_faq(city,n):
    return [(f"Ada berapa panduan audio gratis di {city}?",
             f"{n}. Semuanya gratis, tersedia dalam 45 bahasa, dan bisa dipakai offline."),
            (f"Apakah panduan audio {city} benar-benar gratis?",
             "Ya. Tanpa tiket, tanpa rombongan dan tanpa langganan — panduan diputar di ponsel Anda sendiri.")]
