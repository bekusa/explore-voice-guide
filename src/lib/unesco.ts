/**
 * UNESCO World Heritage matcher.
 *
 * Full list — ~1,193 inscribed sites, parsed from Wikipedia's
 * "List of World Heritage Sites by year of inscription" and grouped
 * by country alphabetically. This replaces the earlier ~885-entry
 * curated subset; the long tail (rural sites in Mongolia, archaeological
 * digs in central Africa) is now covered too, since Lokali users can
 * search any city and we want the badge to surface wherever it applies.
 *
 * Plus a "Legacy aliases" section at the end preserving alternate
 * spellings (St. Peter's / St Peter's / Saint Peter's) that the
 * curated list had built up — those still feed the substring matcher
 * so they catch the alternate forms Claude sometimes returns.
 *
 * Matching: case-insensitive substring on `attractionName` plus
 * optional `city / type / description` context. We also short-circuit
 * to true if the haystack literally contains "unesco" — useful when
 * Claude / the prompt response explicitly mention UNESCO status in a
 * description.
 *
 * Language-agnostic: the matcher only ever sees the English baseline
 * (smart cache always stores attractions in English, then translates
 * for display). The badge label itself is translated via i18n
 * (`unesco.title` / `unesco.short`), so users in any locale see the
 * pill in their language without changing this list.
 *
 * Decision cache: results are memoised in localStorage so the next
 * page load doesn't re-walk the full needle list for every attraction
 * we already evaluated.
 *
 * Refreshing the list: re-run `build-unesco-list.mjs` to fetch the
 * latest Wikipedia inscription list and regenerate this file. New
 * sites get inscribed every July at the World Heritage Committee
 * session.
 */

