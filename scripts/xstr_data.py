# -*- coding: utf-8 -*-
"""Template chrome for the 24 languages added on 2026-10-13.

Only labels live here. Every sentence about a place comes from cached_guides.
The sentence frames use "Label: value" and "<Name>: question?" so they need no
articles, cases or plural agreement. That keeps them correct in every language
without per-noun grammar tables.
"""
K = ['story', 'facts', 'look', 'tips', 'faq', 'map', 'visitor', 'more',
     'time', 'audio', 'type', 'best', 'loc', 'coord', 'langs',
     'badge', 'begin', 'open', 'verified', 'howwrite', 'maps', 'allcities', 'editorial', 'guides',
     'langval', 'free', 'min', 'getapp', 'h',
     'route', 'q_time', 'q_free', 'a_free', 'q_where', 'q_before', 'q_known', 'note',
     'q_hub1', 'q_hub2', 'a_hub2']
CK = ['türkiye', 'france', 'georgia', 'italy', 'spain', 'thailand', 'united-states', 'india',
      'vietnam', 'greece', 'japan']

L = {}
C = {}
META = {}  # locale, dir, colon, stop, sep

L['hr'] = ['Priča', 'Ključne činjenice', 'Na što obratiti pažnju', 'Praktični savjeti', 'Česta pitanja', 'Na karti', 'Informacije za posjetitelje', 'što još vidjeti',
  'Potrebno vrijeme', 'Lokali audiovodič', 'Vrsta', 'Najbolje za', 'Lokacija', 'Koordinate', 'Jezici',
  'Besplatni audiovodič', 'Započni', 'Otvori aplikaciju Lokali', 'Provjereno u listopadu 2026.', 'kako pišemo ove vodiče', 'Otvori u Google kartama', 'Svi gradovi', 'Urednički postupak', 'Besplatni audiovodiči',
  '45 jezika, u aplikaciji Lokali', 'besplatno', 'min', 'Preuzmi aplikaciju', 'h',
  'ruta od vaše lokacije', 'koliko vremena treba za posjet?', 'postoji li besplatni audiovodič?',
  'Da. Aplikacija Lokali pripovijeda besplatno na 45 jezika — bez ulaznice, grupe i pretplate; nakon preuzimanja radi bez interneta.',
  'gdje se nalazi?', 'što znati prije posjeta?', 'po čemu je poznato?',
  'Svi su besplatni, na 45 jezika, bez ulaznice i grupe, a nakon preuzimanja rade bez interneta.',
  'koliko ima besplatnih audiovodiča?', 'je li audiovodič stvarno besplatan?',
  'Da. Bez ulaznice, grupe i pretplate — vodiči se reproduciraju na vašem telefonu.']
C['hr'] = ['Turska', 'Francuska', 'Gruzija', 'Italija', 'Španjolska', 'Tajland', 'Sjedinjene Američke Države', 'Indija', 'Vijetnam', 'Grčka', 'Japan']
META['hr'] = ('hr_HR', 'ltr')

L['sr'] = ['Прича', 'Кључне чињенице', 'На шта обратити пажњу', 'Практични савети', 'Честа питања', 'На мапи', 'Информације за посетиоце', 'шта још видети',
  'Потребно време', 'Lokali аудио-водич', 'Врста', 'Најбоље за', 'Локација', 'Координате', 'Језици',
  'Бесплатан аудио-водич', 'Почни', 'Отвори апликацију Lokali', 'Проверено у октобру 2026.', 'како пишемо ове водиче', 'Отвори у Google мапама', 'Сви градови', 'Уређивачки поступак', 'Бесплатни аудио-водичи',
  '45 језика, у апликацији Lokali', 'бесплатно', 'мин', 'Преузми апликацију', 'ч',
  'рута од ваше локације', 'колико времена треба за посету?', 'да ли постоји бесплатан аудио-водич?',
  'Да. Апликација Lokali приповеда бесплатно на 45 језика — без улазнице, групе и претплате; после преузимања ради без интернета.',
  'где се налази?', 'шта знати пре посете?', 'по чему је познато?',
  'Сви су бесплатни, на 45 језика, без улазнице и групе, а после преузимања раде без интернета.',
  'колико има бесплатних аудио-водича?', 'да ли је аудио-водич заиста бесплатан?',
  'Да. Без улазнице, групе и претплате — водичи се репродукују на вашем телефону.']
C['sr'] = ['Турска', 'Француска', 'Грузија', 'Италија', 'Шпанија', 'Тајланд', 'Сједињене Америчке Државе', 'Индија', 'Вијетнам', 'Грчка', 'Јапан']
META['sr'] = ('sr_RS', 'ltr')

L['cs'] = ['Příběh', 'Klíčová fakta', 'Na co se zaměřit', 'Praktické tipy', 'Časté otázky', 'Na mapě', 'Informace pro návštěvníky', 'co dalšího vidět',
  'Potřebný čas', 'Audioprůvodce Lokali', 'Typ', 'Nejlepší pro', 'Místo', 'Souřadnice', 'Jazyky',
  'Audioprůvodce zdarma', 'Začít', 'Otevřít aplikaci Lokali', 'Ověřeno v říjnu 2026', 'jak tyto průvodce píšeme', 'Otevřít v Mapách Google', 'Všechna města', 'Redakční postup', 'Audioprůvodci zdarma',
  '45 jazyků, v aplikaci Lokali', 'zdarma', 'min', 'Stáhnout aplikaci', 'h',
  'trasa z vaší polohy', 'kolik času na návštěvu?', 'existuje audioprůvodce zdarma?',
  'Ano. Aplikace Lokali vypráví zdarma ve 45 jazycích — bez vstupenky, skupiny a předplatného; po stažení funguje offline.',
  'kde se nachází?', 'co vědět před návštěvou?', 'čím je známé?',
  'Všichni jsou zdarma, ve 45 jazycích, bez vstupenky a skupiny, a po stažení fungují offline.',
  'kolik je zde audioprůvodců zdarma?', 'je audioprůvodce opravdu zdarma?',
  'Ano. Bez vstupenky, skupiny a předplatného — průvodci hrají ve vašem telefonu.']
C['cs'] = ['Turecko', 'Francie', 'Gruzie', 'Itálie', 'Španělsko', 'Thajsko', 'Spojené státy americké', 'Indie', 'Vietnam', 'Řecko', 'Japonsko']
META['cs'] = ('cs_CZ', 'ltr')

