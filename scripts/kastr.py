# -*- coding: utf-8 -*-
"""Georgian.

The existing explore/ka/ pages were built by the v3 generator with their section
headings left in English ("The story", "Key facts"), so nothing could be lifted
from them -- the chrome here is written fresh. The guide text, titles, facts and
tips still come from the database untouched.

Georgian declines place names and the database stores city names in Latin
script, which cannot take a Georgian case ending. So the location is stated
after a colon in the nominative ("მდებარეობა: Istanbul, თურქეთი") instead of
inside the sentence, and FAQ questions put the attraction name before a colon so
it never has to be declined either. Georgian has no articles and numerals take a
singular noun, so no article or plural tables are needed.

Slugs use the English page's slug (USE_EN_SLUG): the existing Georgian pages
already live on those paths, and romanising Georgian titles would invent names.
"""
USE_EN_SLUG=True
SEC={'story':'ისტორია','facts':'მთავარი ფაქტები','look':'რას მიაქციოთ ყურადღება',
     'tips':'პრაქტიკული რჩევები','faq':'ხშირად დასმული კითხვები','map':'რუკაზე',
     'visitor':'ინფორმაცია ვიზიტორისთვის','more':'კიდევ რა ნახოთ'}
ROW={'time':'რამდენი დრო სჭირდება','audio':'Lokali-ს აუდიოგიდი','type':'ტიპი',
     'best':'ვისთვის არის','loc':'მდებარეობა','coord':'კოორდინატები','langs':'ენები'}
UI={'badge':'უფასო აუდიოგიდი','begin':'დაწყება','open':'გახსენით Lokali-ს აპი',
    'verified':'შემოწმებულია 2026 წლის ოქტომბერში','howwrite':'როგორ ვწერთ ამ გიდებს',
    'maps':'გახსენით Google Maps-ში','allcities':'ყველა ქალაქი','editorial':'სარედაქციო პროცესი',
    'guidesin':'აუდიოგიდები','langval':'45 ენა, Lokali-ს აპში','free':'უფასო',
    'min':'წთ','getapp':'აპის ჩამოტვირთვა'}
CAT={'history':'ისტორია','photography':'ფოტოგრაფია','authentic':'ავთენტური',
     'romantic':'რომანტიკული','family':'ოჯახებისთვის','editors':'რედაქციის არჩევანი',
     'nature':'ბუნება','art':'ხელოვნება','architecture':'არქიტექტურა','food':'კვება'}