const UNESCO_SITES: string[] = [
  // ─── Afghanistan (2)
  "Cultural Landscape and Archaeological Remains of the Bamiyan Valley",
  "Minaret and Archaeological Remains of Jam",

  // ─── Albania (2)
  "Butrint",
  "Historic Centres of Berat and Gjirokastra",

  // ─── Albania Austria Belgium Bosnia and Herzegovina Bulgaria Croatia Czech Republic … (1)
  "Ancient and Primeval Beech Forests of the Carpathians and Other Regions of Euro…",

  // ─── Albania SR Macedonia (1)
  "Natural and Cultural Heritage of the Ohrid Region",

  // ─── Algeria (7)
  "Al Qal'a of Beni Hammad",
  "Djémila",
  "Kasbah of Algiers",
  "M'Zab Valley",
  "Tassili n'Ajjer",
  "Timgad",
  "Tipasa",

  // ─── Andorra (1)
  "Madriu-Perafita-Claror Valley",

  // ─── Angola (1)
  "Mbanza Kongo, Vestiges of the Capital of the former Kingdom of Kongo",

  // ─── Antigua and Barbuda (1)
  "Antigua Naval Dockyard and Related Archaeological Sites",

  // ─── Argentina (9)
  "Cueva de las Manos, Río Pinturas",
  "ESMA Museum and Site of Memory – Former Clandestine Center of Detention, Tortur…",
  "Iguazu National Park",
  "Ischigualasto / Talampaya Natural Parks",
  "Jesuit Block and Estancias of Córdoba",
  "Los Alerces National Park",
  "Los Glaciares National Park",
  "Península Valdés",
  "Quebrada de Humahuaca",

  // ─── Argentina Belgium France Germany India Japan Switzerland (1)
  "The Architectural Work of Le Corbusier, an Outstanding Contribution to the Mode…",

  // ─── Argentina Bolivia Chile Colombia Ecuador Peru (1)
  "Qhapaq Ñan, Andean Road System",

  // ─── Argentina Brazil (1)
  "Jesuit Missions of the Guaranis: San Ignacio Mini, Santa Ana, Nuestra Señora de…",

  // ─── Armenia (3)
  "Cathedral and Churches of Echmiatsin and the Archaeological Site of Zvartnots",
  "Monasteries of Haghpat and Sanahin",
  "Monastery of Geghard and the Upper Azat Valley",

  // ─── Australia (20)
  "Australian Convict Sites",
  "Australian Fossil Mammal Sites (Riversleigh / Naracoorte)",
  "Budj Bim Cultural Landscape",
  "Gondwana Rainforests of Australia",
  "Great Barrier Reef",
  "Greater Blue Mountains Area",
  "Heard and McDonald Islands",
  "K'gari (Fraser Island)",
  "Kakadu National Park",
  "Lord Howe Island Group",
  "Macquarie Island",
  "Ningaloo Coast",
  "Purnululu National Park",
  "Royal Exhibition Building and Carlton Gardens",
  "Shark Bay, Western Australia",
  "Sydney Opera House",
  "Tasmanian Wilderness",
  "Uluṟu-Kata Tjuṯa National Park",
  "Wet Tropics of Queensland",
  "Willandra Lakes Region",

  // ─── Austria (7)
  "City of Graz – Historic Centre and Schloss Eggenberg",
  "Hallstatt-Dachstein / Salzkammergut Cultural Landscape",
  "Historic Centre of the City of Salzburg",
  "Historic Centre of Vienna",
  "Palace and Gardens of Schönbrunn",
  "Semmering Railway",
  "Wachau Cultural Landscape",

  // ─── Austria Belgium Czech Republic France Germany Italy United Kingdom (1)
  "The Great Spa Towns of Europe",

  // ─── Austria France Germany Italy Slovenia Switzerland (1)
  "Prehistoric Pile dwellings around the Alps",

  // ─── Austria Germany Slovakia (1)
  "Frontiers of the Roman Empire – The Danube Limes (Western Segment)",

  // ─── Austria Hungary (1)
  "Fertö / Neusiedlersee Cultural Landscape",

  // ─── Azerbaijan (4)
  "Cultural Landscape of Khinalig People and “Köç Yolu” Transhumance Route",
  "Gobustan Rock Art Cultural Landscape",
  "Historic Centre of Sheki with the Khan's Palace",
  "Walled City of Baku with the Shirvanshah's Palace and Maiden Tower",

  // ─── Azerbaijan Iran (1)
  "Hyrcanian Forests",

  // ─── Bahrain (3)
  "Dilmun Burial Mounds",
  "Pearling, Testimony of an Island Economy",
  "Qal'at al-Bahrain – Ancient Harbour and Capital of Dilmun",

  // ─── Bangladesh (3)
  "Historic Mosque City of Bagerhat",
  "Ruins of the Buddhist Vihara at Paharpur",
  "The Sundarbans",

  // ─── Barbados (1)
  "Historic Bridgetown and its Garrison",

  // ─── Belarus (2)
  "Architectural, Residential and Cultural Complex of the Radziwill Family at Nesv…",
  "Mir Castle Complex",

  // ─── Belarus Estonia Finland Latvia Lithuania Moldova Norway Russia Sweden Ukrai… (1)
  "Struve Geodetic Arc",

  // ─── Belarus Poland (1)
  "Białowieża Forest",

  // ─── Belgium (10)
  "Flemish Béguinages",
  "Historic Centre of Brugge",
  "La Grand-Place, Brussels",
  "Major Mining Sites of Wallonia",
  "Major Town Houses of the Architect Victor Horta (Brussels)",
  "Neolithic Flint Mines at Spiennes (Mons)",
  "Notre-Dame Cathedral in Tournai",
  "Plantin-Moretus House-Workshops-Museum Complex",
  "Stoclet House",
  "The Four Lifts on the Canal du Centre and their Environs, La Louvière and Le Ro…",

  // ─── Belgium France (2)
  "Belfries of Belgium and France",
  "Funerary and memory sites of the First World War (Western Front)",

  // ─── Belgium Netherlands (1)
  "Colonies of Benevolence",

  // ─── Belize (1)
  "Belize Barrier Reef Reserve System",

  // ─── Benin (1)
  "Royal Palaces of Abomey",

  // ─── Benin Burkina Faso Niger (1)
  "W-Arly-Pendjari Complex",

  // ─── Benin Togo (1)
  "Koutammakou, the Land of the Batammariba",

  // ─── Bolivia (5)
  "City of Potosí",
  "Fuerte de Samaipata",
  "Historic City of Sucre",
  "Jesuit Missions of the Chiquitos",
  "Noel Kempff Mercado National Park",

  // ─── Bosnia and Herzegovina (3)
  "Mehmed Paša Sokolović Bridge in Višegrad",
  "Old Bridge Area of the Old City of Mostar",
  "Vjetrenica Cave, Ravno",

  // ─── Bosnia and Herzegovina Croatia Montenegro Serbia (1)
  "Stećci Medieval Tombstone Graveyards",

  // ─── Botswana (2)
  "Okavango Delta",
  "Tsodilo",

  // ─── Brazil (22)
  "Atlantic Forest South-East Reserves",
  "Brasilia",
  "Brazilian Atlantic Islands: Fernando de Noronha and Atol das Rocas Reserves",
  "Central Amazon Conservation Complex",
  "Discovery Coast Atlantic Forest Reserves",
  "Historic Centre of Salvador de Bahia",
  "Historic Centre of São Luís",
  "Historic Centre of the Town of Diamantina",
  "Historic Centre of the Town of Goiás",
  "Historic Centre of the Town of Olinda",
  "Historic Town of Ouro Preto",
  "Iguaçu National Park",
  "Lençóis Maranhenses National Park",
  "Pampulha Modern Ensemble",
  "Pantanal Conservation Area",
  "Paraty and Ilha Grande – Culture and Biodiversity",
  "Rio de Janeiro: Carioca Landscapes between the Mountain and the Sea",
  "Sanctuary of Bom Jesus do Congonhas",
  "São Francisco Square in the Town of São Cristóvão",
  "Serra da Capivara National Park",
  "Sítio Roberto Burle Marx",
  "Valongo Wharf Archaeological Site",

  // ─── Bulgaria (9)
  "Ancient City of Nessebar",
  "Boyana Church",
  "Madara Rider",
  "Pirin National Park",
  "Rila Monastery",
  "Rock-Hewn Churches of Ivanovo",
  "Srebarna Nature Reserve",
  "Thracian Tomb of Kazanlak",
  "Thracian Tomb of Sveshtari",

  // ─── Burkina Faso (3)
  "Ancient Ferrous Metallurgy Sites of Burkina Faso",
  "Royal Court of Tiébélé",
  "Ruins of Loropéni",

  // ─── Cambodia (4)
  "Angkor",
  "Koh Ker: Archeological Site of Ancient Lingapura or Chok Gargyar",
  "Preah Vihear",
  "Temple Zone of Sambor Prei Kuk, Archaeological Site of Ancient Ishanapura",

  // ─── Cameroon (1)
  "Dja Faunal Reserve",

  // ─── Cameroon Central African Republic Congo (1)
  "Sangha Trinational",

  // ─── Canada (20)
  "Anticosti",
  "Canadian Rocky Mountain Parks",
  "Dinosaur Provincial Park",
  "Gros Morne National Park",
  "Head-Smashed-In Buffalo Jump",
  "Historic District of Old Québec",
  "Joggins Fossil Cliffs",
  "L'Anse aux Meadows National Historic Site",
  "Landscape of Grand Pré",
  "Miguasha National Park",
  "Mistaken Point",
  "Nahanni National Park",
  "Old Town Lunenburg",
  "Pimachiowin Aki",
  "Red Bay Basque Whaling Station",
  "Rideau Canal",
  "SG̱ang Gwaay",
  "Tr'ondëk-Klondike",
  "Wood Buffalo National Park",
  "Writing-on-Stone / Áísínai'pi",

  // ─── Canada United States (2)
  "Kluane / Wrangell–St. Elias / Glacier Bay / Tatshenshini-Alsek",
  "Waterton Glacier International Peace Park",

  // ─── Cape Verde (1)
  "Cidade Velha, Historic Centre of Ribeira Grande",

  // ─── Central African Republic (1)
  "Manovo-Gounda St Floris National Park",

  // ─── Chad (2)
  "Ennedi Massif: Natural and Cultural Landscape",
  "Lakes of Ounianga",

  // ─── Chile (6)
  "Churches of Chiloé",
  "Historic Quarter of the Seaport City of Valparaíso",
  "Humberstone and Santa Laura Saltpeter Works",
  "Rapa Nui National Park",
  "Settlement and Artificial Mummification of the Chinchorro Culture in the Arica …",
  "Sewell Mining Town",

  // ─── China (56)
  "Ancient Building Complex in the Wudang Mountains",
  "Ancient City of Ping Yao",
  "Ancient Villages in Southern Anhui – Xidi and Hongcun",
  "Archaeological ruins of Liangzhu City",
  "Badain Jaran Desert – Towers of Sand and Lakes",
  "Capital Cities and Tombs of the Ancient Koguryo Kingdom",
  "Chengjiang Fossil Site",
  "China Danxia",
  "Classical Gardens of Suzhou",
  "Cultural Landscape of Honghe Hani Rice Terraces",
  "Cultural Landscape of Old Tea Forests of the Jingmai Mountain in Pu'er",
  "Dazu Rock Carvings",
  "Fanjingshan",
  "Fujian Tulou",
  "Historic Centre of Macao",
  "Historic Ensemble of the Potala Palace, Lhasa",
  "Historic Monuments of Dengfeng in 'The Centre of Heaven and Earth'",
  "Huanglong Scenic and Historic Interest Area",
  "Hubei Shennongjia",
  "Imperial Palaces of the Ming and Qing Dynasties in Beijing and Shenyang",
  "Imperial Tombs of the Ming and Qing Dynasties",
  "Jiuzhaigou Valley Scenic and Historic Interest Area",
  "Kaiping Diaolou and Villages",
  "Kulangsu: a Historic International Settlement",
  "Longmen Grottoes",
  "Lushan National Park",
  "Mausoleum of the First Qin Emperor",
  "Migratory Bird Sanctuaries along the Coast of Yellow Sea–Bohai Gulf of China (P…",
  "Mogao Caves",
  "Mount Emei Scenic Area, including Leshan Giant Buddha Scenic Area",
  "Mount Huangshan",
  "Mount Qingcheng and the Dujiangyan Irrigation System",
  "Mount Sanqingshan National Park",
  "Mount Taishan",
  "Mount Wutai",
  "Mount Wuyi",
  "Mountain Resort and its Outlying Temples, Chengde",
  "Old Town of Lijiang",
  "Peking Man Site at Zhoukoudian",
  "Qinghai Hoh Xil",
  "Quanzhou: Emporium of the World in Song-Yuan China",
  "Sichuan Giant Panda Sanctuaries - Wolong, Mt Siguniang and Jiajin Mountains",
  "Site of Xanadu",
  "South China Karst",
  "Summer Palace, an Imperial Garden in Beijing",
  "Temple and Cemetery of Confucius and the Kong Family Mansion in Qufu",
  "The Grand Canal",
  "The Great Wall",
  "Three Parallel Rivers of Yunnan Protected Areas",
  "Tusi Sites",
  "West Lake Cultural Landscape of Hangzhou",
  "Wulingyuan Scenic and Historic Interest Area",
  "Xinjiang Tianshan",
  "Yin Xu",
  "Yungang Grottoes",
  "Zuojiang Huashan Rock Art Cultural Landscape",

  // ─── China Kazakhstan Kyrgyzstan (1)
  "Silk Roads: the Routes Network of Chang'an-Tianshan Corridor",

  // ─── Colombia (8)
  "Chiribiquete National Park – 'The Maloca of the Jaguar'",
  "Coffee Cultural Landscape of Colombia",
  "Historic Centre of Santa Cruz de Mompox",
  "Los Katíos National Park",
  "Malpelo Fauna and Flora Sanctuary",
  "National Archeological Park of Tierradentro",
  "Port, Fortresses and Group of Monuments, Cartagena",
  "San Agustín Archaeological Park",

  // ─── Congo (1)
  "Forest Massif of Odzala-Kokoua",

  // ─── Costa Rica (3)
  "Area de Conservación Guanacaste",
  "Cocos Island National Park",
  "Precolumbian Chiefdom Settlements with Stone Spheres of the Diquís",

  // ─── Costa Rica Panama (1)
  "Talamanca Range–La Amistad Reserves / La Amistad National Park",

  // ─── Côte d'Ivoire (4)
  "Comoé National Park",
  "Historic Town of Grand-Bassam",
  "Sudanese style mosques in northern Côte d'Ivoire",
  "Taï National Park",

  // ─── Côte d'Ivoire Guinea (1)
  "Mount Nimba Strict Nature Reserve",

  // ─── Croatia (4)
  "Episcopal Complex of the Euphrasian Basilica in the Historic Centre of Poreč",
  "Historic City of Trogir",
  "Stari Grad Plain",
  "The Cathedral of St James in Šibenik",

  // ─── Croatia Italy Montenegro (1)
  "Venetian Works of Defence between the 16th and 17th centuries: Stato da Terra –…",

  // ─── Cuba (9)
  "Alejandro de Humboldt National Park",
  "Archaeological Landscape of the First Coffee Plantations in the South-East of C…",
  "Desembarco del Granma National Park",
  "Historic Centre of Camagüey",
  "Old Havana and its Fortification System",
  "San Pedro de la Roca Castle, Santiago de Cuba",
  "Trinidad and the Valley de los Ingenios",
  "Urban Historic Centre of Cienfuegos",
  "Viñales Valley",

  // ─── Cyprus (3)
  "Choirokoitia",
  "Painted Churches in the Troodos Region",
  "Paphos",

  // ─── Czech Republic (14)
  "Gardens and Castle at Kroměříž",
  "Historic Centre of Český Krumlov",
  "Historic Centre of Prague",
  "Historic Centre of Telč",
  "Holašovice Historic Village",
  "Holy Trinity Column in Olomouc",
  "Jewish Quarter and St Procopius' Basilica in Třebíč",
  "Kutná Hora: Historical Town Centre with the Church of St Barbara and the Cathed…",
  "Landscape for Breeding and Training of Ceremonial Carriage Horses at Kladruby n…",
  "Lednice–Valtice Cultural Landscape",
  "Litomyšl Castle",
  "Pilgrimage Church of St John of Nepomuk at Zelená Hora",
  "Tugendhat Villa in Brno",
  "Žatec and the Landscape of Saaz Hops",

  // ─── Czech Republic Germany (1)
  "Erzgebirge / Krušnohoří Mining Region",

  // ─── Denmark (9)
  "Aasivissuit – Nipisat. Inuit Hunting Ground between Ice and Sea",
  "Ilulissat Icefjord",
  "Jelling Mounds, Runic Stones and Church",
  "Kronborg Castle",
  "Kujataa Greenland: Norse and Inuit Farming at the Edge of the Ice Cap",
  "Roskilde Cathedral",
  "Stevns Klint",
  "The par force hunting landscape in North Zealand",
  "Viking-Age Ring Fortresses",

  // ─── Denmark Germany Netherlands (1)
  "Wadden Sea",

  // ─── Denmark Germany United Kingdom United States (1)
  "Moravian Church Settlements",

  // ─── Dominica (1)
  "Morne Trois Pitons National Park",

  // ─── Dominican Republic (1)
  "Colonial City of Santo Domingo",

  // ─── DR Congo (5)
  "Garamba National Park",
  "Kahuzi-Biega National Park",
  "Okapi Wildlife Reserve",
  "Salonga National Park",
  "Virunga National Park",

  // ─── Ecuador (4)
  "City of Quito",
  "Galápagos Islands",
  "Historic Centre of Santa Ana de los Ríos de Cuenca",
  "Sangay National Park",

  // ─── Egypt (7)
  "Abu Mena",
  "Ancient Thebes with its Necropolis",
  "Historic Cairo",
  "Memphis and its Necropolis – the Pyramid Fields from Giza to Dahshur",
  "Nubian Monuments from Abu Simbel to Philae",
  "Saint Catherine Area",
  "Wadi Al-Hitan (Whale Valley)",

  // ─── El Salvador (1)
  "Joya de Cerén Archaeological Site",

  // ─── Eritrea (1)
  "Asmara: a Modernist African City",

  // ─── Estonia (1)
  "Historic Centre (Old Town) of Tallinn",

  // ─── Ethiopia (12)
  "Aksum",
  "Bale Mountains National Park",
  "Fasil Ghebbi, Gondar Region",
  "Harar Jugol, the Fortified Historic Town",
  "Konso Cultural Landscape",
  "Lower Valley of the Awash",
  "Lower Valley of the Omo",
  "Melka Kunture and Balchit: Archaeological and Palaeontological Sites in the Hig…",
  "Rock-Hewn Churches, Lalibela",
  "Simien National Park",
  "The Gedeo Cultural Landscape",
  "Tiya",

  // ─── Fiji (1)
  "Levuka Historical Port Town",

  // ─── Finland (5)
  "Bronze Age Burial Site of Sammallahdenmäki",
  "Fortress of Suomenlinna",
  "Old Rauma",
  "Petäjävesi Old Church",
  "Verla Groundwood and Board Mill",

  // ─── Finland Sweden (1)
  "High Coast / Kvarken Archipelago",

  // ─── France (46)
  "Abbey Church of Saint-Savin sur Gartempe",
  "Amiens Cathedral",
  "Arles, Roman and Romanesque Monuments",
  "Bordeaux, Port of the Moon",
  "Bourges Cathedral",
  "Canal du Midi",
  "Cathedral of Notre-Dame, Former Abbey of Saint-Remi and Palace of Tau, Reims",
  "Chaîne des Puys - Limagne fault tectonic arena",
  "Champagne Hillsides, Houses and Cellars",
  "Chartres Cathedral",
  "Cistercian Abbey of Fontenay",
  "Cordouan Lighthouse",
  "Decorated Cave of Pont d'Arc, known as Grotte Chauvet-Pont d'Arc, Ardèche",
  "Episcopal City of Albi",
  "Fortifications of Vauban",
  "French Austral Lands and Seas",
  "From the Great Saltworks of Salins-les-Bains to the Royal Saltworks of Arc-et-S…",
  "Historic Centre of Avignon: Papal Palace, Episcopal Ensemble and Avignon Bridge",
  "Historic Fortified City of Carcassonne",
  "Historic Site of Lyon",
  "Jurisdiction of Saint-Emilion",
  "Lagoons of New Caledonia: Reef Diversity and Associated Ecosystems",
  "Le Havre, the City Rebuilt by Auguste Perret",
  "Mont-Saint-Michel and its Bay",
  "Nice, Winter Resort Town of the Riviera",
  "Nord-Pas de Calais Mining Basin",
  "Palace and Park of Fontainebleau",
  "Palace and Park of Versailles",
  "Paris, Banks of the Seine",
  "Pitons, cirques and remparts of Reunion Island",
  "Place Stanislas, Place de la Carrière and Place d'Alliance in Nancy",
  "Pont du Gard (Roman Aqueduct)",
  "Prehistoric Sites and Decorated Caves of the Vézère Valley",
  "Provins, Town of Medieval Fairs",
  "Roman Theatre and its Surroundings and the 'Triumphal Arch' of Orange",
  "Routes of Santiago de Compostela in France",
  "Schwerin Residence Ensemble",
  "Strasbourg, Grande-Île and Neustadt",
  "Taputapuātea",
  "Te Henua Enata – The Marquesas Islands",
  "The Causses and the Cévennes, Mediterranean agro-pastoral Cultural Landscape",
  "The Climats, terroirs of Burgundy",
  "The Loire Valley between Sully-sur-Loire and Chalonnes",
  "The Maison Carrée of Nîmes",
  "Vézelay, Church and Hill",
  "Volcanoes and Forests of Mount Pelée and the Pitons of Northern Martinique",

  // ─── France Spain (1)
  "Pyrénées - Mont Perdu",

  // ─── Gabon (2)
  "Ecosystem and Relict Cultural Landscape of Lopé-Okanda",
  "Ivindo National Park",

  // ─── Gambia (1)
  "Kunta Kinteh Island and Related Sites",

  // ─── Gambia Senegal (1)
  "Stone Circles of Senegambia",

  // ─── Georgia (4)
  "Colchic Rainforests and Wetlands",
  "Gelati Monastery",
  "Historical Monuments of Mtskheta",
  "Upper Svaneti",

  // ─── Germany (43)
  "Aachen Cathedral",
  "Abbey and Altenmünster of Lorsch",
  "Archaeological Border complex of Hedeby and the Danevirke",
  "Bauhaus and its Sites in Weimar, Dessau and Bernau",
  "Bergpark Wilhelmshöhe",
  "Berlin Modernism Housing Estates",
  "Carolingian Westwork and Civitas Corvey",
  "Castles of Augustusburg and Falkenlust at Brühl",
  "Caves and Ice Age Art in the Swabian Jura",
  "Classical Weimar",
  "Collegiate Church, Castle and Old Town of Quedlinburg",
  "Cologne Cathedral",
  "Dresden Elbe Valley (delisted in 2009)",
  "Fagus Factory in Alfeld",
  "Garden Kingdom of Dessau-Wörlitz",
  "Hanseatic City of Lübeck",
  "Historic Centres of Stralsund and Wismar",
  "Jewish-Medieval Heritage of Erfurt",
  "Luther Memorials in Eisleben and Wittenberg",
  "Margravial Opera House Bayreuth",
  "Mathildenhöhe Darmstadt",
  "Maulbronn Monastery Complex",
  "Messel Pit Fossil Site",
  "Mines of Rammelsberg, Historic Town of Goslar and Upper Harz Water Management S…",
  "Monastic Island of Reichenau",
  "Museumsinsel (Museum Island), Berlin",
  "Naumburg Cathedral",
  "Old town of Regensburg with Stadtamhof",
  "Palaces and Parks of Potsdam and Berlin",
  "Roman Monuments, Cathedral of St Peter and Church of Our Lady in Trier",
  "ShUM Sites of Speyer, Worms and Mainz",
  "Speicherstadt and Kontorhaus District with Chilehaus",
  "Speyer Cathedral",
  "St Mary's Cathedral and St Michael's Church at Hildesheim",
  "Town Hall and Roland on the Marketplace of Bremen",
  "Town of Bamberg",
  "Upper Middle Rhine Valley",
  "Völklingen Ironworks",
  "Wartburg Castle",
  "Water Management System of Augsburg",
  "Wieskirche",
  "Würzburg Residence with the Court Gardens and Residence Square",
  "Zollverein Coal Mine Industrial Complex in Essen",

  // ─── Germany Netherlands (1)
  "Frontiers of the Roman Empire – The Lower German Limes",

  // ─── Germany Poland (1)
  "Muskauer Park / Park Mużakowski",

  // ─── Germany United Kingdom (1)
  "Frontiers of the Roman Empire",

  // ─── Ghana (2)
  "Asante Traditional Buildings",
  "Forts and Castles, Volta, Greater Accra, Central and Western Regions",

  // ─── Greece (19)
  "Acropolis, Athens",
  "Archaeological Site of Aigai (modern name Vergina)",
  "Archaeological Site of Delphi",
  "Archaeological Site of Mystras",
  "Archaeological Site of Olympia",
  "Archaeological Site of Philippi",
  "Archaeological Sites of Mycenae and Tiryns",
  "Delos",
  "Medieval City of Rhodes",
  "Meteora",
  "Monasteries of Daphni, Hosios Loukas and Nea Moni of Chios",
  "Mount Athos",
  "Old Town of Corfu",
  "Paleochristian and Byzantine Monuments of Thessalonika",
  "Pythagoreion and Heraion of Samos",
  "Sanctuary of Asklepios at Epidaurus",
  "Temple of Apollo Epicurius at Bassae",
  "The Historic Centre (Chorá) with the Monastery of Saint-John the Theologian and…",
  "Zagori Cultural Landscape",

  // ─── Guatemala (4)
  "Antigua Guatemala",
  "Archaeological Park and Ruins of Quirigua",
  "National Archaeological Park Tak'alik Ab'aj",
  "Tikal National Park",

  // ─── Haiti (1)
  "National History Park – Citadel, Sans Souci, Ramiers",

  // ─── Holy See (1)
  "Vatican City",

  // ─── Holy See Italy (1)
  "Historic Centre of Rome, the Properties of the Holy See in that City Enjoying E…",

  // ─── Honduras (2)
  "Maya Site of Copan",
  "Río Plátano Biosphere Reserve",

  // ─── Hungary (6)
  "Budapest, including the Banks of the Danube, the Buda Castle Quarter and András…",
  "Early Christian Necropolis of Pécs (Sopianae)",
  "Hortobágy National Park - the Puszta",
  "Millenary Benedictine Abbey of Pannonhalma and its Natural Environment",
  "Old Village of Hollókő and its Surroundings",
  "Tokaj Wine Region Historic Cultural Landscape",

  // ─── Hungary Slovakia (1)
  "Caves of Aggtelek Karst and Slovak Karst",

  // ─── Iceland (3)
  "Surtsey",
  "Vatnajökull National Park – Dynamic Nature of Fire and Ice",
  "Þingvellir National Park",

  // ─── India (42)
  "Agra Fort",
  "Ajanta Caves",
  "Archaeological Site of Nalanda Mahavihara at Nalanda, Bihar",
  "Buddhist Monuments at Sanchi",
  "Champaner-Pavagadh Archaeological Park",
  "Chhatrapati Shivaji Terminus (formerly Victoria Terminus)",
  "Churches and Convents of Goa",
  "Dholavira: a Harappan City",
  "Elephanta Caves",
  "Ellora Caves",
  "Fatehpur Sikri",
  "Great Himalayan National Park Conservation Area",
  "Great Living Chola Temples",
  "Group of Monuments at Hampi",
  "Group of Monuments at Mahabalipuram",
  "Group of Monuments at Pattadakal",
  "Hill Forts of Rajasthan",
  "Historic City of Ahmadabad",
  "Humayun's Tomb, Delhi",
  "Jaipur City, Rajasthan",
  "Kakatiya Rudreshwara (Ramappa) Temple, Telangana",
  "Kaziranga National Park",
  "Keoladeo National Park",
  "Khajuraho Group of Monuments",
  "Khangchendzonga National Park",
  "Mahabodhi Temple Complex at Bodh Gaya",
  "Manas Wildlife Sanctuary",
  "Moidams – the Mound-Burial System of the Ahom Dynasty",
  "Mountain Railways of India",
  "Nanda Devi and Valley of Flowers National Parks",
  "Qutb Minar and its Monuments, Delhi",
  "Rani-ki-Vav (the Queen's Stepwell) at Patan, Gujarat",
  "Red Fort Complex",
  "Rock Shelters of Bhimbetka",
  "Sacred Ensembles of the Hoysalas",
  "Santiniketan",
  "Sun Temple, Konârak",
  "Sundarbans National Park",
  "Taj Mahal",
  "The Jantar Mantar, Jaipur",
  "Victorian Gothic and Art Deco Ensembles of Mumbai",
  "Western Ghats",

  // ─── Indonesia (10)
  "Borobudur Temple Compounds",
  "Cultural Landscape of Bali Province: the Subak as a Manifestation of the Tri Hi…",
  "Komodo National Park",
  "Lorentz National Park",
  "Ombilin Mining Heritage of Sawahlunto",
  "Prambanan Temple Compounds",
  "Sangiran Early Man Site",
  "The Cosmological Axis of Yogyakarta and its Historic Landmarks",
  "Tropical Rainforest Heritage of Sumatra",
  "Ujung Kulon National Park",

  // ─── Iran (27)
  "Armenian Monastic Ensembles of Iran",
  "Bam and its Cultural Landscape",
  "Behistun Inscription",
  "Cultural Landscape of Hawraman / Uramanat",
  "Cultural Landscape of Maymand",
  "Golestan Palace",
  "Gonbad-e Qābus",
  "Hegmataneh",
  "Historic City of Yazd",
  "Lut Desert",
  "Masjed-e Jāmé of Isfahan",
  "Meidan Eimam, Esfahan",
  "Pasargadae",
  "Persepolis",
  "Sassanid Archaeological Landscape of Fars Region",
  "Shahr-I Sokhta",
  "Sheikh Safi al-Din Khānegāh and Shrine Ensemble in Ardabil",
  "Shushtar Historical Hydraulic System",
  "Soltaniyeh",
  "Susa",
  "Tabriz Historic Bazaar Complex",
  "Takht-e Soleyman",
  "Tchogha Zanbil",
  "The Persian Caravanserai",
  "The Persian Garden",
  "The Persian Qanat",
  "Trans-Iranian Railway",

  // ─── Iraq (6)
  "Ashur (Qal'at Sherqat)",
  "Babylon",
  "Erbil Citadel",
  "Hatra",
  "Samarra Archaeological City",
  "The Ahwar of Southern Iraq: Refuge of Biodiversity and the Relict Landscape of …",

  // ─── Ireland (2)
  "Brú na Bóinne – Archaeological Ensemble of the Bend of the Boyne",
  "Sceilg Mhichíl",

  // ─── Israel (9)
  "Bahá'í Holy Places in Haifa and the Western Galilee",
  "Biblical Tels – Megiddo, Hazor, Beer Sheba",
  "Caves of Maresha and Bet-Guvrin in the Judean Lowlands as a Microcosm of the La…",
  "Incense Route – Desert Cities in the Negev",
  "Masada",
  "Necropolis of Bet She'arim: A Landmark of Jewish Renewal",
  "Old City of Acre",
  "Sites of Human Evolution at Mount Carmel: The Nahal Me'arot / Wadi el-Mughara C…",
  "White City of Tel-Aviv – the Modern Movement",

  // ─── Italy (53)
  "18th-Century Royal Palace at Caserta with the Park, the Aqueduct of Vanvitelli,…",
  "Arab-Norman Palermo and the Cathedral Churches of Cefalù and Monreale",
  "Archaeological Area and the Patriarchal Basilica of Aquileia",
  "Archaeological Area of Agrigento",
  "Archaeological Areas of Pompei, Herculaneum and Torre Annunziata",
  "Assisi, the Basilica of San Francesco and Other Franciscan Sites",
  "Botanical Garden (Orto Botanico), Padua",
  "Castel del Monte",
  "Cathedral, Torre Civica and Piazza Grande, Modena",
  "Church and Dominican Convent of Santa Maria delle Grazie with 'The Last Supper'…",
  "Cilento and Vallo di Diano National Park with the Archeological Sites of Paestu…",
  "City of Verona",
  "City of Vicenza and the Palladian Villas of the Veneto",
  "Costiera Amalfitana",
  "Crespi d'Adda",
  "Early Christian Monuments of Ravenna",
  "Etruscan Necropolises of Cerveteri and Tarquinia",
  "Evaporitic Karst and Caves of Northern Apennines",
  "Ferrara, City of the Renaissance, and its Po Delta",
  "Genoa: Le Strade Nuove and the system of the Palazzi dei Rolli",
  "Historic Centre of Florence",
  "Historic Centre of Naples",
  "Historic Centre of San Gimignano",
  "Historic Centre of Siena",
  "Historic Centre of the City of Pienza",
  "Historic Centre of Urbino",
  "Isole Eolie (Aeolian Islands)",
  "Ivrea, Industrial City of the 20th Century",
  "Late Baroque Towns of the Val di Noto (South-Eastern Sicily)",
  "Le Colline del Prosecco di Conegliano e Valdobbiadene",
  "Longobards in Italy. Places of the Power (568–774 A.D.)",
  "Mantua and Sabbioneta",
  "Medici Villas and Gardens in Tuscany",
  "Mount Etna",
  "Padua's fourteenth-century fresco cycles",
  "Piazza del Duomo, Pisa",
  "Portovenere, Cinque Terre, and the Islands (Palmaria, Tino and Tinetto)",
  "Residences of the Royal House of Savoy",
  "Rock Drawings in Valcamonica",
  "Sacri Monti of Piedmont and Lombardy",
  "Su Nuraxi di Barumini",
  "Syracuse and the Rocky Necropolis of Pantalica",
  "The Dolomites",
  "The Porticoes of Bologna",
  "The Sassi and the Park of the Rupestrian Churches of Matera",
  "The Trulli of Alberobello",
  "Val d'Orcia",
  "Venice and its Lagoon",
  "Via Appia. Regina Viarum",
  "Villa Adriana (Tivoli)",
  "Villa d'Este, Tivoli",
  "Villa Romana del Casale",
  "Vineyard Landscape of Piedmont: Langhe-Roero and Monferrato",

  // ─── Italy Switzerland (2)
  "Monte San Giorgio",
  "Rhaetian Railway in the Albula / Bernina Landscapes",

  // ─── Jamaica (1)
  "Blue and John Crow Mountains",

  // ─── Japan (25)
  "Amami-Ōshima Island, Tokunoshima Island, Northern part of Okinawa Island, and I…",
  "Buddhist Monuments in the Horyu-ji Area",
  "Fujisan, sacred place and source of artistic inspiration",
  "Gusuku Sites and Related Properties of the Kingdom of Ryukyu",
  "Hidden Christian Sites in the Nagasaki Region",
  "Himeji-jo",
  "Hiraizumi – Temples, Gardens and Archaeological Sites Representing the Buddhist…",
  "Hiroshima Peace Memorial (Genbaku Dome)",
  "Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities)",
  "Historic Monuments of Ancient Nara",
  "Historic Villages of Shirakawa-go and Gokayama",
  "Itsukushima Shinto Shrine",
  "Iwami Ginzan Silver Mine and its Cultural Landscape",
  "Jōmon Prehistoric Sites in Northern Japan",
  "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan",
  "Ogasawara Islands",
  "Sacred Island of Okinoshima and Associated Sites in the Munakata Region",
  "Sacred Sites and Pilgrimage Routes in the Kii Mountain Range",
  "Sado Island Gold Mines",
  "Shirakami-Sanchi",
  "Shiretoko Peninsula",
  "Shrines and Temples of Nikko",
  "Sites of Japan's Meiji Industrial Revolution: Iron and Steel, Shipbuilding and …",
  "Tomioka Silk Mill and Related Sites",
  "Yakushima",

  // ─── Jerusalem (1)
  "Old City of Jerusalem and its Walls",

  // ─── Jordan (7)
  "As-Salt - The Place of Tolerance and Urban Hospitality",
  "Baptism Site 'Bethany Beyond the Jordan' (Al-Maghtas)",
  "Petra",
  "Quseir Amra",
  "Um er-Rasas (Kastrom Mefa'a)",
  "Umm Al-Jimāl",
  "Wadi Rum Protected Area",

  // ─── Kazakhstan (3)
  "Mausoleum of Khoja Ahmed Yasawi",
  "Petroglyphs within the Archaeological Landscape of Tamgaly",
  "Saryarka – Steppe and Lakes of Northern Kazakhstan",

  // ─── Kazakhstan Kyrgyzstan Uzbekistan (1)
  "Western Tien-Shan",

  // ─── Kazakhstan Turkmenistan Uzbekistan (1)
  "Cold Winter Deserts of Turan",

  // ─── Kenya (8)
  "Fort Jesus, Mombasa",
  "Kenya Lake System in the Great Rift Valley",
  "Lake Turkana National Parks",
  "Lamu Old Town",
  "Mount Kenya National Park/Natural Forest",
  "Sacred Mijikenda Kaya Forests",
  "The Historic Town and Archaeological Site of Gedi",
  "Thimlich Ohinga Archaeological Site",

  // ─── Kiribati (1)
  "Phoenix Islands Protected Area",

  // ─── Kyrgyzstan (1)
  "Sulaiman-Too Sacred Mountain",

  // ─── Laos (3)
  "Megalithic Jar Sites in Xiengkhuang - Plain of Jars",
  "Town of Luang Prabang",
  "Vat Phou and Associated Ancient Settlements within the Champasak Cultural Lands…",

  // ─── Laos Vietnam (1)
  "Phong Nha-Ke Bang National Park and Hin Nam No National Park",

  // ─── Latvia (2)
  "Historic Centre of Riga",
  "Old town of Kuldīga",

  // ─── Lebanon (6)
  "Anjar",
  "Baalbek",
  "Byblos",
  "Ouadi Qadisha (the Holy Valley) and the Forest of the Cedars of God (Horsh Arz …",
  "Rachid Karami International Fair-Tripoli",
  "Tyre",

  // ─── Lesotho South Africa (1)
  "Maloti-Drakensberg Park",

  // ─── Libya (5)
  "Archaeological Site of Cyrene",
  "Archaeological Site of Leptis Magna",
  "Archaeological Site of Sabratha",
  "Old Town of Ghadamès",
  "Rock-Art Sites of Tadrart Acacus",

  // ─── Lithuania (3)
  "Kernavė Archaeological Site (Cultural Reserve of Kernavė)",
  "Modernist Kaunas: Architecture of Optimism, 1919-1939",
  "Vilnius Historic Centre",

  // ─── Lithuania Russia (1)
  "Curonian Spit",

  // ─── Luxembourg (1)
  "City of Luxembourg: its Old Quarters and Fortifications",

  // ─── Madagascar (3)
  "Andrefana Dry Forests",
  "Rainforests of the Atsinanana",
  "Royal Hill of Ambohimanga",

  // ─── Malawi (2)
  "Chongoni Rock-Art Area",
  "Lake Malawi National Park",

  // ─── Malaysia (5)
  "Archaeological Heritage of the Lenggong Valley",
  "Gunung Mulu National Park",
  "Kinabalu Park",
  "Melaka and George Town, Historic Cities of the Straits of Malacca",
  "The Archaeological Heritage of Niah National Park’s Caves Complex",

  // ─── Mali (4)
  "Cliff of Bandiagara (Land of the Dogons)",
  "Old Towns of Djenné",
  "Timbuktu",
  "Tomb of Askia",

  // ─── Malta (3)
  "City of Valletta",
  "Ħal Saflieni Hypogeum",
  "Megalithic Temples of Malta",

  // ─── Marshall Islands (1)
  "Bikini Atoll Nuclear Test Site",

  // ─── Mauritania (2)
  "Ancient Ksour of Ouadane, Chinguetti, Tichitt and Oualata",
  "Banc d'Arguin National Park",

  // ─── Mauritius (2)
  "Aapravasi Ghat",
  "Le Morne Cultural Landscape",

  // ─── Mexico (35)
  "Agave Landscape and Ancient Industrial Facilities of Tequila",
  "Ancient Maya City and Protected Tropical Forests of Calakmul, Campeche",
  "Aqueduct of Padre Tembleque Hydraulic System",
  "Archaeological Monuments Zone of Xochicalco",
  "Archaeological Zone of Paquimé, Casas Grandes",
  "Archipiélago de Revillagigedo",
  "Camino Real de Tierra Adentro",
  "Central University City Campus of the Universidad Nacional Autónoma de México (…",
  "Earliest 16th-Century Monasteries on the Slopes of Popocatepetl",
  "El Pinacate and Gran Desierto de Altar Biosphere Reserve",
  "El Tajin, Pre-Hispanic City",
  "Franciscan Missions in the Sierra Gorda of Querétaro",
  "Historic Centre of Mexico City and Xochimilco",
  "Historic Centre of Morelia",
  "Historic Centre of Oaxaca and Archaeological Site of Monte Albán",
  "Historic Centre of Puebla",
  "Historic Centre of Zacatecas",
  "Historic Fortified Town of Campeche",
  "Historic Monuments Zone of Querétaro",
  "Historic Monuments Zone of Tlacotalpan",
  "Historic Town of Guanajuato and Adjacent Mines",
  "Hospicio Cabañas, Guadalajara",
  "Islands and Protected Areas of the Gulf of California",
  "Luis Barragán House and Studio",
  "Monarch Butterfly Biosphere Reserve",
  "Pre-Hispanic City and National Park of Palenque",
  "Pre-Hispanic City of Chichen-Itza",
  "Pre-Hispanic City of Teotihuacan",
  "Pre-Hispanic Town of Uxmal",
  "Prehistoric Caves of Yagul and Mitla in the Central Valley of Oaxaca",
  "Protective town of San Miguel and the Sanctuary of Jesús Nazareno de Atotonilco",
  "Rock Paintings of the Sierra de San Francisco",
  "Sian Ka'an",
  "Tehuacán-Cuicatlán Valley: originary habitat of Mesoamerica",
  "Whale Sanctuary of El Vizcaino",

  // ─── Micronesia (1)
  "Nan Madol: Ceremonial Centre of Eastern Micronesia",

  // ─── Mongolia (4)
  "Deer Stone Monuments and Related Bronze Age Sites",
  "Great Burkhan Khaldun Mountain and its surrounding sacred landscape",
  "Orkhon Valley Cultural Landscape",
  "Petroglyphic Complexes of the Mongolian Altai",

  // ─── Mongolia Russia (2)
  "Landscapes of Dauria",
  "Uvs Nuur Basin",

  // ─── Morocco (9)
  "Archaeological Site of Volubilis",
  "Historic City of Meknes",
  "Ksar of Ait-Ben-Haddou",
  "Medina of Essaouira (formerly Mogador)",
  "Medina of Fez",
  "Medina of Marrakesh",
  "Medina of Tétouan (formerly known as Titawin)",
  "Portuguese City of Mazagan (El Jadida)",
  "Rabat, Modern Capital and Historic City: a Shared Heritage",

  // ─── Mozambique (1)
  "Island of Mozambique",

  // ─── Mozambique South Africa (1)
  "iSimangaliso Wetland Park – Maputo National Park",

  // ─── Myanmar (2)
  "Bagan",
  "Pyu Ancient Cities",

  // ─── Namibia (2)
  "Namib Sand Sea",
  "Twyfelfontein or /Ui-//aes",

  // ─── Nepal (4)
  "Chitwan National Park",
  "Kathmandu Valley",
  "Lumbini, the Birthplace of the Lord Buddha",
  "Sagarmatha National Park",

  // ─── Netherlands (10)
  "Droogmakerij de Beemster (Beemster Polder)",
  "Dutch Water Defence Lines",
  "Eisinga Planetarium in Franeker",
  "Historic Area of Willemstad, Inner City and Harbour, Curaçao",
  "Ir.D.F. Woudagemaal (D.F. Wouda Steam Pumping Station)",
  "Mill Network at Kinderdijk-Elshout",
  "Rietveld Schröderhuis (Rietveld Schröder House)",
  "Schokland and Surroundings",
  "Seventeenth-Century Canal Ring Area of Amsterdam inside the Singelgracht",
  "Van Nellefabriek",

  // ─── New Zealand (3)
  "New Zealand Sub-Antarctic Islands",
  "Te Wahipounamu – South West New Zealand",
  "Tongariro National Park",

  // ─── Nicaragua (2)
  "León Cathedral",
  "Ruins of León Viejo",

  // ─── Niger (2)
  "Air and Ténéré Natural Reserves",
  "Historic Centre of Agadez",

  // ─── Nigeria (2)
  "Osun-Osogbo Sacred Grove",
  "Sukur Cultural Landscape",

  // ─── North Korea (2)
  "Complex of Koguryo Tombs",
  "Historic Monuments and Sites in Kaesong",

  // ─── Norway (7)
  "Bryggen",
  "Rjukan–Notodden Industrial Heritage Site",
  "Rock Art of Alta",
  "Røros Mining Town and the Circumference",
  "Urnes Stave Church",
  "Vegaøyan – The Vega Archipelago",
  "West Norwegian Fjords – Geirangerfjord and Nærøyfjord",

  // ─── Oman (6)
  "Aflaj Irrigation Systems of Oman",
  "Ancient City of Qalhat",
  "Arabian Oryx Sanctuary (delisted in 2007)",
  "Archaeological Sites of Bat, Al-Khutm and Al-Ayn",
  "Bahla Fort",
  "Land of Frankincense",

  // ─── Pakistan (6)
  "Archaeological Ruins at Moenjodaro",
  "Buddhist Ruins of Takht-i-Bahi and Neighbouring City Remains at Sahr-i-Bahlol",
  "Fort and Shalamar Gardens in Lahore",
  "Historical Monuments at Makli, Thatta",
  "Rohtas Fort",
  "Taxila",

  // ─── Palau (1)
  "Rock Islands Southern Lagoon",

  // ─── Palestine (5)
  "Ancient Jericho/Tell es-Sultan",
  "Birthplace of Jesus: Church of the Nativity and the Pilgrimage Route, Bethlehem…",
  "Hebron / Al-Khalil Old Town",
  "Palestine: Land of Olives and Vines – Cultural Landscape of Southern Jerusalem,…",
  "Saint Hilarion Monastery/Tell Umm Amer",

  // ─── Panama (4)
  "Archaeological Site of Panamá Viejo and Historic District of Panamá",
  "Coiba National Park and its Special Zone of Marine Protection",
  "Darien National Park",
  "Fortifications on the Caribbean Side of Panama: Portobelo-San Lorenzo",

  // ─── Papua New Guinea (1)
  "Kuk Early Agricultural Site",

  // ─── Paraguay (1)
  "Jesuit Missions of La Santísima Trinidad de Paraná and Jesús de Tavarangue",

  // ─── Peru (12)
  "Chan Chan Archaeological Zone",
  "Chankillo Archaeoastronomical Complex",
  "Chavín (Archaeological Site)",
  "City of Cuzco",
  "Historic Centre of Lima",
  "Historic Sanctuary of Machu Picchu",
  "Historical Centre of the City of Arequipa",
  "Huascarán National Park",
  "Lines and Geoglyphs of Nasca and Palpa",
  "Manú National Park",
  "Río Abiseo National Park",
  "Sacred City of Caral-Supe",

  // ─── Philippines (6)
  "Baroque Churches of the Philippines",
  "Historic City of Vigan",
  "Mount Hamiguitan Range Wildlife Sanctuary",
  "Puerto-Princesa Subterranean River National Park",
  "Rice Terraces of the Philippine Cordilleras",
  "Tubbataha Reefs Natural Park",

  // ─── Poland (13)
  "Auschwitz Birkenau German Nazi Concentration and Extermination Camp (1940–1945)",
  "Castle of the Teutonic Order in Malbork",
  "Centennial Hall in Wrocław",
  "Churches of Peace in Jawor and Świdnica",
  "Historic Centre of Kraków",
  "Historic Centre of Warsaw",
  "Kalwaria Zebrzydowska: the Mannerist Architectural and Park Landscape Complex a…",
  "Krzemionki Prehistoric Striped Flint Mining Region",
  "Medieval Town of Toruń",
  "Old City of Zamość",
  "Tarnowskie Góry Lead-Silver-Zinc Mine and its Underground Water Management Syst…",
  "Wieliczka and Bochnia Royal Salt Mines",
  "Wooden Churches of Southern Małopolska",

  // ─── Poland Ukraine (1)
  "Wooden Tserkvas of the Carpathian Region in Poland and Ukraine",

  // ─── Portugal (16)
  "Alto Douro Wine Region",
  "Central Zone of the Town of Angra do Heroismo in the Azores",
  "Convent of Christ in Tomar",
  "Cultural Landscape of Sintra",
  "Garrison Border Town of Elvas and its Fortifications",
  "Historic Centre of Évora",
  "Historic Centre of Guimarães and Couros Zone",
  "Historic Centre of Oporto, Luiz I Bridge and Monastery of Serra do Pilar",
  "Landscape of the Pico Island Vineyard Culture",
  "Laurisilva of Madeira",
  "Monastery of Alcobaça",
  "Monastery of Batalha",
  "Monastery of the Hieronymites and Tower of Belém in Lisbon",
  "Royal Building of Mafra – Palace, Basilica, Convent, Cerco Garden and Hunting P…",
  "Sanctuary of Bom Jesus do Monte in Braga",
  "University of Coimbra – Alta and Sofia",

  // ─── Portugal Spain (1)
  "Prehistoric Rock Art Sites in the Côa Valley and Siega Verde",

  // ─── Qatar (1)
  "Al Zubarah Archaeological Site",

  // ─── Romania (10)
  "Brâncusi Monumental Ensemble of Târgu Jiu",
  "Churches of Moldavia",
  "Dacian Fortresses of the Orastie Mountains",
  "Danube Delta",
  "Frontiers of the Roman Empire - Dacia",
  "Historic Centre of Sighişoara",
  "Monastery of Horezu",
  "Roșia Montană Mining Landscape",
  "Villages with Fortified Churches in Transylvania",
  "Wooden Churches of Maramureş",

  // ─── Russia (25)
  "Architectural Ensemble of the Trinity Sergius Lavra in Sergiev Posad",
  "Assumption Cathedral and Monastery of the town-island of Sviyazhsk",
  "Astronomical Observatories of Kazan Federal University",
  "Bolghar Historical and Archaeological Complex",
  "Central Sikhote-Alin",
  "Church of the Ascension, Kolomenskoye",
  "Churches of the Pskov School of Architecture",
  "Citadel, Ancient City and Fortress Buildings of Derbent",
  "Cultural and Historic Ensemble of the Solovetsky Islands",
  "Cultural Landscape of Kenozero Lake",
  "Ensemble of the Ferapontov Monastery",
  "Ensemble of the Novodevichy Convent",
  "Golden Mountains of Altai",
  "Historic and Architectural Complex of the Kazan Kremlin",
  "Historic Monuments of Novgorod and Surroundings",
  "Historical Centre of the City of Yaroslavl",
  "Lake Baikal",
  "Lena Pillars Nature Park",
  "Natural System of Wrangel Island Reserve",
  "Petroglyphs of Lake Onega and the White Sea",
  "Putorana Plateau",
  "Virgin Komi Forests",
  "Volcanoes of Kamchatka",
  "Western Caucasus",
  "White Monuments of Vladimir and Suzdal",

  // ─── Russian Soviet Federative Socialist Republic (3)
  "Historic Centre of Saint Petersburg and Related Groups of Monuments",
  "Kizhi Pogost",
  "Kremlin and Red Square, Moscow",

  // ─── Rwanda (2)
  "Memorial sites of the Genocide: Nyamata, Murambi, Gisozi and Bisesero",
  "Nyungwe National Park",

  // ─── Saint Kitts and Nevis (1)
  "Brimstone Hill Fortress National Park",

  // ─── Saint Lucia (1)
  "Pitons Management Area",

  // ─── San Marino (1)
  "San Marino Historic Centre and Mount Titano",

  // ─── Saudi Arabia (8)
  "'Uruq Bani Ma'arid",
  "Al-Ahsa Oasis, an Evolving Cultural Landscape",
  "At-Turaif District in ad-Dir'iyah",
  "Hegra Archaeological Site (al-Hijr / Madā ͐ in Ṣāliḥ)",
  "Ḥimā Cultural Area",
  "Historic Jeddah, the Gate to Makkah",
  "Rock Art in the Hail Region of Saudi Arabia",
  "The Cultural Landscape of Al-Faw Archaeological Area",

  // ─── Senegal (6)
  "Bassari Country: Bassari, Fula and Bedik Cultural Landscapes",
  "Djoudj National Bird Sanctuary",
  "Island of Gorée",
  "Island of Saint-Louis",
  "Niokolo-Koba National Park",
  "Saloum Delta",

  // ─── Serbia (2)
  "Gamzigrad-Romuliana, Palace of Galerius",
  "Medieval Monuments in Kosovo",

  // ─── Seychelles (2)
  "Aldabra Atoll",
  "Vallée de Mai Nature Reserve",

  // ─── Singapore (1)
  "Singapore Botanic Gardens",

  // ─── Slovakia (5)
  "Bardejov Town Conservation Reserve",
  "Historic Town of Banská Štiavnica and the Technical Monuments in its Vicinity",
  "Levoča, Spišský Hrad and the Associated Cultural Monuments",
  "Vlkolínec",
  "Wooden Churches of the Slovak part of the Carpathian Mountain Area",

  // ─── Slovenia (1)
  "The works of Jože Plečnik in Ljubljana – Human Centred Urban Design",

  // ─── Slovenia Spain (1)
  "Heritage of Mercury. Almadén and Idrija",

  // ─── Solomon Islands (1)
  "East Rennell",

  // ─── South Africa (9)
  "Barberton Makhonjwa Mountains",
  "Cape Floral Region Protected Areas",
  "Fossil Hominid Sites of South Africa",
  "Human Rights, Liberation and Reconciliation: Nelson Mandela Legacy Sites",
  "Mapungubwe Cultural Landscape",
  "Richtersveld Cultural and Botanical Landscape",
  "Robben Island",
  "Vredefort Dome",
  "ǂKhomani Cultural Landscape",

  // ─── South Korea (16)
  "Baekje Historic Areas",
  "Changdeokgung Palace Complex",
  "Gaya Tumuli",
  "Getbol, Korean Tidal Flats",
  "Gochang, Hwasun and Ganghwa Dolmen Sites",
  "Gyeongju Historic Areas",
  "Haeinsa Temple Janggyeong Panjeon, the Depositories for the Tripitaka Koreana W…",
  "Historic Villages of Korea: Hahoe and Yangdong",
  "Hwaseong Fortress",
  "Jeju Volcanic Island and Lava Tubes",
  "Jongmyo Shrine",
  "Namhansanseong",
  "Royal Tombs of the Joseon Dynasty",
  "Sansa, Buddhist Mountain Monasteries in Korea",
  "Seokguram Grotto and Bulguksa Temple",
  "Seowon, Korean Neo-Confucian Academies",

  // ─── Spain (45)
  "Alhambra, Generalife and Albayzín, Granada",
  "Antequera Dolmens Site",
  "Aranjuez Cultural Landscape",
  "Archaeological Ensemble of Mérida",
  "Archaeological Ensemble of Tarraco",
  "Archaeological Site of Atapuerca",
  "Burgos Cathedral",
  "Caliphate City of Medina Azahara",
  "Catalan Romanesque Churches of the Vall de Boí",
  "Cathedral, Alcázar and Archivo de Indias in Seville",
  "Cave of Altamira and Paleolithic Cave Art of Northern Spain",
  "Cultural Landscape of the Serra de Tramuntana",
  "Doñana National Park",
  "Garajonay National Park",
  "Historic Centre of Cordoba",
  "Historic City of Toledo",
  "Historic Walled Town of Cuenca",
  "Ibiza, Biodiversity and Culture",
  "La Lonja de la Seda de Valencia",
  "Las Médulas",
  "Monastery and Site of the Escurial, Madrid",
  "Monuments of Oviedo and the Kingdom of the Asturias",
  "Mudejar Architecture of Aragon",
  "Old City of Salamanca",
  "Old Town of Ávila with its Extra-Muros Churches",
  "Old Town of Cáceres",
  "Old Town of Segovia and its Aqueduct",
  "Palau de la Música Catalana and Hospital de Sant Pau, Barcelona",
  "Palmeral of Elche",
  "Paseo del Prado and Buen Retiro, a landscape of Arts and Sciences",
  "Poblet Monastery",
  "Prehistoric Sites of Talayotic Menorca",
  "Renaissance Monumental Ensembles of Úbeda and Baeza",
  "Risco Caído and the Sacred Mountains of Gran Canaria Cultural Landscape",
  "Rock Art of the Mediterranean Basin on the Iberian Peninsula",
  "Roman Walls of Lugo",
  "Royal Monastery of Santa María de Guadalupe",
  "San Cristóbal de La Laguna",
  "San Millán Yuso and Suso Monasteries",
  "Santiago de Compostela (Old Town)",
  "Teide National Park",
  "Tower of Hercules",
  "University and Historic Precinct of Alcalá de Henares",
  "Vizcaya Bridge",
  "Works of Antoni Gaudí",

  // ─── SR Croatia (3)
  "Historical Complex of Split with the Palace of Diocletian",
  "Old City of Dubrovnik",
  "Plitvice Lakes National Park",

  // ─── SR Montenegro (2)
  "Durmitor National Park",
  "Natural and Culturo-Historical Region of Kotor",

  // ─── SR Serbia (2)
  "Stari Ras and Sopoćani",
  "Studenica Monastery",

  // ─── SR Slovenia (1)
  "Škocjan Caves",

  // ─── Sri Lanka (8)
  "Ancient City of Polonnaruwa",
  "Ancient City of Sigiriya",
  "Central Highlands of Sri Lanka",
  "Old Town of Galle and its Fortifications",
  "Rangiri Dambulla Cave Temple",
  "Sacred City of Anuradhapura",
  "Sacred City of Kandy",
  "Sinharaja Forest Reserve",

  // ─── Sudan (3)
  "Archaeological Sites of the Island of Meroe",
  "Gebel Barkal and the Sites of the Napatan Region",
  "Sanganeb Marine National Park and Dungonab Bay – Mukkawar Island Marine Nationa…",

  // ─── Suriname (3)
  "Central Suriname Nature Reserve",
  "Historic Inner City of Paramaribo",
  "Jodensavanne Archaeological Site: Jodensavanne Settlement and Cassipora Creek C…",

  // ─── Sweden (13)
  "Agricultural Landscape of Southern Öland",
  "Birka and Hovgården",
  "Church Town of Gammelstad, Luleå",
  "Decorated Farmhouses of Hälsingland",
  "Engelsberg Ironworks",
  "Grimeton Radio Station, Varberg",
  "Hanseatic Town of Visby",
  "Laponian Area",
  "Mining Area of the Great Copper Mountain in Falun",
  "Naval Port of Karlskrona",
  "Rock Carvings in Tanum",
  "Royal Domain of Drottningholm",
  "Skogskyrkogården",

  // ─── Switzerland (8)
  "Abbey of St Gall",
  "Benedictine Convent of St John at Müstair",
  "La Chaux-de-Fonds / Le Locle, Watchmaking Town Planning",
  "Lavaux, Vineyard Terraces",
  "Old City of Berne",
  "Swiss Alps Jungfrau-Aletsch",
  "Swiss Tectonic Arena Sardona",
  "Three Castles, Defensive Wall and Ramparts of the Market-Town of Bellinzona",

  // ─── Syria (6)
  "Ancient City of Aleppo",
  "Ancient City of Bosra",
  "Ancient City of Damascus",
  "Ancient Villages of Northern Syria",
  "Crac des Chevaliers and Qal'at Salah El-Din",
  "Site of Palmyra",

  // ─── Tajikistan (3)
  "Proto-urban Site of Sarazm",
  "Tajik National Park (Mountains of the Pamirs)",
  "Tugay forests of the Tigrovaya Balka Nature Reserve",

  // ─── Tajikistan Turkmenistan Uzbekistan (1)
  "Silk Roads: Zarafshan-Karakum Corridor",

  // ─── Tanzania (7)
  "Kilimanjaro National Park",
  "Kondoa Rock-Art Sites",
  "Ngorongoro Conservation Area",
  "Ruins of Kilwa Kisiwani and Ruins of Songo Mnara",
  "Selous Game Reserve",
  "Serengeti National Park",
  "Stone Town of Zanzibar",

  // ─── Thailand (8)
  "Ban Chiang Archaeological Site",
  "Dong Phayayen-Khao Yai Forest Complex",
  "Historic City of Ayutthaya",
  "Historic Town of Sukhothai and Associated Historic Towns",
  "Kaeng Krachan Forest Complex",
  "Phu Phrabat, a testimony to the Sīma stone tradition of the Dvaravati period",
  "The Ancient Town of Si Thep and its Associated Dvaravati Monuments",
  "Thungyai-Huai Kha Khaeng Wildlife Sanctuaries",

  // ─── Tunisia (9)
  "Amphitheatre of El Jem",
  "Archaeological Site of Carthage",
  "Djerba: Testimony to a settlement pattern in an island territory",
  "Dougga / Thugga",
  "Ichkeul National Park",
  "Kairouan",
  "Medina of Sousse",
  "Medina of Tunis",
  "Punic Town of Kerkuane and its Necropolis",

  // ─── Turkey (21)
  "Aphrodisias",
  "Archaeological Site of Ani",
  "Archaeological Site of Troy",
  "Arslantepe Mound",
  "Bursa and Cumalıkızık: the Birth of the Ottoman Empire",
  "City of Safranbolu",
  "Diyarbakır Fortress and Hevsel Gardens Cultural Landscape",
  "Ephesus",
  "Göbekli Tepe",
  "Gordion",
  "Göreme National Park and the Rock Sites of Cappadocia",
  "Great Mosque and Hospital of Divriği",
  "Hattusha: the Hittite Capital",
  "Hierapolis–Pamukkale",
  "Historic Areas of Istanbul",
  "Nemrut Dağ",
  "Neolithic Site of Çatalhöyük",
  "Pergamon and its Multi-Layered Cultural Landscape",
  "Selimiye Mosque and its Social Complex",
  "Wooden Hypostyle Mosques of Medieval Anatolia",
  "Xanthos–Letoon",

  // ─── Turkmenistan (3)
  "Kunya-Urgench",
  "Parthian Fortresses of Nisa",
  "State Historical and Cultural Park 'Ancient Merv'",

  // ─── Uganda (3)
  "Bwindi Impenetrable National Park",
  "Rwenzori Mountains National Park",
  "Tombs of Buganda Kings at Kasubi",

  // ─── Ukraine (4)
  "Ancient City of Tauric Chersonese and its Chora",
  "L'viv – the Ensemble of the Historic Centre",
  "Residence of Bukovinian and Dalmatian Metropolitans",
  "The Historic Centre of Odesa",

  // ─── Ukrainian Soviet Socialist Republic (1)
  "Kyiv: Saint-Sophia Cathedral and Related Monastic Buildings, Kyiv-Pechersk Lavra",

  // ─── United Arab Emirates (1)
  "Cultural Sites of Al Ain (Hafit, Hili, Bidaa Bint Saud and Oases Areas)",

  // ─── United Kingdom (32)
  "Blaenavon Industrial Landscape",
  "Blenheim Palace",
  "Canterbury Cathedral, St Augustine's Abbey, and St Martin's Church",
  "Castles and Town Walls of King Edward in Gwynedd",
  "City of Bath",
  "Cornwall and West Devon Mining Landscape",
  "Derwent Valley Mills",
  "Dorset and East Devon Coast",
  "Durham Castle and Cathedral",
  "Giant's Causeway and Causeway Coast",
  "Gorham's Cave Complex",
  "Gough and Inaccessible Islands",
  "Heart of Neolithic Orkney",
  "Henderson Island",
  "Historic Town of St George and Related Fortifications, Bermuda",
  "Ironbridge Gorge",
  "Jodrell Bank Observatory",
  "Lake District National Park",
  "Liverpool – Maritime Mercantile City (delisted in 2021)",
  "Maritime Greenwich",
  "New Lanark",
  "Old and New Towns of Edinburgh",
  "Palace of Westminster and Westminster Abbey including Saint Margaret's Church",
  "Pontcysyllte Aqueduct and Canal",
  "Royal Botanic Gardens, Kew",
  "Saltaire",
  "St Kilda",
  "Stonehenge, Avebury and Associated Sites",
  "Studley Royal Park including the Ruins of Fountains Abbey",
  "The Forth Bridge",
  "The Slate Landscape of Northwest Wales",
  "Tower of London",

  // ─── United States (23)
  "Cahokia Mounds State Historic Site",
  "Carlsbad Caverns National Park",
  "Chaco Culture",
  "Everglades National Park",
  "Grand Canyon National Park",
  "Great Smoky Mountains National Park",
  "Hawaii Volcanoes National Park",
  "Hopewell Ceremonial Earthworks",
  "Independence Hall",
  "La Fortaleza and San Juan National Historic Site in Puerto Rico",
  "Mammoth Cave National Park",
  "Mesa Verde National Park",
  "Monticello and the University of Virginia in Charlottesville",
  "Monumental Earthworks of Poverty Point",
  "Olympic National Park",
  "Papahānaumokuākea",
  "Redwood National and State Parks",
  "San Antonio Missions",
  "Statue of Liberty",
  "Taos Pueblo",
  "The 20th-Century Architecture of Frank Lloyd Wright",
  "Yellowstone National Park",
  "Yosemite National Park",

  // ─── Uruguay (3)
  "Fray Bentos Industrial Landscape",
  "Historic Quarter of the City of Colonia del Sacramento",
  "The work of engineer Eladio Dieste: Church of Atlántida",

  // ─── Uzbek Soviet Socialist Republic (1)
  "Itchan Kala",

  // ─── Uzbekistan (3)
  "Historic Centre of Bukhara",
  "Historic Centre of Shakhrisyabz",
  "Samarkand – Crossroad of Cultures",

  // ─── Vanuatu (1)
  "Chief Roi Mata's Domain",

  // ─── Venezuela (3)
  "Canaima National Park",
  "Ciudad Universitaria de Caracas",
  "Coro and its Port",

  // ─── Vietnam (7)
  "Central Sector of the Imperial Citadel of Thang Long - Hanoi",
  "Citadel of the Ho Dynasty",
  "Complex of Hué Monuments",
  "Ha Long Bay - Cat Ba Archipelago",
  "Hoi An Ancient Town",
  "My Son Sanctuary",
  "Trang An Landscape Complex",

  // ─── Yemen (5)
  "Historic Town of Zabid",
  "Landmarks of the Ancient Kingdom of Saba, Marib",
  "Old City of Sanaa",
  "Old Walled City of Shibam",
  "Socotra Archipelago",

  // ─── Zambia Zimbabwe (1)
  "Mosi-oa-Tunya / Victoria Falls",

  // ─── Zimbabwe (4)
  "Great Zimbabwe National Monument",
  "Khami Ruins National Monument",
  "Mana Pools National Park, Sapi and Chewore Safari Areas",
  "Matobo Hills",

  // ─── Legacy aliases (alternate spellings preserved for matcher coverage)
  "Colosseum",
  "Roman Forum",
  "Palatine Hill",
  "St. Peter's Basilica",
  "St Peter's Basilica",
  "Sistine Chapel",
  "Pantheon",
  "Castel Sant'Angelo",
  "Historic Centre of Rome",
  "Trevi Fountain",
  "Spanish Steps",
  "Florence Cathedral",
  "Duomo di Firenze",
  "Ponte Vecchio",
  "Uffizi Gallery",
  "Pitti Palace",
  "Palazzo Vecchio",
  "Boboli Gardens",
  "St Mark's Basilica",
  "St. Mark's Basilica",
  "Doge's Palace",
  "Piazza San Marco",
  "Rialto Bridge",
  "Murano",
  "Burano",
  "Pisa Cathedral",
  "Leaning Tower of Pisa",
  "Piazza dei Miracoli",
  "Pompeii",
  "Herculaneum",
  "Cinque Terre",
  "Amalfi Coast",
  "Aeolian Islands",
  "Sassi di Matera",
  "Matera",
  "San Gimignano",
  "Siena Historic Centre",
  "Verona",
  "Ravenna",
  "Naples Historic Centre",
  "Genoa",
  "Urbino",
  "Mantua",
  "Sabbioneta",
  "Vicenza",
  "Padua",
  "Hadrian's Villa",
  "Villa d'Este",
  "Trulli of Alberobello",
  "Aquileia",
  "Modena Cathedral",
  "Piazza Grande Modena",
  "Banks of the Seine",
  "Notre-Dame de Paris",
  "Notre Dame Cathedral",
  "Louvre",
  "Sainte-Chapelle",
  "Conciergerie",
  "Palace of Versailles",
  "Mont-Saint-Michel",
  "Mont Saint-Michel",
  "Carcassonne",
  "Pont du Gard",
  "Palais des Papes",
  "Pont d'Avignon",
  "Avignon Historic Centre",
  "Lyon Historic Site",
  "Strasbourg Grande Île",
  "Reims Cathedral",
  "Bordeaux Port of the Moon",
  "Saint-Émilion",
  "Loire Valley",
  "Château de Chambord",
  "Château de Chenonceau",
  "Vézelay",
  "Fontainebleau",
  "Provins",
  "Le Havre",
  "Albi Episcopal City",
  "Nîmes",
  "Arles Roman Monuments",
  "Théâtre Antique d'Orange",
  "Causses and the Cévennes",
  "Pyrénées-Mont Perdu",
  "Alhambra",
  "Generalife",
  "Albayzín",
  "Sagrada Familia",
  "Sagrada Família",
  "Park Güell",
  "Park Guell",
  "Casa Batlló",
  "Casa Milà",
  "Casa Mila",
  "La Pedrera",
  "Palau de la Música Catalana",
  "Hospital de Sant Pau",
  "Casa Vicens",
  "Palau Güell",
  "Casa de los Botines",
  "El Escorial",
  "Toledo Historic City",
  "Segovia Aqueduct",
  "Segovia Old Town",
  "Alcázar of Seville",
  "Alcazar of Seville",
  "Seville Cathedral",
  "Giralda",
  "General Archive of the Indies",
  "Mosque-Cathedral of Córdoba",
  "Mezquita",
  "Historic Centre of Córdoba",
  "Avila",
  "Salamanca Old City",
  "Santiago de Compostela",
  "Cathedral of Santiago de Compostela",
  "Garajonay",
  "Ibiza",
  "Cuenca Historic Walled Town",
  "Cáceres Old Town",
  "Antequera Dolmens",
  "Risco Caído",
  "Caves of Altamira",
  "Westminster Abbey",
  "Palace of Westminster",
  "Royal Observatory Greenwich",
  "Cutty Sark",
  "Kew Gardens",
  "Stonehenge",
  "Avebury",
  "Bath Roman",
  "Edinburgh Old Town",
  "Edinburgh New Town",
  "Edinburgh Castle",
  "Hadrian's Wall",
  "Antonine Wall",
  "Giant's Causeway",
  "Blaenavon",
  "Pontcysyllte Aqueduct",
  "Liverpool Maritime Mercantile",
  "Studley Royal Park",
  "Fountains Abbey",
  "Durham Castle",
  "Durham Cathedral",
  "Canterbury Cathedral",
  "Forth Bridge",
  "Jurassic Coast",
  "Skellig Michael",
  "Brú na Bóinne",
  "Newgrange",
  "Acropolis",
  "Parthenon",
  "Erechtheion",
  "Temple of Olympian Zeus",
  "Ancient Agora of Athens",
  "Delphi",
  "Olympia",
  "Mycenae",
  "Tiryns",
  "Mystras",
  "Knossos",
  "Heraklion Archaeological",
  "Rhodes Old Town",
  "Patmos",
  "Monastery of St John the Theologian",
  "Cave of the Apocalypse",
  "Daphni",
  "Hosios Loukas",
  "Nea Moni of Chios",
  "Vergina",
  "Pythagoreion",
  "Heraion of Samos",
  "Bassae",
  "Hagia Sophia",
  "Blue Mosque",
  "Sultan Ahmed Mosque",
  "Topkapi Palace",
  "Topkapı Palace",
  "Basilica Cistern",
  "Suleymaniye Mosque",
  "Süleymaniye Mosque",
  "Cappadocia",
  "Göreme",
  "Goreme",
  "Pamukkale",
  "Hierapolis",
  "Troy Archaeological",
  "Pergamon",
  "Xanthos",
  "Letoon",
  "Hattusha",
  "Mount Nemrut",
  "Diyarbakır Fortress",
  "Hevsel Gardens",
  "Bursa",
  "Cumalıkızık",
  "Safranbolu",
  "Edirne Selimiye Mosque",
  "Çatalhöyük",
  "Catalhoyuk",
  "Ani",
  "Gobekli Tepe",
  "Aslantepe Mound",
  "Prague Castle",
  "Charles Bridge",
  "Český Krumlov",
  "Cesky Krumlov",
  "Kutná Hora",
  "Sedlec Ossuary",
  "Telč",
  "Lednice-Valtice",
  "Brno Tugendhat",
  "Olomouc Holy Trinity Column",
  "Karlovy Vary",
  "Mariánské Lázně",
  "Schönbrunn Palace",
  "Schloss Schönbrunn",
  "Hofburg",
  "Belvedere Palace",
  "Salzburg Old Town",
  "Hallstatt",
  "Graz Historic Centre",
  "Schloss Eggenberg",
  "Museum Island",
  "Brandenburg Gate",
  "Speicherstadt",
  "Würzburg Residence",
  "Bavarian Court Garden",
  "Hildesheim",
  "Lübeck Hanseatic",
  "Wartburg",
  "Bauhaus",
  "Wittenberg",
  "Bamberg Town",
  "Quedlinburg",
  "Trier Roman",
  "Porta Nigra",
  "Maulbronn Monastery",
  "Reichenau",
  "Messel Pit",
  "Zollverein Coal Mine",
  "Berlin Modernism Housing",
  "Castles of Augustusburg",
  "Limes",
  "Pillnitz",
  "Pilatus",
  "Old City of Bern",
  "Convent of Saint Gall",
  "Castles of Bellinzona",
  "Lavaux Vineyard",
  "Rhaetian Railway",
  "Jungfrau-Aletsch",
  "Sardona Tectonic Arena",
  "Le Corbusier",
  "Canal Ring",
  "Singel",
  "Kinderdijk",
  "Beemster",
  "Schokland",
  "Ir. D.F. Woudagemaal",
  "Stelling van Amsterdam",
  "Rietveld Schröder House",
  "Tower of Belém",
  "Torre de Belém",
  "Jerónimos Monastery",
  "Mosteiro dos Jerónimos",
  "Sintra Cultural Landscape",
  "Pena Palace",
  "Quinta da Regaleira",
  "Castle of the Moors",
  "Pico Island Vineyard",
  "Madeira Laurisilva",
  "Évora Historic Centre",
  "Porto Historic Centre",
  "Ribeira Porto",
  "Coimbra University",
  "Tomar Convent of Christ",
  "Alcobaça Monastery",
  "Batalha Monastery",
  "Elvas Garrison",
  "Mafra Royal Building",
  "Côa Valley",
  "Guimarães",
  "Medina of Marrakech",
  "Koutoubia Mosque",
  "Bahia Palace",
  "Jemaa el-Fnaa",
  "Medina of Fes",
  "Volubilis",
  "Medina of Tetouan",
  "Medina of Essaouira",
  "Aït Benhaddou",
  "Meknes Historic City",
  "Portuguese City of Mazagan",
  "Rabat",
  "Pyramids of Giza",
  "Great Pyramid",
  "Sphinx",
  "Memphis Egypt",
  "Saqqara",
  "Step Pyramid",
  "Khan el-Khalili",
  "Al-Azhar Mosque",
  "Sultan Hassan",
  "Citadel of Cairo",
  "Abu Simbel",
  "Karnak",
  "Luxor Temple",
  "Valley of the Kings",
  "Hatshepsut Temple",
  "Saint Catherine's Monastery",
  "Mount Sinai",
  "Wadi Rum",
  "Old City of Jerusalem",
  "Western Wall",
  "Dome of the Rock",
  "Holy Sepulchre",
  "Bethlehem Church of the Nativity",
  "Akko",
  "Baha'i",
  "Bahá'í",
  "Naqsh-e Jahan Square",
  "Shah Mosque",
  "Bam Citadel",
  "Yazd",
  "Samarra",
  "Palmyra",
  "Bosra",
  "Crac des Chevaliers",
  "Old City of Sana'a",
  "Shibam",
  "Al Ain",
  "Hegra",
  "Mada'in Saleh",
  "Diriyah",
  "Cultural Landscape of Bali",
  "Subak System",
  "Tanah Lot",
  "Borobudur",
  "Prambanan",
  "Ujung Kulon",
  "Lorentz",
  "Sangiran",
  "Angkor Wat",
  "Angkor Thom",
  "Bayon",
  "Ta Prohm",
  "Banteay Srei",
  "Sukhothai",
  "Ayutthaya",
  "Dong Phayayen",
  "Si Thep",
  "Hạ Long Bay",
  "Halong Bay",
  "Hoi An",
  "Hue Imperial",
  "My Son",
  "Phong Nha",
  "Trang An",
  "Great Wall of China",
  "Forbidden City",
  "Imperial Palaces of Beijing",
  "Summer Palace",
  "Temple of Heaven",
  "Ming Tombs",
  "Terracotta Army",
  "Mount Tai",
  "Huangshan",
  "Mount Emei",
  "Leshan Giant Buddha",
  "Potala Palace",
  "Jokhang Temple",
  "Lhasa",
  "Macau Historic Centre",
  "Lijiang Old Town",
  "Pingyao Ancient City",
  "Suzhou Classical Gardens",
  "Hangzhou West Lake",
  "Kulangsu",
  "Quanzhou",
  "Kaiping Diaolou",
  "Three Parallel Rivers",
  "Wulingyuan",
  "Jiuzhaigou",
  "Huanglong",
  "Sichuan Giant Panda",
  "Zhangjiajie",
  "Kyoto Historic Monuments",
  "Kiyomizu-dera",
  "Kinkaku-ji",
  "Ginkaku-ji",
  "Ryōan-ji",
  "Ryoan-ji",
  "Nijo Castle",
  "Nara Historic Monuments",
  "Tōdai-ji",
  "Todai-ji",
  "Kasuga Taisha",
  "Hōryū-ji",
  "Horyu-ji",
  "Himeji Castle",
  "Itsukushima Shrine",
  "Miyajima",
  "Mount Fuji",
  "Hiroshima Peace Memorial",
  "Genbaku Dome",
  "Atomic Bomb Dome",
  "Shirakawa-go",
  "Gokayama",
  "Shiretoko",
  "Ogasawara",
  "Hiraizumi",
  "Tomioka Silk Mill",
  "Meiji Industrial Revolution",
  "Mozu-Furuichi Kofun",
  "Amami Ōshima",
  "Iwami Ginzan",
  "Ryūkyū",
  "Hahoe",
  "Yangdong",
  "Bulguksa",
  "Seokguram",
  "Changdeokgung",
  "Tripitaka Koreana",
  "Haeinsa",
  "Jeju Volcanic",
  "Royal Tombs Joseon",
  "Sansa Buddhist Mountain",
  "Seowon",
  "Getbol",
  "Red Fort",
  "Qutub Minar",
  "Humayun's Tomb",
  "Khajuraho",
  "Hampi",
  "Sundarbans",
  "Konark Sun Temple",
  "Mahabalipuram",
  "Brihadeeswarar",
  "Pattadakal",
  "Hampi Group",
  "Champaner-Pavagadh",
  "Bodh Gaya",
  "Mahabodhi",
  "Chhatrapati Shivaji Terminus",
  "Darjeeling Himalayan",
  "Nilgiri Mountain",
  "Le Corbusier Chandigarh",
  "Rani-ki-Vav",
  "Stepwell at Patan",
  "Kaziranga",
  "Keoladeo",
  "Manas",
  "Nanda Devi",
  "Khangchendzonga",
  "Jaipur",
  "Hawa Mahal",
  "Jantar Mantar",
  "Lumbini",
  "Sagarmatha",
  "Chitwan",
  "Pashupatinath",
  "Boudhanath",
  "Sigiriya",
  "Anuradhapura",
  "Polonnaruwa",
  "Dambulla",
  "Kandy",
  "Sinharaja",
  "Galle Fort",
  "Mahaweli",
  "Mesa Verde",
  "Yellowstone",
  "Yosemite",
  "Grand Canyon",
  "Everglades",
  "Mammoth Cave",
  "Redwood",
  "Carlsbad Caverns",
  "Great Smoky Mountains",
  "Hawaii Volcanoes",
  "Glacier Bay",
  "Wrangell-St. Elias",
  "Kluane",
  "Cahokia Mounds",
  "Monticello",
  "University of Virginia",
  "Poverty Point",
  "Frank Lloyd Wright",
  "Hopewell Ceremonial",
  "Old Quebec",
  "Lunenburg",
  "L'Anse aux Meadows",
  "Banff National Park",
  "Jasper",
  "Canadian Rocky Mountain",
  "Gros Morne",
  "Wood Buffalo",
  "Nahanni",
  "SGang Gwaay",
  "Machu Picchu",
  "Cusco Old City",
  "Sacred Valley",
  "Nazca Lines",
  "Chan Chan",
  "Chavin",
  "Río Abiseo",
  "Huascarán",
  "Lima Historic Centre",
  "Arequipa Historic Centre",
  "Chichen Itza",
  "Chichén Itzá",
  "Teotihuacan",
  "Palenque",
  "Tikal",
  "Tulum",
  "Uxmal",
  "Calakmul",
  "El Tajín",
  "Monte Albán",
  "Oaxaca Historic Centre",
  "Puebla Historic Centre",
  "Mexico City Historic Centre",
  "Xochimilco",
  "Guanajuato",
  "Morelia Historic Centre",
  "Zacatecas Historic Centre",
  "Querétaro Historic Centre",
  "San Miguel de Allende",
  "Campeche",
  "Tlacotalpan",
  "El Pinacate",
  "Iguazu",
  "Iguaçu",
  "Galápagos",
  "Galapagos",
  "Easter Island",
  "Rapa Nui",
  "Christ the Redeemer",
  "Sugarloaf Mountain",
  "Cartagena Port",
  "Quito Old Town",
  "Ouro Preto",
  "Salvador da Bahia",
  "Olinda",
  "Brasília",
  "Pantanal",
  "Atlantic Forest",
  "Pampulha",
  "Cuenca Historic",
  "La Habana Vieja",
  "Old Havana",
  "Trinidad Cuba",
  "Panama Viejo",
  "Casco Viejo Panama",
  "Coro",
  "Valparaíso",
  "Hospicio Cabañas",
  "Tequila",
  "Sucre Historic City",
  "Potosí",
  "Tiwanaku",
  "Noel Kempff Mercado",
  "Moscow Kremlin",
  "Red Square",
  "St. Basil's Cathedral",
  "Saint Basil's Cathedral",
  "Hermitage",
  "Historic Centre of Saint Petersburg",
  "Peterhof",
  "Tsarskoye Selo",
  "Catherine Palace",
  "Trinity Sergius Lavra",
  "Solovetsky Islands",
  "Novodevichy Convent",
  "Yaroslavl Historical",
  "Suzdal",
  "Vladimir",
  "Ferapontov",
  "Mtskheta",
  "Jvari Monastery",
  "Svetitskhoveli",
  "Bagrati Cathedral",
  "Echmiadzin",
  "Geghard",
  "Khor Virap",
  "Haghpat",
  "Sanahin",
  "Zvartnots",
  "Gobustan",
  "Walled City of Baku",
  "Maiden Tower",
  "Shirvanshahs Palace",
  "Wieliczka Salt Mine",
  "Auschwitz Birkenau",
  "Auschwitz-Birkenau",
  "Old Town of Krakow",
  "Old Town of Warsaw",
  "Wrocław Centennial Hall",
  "Białowieża",
  "Bran Castle",
  "Painted Churches of Moldavia",
  "Wooden Churches of Maramureș",
  "Sighișoara",
  "Sibiu",
  "Dacian Fortresses",
  "Dubrovnik Old Town",
  "Plitvice Lakes",
  "Diocletian's Palace",
  "Stećci",
  "Stari Most",
  "Mostar",
  "Old Town of Korčula",
  "Trogir",
  "Šibenik",
  "Sibenik",
  "Episcopal Complex of Poreč",
  "Saint Sophia Sofia",
  "Pirin",
  "Belogradchik",
  "Stari Ras",
  "Sopoćani",
  "Gamzigrad",
  "Felix Romuliana",
  "Ohrid",
  "Lake Ohrid",
  "Berat Historic Centre",
  "Gjirokastër",
  "Geirangerfjord",
  "Nærøyfjord",
  "Naroyfjord",
  "West Norwegian Fjords",
  "Røros Mining Town",
  "Vegaøyan",
  "Rock Carvings at Alta",
  "Drottningholm Palace",
  "Birka",
  "Tanum Rock Carvings",
  "Visby",
  "Hammurabi",
  "Suomenlinna",
  "Verla",
  "Petäjävesi",
  "Sammallahdenmäki",
  "Kvarken",
  "High Coast",
  "Christiansfeld",
  "Kronborg",
  "Jelling Mounds",
  "Kuršių Nerija",
  "Kernavė",
  "Riga Historic Centre",
  "Tallinn Historic Centre",
  "Old Town of Tallinn",
  "Cape Floral Region",
  "Cradle of Humankind",
  "Mapungubwe",
  "iSimangaliso",
  "Drakensberg",
  "uKhahlamba",
  "Khami Ruins",
  "Great Zimbabwe",
  "Mana Pools",
  "Serengeti",
  "Ngorongoro",
  "Kilimanjaro",
  "Kondoa Rock-Art",
  "Lalibela",
  "Fasil Ghebbi",
  "Gondar",
  "Konso",
  "Harar Jugol",
  "Simien",
  "Bale Mountains",
  "Victoria Falls",
  "Mosi-oa-Tunya",
  "Twyfelfontein",
  "Bwindi Impenetrable",
  "Rwenzori",
  "Kasubi Tombs",
  "Kibale",
  "Murchison Falls",
  "Salonga",
  "Kahuzi-Biega",
  "Garamba",
  "Virunga",
  "Lopé-Okanda",
  "Bandiagara",
  "Djenné",
  "Gao",
  "Tombs of Buganda Kings",
  "Mt. Kenya",
  "Lake Turkana",
  "Mijikenda Kaya Forests",
  "Fort Jesus",
  "Maloti-Drakensberg",
  "Île de Gorée",
  "Saint-Louis Senegal",
  "Bassari Country",
  "Niokolo-Koba",
  "Sine-Saloum",
  "James Island",
  "Le Morne",
  "Tsingy de Bemaraha",
  "Vallée de Mai",
  "Maropeng",
  "Sukur",
  "Osun-Osogbo",
  "Uluru",
  "Kakadu",
  "Daintree",
  "Blue Mountains",
  "Lord Howe",
  "Shark Bay",
  "Fraser Island",
  "K'gari",
  "Greater Blue Mountains",
  "Royal Exhibition Building",
  "Carlton Gardens",
  "Cockatoo Island",
  "Heard and McDonald",
  "Tongariro",
  "Te Wahipounamu",
  "Sub-Antarctic Islands",
  "Phoenix Islands",

];