L['hu'] = ['A történet', 'Fontos tények', 'Mire figyelj', 'Gyakorlati tippek', 'Gyakori kérdések', 'A térképen', 'Látogatói információk', 'további látnivalók',
  'Szükséges idő', 'Lokali audioguide', 'Típus', 'Kinek ajánlott', 'Helyszín', 'Koordináták', 'Nyelvek',
  'Ingyenes audioguide', 'Kezdés', 'Lokali alkalmazás megnyitása', 'Ellenőrizve: 2026. október', 'hogyan írjuk ezeket az útmutatókat', 'Megnyitás a Google Térképen', 'Minden város', 'Szerkesztési elvek', 'Ingyenes audioguide-ok',
  '45 nyelv, a Lokali alkalmazásban', 'ingyenes', 'perc', 'Alkalmazás letöltése', 'óra',
  'útvonal a tartózkodási helyedről', 'mennyi idő kell a látogatáshoz?', 'van ingyenes audioguide?',
  'Igen. A Lokali alkalmazás ingyen, 45 nyelven meséli el — jegy, csoport és előfizetés nélkül; letöltés után offline is működik.',
  'hol található?', 'mit érdemes tudni a látogatás előtt?', 'miről híres?',
  'Mind ingyenes, 45 nyelven érhető el, jegy és csoport nélkül, letöltés után pedig offline is működik.',
  'hány ingyenes audioguide van?', 'tényleg ingyenes az audioguide?',
  'Igen. Jegy, csoport és előfizetés nélkül — az útmutatók a saját telefonodon szólnak.']
C['hu'] = ['Törökország', 'Franciaország', 'Grúzia', 'Olaszország', 'Spanyolország', 'Thaiföld', 'Amerikai Egyesült Államok', 'India', 'Vietnám', 'Görögország', 'Japán']
META['hu'] = ('hu_HU', 'ltr')

L['ro'] = ['Povestea', 'Fapte esențiale', 'La ce să fii atent', 'Sfaturi practice', 'Întrebări frecvente', 'Pe hartă', 'Informații pentru vizitatori', 'ce mai poți vedea',
  'Timp necesar', 'Ghid audio Lokali', 'Tip', 'Potrivit pentru', 'Locație', 'Coordonate', 'Limbi',
  'Ghid audio gratuit', 'Începe', 'Deschide aplicația Lokali', 'Verificat în octombrie 2026', 'cum scriem aceste ghiduri', 'Deschide în Google Maps', 'Toate orașele', 'Procesul editorial', 'Ghiduri audio gratuite',
  '45 de limbi, în aplicația Lokali', 'gratuit', 'min', 'Descarcă aplicația', 'h',
  'traseul de la locația ta', 'cât timp îți trebuie pentru vizită?', 'există un ghid audio gratuit?',
  'Da. Aplicația Lokali îl povestește gratuit în 45 de limbi — fără bilet, grup sau abonament; după descărcare funcționează offline.',
  'unde se află?', 'ce trebuie să știi înainte de vizită?', 'prin ce este cunoscut?',
  'Toate sunt gratuite, în 45 de limbi, fără bilet și fără grup, iar după descărcare funcționează offline.',
  'câte ghiduri audio gratuite există?', 'ghidul audio este cu adevărat gratuit?',
  'Da. Fără bilet, grup sau abonament — ghidurile rulează pe telefonul tău.']
C['ro'] = ['Turcia', 'Franța', 'Georgia', 'Italia', 'Spania', 'Thailanda', 'Statele Unite ale Americii', 'India', 'Vietnam', 'Grecia', 'Japonia']
META['ro'] = ('ro_RO', 'ltr')

L['pt-br'] = ['A história', 'Fatos importantes', 'O que observar', 'Dicas práticas', 'Perguntas frequentes', 'No mapa', 'Informações para visitantes', 'o que mais ver',
  'Tempo necessário', 'Guia de áudio Lokali', 'Tipo', 'Ideal para', 'Localização', 'Coordenadas', 'Idiomas',
  'Guia de áudio grátis', 'Começar', 'Abrir o app Lokali', 'Verificado em outubro de 2026', 'como escrevemos estes guias', 'Abrir no Google Maps', 'Todas as cidades', 'Processo editorial', 'Guias de áudio grátis',
  '45 idiomas, no app Lokali', 'grátis', 'min', 'Baixar o app', 'h',
  'rota a partir da sua localização', 'quanto tempo leva a visita?', 'existe um guia de áudio grátis?',
  'Sim. O app Lokali conta a história de graça em 45 idiomas — sem ingresso, grupo ou assinatura; depois de baixado, funciona offline.',
  'onde fica?', 'o que saber antes de visitar?', 'pelo que é conhecido?',
  'Todos são grátis, em 45 idiomas, sem ingresso e sem grupo, e funcionam offline depois de baixados.',
  'quantos guias de áudio grátis existem?', 'o guia de áudio é mesmo grátis?',
  'Sim. Sem ingresso, grupo ou assinatura — os guias tocam no seu próprio celular.']
C['pt-br'] = ['Turquia', 'França', 'Geórgia', 'Itália', 'Espanha', 'Tailândia', 'Estados Unidos', 'Índia', 'Vietnã', 'Grécia', 'Japão']
META['pt-br'] = ('pt_BR', 'ltr')

L['af'] = ['Die storie', 'Belangrike feite', 'Waarna om te kyk', 'Praktiese wenke', 'Algemene vrae', 'Op die kaart', 'Besoekersinligting', 'wat nog om te sien',
  'Tyd nodig', 'Lokali-oudiogids', 'Soort', 'Beste vir', 'Ligging', 'Koördinate', 'Tale',
  'Gratis oudiogids', 'Begin', 'Maak die Lokali-toep oop', 'Geverifieer in Oktober 2026', 'hoe ons hierdie gidse skryf', 'Maak oop in Google Maps', 'Alle stede', 'Redaksionele proses', 'Gratis oudiogidse',
  '45 tale, in die Lokali-toep', 'gratis', 'min', 'Kry die toep', 'h',
  'roete vanaf jou ligging', 'hoeveel tyd het jy nodig vir ’n besoek?', 'is daar ’n gratis oudiogids?',
  'Ja. Die Lokali-toep vertel die storie gratis in 45 tale — geen kaartjie, groep of intekening nie; dit werk vanlyn sodra dit afgelaai is.',
  'waar is dit?', 'wat moet jy weet voor jy gaan?', 'waarvoor is dit bekend?',
  'Almal is gratis, in 45 tale, sonder kaartjie of groep, en werk vanlyn sodra dit afgelaai is.',
  'hoeveel gratis oudiogidse is daar?', 'is die oudiogids regtig gratis?',
  'Ja. Geen kaartjie, groep of intekening nie — die gidse speel op jou eie foon.']
