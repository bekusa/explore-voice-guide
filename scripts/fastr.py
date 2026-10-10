# -*- coding: utf-8 -*-
"""Persian. Section headings lifted from the existing explore/fa/ pages.

Right-to-left, no indefinite article before the type noun in this construction,
and slugs borrow the English page's slug (USE_EN_SLUG) because the existing
Persian pages already live there.
"""
import re as _re
USE_EN_SLUG=True
DIR='rtl'
SEC={'story':'داستان','facts':'حقایق کلیدی','look':'به دنبال چه بگردید',
     'tips':'نکته‌های کاربردی','faq':'پرسش‌های رایج','map':'روی نقشه',
     'visitor':'اطلاعات بازدید','more':'چه چیز دیگری ببینید در'}
ROW={'time':'زمان لازم','audio':'راهنمای صوتی Lokali','type':'نوع','best':'مناسب برای',
     'loc':'موقعیت','coord':'مختصات','langs':'زبان‌ها'}
UI={'badge':'راهنمای صوتی رایگان','begin':'آغاز','open':'اپلیکیشن Lokali را باز کنید',
    'verified':'بررسی‌شده در اکتبر ۲۰۲۶','howwrite':'چگونه این راهنماها را می‌نویسیم',
    'maps':'باز کردن در Google Maps','allcities':'همهٔ شهرها','editorial':'فرایند تحریریه',
    'guidesin':'راهنماهای صوتی در','langval':'۴۵ زبان، در اپلیکیشن Lokali','free':'رایگان',
    'min':'دقیقه','getapp':'دریافت اپلیکیشن'}
CAT={'history':'تاریخ','photography':'عکاسی','authentic':'حال‌وهوای محلی','romantic':'رمانتیک',
     'family':'خانواده‌ها','editors':'انتخاب سردبیر','nature':'طبیعت','art':'هنر',
     'architecture':'معماری','food':'خوراک'}
T={'Archaeological Site':'محوطهٔ باستانی','Museum':'موزه','Mosque':'مسجد','Neighborhood':'محله',
 'Beach':'ساحل','Historic Town':'شهر تاریخی','Palace':'کاخ','Waterfall':'آبشار',
 'Viewpoint':'نقطهٔ دیدبانی','Park':'پارک','Canyon':'درهٔ عمیق','Lake':'دریاچه','Tower':'برج',
 'Mountain':'کوه','Village':'روستا','Market':'بازار','Monastery':'صومعه','Town':'شهر','Castle':'قلعه',
 'Neolithic Site':'محوطهٔ نوسنگی','Church':'کلیسا','Street':'خیابان','Sea Castle':'قلعهٔ دریایی',
 'Salt Lake':'دریاچهٔ نمک','Ancient Wonder Site':'عجایب جهان باستان','Monument':'بنای یادبود',
 'Cable Car':'تله‌کابین','Historic District':'محلهٔ تاریخی','Beach and Ruins':'ساحل با ویرانه‌ها',
 'Natural Site':'پهنهٔ طبیعی','Rock Formations':'سازندهای سنگی','Islands':'مجمع‌الجزایر',
 'Fortress':'دژ','Gorge':'تنگه','Ancient Town':'شهر باستانی','Square':'میدان',
 'Ancient Temple':'معبد باستانی','Rock Fortress':'دژ صخره‌ای','Island Church':'کلیسای جزیره',
 'Ruined City':'شهر ویران','Mausoleum':'آرامگاه','Ancient Theater':'تئاتر باستانی',
 'Highland Plateau':'فلات مرتفع','Sacred Pool':'حوض مقدس','Cistern':'آب‌انبار زیرزمینی',
 'Waterway':'آبراه','Beach Valley':'درهٔ ساحلی','Region':'منطقه','Bathhouse':'حمام تاریخی',
 'Natural Phenomenon':'پدیدهٔ طبیعی','Historic Village':'روستای تاریخی',
 'Ancient Tombs':'گورستان باستانی','Underground City':'شهر زیرزمینی','City Walls':'باروی شهر',
 'Memorial Site':'یادمان','Rock Churches':'کلیساهای صخره‌ای','Sunken Town':'شهر غرق‌شده',
 'Historic Square':'میدان تاریخی','Religious Site':'مکان مذهبی','Cathedral':'کلیسای جامع',
 'Temple':'معبد','Garden':'باغ','Island':'جزیره','Valley':'دره','Bazaar':'بازار','Bridge':'پل',
 'Ruins':'ویرانه‌ها','Historic Site':'محوطهٔ تاریخی','Historical Site':'محوطهٔ تاریخی',
 'Landmark':'نشانهٔ شهری','Sunken Ruins':'ویرانه‌های زیر آب','Abandoned Village':'روستای متروکه',
 'Ghost Town':'شهر ارواح','Historic Café':'کافهٔ تاریخی','Pilgrimage Site':'زیارتگاه',
 'Museum Complex':'مجموعهٔ موزه‌ها','Stadium':'ورزشگاه','Cinema':'سینما','Basilica':'بازیلیکا',
 'Food Market':'بازار خوراک','Religious Complex':'مجموعهٔ مذهبی','Skyscraper':'آسمان‌خراش',
 'Shrine':'زیارتگاه'}