const UNESCO_NEEDLES = UNESCO_SITES.map((s) => s.toLowerCase()).filter((s) => s.length >= 8);

/* ─── localStorage memo ─── */

const MEMO_KEY = "unesco:memo:v1";
const MEMO_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days
type MemoFile = Record<string, { v: boolean; t: number }>;

function readMemo(): MemoFile {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MEMO_KEY);
    return raw ? (JSON.parse(raw) as MemoFile) : {};
  } catch {
    return {};
  }
}

function writeMemo(memo: MemoFile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MEMO_KEY, JSON.stringify(memo));
  } catch {
    /* quota / private mode — ignore */
  }
}

function memoLookup(key: string): boolean | undefined {
  const memo = readMemo();
  const entry = memo[key];
  if (!entry) return undefined;
  if (Date.now() - entry.t > MEMO_TTL_MS) return undefined;
  return entry.v;
}

function memoStore(key: string, value: boolean): void {
  const memo = readMemo();
  // Prevent unbounded growth — drop the oldest 50% once we hit 5000 keys.
  const keys = Object.keys(memo);
  if (keys.length >= 5000) {
    const sorted = keys.sort((a, b) => memo[a].t - memo[b].t).slice(0, Math.floor(keys.length / 2));
    for (const k of sorted) delete memo[k];
  }
  memo[key] = { v: value, t: Date.now() };
  writeMemo(memo);
}