C['af'] = ['Turkye', 'Frankryk', 'Georgië', 'Italië', 'Spanje', 'Thailand', 'Verenigde State van Amerika', 'Indië', 'Viëtnam', 'Griekeland', 'Japan']
META['af'] = ('af_ZA', 'ltr')

L['da'] = ['Historien', 'Vigtige fakta', 'Hvad du skal se efter', 'Praktiske tips', 'Ofte stillede spørgsmål', 'På kortet', 'Besøgsinformation', 'hvad du ellers kan se',
  'Tidsforbrug', 'Lokali-lydguide', 'Type', 'Bedst til', 'Placering', 'Koordinater', 'Sprog',
  'Gratis lydguide', 'Start', 'Åbn Lokali-appen', 'Verificeret i oktober 2026', 'sådan skriver vi guiderne', 'Åbn i Google Maps', 'Alle byer', 'Redaktionel proces', 'Gratis lydguider',
  '45 sprog, i Lokali-appen', 'gratis', 'min', 'Hent appen', 't',
  'rute fra din placering', 'hvor lang tid tager et besøg?', 'findes der en gratis lydguide?',
  'Ja. Lokali-appen fortæller historien gratis på 45 sprog — uden billet, gruppe eller abonnement; den virker offline, når den er hentet.',
  'hvor ligger det?', 'hvad skal man vide før besøget?', 'hvad er det kendt for?',
  'Alle er gratis, på 45 sprog, uden billet og gruppe, og virker offline, når de er hentet.',
  'hvor mange gratis lydguider er der?', 'er lydguiden virkelig gratis?',
  'Ja. Ingen billet, gruppe eller abonnement — guiderne afspilles på din egen telefon.']
C['da'] = ['Tyrkiet', 'Frankrig', 'Georgien', 'Italien', 'Spanien', 'Thailand', 'USA', 'Indien', 'Vietnam', 'Grækenland', 'Japan']
META['da'] = ('da_DK', 'ltr')

L['nb'] = ['Historien', 'Viktige fakta', 'Hva du bør se etter', 'Praktiske tips', 'Vanlige spørsmål', 'På kartet', 'Besøksinformasjon', 'hva mer du kan se',
  'Tidsbruk', 'Lokali-lydguide', 'Type', 'Best for', 'Beliggenhet', 'Koordinater', 'Språk',
  'Gratis lydguide', 'Start', 'Åpne Lokali-appen', 'Verifisert i oktober 2026', 'slik skriver vi guidene', 'Åpne i Google Maps', 'Alle byer', 'Redaksjonell prosess', 'Gratis lydguider',
  '45 språk, i Lokali-appen', 'gratis', 'min', 'Last ned appen', 't',
  'rute fra der du er', 'hvor lang tid tar et besøk?', 'finnes det en gratis lydguide?',
  'Ja. Lokali-appen forteller historien gratis på 45 språk — uten billett, gruppe eller abonnement; den fungerer offline når den er lastet ned.',
  'hvor ligger det?', 'hva bør man vite før besøket?', 'hva er det kjent for?',
  'Alle er gratis, på 45 språk, uten billett og gruppe, og fungerer offline når de er lastet ned.',
  'hvor mange gratis lydguider finnes det?', 'er lydguiden virkelig gratis?',
  'Ja. Ingen billett, gruppe eller abonnement — guidene spilles av på din egen telefon.']
C['nb'] = ['Tyrkia', 'Frankrike', 'Georgia', 'Italia', 'Spania', 'Thailand', 'USA', 'India', 'Vietnam', 'Hellas', 'Japan']
META['nb'] = ('nb_NO', 'ltr')

L['sv'] = ['Berättelsen', 'Viktiga fakta', 'Vad du ska titta efter', 'Praktiska tips', 'Vanliga frågor', 'På kartan', 'Besöksinformation', 'mer att se',
  'Tidsåtgång', 'Lokalis ljudguide', 'Typ', 'Passar för', 'Plats', 'Koordinater', 'Språk',
  'Gratis ljudguide', 'Starta', 'Öppna Lokali-appen', 'Verifierad i oktober 2026', 'så skriver vi guiderna', 'Öppna i Google Maps', 'Alla städer', 'Redaktionell process', 'Gratis ljudguider',
  '45 språk, i Lokali-appen', 'gratis', 'min', 'Hämta appen', 'h',
  'vägen från din plats', 'hur lång tid tar ett besök?', 'finns det en gratis ljudguide?',
  'Ja. Lokali-appen berättar historien gratis på 45 språk — utan biljett, grupp eller prenumeration; den fungerar offline när den har laddats ner.',
  'var ligger det?', 'vad bör man veta före besöket?', 'vad är det känt för?',
  'Alla är gratis, på 45 språk, utan biljett och grupp, och fungerar offline när de har laddats ner.',
  'hur många gratis ljudguider finns det?', 'är ljudguiden verkligen gratis?',
  'Ja. Ingen biljett, grupp eller prenumeration — guiderna spelas upp i din egen telefon.']
C['sv'] = ['Turkiet', 'Frankrike', 'Georgien', 'Italien', 'Spanien', 'Thailand', 'USA', 'Indien', 'Vietnam', 'Grekland', 'Japan']
META['sv'] = ('sv_SE', 'ltr')