T={'Archaeological Site':'არქეოლოგიური ძეგლი','Museum':'მუზეუმი','Mosque':'მეჩეთი',
 'Neighborhood':'უბანი','Beach':'პლაჟი','Historic Town':'ისტორიული ქალაქი','Palace':'სასახლე',
 'Waterfall':'ჩანჩქერი','Viewpoint':'ხედვის წერტილი','Park':'პარკი','Canyon':'კანიონი',
 'Lake':'ტბა','Tower':'კოშკი','Mountain':'მთა','Village':'სოფელი','Market':'ბაზარი',
 'Monastery':'მონასტერი','Town':'ქალაქი','Castle':'ციხე-სიმაგრე',
 'Neolithic Site':'ნეოლითური ძეგლი','Church':'ეკლესია','Street':'ქუჩა',
 'Sea Castle':'ზღვის ციხე','Salt Lake':'მარილიანი ტბა','Ancient Wonder Site':'ანტიკური საოცრება',
 'Monument':'ძეგლი','Cable Car':'საბაგირო გზა','Historic District':'ისტორიული უბანი',
 'Beach and Ruins':'პლაჟი ნანგრევებით','Natural Site':'ბუნების ძეგლი',
 'Rock Formations':'კლდოვანი წარმონაქმნები','Islands':'კუნძულების ჯგუფი','Fortress':'ციხესიმაგრე',
 'Gorge':'ხეობა','Ancient Town':'ანტიკური ქალაქი','Square':'მოედანი',
 'Ancient Temple':'ანტიკური ტაძარი','Rock Fortress':'კლდოვანი ციხე',
 'Island Church':'ეკლესია კუნძულზე','Ruined City':'ნანგრევებად ქცეული ქალაქი',
 'Mausoleum':'მავზოლეუმი','Ancient Theater':'ანტიკური თეატრი','Highland Plateau':'მაღალმთიანი პლატო',
 'Sacred Pool':'წმინდა წყალსატევი','Cistern':'მიწისქვეშა წყალსაცავი','Waterway':'წყლის გზა',
 'Beach Valley':'სანაპირო ხეობა','Region':'რეგიონი','Bathhouse':'ისტორიული აბანო',
 'Natural Phenomenon':'ბუნებრივი მოვლენა','Historic Village':'ისტორიული სოფელი',
 'Ancient Tombs':'ანტიკური სამარხები','Underground City':'მიწისქვეშა ქალაქი',
 'City Walls':'ქალაქის გალავანი','Memorial Site':'მემორიალი','Rock Churches':'კლდოვანი ეკლესიები',
 'Sunken Town':'წყალქვეშ მოქცეული ქალაქი','Historic Square':'ისტორიული მოედანი',
 'Religious Site':'სალოცავი','Cathedral':'საკათედრო ტაძარი','Temple':'ტაძარი','Garden':'ბაღი',
 'Island':'კუნძული','Valley':'ხეობა','Bazaar':'ბაზარი','Bridge':'ხიდი','Ruins':'ნანგრევები',
 'Historic Site':'ისტორიული ძეგლი','Historical Site':'ისტორიული ძეგლი',
 'Landmark':'ღირსშესანიშნაობა','Sunken Ruins':'წყალქვეშა ნანგრევები',
 'Abandoned Village':'მიტოვებული სოფელი','Ghost Town':'მოჩვენებათა ქალაქი',
 'Historic Café':'ისტორიული კაფე','Pilgrimage Site':'სამლოცველო ადგილი',
 'Museum Complex':'მუზეუმების კომპლექსი','Stadium':'სტადიონი','Cinema':'კინოთეატრი',
 'Basilica':'ბაზილიკა','Food Market':'სურსათის ბაზარი','Religious Complex':'სასულიერო კომპლექსი',
 'Skyscraper':'ცათამბჯენი','Shrine':'სალოცავი'}
def type_phrase(t): return T.get(t)
def dur(s):
    import re
    if not s: return None
    s=s.strip()
    s=re.sub(r'\bhours?\b','სთ',s); s=re.sub(r'\bmin(utes)?\b','წთ',s)
    return s
def faq(t,city,country,vis,mins,tips,kfs,lat,lng):
    o=[(f"{t}: რამდენი დრო სჭირდება დათვალიერებას?",
        (f"ვიზიტორების უმეტესობა აქ {vis} ატარებს. " if vis else "")+
        f"Lokali-ს უფასო აუდიოგიდი {mins} წუთს გრძელდება და სიარულში მოსასმენადაა გათვლილი."),
       (f"{t}: არის თუ არა უფასო აუდიოგიდი?",
        f"დიახ — Lokali-ს აპი ამ ადგილზე უფასოდ მოგიყვებათ 45 ენაზე. ბილეთის, ჯგუფისა და "
        f"გამოწერის გარეშე; ჩამოტვირთვის შემდეგ ოფლაინაც მუშაობს.")]
    if lat is not None:
        o.append((f"{t}: სად მდებარეობს?",
          f"მდებარეობა: {city}, {country}; კოორდინატები {lat}, {lng}. "
          f"ამ გვერდზე რუკის ბმულს რომ დააჭიროთ, მარშრუტი გაიხსნება."))
    if tips: o.append((f"{t}: რა უნდა იცოდეთ ვიზიტამდე?", tips[0]))
    if kfs:  o.append((f"{t}: რით არის ეს ადგილი ცნობილი?", kfs[0]))
    import re as _re
    TW=_re.compile(r'(დილ|შუადღ|საღამო|ამომავალ|ჩასვლ|ადრე|გვიან|სეზონ|ზაფხულ|ზამთ|გაზაფხულ|'
                   r'შემოდგომ|შაბათ-კვირ|განათებ|რიგ|ხალხმრავლ)')
    tt=[x for x in (tips or []) if TW.search(x)]
    if tt: o.append((f"{t}: როდის არის საუკეთესო დრო მისვლისთვის?", tt[0]))
    return o
