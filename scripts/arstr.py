# -*- coding: utf-8 -*-
"""Arabic. Section headings lifted from the existing explore/ar/ pages.

Right-to-left, so DIR is set and gen.py writes dir="rtl" on <html>. Arabic has
no indefinite article, so a type is just the noun. Slugs use the English page's
slug (USE_EN_SLUG) -- the existing Arabic pages already live there and
romanising Arabic titles would invent names.
"""
import re as _re
USE_EN_SLUG=True
DIR='rtl'
SEC={'story':'الحكاية','facts':'حقائق أساسية','look':'ما الذي تبحث عنه',
     'tips':'نصائح عملية','faq':'أسئلة شائعة','map':'على الخريطة',
     'visitor':'معلومات للزائر','more':'ماذا تشاهد أيضًا في'}
ROW={'time':'الوقت اللازم','audio':'دليل Lokali الصوتي','type':'النوع','best':'مناسب لـ',
     'loc':'الموقع','coord':'الإحداثيات','langs':'اللغات'}
UI={'badge':'دليل صوتي مجاني','begin':'ابدأ','open':'افتح تطبيق Lokali',
    'verified':'تم التحقق في أكتوبر 2026','howwrite':'كيف نكتب هذه الأدلة',
    'maps':'افتح في خرائط Google','allcities':'كل المدن','editorial':'سياسة التحرير',
    'guidesin':'أدلة صوتية في','langval':'45 لغة، في تطبيق Lokali','free':'مجاني',
    'min':'دقيقة','getapp':'حمّل التطبيق'}
CAT={'history':'التاريخ','photography':'التصوير','authentic':'أجواء محلية',
     'romantic':'رومانسي','family':'العائلات','editors':'اختيار المحررين','nature':'الطبيعة',
     'art':'الفن','architecture':'العمارة','food':'الطعام'}