L['fi'] = ['Tarina', 'Tärkeät faktat', 'Mihin kiinnittää huomiota', 'Käytännön vinkit', 'Usein kysytyt kysymykset', 'Kartalla', 'Tietoa kävijöille', 'muuta nähtävää',
  'Tarvittava aika', 'Lokalin ääniopas', 'Tyyppi', 'Sopii', 'Sijainti', 'Koordinaatit', 'Kielet',
  'Ilmainen ääniopas', 'Aloita', 'Avaa Lokali-sovellus', 'Tarkistettu lokakuussa 2026', 'miten kirjoitamme oppaat', 'Avaa Google Mapsissa', 'Kaikki kaupungit', 'Toimitusperiaatteet', 'Ilmaiset äänioppaat',
  '45 kieltä, Lokali-sovelluksessa', 'ilmainen', 'min', 'Lataa sovellus', 't',
  'reitti sijainnistasi', 'paljonko aikaa vierailuun kuluu?', 'onko ilmaista ääniopasta?',
  'On. Lokali-sovellus kertoo tarinan ilmaiseksi 45 kielellä — ilman lippua, ryhmää tai tilausta; latauksen jälkeen se toimii ilman verkkoa.',
  'missä se sijaitsee?', 'mitä kannattaa tietää ennen vierailua?', 'mistä se on tunnettu?',
  'Kaikki ovat ilmaisia, 45 kielellä, ilman lippua ja ryhmää, ja ne toimivat latauksen jälkeen ilman verkkoa.',
  'montako ilmaista ääniopasta on?', 'onko ääniopas todella ilmainen?',
  'On. Ei lippua, ryhmää eikä tilausta — oppaat soivat omassa puhelimessasi.']
C['fi'] = ['Turkki', 'Ranska', 'Georgia', 'Italia', 'Espanja', 'Thaimaa', 'Yhdysvallat', 'Intia', 'Vietnam', 'Kreikka', 'Japani']
META['fi'] = ('fi_FI', 'ltr')

L['el'] = ['Η ιστορία', 'Βασικά στοιχεία', 'Τι να προσέξετε', 'Πρακτικές συμβουλές', 'Συχνές ερωτήσεις', 'Στον χάρτη', 'Πληροφορίες επισκεπτών', 'τι άλλο να δείτε',
  'Απαιτούμενος χρόνος', 'Ηχητικός ξεναγός Lokali', 'Είδος', 'Ιδανικό για', 'Τοποθεσία', 'Συντεταγμένες', 'Γλώσσες',
  'Δωρεάν ηχητικός ξεναγός', 'Έναρξη', 'Άνοιγμα της εφαρμογής Lokali', 'Επαληθεύτηκε τον Οκτώβριο 2026', 'πώς γράφουμε αυτούς τους οδηγούς', 'Άνοιγμα στους Χάρτες Google', 'Όλες οι πόλεις', 'Συντακτική διαδικασία', 'Δωρεάν ηχητικοί ξεναγοί',
  '45 γλώσσες, στην εφαρμογή Lokali', 'δωρεάν', 'λεπτά', 'Κατεβάστε την εφαρμογή', 'ώρες',
  'διαδρομή από την τοποθεσία σας', 'πόσος χρόνος χρειάζεται για την επίσκεψη;', 'υπάρχει δωρεάν ηχητικός ξεναγός;',
  'Ναι. Η εφαρμογή Lokali αφηγείται την ιστορία δωρεάν σε 45 γλώσσες — χωρίς εισιτήριο, γκρουπ ή συνδρομή· μετά τη λήψη λειτουργεί εκτός σύνδεσης.',
  'πού βρίσκεται;', 'τι να ξέρετε πριν από την επίσκεψη;', 'για τι είναι γνωστό;',
  'Όλοι είναι δωρεάν, σε 45 γλώσσες, χωρίς εισιτήριο και γκρουπ, και λειτουργούν εκτός σύνδεσης μετά τη λήψη.',
  'πόσοι δωρεάν ηχητικοί ξεναγοί υπάρχουν;', 'είναι πραγματικά δωρεάν ο ηχητικός ξεναγός;',
  'Ναι. Χωρίς εισιτήριο, γκρουπ ή συνδρομή — οι οδηγοί παίζουν στο δικό σας κινητό.']
C['el'] = ['Τουρκία', 'Γαλλία', 'Γεωργία', 'Ιταλία', 'Ισπανία', 'Ταϊλάνδη', 'Ηνωμένες Πολιτείες', 'Ινδία', 'Βιετνάμ', 'Ελλάδα', 'Ιαπωνία']
META['el'] = ('el_GR', 'ltr')

L['hy'] = ['Պատմությունը', 'Հիմնական փաստեր', 'Ինչին ուշադրություն դարձնել', 'Գործնական խորհուրդներ', 'Հաճախ տրվող հարցեր', 'Քարտեզի վրա', 'Տեղեկություններ այցելուների համար', 'ինչ այլ բան տեսնել',
  'Անհրաժեշտ ժամանակ', 'Lokali աուդիոուղեցույց', 'Տեսակ', 'Լավագույնը', 'Վայր', 'Կոորդինատներ', 'Լեզուներ',
  'Անվճար աուդիոուղեցույց', 'Սկսել', 'Բացել Lokali հավելվածը', 'Ստուգված է 2026 թ. հոկտեմբերին', 'ինչպես ենք գրում այս ուղեցույցները', 'Բացել Google Քարտեզներում', 'Բոլոր քաղաքները', 'Խմբագրական գործընթաց', 'Անվճար աուդիոուղեցույցներ',
  '45 լեզու, Lokali հավելվածում', 'անվճար', 'րոպե', 'Ներբեռնել հավելվածը', 'ժ',
  'երթուղի ձեր գտնվելու վայրից', 'որքա՞ն ժամանակ է պետք այցելության համար', 'կա՞ անվճար աուդիոուղեցույց',
  'Այո։ Lokali հավելվածը պատմությունը պատմում է անվճար՝ 45 լեզվով, առանց տոմսի, խմբի կամ բաժանորդագրության. ներբեռնելուց հետո աշխատում է առանց ինտերնետի։',
  'որտե՞ղ է գտնվում', 'ի՞նչ իմանալ այցելելուց առաջ', 'ինչո՞վ է հայտնի',
  'Բոլորն անվճար են, 45 լեզվով, առանց տոմսի և խմբի, իսկ ներբեռնելուց հետո աշխատում են առանց ինտերնետի։',
  'քանի՞ անվճար աուդիոուղեցույց կա', 'աուդիոուղեցույցն իսկապե՞ս անվճար է',
  'Այո։ Առանց տոմսի, խմբի կամ բաժանորդագրության — ուղեցույցները հնչում են ձեր հեռախոսում։']
C['hy'] = ['Թուրքիա', 'Ֆրանսիա', 'Վրաստան', 'Իտալիա', 'Իսպանիա', 'Թաիլանդ', 'ԱՄՆ', 'Հնդկաստան', 'Վիետնամ', 'Հունաստան', 'Ճապոնիա']
META['hy'] = ('hy_AM', 'ltr', ': ', '։')

