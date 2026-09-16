import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TABLE = `Arashiyama Bamboo Grove	35.016800	135.671600
Bargello	43.770372	11.258350
Basilica of Our Lady of Guadalupe	19.484000	-99.117000
Big Wild Goose Pagoda	34.219842	108.959354
Bishop Museum	21.333084	-157.870711
Castel Sant'Angelo	41.901925	12.466461
Castello Sforzesco	45.470000	9.178611
Castillo de Chapultepec	19.420463	-99.182087
Chapel Bridge	47.051667	8.307500
Charles Bridge	50.086389	14.411944
Cusco Cathedral	-13.516300	-71.978100
Darjeeling Himalayan Railway	26.683889	88.443889
Derinkuyu Underground City	38.373500	34.735100
Diamond Head	21.255712	-157.809499
Dorrego Square	-34.620556	-58.371667
Florence Cathedral	43.773056	11.256944
Galleria Vittorio Emanuele II	45.465556	9.190000
Giant Wild Goose Pagoda	34.219842	108.959354
Grand Palace	13.750100	100.492000
Ihlara Valley	38.261111	34.292222
Iolani Palace	21.306667	-157.858889
Jvari Monastery	41.838611	44.733889
Kondapalli Fort	16.622037	80.514868
La Scala	45.467248	9.189514
Lago Argentino	-50.216667	-72.416667
Lake Managua	12.333333	-86.416667
Lake Wakatipu	-45.050000	168.500000
Lion Monument	47.058333	8.310556
Merv	37.662778	62.192500
Milan Cathedral	45.464167	9.191389
Nami Island	37.790000	127.525800
Old Town Square	50.087500	14.421400
Palazzo Altemps	41.901253	12.498294
Palazzo Pitti	43.765056	11.249819
Parque Lezama	-34.628851	-58.370201
Phang Nga Bay	8.283333	98.600000
Phuket Old Town	7.883714	98.387532
Piazza Navona	41.897791	12.473182
Pike Place Market	47.608632	-122.340729
Ponte Sant'Angelo	41.901143	12.466521
Ponte Vecchio	43.768429	11.253449
Prague Castle	50.085957	14.387914
Qorikancha	-13.520975	-71.975943
Queenstown Gardens	-45.037704	168.659836
Rijksmuseum	52.359843	4.885040
Saint Vitus Cathedral	50.090833	14.400556
Santa Maria delle Grazie	45.465650	9.169926
Sforza Castle	45.470000	9.178611
Shaanxi History Museum	34.225278	108.951389
Sheikh Zayed Grand Mosque	24.412000	54.474000
Skansen	59.323709	18.101643
Small Wild Goose Pagoda	34.240806	108.937389
St. Peter's Basilica	41.902222	12.453333
Strahov Monastery	50.086000	14.390000
Table Mountain	-33.962180	18.409883
Talad Noi	13.733333	100.513889
The Remarkables	-45.082012	168.797325
Tianmen Mountain	29.049881	110.478889
Tiber Island	41.890800	12.477200
Tofo Beach	-23.849417	35.543600
Trastevere	41.881761	12.450760
Trevi Fountain	41.900833	12.483056
Uffizi Gallery	43.768300	11.255300
Ushguli	42.911045	43.009614
Van Gogh Museum	52.358300	4.881100
Vatican Museums	41.901661	12.455695
Victoria and Albert Museum	51.495893	-0.172877
Wat Benchamabophit	13.766583	100.514083
Wat Chalong	7.846263	98.337469
Wat Pho	13.746389	100.493611
Wat Saket	13.753889	100.508333`;

const COORDS = new Map();
for (const line of TABLE.split("\n")) {
  const [name, lat, lng] = line.split("\t");
  COORDS.set(name.trim(), { lat: lat.trim(), lng: lng.trim() });
}

const ROOT = "public/explore";
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".html")) files.push(p);
  }
})(ROOT);

const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
const GEO_RE = /"geo"\s*:\s*\{\s*"@type"\s*:\s*"GeoCoordinates"\s*,\s*"latitude"\s*:\s*(-?[\d.]+)\s*,\s*"longitude"\s*:\s*(-?[\d.]+)\s*\}/;

let scanned = 0, updated = 0, inserted = 0;
const matched = new Map();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const file of files) {
  scanned++;
  const original = readFileSync(file, "utf8");
  const ld = LD_RE.exec(original);
  if (!ld) continue;

  let data;
  try { data = JSON.parse(ld[1]); } catch { continue; }
  const node = Array.isArray(data?.["@graph"]) ? data["@graph"][0] : data;
  const name = typeof node?.name === "string" ? node.name.trim() : null;
  if (!name || !COORDS.has(name)) continue;

  const { lat, lng } = COORDS.get(name);
  let block = ld[1];
  let didInsert = false;
  const geo = GEO_RE.exec(block);
  let oldLat = null, oldLng = null;

  if (geo) {
    oldLat = geo[1];
    oldLng = geo[2];
    block = block.replace(GEO_RE, `"geo": {"@type": "GeoCoordinates", "latitude": ${lat}, "longitude": ${lng}}`);
  } else {
    const geoJson = `, "geo": {"@type": "GeoCoordinates", "latitude": ${lat}, "longitude": ${lng}}`;
    const anchor = /"image"\s*:\s*"(?:[^"\\]|\\.)*"/.exec(block) || /"url"\s*:\s*"(?:[^"\\]|\\.)*"/.exec(block);
    if (!anchor) continue;
    const end = anchor.index + anchor[0].length;
    block = block.slice(0, end) + geoJson + block.slice(end);
    didInsert = true;
  }

  let out = original.slice(0, ld.index) +
    original.slice(ld.index, ld.index + ld[0].length).replace(ld[1], block) +
    original.slice(ld.index + ld[0].length);

  if (oldLat !== null) {
    out = out.split(`query=${oldLat}%2C${oldLng}`).join(`query=${lat}%2C${lng}`);
  }
  out = out.replace(/query=-?[\d.]+%2C-?[\d.]+/g, `query=${lat}%2C${lng}`);

  if (out !== original) {
    writeFileSync(file, out);
    updated++;
    if (didInsert) inserted++;
    matched.set(name, (matched.get(name) ?? 0) + 1);
  }
}

console.log(`Files scanned: ${scanned}`);
console.log(`Files updated: ${updated}`);
console.log(`Geo blocks inserted: ${inserted}`);
console.log("Matched names:");
for (const [name, count] of [...matched].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${name}: ${count}`);
}
