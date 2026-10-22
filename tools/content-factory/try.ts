/**
 * Dry run: generate a few guides / city lists and run the gates,
 * WITHOUT writing anything to the database.
 *
 *   npx tsx tools/content-factory/try.ts guide "Parthenon|Athens" "Golden Gate Bridge|San Francisco"
 *   npx tsx tools/content-factory/try.ts city "Lisbon" "Kraków"
 *
 * Output: one JSON file per item in $CF_OUT (default ./cf-out) and a
 * summary line per item on stdout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateAttractions, generateGuide } from "./generate";
import { gate1Attractions, gate1Guide } from "./gate1";

const [kind, ...items] = process.argv.slice(2);
const outDir = process.env.CF_OUT ?? "cf-out";
mkdirSync(outDir, { recursive: true });

async function one(item: string) {
  if (kind === "guide") {
    const [name, city] = item.split("|");
    const r = await generateGuide({ name, city });
    const g = r.payload ? gate1Guide(r.payload, name) : null;
    writeFileSync(join(outDir, `guide-${name.replace(/\W+/g, "_")}.json`), JSON.stringify({ name, city, call: { ...r.call, text: r.payload ? undefined : r.call.text }, payload: r.payload, gate1: g }, null, 1));
    return `${name} | ok=${r.call.ok} $${r.call.costUsd.toFixed(4)} ${Math.round(r.call.durationMs / 1000)}s | ${g ? JSON.stringify(g.metrics) : r.call.error} | hard=${g?.hard.join(";") ?? "-"} | soft=${g?.soft.join(";") ?? "-"}`;
  }
  const r = await generateAttractions({ query: item });
  const g = r.payload ? gate1Attractions(r.payload.attractions) : null;
  writeFileSync(join(outDir, `city-${item.replace(/\W+/g, "_")}.json`), JSON.stringify({ query: item, call: { ...r.call, text: r.payload ? undefined : r.call.text }, payload: r.payload, gate1: g }, null, 1));
  return `${item} | ok=${r.call.ok} $${r.call.costUsd.toFixed(4)} ${Math.round(r.call.durationMs / 1000)}s | ${g ? JSON.stringify(g.metrics) : r.call.error} | hard=${g?.hard.join(";") ?? "-"} | soft=${g?.soft.join(";") ?? "-"}`;
}

const lines = await Promise.all(items.map(one));
console.log(lines.join("\n"));