L['vi'] = ['Câu chuyện', 'Thông tin chính', 'Điều cần chú ý', 'Mẹo thực tế', 'Câu hỏi thường gặp', 'Trên bản đồ', 'Thông tin tham quan', 'còn gì để xem',
  'Thời gian cần', 'Hướng dẫn âm thanh Lokali', 'Loại', 'Phù hợp nhất', 'Vị trí', 'Tọa độ', 'Ngôn ngữ',
  'Hướng dẫn âm thanh miễn phí', 'Bắt đầu', 'Mở ứng dụng Lokali', 'Đã xác minh tháng 10/2026', 'cách chúng tôi viết các hướng dẫn này', 'Mở trong Google Maps', 'Tất cả thành phố', 'Quy trình biên tập', 'Hướng dẫn âm thanh miễn phí',
  '45 ngôn ngữ, trong ứng dụng Lokali', 'miễn phí', 'phút', 'Tải ứng dụng', 'giờ',
  'đường đi từ vị trí của bạn', 'cần bao nhiêu thời gian để tham quan?', 'có hướng dẫn âm thanh miễn phí không?',
  'Có. Ứng dụng Lokali kể câu chuyện miễn phí bằng 45 ngôn ngữ — không cần vé, đoàn hay đăng ký; sau khi tải về có thể dùng ngoại tuyến.',
  'nằm ở đâu?', 'cần biết gì trước khi đến?', 'nổi tiếng vì điều gì?',
  'Tất cả đều miễn phí, bằng 45 ngôn ngữ, không cần vé hay đoàn, và dùng được ngoại tuyến sau khi tải về.',
  'có bao nhiêu hướng dẫn âm thanh miễn phí?', 'hướng dẫn âm thanh có thật sự miễn phí không?',
  'Có. Không cần vé, đoàn hay đăng ký — hướng dẫn phát ngay trên điện thoại của bạn.']
C['vi'] = ['Thổ Nhĩ Kỳ', 'Pháp', 'Gruzia', 'Ý', 'Tây Ban Nha', 'Thái Lan', 'Hoa Kỳ', 'Ấn Độ', 'Việt Nam', 'Hy Lạp', 'Nhật Bản']
META['vi'] = ('vi_VN', 'ltr')

L['ms'] = ['Kisahnya', 'Fakta penting', 'Apa yang perlu diperhatikan', 'Petua praktikal', 'Soalan lazim', 'Pada peta', 'Maklumat pelawat', 'apa lagi untuk dilihat',
  'Masa diperlukan', 'Panduan audio Lokali', 'Jenis', 'Sesuai untuk', 'Lokasi', 'Koordinat', 'Bahasa',
  'Panduan audio percuma', 'Mula', 'Buka aplikasi Lokali', 'Disahkan Oktober 2026', 'cara kami menulis panduan ini', 'Buka dalam Google Maps', 'Semua bandar', 'Proses editorial', 'Panduan audio percuma',
  '45 bahasa, dalam aplikasi Lokali', 'percuma', 'min', 'Muat turun aplikasi', 'jam',
  'laluan dari lokasi anda', 'berapa lama masa untuk melawat?', 'adakah panduan audio percuma?',
  'Ya. Aplikasi Lokali menceritakannya secara percuma dalam 45 bahasa — tanpa tiket, kumpulan atau langganan; selepas dimuat turun ia berfungsi di luar talian.',
  'di mana letaknya?', 'apa yang perlu diketahui sebelum melawat?', 'terkenal kerana apa?',
  'Semuanya percuma, dalam 45 bahasa, tanpa tiket atau kumpulan, dan berfungsi di luar talian selepas dimuat turun.',
  'berapa banyak panduan audio percuma?', 'adakah panduan audio benar-benar percuma?',
  'Ya. Tanpa tiket, kumpulan atau langganan — panduan dimainkan pada telefon anda sendiri.']
C['ms'] = ['Turkiye', 'Perancis', 'Georgia', 'Itali', 'Sepanyol', 'Thailand', 'Amerika Syarikat', 'India', 'Vietnam', 'Greece', 'Jepun']
META['ms'] = ('ms_MY', 'ltr')

L['sw'] = ['Hadithi yake', 'Mambo muhimu', 'Cha kuangalia', 'Vidokezo vya vitendo', 'Maswali ya kawaida', 'Kwenye ramani', 'Taarifa kwa wageni', 'cha kuona zaidi',
  'Muda unaohitajika', 'Mwongozo wa sauti wa Lokali', 'Aina', 'Bora kwa', 'Mahali', 'Viwianishi', 'Lugha',
  'Mwongozo wa sauti bure', 'Anza', 'Fungua programu ya Lokali', 'Imethibitishwa Oktoba 2026', 'jinsi tunavyoandika miongozo hii', 'Fungua katika Ramani za Google', 'Miji yote', 'Mchakato wa uhariri', 'Miongozo ya sauti bure',
  'Lugha 45, katika programu ya Lokali', 'bure', 'dak', 'Pakua programu', 'saa',
  'njia kutoka ulipo', 'ziara inachukua muda gani?', 'je, kuna mwongozo wa sauti bure?',
  'Ndiyo. Programu ya Lokali inasimulia hadithi bure kwa lugha 45 — bila tiketi, kikundi wala usajili; ikishapakuliwa inafanya kazi nje ya mtandao.',
  'iko wapi?', 'nini cha kujua kabla ya kutembelea?', 'inajulikana kwa nini?',
  'Yote ni bure, kwa lugha 45, bila tiketi wala kikundi, na yanafanya kazi nje ya mtandao baada ya kupakuliwa.',
  'kuna miongozo mingapi ya sauti bure?', 'je, mwongozo wa sauti ni bure kweli?',
  'Ndiyo. Bila tiketi, kikundi wala usajili — miongozo inachezwa kwenye simu yako.']
C['sw'] = ['Uturuki', 'Ufaransa', 'Georgia', 'Italia', 'Hispania', 'Tailandi', 'Marekani', 'India', 'Vietnam', 'Ugiriki', 'Japani']
META['sw'] = ('sw_KE', 'ltr')