LOCALE='ka_GE'
TITLE='{t}, {city} — უფასო აუდიოგიდი | Lokali'
TITLE_SHORT='{t} — უფასო აუდიოგიდი | Lokali'
HUB_TITLE='{city} — {n} უფასო აუდიოგიდი | Lokali'
HUB_TITLE_SHORT='{city} — {n} აუდიოგიდი | Lokali'
HUB_DESC="Lokali-ს {n} უფასო აუდიოგიდი — {city}: {names}. რამდენი დრო სჭირდება, რას მიაქციოთ ყურადღება და პრაქტიკული რჩევები. ოფლაინ, ბილეთის გარეშე."
HUB_INTRO="Lokali-ს {city}-ზე {n} უფასო აუდიოგიდი აქვს. თითოეული 45 ენაზე ჟღერს, არ საჭიროებს ბილეთს ან სამოგზაურო ჯგუფს და ჩამოტვირთვის შემდეგ ოფლაინ მუშაობს."
SENT={'is':'{t} — {tp}. მდებარეობა: {where}.','in':'{t}. მდებარეობა: {where}.',
      'spend':'ვიზიტორების უმეტესობა აქ {vis} ატარებს.',
      'runs':'Lokali-ს უფასო აუდიოგიდი {n} წუთს გრძელდება.',
      'route':'მარშრუტი თქვენი ადგილმდებარეობიდან — {t}.'}
COUNTRY={'türkiye':'თურქეთი','greece':'საბერძნეთი','italy':'იტალია','france':'საფრანგეთი',
 'spain':'ესპანეთი','germany':'გერმანია','austria':'ავსტრია','georgia':'საქართველო',
 'india':'ინდოეთი','japan':'იაპონია','china':'ჩინეთი','egypt':'ეგვიპტე','poland':'პოლონეთი',
 'czechia':'ჩეხეთი','united-kingdom':'გაერთიანებული სამეფო','united-states':'აშშ',
 'netherlands':'ნიდერლანდები','russia':'რუსეთი','thailand':'ტაილანდი','romania':'რუმინეთი',
 'israel':'ისრაელი','morocco':'მაროკო','mexico':'მექსიკა','portugal':'პორტუგალია',
 'sweden':'შვედეთი','denmark':'დანია','finland':'ფინეთი','iceland':'ისლანდია',
 'switzerland':'შვეიცარია','hungary':'უნგრეთი','croatia':'ხორვატია','cyprus':'კვიპროსი',
 'jordan':'იორდანია','iran':'ირანი','vietnam':'ვიეტნამი','indonesia':'ინდონეზია',
 'singapore':'სინგაპური','south-korea':'სამხრეთ კორეა','malaysia':'მალაიზია','taiwan':'ტაივანი',
 'brazil':'ბრაზილია','argentina':'არგენტინა','peru':'პერუ','chile':'ჩილე','colombia':'კოლუმბია',
 'canada':'კანადა','australia':'ავსტრალია','new-zealand':'ახალი ზელანდია',
 'south-africa':'სამხრეთ აფრიკა','kazakhstan':'ყაზახეთი','madagascar':'მადაგასკარი',
 'ireland':'ირლანდია','belgium':'ბელგია','norway':'ნორვეგია','nepal':'ნეპალი',
 'pakistan':'პაკისტანი','cambodia':'კამბოჯა','philippines':'ფილიპინები'}
def hub_faq(city,n):
    return [(f"{city}: რამდენი უფასო აუდიოგიდია?",
             f"{n}. ყველა უფასოა, 45 ენაზე ჟღერს და ოფლაინ მუშაობს."),
            (f"{city}: აუდიოგიდი ნამდვილად უფასოა?",
             "დიახ. ბილეთის, სამოგზაურო ჯგუფისა და გამოწერის გარეშე — "
             "გიდები თქვენსავე ტელეფონზე ისმის.")]
def more_heading(city): return f'{city} — კიდევ რა ნახოთ'
def guides_in(country): return f'აუდიოგიდები — {country}'