/**
 * Heuristic: returns true if `attractionName` (or the optional
 * city / type / description fields) matches a UNESCO World Heritage
 * site. Result is cached in localStorage for 90 days so repeat
 * lookups (a long results page, a re-render) don't re-scan the
 * 350-entry needle list every time.
 */
export function isUnescoSite(
  attractionName: string | null | undefined,
  context?: { city?: string | null; type?: string | null; description?: string | null },
): boolean {
  if (!attractionName) return false;

  const memoKey = [
    attractionName,
    context?.city ?? "",
    context?.type ?? "",
    // Description is volatile — hash it down to a length so we don't
    // bust the memo on every re-translation; same lengths almost
    // always mean same content for our purposes.
    String(context?.description?.length ?? 0),
  ]
    .join("|")
    .toLowerCase();

  const cached = memoLookup(memoKey);
  if (cached !== undefined) return cached;

  const haystack = [
    attractionName,
    context?.city ?? "",
    context?.type ?? "",
    context?.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let result = false;
  if (haystack.includes("unesco") || haystack.includes("world heritage")) {
    result = true;
  } else {
    for (const needle of UNESCO_NEEDLES) {
      if (haystack.includes(needle)) {
        result = true;
        break;
      }
    }
  }

  memoStore(memoKey, result);
  return result;
}
