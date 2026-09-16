import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NAMES = new Set(`Arashiyama Bamboo Grove
Bargello
Basilica of Our Lady of Guadalupe
Big Wild Goose Pagoda
Bishop Museum
Castel Sant'Angelo
Castello Sforzesco
Castillo de Chapultepec
Chapel Bridge
Charles Bridge
Cusco Cathedral
Darjeeling Himalayan Railway
Derinkuyu Underground City
Diamond Head
Dorrego Square
Florence Cathedral
Galleria Vittorio Emanuele II
Giant Wild Goose Pagoda
Grand Palace
Ihlara Valley
Iolani Palace
Jvari Monastery
Kondapalli Fort
La Scala
Lago Argentino
Lake Managua
Lake Wakatipu
Lion Monument
Merv
Milan Cathedral
Nami Island
Old Town Square
Palazzo Altemps
Palazzo Pitti
Parque Lezama
Phang Nga Bay
Phuket Old Town
Piazza Navona
Pike Place Market
Ponte Sant'Angelo
Ponte Vecchio
Prague Castle
Qorikancha
Queenstown Gardens
Rijksmuseum
Saint Vitus Cathedral
Santa Maria delle Grazie
Sforza Castle
Shaanxi History Museum
Sheikh Zayed Grand Mosque
Skansen
Small Wild Goose Pagoda
St. Peter's Basilica
Strahov Monastery
Table Mountain
Talad Noi
The Remarkables
Tianmen Mountain
Tiber Island
Tofo Beach
Trastevere
Trevi Fountain
Uffizi Gallery
Ushguli
Van Gogh Museum
Vatican Museums
Victoria and Albert Museum
Wat Benchamabophit
Wat Chalong
Wat Pho
Wat Saket`.split("\n").map((s) => s.trim()));

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

let changed = 0, nGeoline = 0, nTable = 0, nFaq = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  const ld = LD_RE.exec(original);
  if (!ld) continue;
  let data;
  try { data = JSON.parse(ld[1]); } catch { continue; }
  const node = Array.isArray(data?.["@graph"]) ? data["@graph"][0] : data;
  const name = typeof node?.name === "string" ? node.name.trim() : null;
  if (!name || !NAMES.has(name)) continue;

  const geo = GEO_RE.exec(original);
  if (!geo) continue;
  const lat = Number(geo[1]);
  const lng = Number(geo[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

  const latTxt = lat.toFixed(4);
  const lngTxt = lng.toFixed(4);
  const pair = `${latTxt}, ${lngTxt}`;

  let out = original;

  out = out.replace(
    /(class="geoline">)-?[\d.]+&deg; [NS] &middot; -?[\d.]+&deg; [EW]/g,
    (_m, p1) => {
      nGeoline++;
      return `${p1}${Math.abs(lat).toFixed(4)}&deg; ${lat >= 0 ? "N" : "S"} &middot; ${Math.abs(lng).toFixed(4)}&deg; ${lng >= 0 ? "E" : "W"}`;
    },
  );

  out = out.replace(
    /(<th>Coordinates<\/th><td><span translate="no">)-?[\d.]+,\s*-?[\d.]+(<\/span>)/g,
    (_m, p1, p2) => { nTable++; return `${p1}${pair}${p2}`; },
  );

  out = out.replace(
    /(,\s*at\s+)-?[\d.]+,\s*-?[\d.]+/g,
    (_m, p1) => { nFaq++; return `${p1}${pair}`; },
  );

  if (out !== original) {
    writeFileSync(file, out);
    changed++;
  }
}

console.log(`Files changed: ${changed}`);
console.log(`geoline replacements: ${nGeoline}`);
console.log(`Coordinates table replacements: ${nTable}`);
console.log(`FAQ text replacements: ${nFaq}`);
