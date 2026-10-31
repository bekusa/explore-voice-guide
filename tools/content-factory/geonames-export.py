"""Export GeoNames cities (population >= 15,000) for prepare.ts city resolution.

    pip install geonamescache
    python tools/content-factory/geonames-export.py <folder with the target CSVs>

Writes <folder>/geonames-cities15000.json: rows of [name, lat, lng, population] (main GeoNames name).
Data: GeoNames (geonames.org), CC BY 4.0, via the geonamescache package."""
import json, os, sys
import geonamescache

rows = [[c["name"], round(c["latitude"], 4), round(c["longitude"], 4), c["population"]]
        for c in geonamescache.GeonamesCache(min_city_population=15000).get_cities().values()]
rows.sort(key=lambda r: -r[3])
out = os.path.join(sys.argv[1] if len(sys.argv) > 1 else ".", "geonames-cities15000.json")
with open(out, "w", encoding="utf-8") as f:
    f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
print(len(rows), "cities ->", out)