T={'Archaeological Site':'موقع أثري','Museum':'متحف','Mosque':'مسجد','Neighborhood':'حي',
 'Beach':'شاطئ','Historic Town':'مدينة تاريخية','Palace':'قصر','Waterfall':'شلال',
 'Viewpoint':'نقطة إطلالة','Park':'حديقة','Canyon':'وادٍ سحيق','Lake':'بحيرة','Tower':'برج',
 'Mountain':'جبل','Village':'قرية','Market':'سوق','Monastery':'دير','Town':'مدينة','Castle':'قلعة',
 'Neolithic Site':'موقع من العصر الحجري الحديث','Church':'كنيسة','Street':'شارع',
 'Sea Castle':'قلعة بحرية','Salt Lake':'بحيرة ملحية','Ancient Wonder Site':'موقع أعجوبة قديمة',
 'Monument':'نصب تذكاري','Cable Car':'تلفريك','Historic District':'حي تاريخي',
 'Beach and Ruins':'شاطئ بأطلال','Natural Site':'موقع طبيعي','Rock Formations':'تشكيلات صخرية',
 'Islands':'أرخبيل','Fortress':'حصن','Gorge':'مضيق جبلي','Ancient Town':'مدينة قديمة',
 'Square':'ساحة','Ancient Temple':'معبد قديم','Rock Fortress':'حصن صخري',
 'Island Church':'كنيسة على جزيرة','Ruined City':'مدينة أطلال','Mausoleum':'ضريح',
 'Ancient Theater':'مسرح قديم','Highland Plateau':'هضبة مرتفعة','Sacred Pool':'بركة مقدسة',
 'Cistern':'صهريج تحت الأرض','Waterway':'ممر مائي','Beach Valley':'وادٍ ساحلي','Region':'منطقة',
 'Bathhouse':'حمّام تاريخي','Natural Phenomenon':'ظاهرة طبيعية','Historic Village':'قرية تاريخية',
 'Ancient Tombs':'مقابر قديمة','Underground City':'مدينة تحت الأرض','City Walls':'أسوار المدينة',
 'Memorial Site':'نصب تذكاري','Rock Churches':'كنائس صخرية','Sunken Town':'مدينة غارقة',
 'Historic Square':'ساحة تاريخية','Religious Site':'موقع ديني','Cathedral':'كاتدرائية',
 'Temple':'معبد','Garden':'حديقة','Island':'جزيرة','Valley':'وادٍ','Bazaar':'بازار','Bridge':'جسر',
 'Ruins':'أطلال','Historic Site':'موقع تاريخي','Historical Site':'موقع تاريخي','Landmark':'معلم',
 'Sunken Ruins':'أطلال غارقة','Abandoned Village':'قرية مهجورة','Ghost Town':'مدينة أشباح',
 'Historic Café':'مقهى تاريخي','Pilgrimage Site':'موقع حج','Museum Complex':'مجمع متاحف',
 'Stadium':'ملعب','Cinema':'سينما','Basilica':'بازيليكا','Food Market':'سوق للأطعمة',
 'Religious Complex':'مجمع ديني','Skyscraper':'ناطحة سحاب','Shrine':'مزار'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','ساعة',s); s=_re.sub(r'\bmin(utes)?\b','دقيقة',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"كم من الوقت يحتاج زيارة {t}؟",
        (f"يقضي معظم الزوار {vis}. " if vis else "")+
        f"دليل Lokali الصوتي المجاني مدته {mins} دقيقة ويمكن سماعه أثناء المشي."),
       (f"هل يوجد دليل صوتي مجاني لـ{t}؟",
        f"نعم — يروي تطبيق Lokali قصة المكان مجانًا بـ45 لغة. بلا تذكرة ولا مجموعة سياحية "
        f"ولا اشتراك؛ وبعد التنزيل يعمل دون اتصال بالإنترنت.")]
    if lat is not None:
        o.append((f"أين يقع {t}؟",
          f"الموقع: {city}، {country}؛ الإحداثيات {lat}, {lng}. "
          f"اضغط على رابط الخريطة في هذه الصفحة لفتح الاتجاهات."))
    if tips: o.append((f"ما الذي يجب معرفته قبل زيارة {t}؟", tips[0]))
    if kfs:  o.append((f"بماذا يشتهر {t}؟", kfs[0]))
    TW=_re.compile(r'(صباح|الظهر|بعد الظهر|المساء|الشروق|الغروب|مبكر|متأخر|موسم|الصيف|الشتاء|'
                   r'الربيع|الخريف|العطلة|الضوء|الطابور|الزحام|الازدحام)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"ما أفضل وقت لزيارة {t}؟", tt[0]))
    return o
LOCALE='ar_SA'
TITLE='{t}، {city} — دليل صوتي مجاني | Lokali'
TITLE_SHORT='{t} — دليل صوتي مجاني | Lokali'
HUB_TITLE='{city} — {n} دليلًا صوتيًا مجانيًا | Lokali'
HUB_TITLE_SHORT='{city} — {n} دليل صوتي | Lokali'
HUB_DESC="{n} دليلًا صوتيًا مجانيًا من Lokali في {city}: {names}. مدة الزيارة وما يستحق الانتباه ونصائح عملية. دون اتصال، وبلا تذكرة."
HUB_INTRO="لدى Lokali {n} دليلًا صوتيًا مجانيًا في {city}. كلها متاحة بـ45 لغة، ولا تحتاج إلى تذكرة ولا مجموعة سياحية، وتعمل دون اتصال بعد التنزيل."
SENT={'is':'{t} هو {tp} في {where}.','in':'{t} يقع في {where}.',
      'spend':'يقضي معظم الزوار {vis}.',
      'runs':'دليل Lokali الصوتي المجاني مدته {n} دقيقة.',
      'route':'افتح الطريق إلى {t} من موقعك.'}
COUNTRY={'türkiye':'تركيا','greece':'اليونان','italy':'إيطاليا','france':'فرنسا','spain':'إسبانيا',
 'germany':'ألمانيا','austria':'النمسا','georgia':'جورجيا','india':'الهند','japan':'اليابان',
 'china':'الصين','egypt':'مصر','poland':'بولندا','czechia':'التشيك',
 'united-kingdom':'المملكة المتحدة','united-states':'الولايات المتحدة','netherlands':'هولندا',
 'russia':'روسيا','thailand':'تايلاند','romania':'رومانيا','israel':'إسرائيل','morocco':'المغرب',
 'mexico':'المكسيك','portugal':'البرتغال','sweden':'السويد','denmark':'الدنمارك','finland':'فنلندا',
 'iceland':'أيسلندا','switzerland':'سويسرا','hungary':'المجر','croatia':'كرواتيا','cyprus':'قبرص',
 'jordan':'الأردن','iran':'إيران','vietnam':'فيتنام','indonesia':'إندونيسيا','singapore':'سنغافورة',
 'south-korea':'كوريا الجنوبية','malaysia':'ماليزيا','taiwan':'تايوان','brazil':'البرازيل',
 'argentina':'الأرجنتين','peru':'بيرو','chile':'تشيلي','colombia':'كولومبيا','canada':'كندا',
 'australia':'أستراليا','new-zealand':'نيوزيلندا','south-africa':'جنوب أفريقيا',
 'kazakhstan':'كازاخستان','madagascar':'مدغشقر','ireland':'أيرلندا','belgium':'بلجيكا',
 'norway':'النرويج','nepal':'نيبال','pakistan':'باكستان','cambodia':'كمبوديا',
 'philippines':'الفلبين'}
def hub_faq(city,n):
    return [(f"كم عدد الأدلة الصوتية المجانية في {city}؟",
             f"{n}. كلها مجانية، بـ45 لغة، وتعمل دون اتصال بالإنترنت."),
            (f"هل دليل {city} الصوتي مجاني فعلًا؟",
             "نعم. بلا تذكرة ولا مجموعة سياحية ولا اشتراك — تُشغَّل الأدلة على هاتفك.")]