def type_phrase(t): return T.get(t)
def dur(s):
    if not s: return None
    s=s.strip()
    s=_re.sub(r'\bhours?\b','ساعت',s); s=_re.sub(r'\bmin(utes)?\b','دقیقه',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"بازدید از {t} چقدر زمان می‌برد؟",
        (f"بیشتر بازدیدکنندگان {vis} آنجا می‌مانند. " if vis else "")+
        f"راهنمای صوتی رایگان Lokali {mins} دقیقه است و حین قدم زدن شنیده می‌شود."),
       (f"آیا راهنمای صوتی رایگانی برای {t} هست؟",
        f"بله — اپلیکیشن Lokali داستان این مکان را رایگان به ۴۵ زبان می‌گوید. بدون بلیت، "
        f"بدون تور گروهی و بدون اشتراک؛ پس از دانلود آفلاین هم کار می‌کند.")]
    if lat is not None:
        o.append((f"{t} کجاست؟",
          f"موقعیت: {city}، {country}؛ مختصات {lat}, {lng}. "
          f"برای باز کردن مسیر، روی پیوند نقشه در این صفحه بزنید."))
    if tips: o.append((f"پیش از بازدید از {t} چه بدانیم؟", tips[0]))
    if kfs:  o.append((f"{t} به چه چیزی شهرت دارد؟", kfs[0]))
    TW=_re.compile(r'(صبح|ظهر|عصر|غروب|طلوع|زود|دیر|فصل|تابستان|زمستان|بهار|پاییز|آخر هفته|نور|صف|شلوغ|ازدحام)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"بهترین زمان بازدید از {t} چه وقت است؟", tt[0]))
    return o
LOCALE='fa_IR'
TITLE='{t}، {city} — راهنمای صوتی رایگان | Lokali'
TITLE_SHORT='{t} — راهنمای صوتی رایگان | Lokali'
HUB_TITLE='{city} — {n} راهنمای صوتی رایگان | Lokali'
HUB_TITLE_SHORT='{city} — {n} راهنمای صوتی | Lokali'
HUB_DESC="{n} راهنمای صوتی رایگان Lokali در {city}: {names}. زمان لازم، چه چیزی را ببینید و نکته‌های کاربردی. آفلاین و بدون بلیت."
HUB_INTRO="Lokali در {city} {n} راهنمای صوتی رایگان دارد. همه به ۴۵ زبان شنیده می‌شوند، بلیت یا تور گروهی نمی‌خواهند و پس از دانلود آفلاین کار می‌کنند."
SENT={'is':'{t} یک {tp} در {where} است.','in':'{t} در {where} قرار دارد.',
      'spend':'بیشتر بازدیدکنندگان {vis} آنجا می‌مانند.',
      'runs':'راهنمای صوتی رایگان Lokali {n} دقیقه است.',
      'route':'مسیر رسیدن به {t} از موقعیت شما.'}
COUNTRY={'türkiye':'ترکیه','greece':'یونان','italy':'ایتالیا','france':'فرانسه','spain':'اسپانیا',
 'germany':'آلمان','austria':'اتریش','georgia':'گرجستان','india':'هند','japan':'ژاپن',
 'china':'چین','egypt':'مصر','poland':'لهستان','czechia':'چک','united-kingdom':'بریتانیا',
 'united-states':'ایالات متحده','netherlands':'هلند','russia':'روسیه','thailand':'تایلند',
 'romania':'رومانی','israel':'اسرائیل','morocco':'مراکش','mexico':'مکزیک','portugal':'پرتغال',
 'sweden':'سوئد','denmark':'دانمارک','finland':'فنلاند','iceland':'ایسلند','switzerland':'سوئیس',
 'hungary':'مجارستان','croatia':'کرواسی','cyprus':'قبرس','jordan':'اردن','iran':'ایران',
 'vietnam':'ویتنام','indonesia':'اندونزی','singapore':'سنگاپور','south-korea':'کرهٔ جنوبی',
 'malaysia':'مالزی','taiwan':'تایوان','brazil':'برزیل','argentina':'آرژانتین','peru':'پرو',
 'chile':'شیلی','colombia':'کلمبیا','canada':'کانادا','australia':'استرالیا',
 'new-zealand':'نیوزیلند','south-africa':'آفریقای جنوبی','kazakhstan':'قزاقستان',
 'madagascar':'ماداگاسکار','ireland':'ایرلند','belgium':'بلژیک','norway':'نروژ','nepal':'نپال',
 'pakistan':'پاکستان','cambodia':'کامبوج','philippines':'فیلیپین'}
def hub_faq(city,n):
    return [(f"در {city} چند راهنمای صوتی رایگان هست؟",
             f"{n} تا. همه رایگان‌اند، به ۴۵ زبان شنیده می‌شوند و آفلاین کار می‌کنند."),
            (f"آیا راهنمای صوتی {city} واقعاً رایگان است؟",
             "بله. بدون بلیت، بدون تور گروهی و بدون اشتراک — راهنماها روی گوشی خودتان پخش می‌شوند.")]