L['th'] = ['เรื่องราว', 'ข้อเท็จจริงสำคัญ', 'สิ่งที่ควรสังเกต', 'เคล็ดลับการเที่ยว', 'คำถามที่พบบ่อย', 'บนแผนที่', 'ข้อมูลสำหรับผู้เยี่ยมชม', 'ที่เที่ยวอื่น ๆ',
  'เวลาที่ใช้', 'ไกด์เสียง Lokali', 'ประเภท', 'เหมาะสำหรับ', 'ที่ตั้ง', 'พิกัด', 'ภาษา',
  'ไกด์เสียงฟรี', 'เริ่ม', 'เปิดแอป Lokali', 'ตรวจสอบเมื่อตุลาคม 2026', 'วิธีที่เราเขียนไกด์เหล่านี้', 'เปิดใน Google Maps', 'ทุกเมือง', 'กระบวนการบรรณาธิการ', 'ไกด์เสียงฟรี',
  '45 ภาษา ในแอป Lokali', 'ฟรี', 'นาที', 'ดาวน์โหลดแอป', 'ชม.',
  'เส้นทางจากตำแหน่งของคุณ', 'ใช้เวลาเที่ยวนานเท่าไร', 'มีไกด์เสียงฟรีไหม',
  'มี แอป Lokali เล่าเรื่องให้ฟังฟรีใน 45 ภาษา ไม่ต้องใช้ตั๋ว ไม่ต้องเข้ากลุ่มทัวร์ และไม่ต้องสมัครสมาชิก เมื่อดาวน์โหลดแล้วใช้งานแบบออฟไลน์ได้',
  'อยู่ที่ไหน', 'ควรรู้อะไรก่อนไป', 'มีชื่อเสียงเรื่องอะไร',
  'ทั้งหมดฟรี มี 45 ภาษา ไม่ต้องใช้ตั๋วหรือเข้ากลุ่มทัวร์ และใช้งานออฟไลน์ได้หลังดาวน์โหลด',
  'มีไกด์เสียงฟรีกี่รายการ', 'ไกด์เสียงฟรีจริงไหม',
  'จริง ไม่ต้องใช้ตั๋ว ไม่ต้องเข้ากลุ่มทัวร์ และไม่ต้องสมัครสมาชิก ไกด์เล่นบนโทรศัพท์ของคุณเอง']
C['th'] = ['ตุรกี', 'ฝรั่งเศส', 'จอร์เจีย', 'อิตาลี', 'สเปน', 'ไทย', 'สหรัฐอเมริกา', 'อินเดีย', 'เวียดนาม', 'กรีซ', 'ญี่ปุ่น']
META['th'] = ('th_TH', 'ltr', ': ', '')

L['zh-tw'] = ['故事', '重點資訊', '值得留意', '實用提示', '常見問題', '地圖', '參觀資訊', '其他景點',
  '所需時間', 'Lokali 語音導覽', '類型', '適合', '位置', '座標', '語言',
  '免費語音導覽', '開始', '開啟 Lokali App', '2026 年 10 月已核實', '我們如何撰寫導覽', '在 Google 地圖中開啟', '所有城市', '編輯流程', '免費語音導覽',
  '45 種語言，Lokali App 內', '免費', '分鐘', '下載 App', '小時',
  '從你的位置出發的路線', '參觀需要多久？', '有免費語音導覽嗎？',
  '有。Lokali App 以 45 種語言免費講述——不需門票、不用跟團、無須訂閱；下載後可離線使用。',
  '在哪裡？', '參觀前需要知道什麼？', '以什麼聞名？',
  '全部免費，提供 45 種語言，不需門票也不用跟團，下載後可離線使用。',
  '有多少個免費語音導覽？', '語音導覽真的免費嗎？',
  '是的。不需門票、不用跟團、無須訂閱——導覽直接在你的手機上播放。']
C['zh-tw'] = ['土耳其', '法國', '喬治亞', '義大利', '西班牙', '泰國', '美國', '印度', '越南', '希臘', '日本']
META['zh-tw'] = ('zh_TW', 'ltr', '：', '。')

L['hi'] = ['कहानी', 'मुख्य तथ्य', 'क्या देखें', 'व्यावहारिक सुझाव', 'अक्सर पूछे जाने वाले प्रश्न', 'नक्शे पर', 'आगंतुक जानकारी', 'और क्या देखें',
  'लगने वाला समय', 'Lokali ऑडियो गाइड', 'प्रकार', 'किसके लिए बेहतर', 'स्थान', 'निर्देशांक', 'भाषाएँ',
  'मुफ़्त ऑडियो गाइड', 'शुरू करें', 'Lokali ऐप खोलें', 'अक्टूबर 2026 में सत्यापित', 'हम ये गाइड कैसे लिखते हैं', 'Google Maps में खोलें', 'सभी शहर', 'संपादकीय प्रक्रिया', 'मुफ़्त ऑडियो गाइड',
  '45 भाषाएँ, Lokali ऐप में', 'मुफ़्त', 'मिनट', 'ऐप डाउनलोड करें', 'घंटे',
  'आपकी जगह से रास्ता', 'घूमने में कितना समय लगता है?', 'क्या मुफ़्त ऑडियो गाइड है?',
  'हाँ। Lokali ऐप 45 भाषाओं में मुफ़्त कहानी सुनाता है — न टिकट, न ग्रुप, न सदस्यता; डाउनलोड के बाद ऑफ़लाइन चलता है।',
  'कहाँ है?', 'जाने से पहले क्या जानें?', 'किस लिए प्रसिद्ध है?',
  'सभी मुफ़्त हैं, 45 भाषाओं में, बिना टिकट और ग्रुप के, और डाउनलोड के बाद ऑफ़लाइन चलते हैं।',
  'कितने मुफ़्त ऑडियो गाइड हैं?', 'क्या ऑडियो गाइड सच में मुफ़्त है?',
  'हाँ। न टिकट, न ग्रुप, न सदस्यता — गाइड आपके अपने फ़ोन पर चलते हैं।']
C['hi'] = ['तुर्किये', 'फ़्रांस', 'जॉर्जिया', 'इटली', 'स्पेन', 'थाईलैंड', 'संयुक्त राज्य अमेरिका', 'भारत', 'वियतनाम', 'ग्रीस', 'जापान']
META['hi'] = ('hi_IN', 'ltr', ': ', '।')

