// Which static /explore/ page covers the same place as an app
// /attraction/$id URL. 2026-10-22.
//
// Why: the app's attraction page server-renders ~40 words (the guide is
// fetched in the browser), while /explore/<lang>/<city>/<slug>.html is the
// full written guide. Both were indexable and self-canonical, so Google
// picked between them and the thin one sometimes won. The app page now
// names the /explore/ page as canonical when one exists, and asks not to be
// indexed when none does.
//
// The table is generated from the /explore/ pages themselves by
// scripts/build-explore-canonical.py — re-run it after adding, merging or
// noindexing /explore/ attraction pages. exactKey/looseKey below MUST stay
// identical to exact_key/loose_key in that script.

function stripParen(s: string): string {
  const t = s.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return t.length > 0 ? t : s;
}

export function exactKey(s: string): string {
  return stripParen(s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\-‐-―]+/g, " ")
    .trim();
}

export function looseKey(s: string): string {
  const k = exactKey(s)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ı/g, "i")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(" ")
    .filter((w) => w)
    .map((w) => (w === "saint" ? "st" : w))
    .join(" ");
  return k.startsWith("the ") ? k.slice(4) : k;
}

// App links are built with encodeURIComponent and then encoded again by the
// router, so the param can arrive encoded once or twice
// ("%25E1%2583..." in usage_events). Decode until it stops changing.
function decodeId(id: string): string {
  let s = id;
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(s); i++) {
    try {
      s = decodeURIComponent(s);
    } catch {
      break;
    }
  }
  return s;
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Absolute URL of the matching /explore/ page, or null when there is none
 * (or the name is shared by several places). Loads a ~300 KB table, so call
 * it on the server only.
 */
export async function exploreUrlFor(id: string): Promise<string | null> {
  const { TARGETS, EXACT, LOOSE } = await import("./exploreCanonical.generated");
  const name = decodeId(id);
  const e = exactKey(name);
  const l = looseKey(name);
  const i = has(EXACT, e) ? EXACT[e] : has(LOOSE, l) ? LOOSE[l] : undefined;
  return i === undefined ? null : `https://lokali.travel/explore/${TARGETS[i]}.html`;
}