L['mr'] = ['कथा', 'महत्त्वाची माहिती', 'काय पाहावे', 'उपयुक्त सूचना', 'नेहमी विचारले जाणारे प्रश्न', 'नकाशावर', 'पर्यटकांसाठी माहिती', 'आणखी काय पाहावे',
  'लागणारा वेळ', 'Lokali ऑडिओ मार्गदर्शक', 'प्रकार', 'कोणासाठी उत्तम', 'ठिकाण', 'निर्देशांक', 'भाषा',
  'मोफत ऑडिओ मार्गदर्शक', 'सुरू करा', 'Lokali ॲप उघडा', 'ऑक्टोबर 2026 मध्ये पडताळले', 'आम्ही हे मार्गदर्शक कसे लिहितो', 'Google Maps मध्ये उघडा', 'सर्व शहरे', 'संपादकीय प्रक्रिया', 'मोफत ऑडिओ मार्गदर्शक',
  '45 भाषा, Lokali ॲपमध्ये', 'मोफत', 'मिनिटे', 'ॲप डाउनलोड करा', 'तास',
  'तुमच्या ठिकाणापासून मार्ग', 'भेटीसाठी किती वेळ लागतो?', 'मोफत ऑडिओ मार्गदर्शक आहे का?',
  'होय. Lokali ॲप 45 भाषांमध्ये मोफत कथा सांगते — तिकीट, गट किंवा सदस्यता नाही; डाउनलोड केल्यावर ऑफलाइन चालते.',
  'कुठे आहे?', 'भेटीपूर्वी काय जाणून घ्यावे?', 'कशासाठी प्रसिद्ध आहे?',
  'सर्व मोफत आहेत, 45 भाषांमध्ये, तिकीट किंवा गटाशिवाय, आणि डाउनलोड केल्यावर ऑफलाइन चालतात.',
  'किती मोफत ऑडिओ मार्गदर्शक आहेत?', 'ऑडिओ मार्गदर्शक खरोखर मोफत आहे का?',
  'होय. तिकीट, गट किंवा सदस्यता नाही — मार्गदर्शक तुमच्या स्वतःच्या फोनवर चालतात.']
C['mr'] = ['तुर्किये', 'फ्रान्स', 'जॉर्जिया', 'इटली', 'स्पेन', 'थायलंड', 'अमेरिका', 'भारत', 'व्हिएतनाम', 'ग्रीस', 'जपान']
META['mr'] = ('mr_IN', 'ltr')

L['bn'] = ['গল্প', 'মূল তথ্য', 'কী দেখবেন', 'ব্যবহারিক টিপস', 'সাধারণ প্রশ্ন', 'মানচিত্রে', 'দর্শনার্থীদের তথ্য', 'আর কী দেখবেন',
  'প্রয়োজনীয় সময়', 'Lokali অডিও গাইড', 'ধরন', 'যাদের জন্য সেরা', 'অবস্থান', 'স্থানাঙ্ক', 'ভাষা',
  'বিনামূল্যে অডিও গাইড', 'শুরু করুন', 'Lokali অ্যাপ খুলুন', 'অক্টোবর 2026-এ যাচাই করা', 'আমরা কীভাবে এই গাইড লিখি', 'Google Maps-এ খুলুন', 'সব শহর', 'সম্পাদকীয় প্রক্রিয়া', 'বিনামূল্যে অডিও গাইড',
  '45টি ভাষা, Lokali অ্যাপে', 'বিনামূল্যে', 'মিনিট', 'অ্যাপ ডাউনলোড করুন', 'ঘণ্টা',
  'আপনার অবস্থান থেকে পথ', 'ঘুরে দেখতে কত সময় লাগে?', 'বিনামূল্যে অডিও গাইড আছে কি?',
  'হ্যাঁ। Lokali অ্যাপ 45টি ভাষায় বিনামূল্যে গল্প শোনায় — টিকিট, দল বা সাবস্ক্রিপশন ছাড়াই; ডাউনলোডের পর অফলাইনে চলে।',
  'কোথায় অবস্থিত?', 'যাওয়ার আগে কী জানা দরকার?', 'কীসের জন্য বিখ্যাত?',
  'সবগুলোই বিনামূল্যে, 45টি ভাষায়, টিকিট বা দল ছাড়াই, আর ডাউনলোডের পর অফলাইনে চলে।',
  'কতগুলো বিনামূল্যে অডিও গাইড আছে?', 'অডিও গাইড কি সত্যিই বিনামূল্যে?',
  'হ্যাঁ। টিকিট, দল বা সাবস্ক্রিপশন নেই — গাইড আপনার নিজের ফোনেই চলে।']
C['bn'] = ['তুরস্ক', 'ফ্রান্স', 'জর্জিয়া', 'ইতালি', 'স্পেন', 'থাইল্যান্ড', 'মার্কিন যুক্তরাষ্ট্র', 'ভারত', 'ভিয়েতনাম', 'গ্রিস', 'জাপান']
META['bn'] = ('bn_BD', 'ltr', ': ', '।')

L['ta'] = ['கதை', 'முக்கிய தகவல்கள்', 'கவனிக்க வேண்டியவை', 'பயனுள்ள குறிப்புகள்', 'அடிக்கடி கேட்கப்படும் கேள்விகள்', 'வரைபடத்தில்', 'பார்வையாளர் தகவல்', 'மேலும் பார்க்க',
  'தேவையான நேரம்', 'Lokali ஒலி வழிகாட்டி', 'வகை', 'சிறந்தது', 'இடம்', 'ஆயத்தொலைவுகள்', 'மொழிகள்',
  'இலவச ஒலி வழிகாட்டி', 'தொடங்கு', 'Lokali செயலியைத் திற', 'அக்டோபர் 2026-இல் சரிபார்க்கப்பட்டது', 'இந்த வழிகாட்டிகளை எப்படி எழுதுகிறோம்', 'Google Maps-இல் திற', 'எல்லா நகரங்களும்', 'தொகுப்பு முறை', 'இலவச ஒலி வழிகாட்டிகள்',
  '45 மொழிகள், Lokali செயலியில்', 'இலவசம்', 'நிமி', 'செயலியைப் பதிவிறக்கு', 'மணி',
  'உங்கள் இடத்திலிருந்து வழி', 'பார்வையிட எவ்வளவு நேரம் ஆகும்?', 'இலவச ஒலி வழிகாட்டி உள்ளதா?',
  'ஆம். Lokali செயலி 45 மொழிகளில் இலவசமாகக் கதை சொல்கிறது — டிக்கெட், குழு, சந்தா எதுவும் இல்லை; பதிவிறக்கிய பின் ஆஃப்லைனில் இயங்கும்.',
  'எங்கே உள்ளது?', 'செல்லும் முன் என்ன தெரிந்துகொள்ள வேண்டும்?', 'எதற்காகப் பிரபலம்?',
  'அனைத்தும் இலவசம், 45 மொழிகளில், டிக்கெட் அல்லது குழு இல்லாமல், பதிவிறக்கிய பின் ஆஃப்லைனில் இயங்கும்.',
  'எத்தனை இலவச ஒலி வழிகாட்டிகள் உள்ளன?', 'ஒலி வழிகாட்டி உண்மையில் இலவசமா?',
  'ஆம். டிக்கெட், குழு, சந்தா எதுவும் இல்லை — வழிகாட்டிகள் உங்கள் சொந்த தொலைபேசியில் இயங்கும்.']
C['ta'] = ['துருக்கி', 'பிரான்ஸ்', 'ஜார்ஜியா', 'இத்தாலி', 'ஸ்பெயின்', 'தாய்லாந்து', 'அமெரிக்கா', 'இந்தியா', 'வியட்நாம்', 'கிரீஸ்', 'ஜப்பான்']
META['ta'] = ('ta_IN', 'ltr')

L['te'] = ['కథ', 'ముఖ్య విషయాలు', 'ఏమి గమనించాలి', 'ఉపయోగకరమైన చిట్కాలు', 'తరచుగా అడిగే ప్రశ్నలు', 'మ్యాప్‌లో', 'సందర్శకుల సమాచారం', 'ఇంకా ఏమి చూడాలి',
  'పట్టే సమయం', 'Lokali ఆడియో గైడ్', 'రకం', 'ఎవరికి ఉత్తమం', 'ప్రదేశం', 'నిర్దేశాంకాలు', 'భాషలు',
  'ఉచిత ఆడియో గైడ్', 'ప్రారంభించండి', 'Lokali యాప్ తెరవండి', 'అక్టోబర్ 2026లో ధృవీకరించబడింది', 'ఈ గైడ్‌లను ఎలా రాస్తాం', 'Google Mapsలో తెరవండి', 'అన్ని నగరాలు', 'సంపాదకీయ విధానం', 'ఉచిత ఆడియో గైడ్‌లు',
  '45 భాషలు, Lokali యాప్‌లో', 'ఉచితం', 'నిమి', 'యాప్ డౌన్‌లోడ్ చేయండి', 'గం',
  'మీ ప్రదేశం నుండి మార్గం', 'సందర్శనకు ఎంత సమయం పడుతుంది?', 'ఉచిత ఆడియో గైడ్ ఉందా?',
  'అవును. Lokali యాప్ 45 భాషల్లో ఉచితంగా కథ చెబుతుంది — టికెట్, బృందం, సభ్యత్వం ఏదీ అవసరం లేదు; డౌన్‌లోడ్ చేశాక ఆఫ్‌లైన్‌లో పనిచేస్తుంది.',
  'ఎక్కడ ఉంది?', 'వెళ్లే ముందు ఏమి తెలుసుకోవాలి?', 'దేనికి ప్రసిద్ధి?',
  'అన్నీ ఉచితం, 45 భాషల్లో, టికెట్ లేదా బృందం లేకుండా, డౌన్‌లోడ్ చేశాక ఆఫ్‌లైన్‌లో పనిచేస్తాయి.',
  'ఎన్ని ఉచిత ఆడియో గైడ్‌లు ఉన్నాయి?', 'ఆడియో గైడ్ నిజంగా ఉచితమేనా?',
  'అవును. టికెట్, బృందం, సభ్యత్వం ఏదీ లేదు — గైడ్‌లు మీ సొంత ఫోన్‌లోనే వినిపిస్తాయి.']
C['te'] = ['టర్కీ', 'ఫ్రాన్స్', 'జార్జియా', 'ఇటలీ', 'స్పెయిన్', 'థాయిలాండ్', 'అమెరికా', 'భారతదేశం', 'వియత్నాం', 'గ్రీస్', 'జపాన్']
META['te'] = ('te_IN', 'ltr')

L['ur'] = ['کہانی', 'اہم حقائق', 'کیا دیکھیں', 'عملی مشورے', 'عام سوالات', 'نقشے پر', 'سیاحوں کے لیے معلومات', 'اور کیا دیکھیں',
  'درکار وقت', 'Lokali آڈیو گائیڈ', 'قسم', 'کس کے لیے بہترین', 'مقام', 'کوآرڈینیٹس', 'زبانیں',
  'مفت آڈیو گائیڈ', 'شروع کریں', 'Lokali ایپ کھولیں', 'اکتوبر 2026 میں تصدیق شدہ', 'ہم یہ گائیڈ کیسے لکھتے ہیں', 'Google Maps میں کھولیں', 'تمام شہر', 'ادارتی طریقہ کار', 'مفت آڈیو گائیڈز',
  '45 زبانیں، Lokali ایپ میں', 'مفت', 'منٹ', 'ایپ ڈاؤن لوڈ کریں', 'گھنٹے',
  'آپ کے مقام سے راستہ', 'دیکھنے میں کتنا وقت لگتا ہے؟', 'کیا مفت آڈیو گائیڈ موجود ہے؟',
  'جی ہاں۔ Lokali ایپ 45 زبانوں میں مفت کہانی سناتی ہے — نہ ٹکٹ، نہ گروپ، نہ سبسکرپشن؛ ڈاؤن لوڈ کے بعد آف لائن چلتی ہے۔',
  'کہاں واقع ہے؟', 'جانے سے پہلے کیا جاننا چاہیے؟', 'کس لیے مشہور ہے؟',
  'سب مفت ہیں، 45 زبانوں میں، ٹکٹ یا گروپ کے بغیر، اور ڈاؤن لوڈ کے بعد آف لائن چلتے ہیں۔',
  'کتنے مفت آڈیو گائیڈز ہیں؟', 'کیا آڈیو گائیڈ واقعی مفت ہے؟',
  'جی ہاں۔ نہ ٹکٹ، نہ گروپ، نہ سبسکرپشن — گائیڈز آپ کے اپنے فون پر چلتے ہیں۔']
C['ur'] = ['ترکیہ', 'فرانس', 'جارجیا', 'اٹلی', 'اسپین', 'تھائی لینڈ', 'امریکہ', 'بھارت', 'ویتنام', 'یونان', 'جاپان']
META['ur'] = ('ur_PK', 'rtl', ': ', '۔')
