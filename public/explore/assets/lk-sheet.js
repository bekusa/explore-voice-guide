/* lk-sheet.js v3 — "X is just the start" app card for /explore/ attraction pages.
 *
 * Desktop: cream card bottom-right — title, nearby subtitle, real app screenshot,
 *          QR + "Scan with your Android phone" + Google Play badge.
 * Mobile:  compact bar (~20% of the screen, Google's intrusive-interstitial
 *          guidance) — thumb, title, one line, Google Play button. Tapping the
 *          bar opens the full card; "Listen in your browser" deep-links to this
 *          place in the web app.
 * Reads only what the page already contains; no data, no API. Nothing (not even
 * an image) is fetched until the card is shown.
 * Shows once the visitor is engaged (half the page scrolled after 10 s, or 25 s),
 * never inside the Android app, and not again for 7 days after it is closed.
 * ?lksheet=1 shows it at once for testing and skips tracking.
 * Events go to usage_events: sheet_shown / sheet_expand / sheet_click / sheet_close.
 */
(function () {
  var KEY = "lk_sheet_closed_at", WEEK = 7 * 864e5, MAX_KM = 1.5, A = "/explore/assets/";
  var PLAY = "https://play.google.com/store/apps/details?id=app.lokali.travel";
  var SB = "https://dwyajguhgyjbgkpzjaln.supabase.co/rest/v1/usage_events";
  var PK = "sb_publishable_9e0MpAV3FKmVGhMLw8u2ig_FL5ZqzHd";
  var SHOTS = { tbilisi: 1, rome: 1, istanbul: 1, paris: 1 };
  var demo = /[?&]lksheet=1/.test(location.search);

  if (window.Capacitor) return;
  try { var t = +localStorage.getItem(KEY); if (!demo && t && Date.now() - t < WEEK) return; } catch (e) {}

  var h1 = document.querySelector(".hero h1"); if (!h1) return;
  var here = h1.textContent.trim();
  var lang = document.documentElement.lang || "en";
  var seg = location.pathname.split("/");
  var slug = (seg.pop() || "").replace(/\.html$/, "");
  if (slug === "index") slug = seg.pop() || "";
  var city = seg[seg.length - 1] || "";
  var crumbs = document.querySelectorAll(".crumbs a");
  var cityName = crumbs.length ? crumbs[crumbs.length - 1].textContent.trim() : "";
  var desk = window.matchMedia("(min-width: 900px)").matches;

  function km(s) { var m = /([\d.]+)\s*km/.exec(s || ""); return m ? parseFloat(m[1]) : 99; }
  var near = [].slice.call(document.querySelectorAll(".rail .pcard")).map(function (a) {
    var b = a.querySelector("b"), sm = a.querySelector("small");
    return { name: b ? b.textContent.trim() : "", km: km(sm && sm.textContent) };
  }).filter(function (n) { return n.name && n.km <= MAX_KM; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 2);

  function dist(k) { return k < 1 ? Math.round(k * 1000 / 50) * 50 + "\u00a0m" : k.toFixed(1) + "\u00a0km"; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function anon() { try { var a = localStorage.getItem("lokali_anon_id"); if (!a) { a = crypto.randomUUID(); localStorage.setItem("lokali_anon_id", a); } return a; } catch (e) { return null; } }
  function track(ev, extra) {
    if (demo) return;
    try {
      var p = { page: slug, city: city, lang: lang, layout: desk ? "desktop" : "mobile", nearby: near.length, v: 3 };
      for (var k in extra || {}) p[k] = extra[k];
      fetch(SB, { method: "POST", keepalive: true, headers: { apikey: PK, Authorization: "Bearer " + PK, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ event: ev, anon_id: anon(), props: p }) });
    } catch (e) {}
  }

  var playUrl = PLAY + "&utm_source=seo&utm_medium=" + (desk ? "qr" : "sheet") + "&utm_campaign=" + lang + "&utm_content=" + encodeURIComponent(slug);
  var webUrl = "https://lokali.travel/attraction/" + encodeURIComponent(here.toLowerCase().replace(/\s+/g, "-")) +
    "?name=" + encodeURIComponent(here) + (cityName ? "&city=" + encodeURIComponent(cityName) : "") +
    "&utm_source=seo&utm_medium=sheet&utm_content=" + encodeURIComponent(slug);
  var shot = A + "app/" + (SHOTS[city] ? city : "cities") + ".webp";

  var title = esc(here) + " is just the start.";
  var sub = near.length
    ? esc(near[0].name) + " is " + dist(near[0].km) + " away" + (near[1] ? ", " + esc(near[1].name) + " " + dist(near[1].km) : "") +
      ". Hear them all with Lokali&rsquo;s <b>free audio guide</b> &mdash; in your language, offline."
    : "Hear the full story with Lokali&rsquo;s <b>free audio guide</b> &mdash; in your language, offline.";
  var line = "<b>Free audio guide</b>" + (near.length ? " &middot; " + esc(near[0].name) + " " + dist(near[0].km) : " &middot; offline");
  var badge = '<a class="lks-badge" href="' + playUrl + '" rel="nofollow" target="_blank"><img src="' + A +
    'google-play-badge.png" alt="Get it on Google Play" width="200" height="77"></a>';

  function full() {
    return '<button class="lks-x" aria-label="Close">&times;</button><span class="lks-tag">&#9654; Free audio guide</span><b class="lks-h">' + title +
      '</b><p class="lks-p">' + sub + '</p><div class="lks-body"><div class="lks-shot"><img src="' + shot + '" alt="Lokali app" width="320" height="622"></div><div class="lks-side">' +
      (desk
        ? '<div class="lks-qr"><img src="' + A + 'lk-qr.svg" alt="QR code for Lokali on Google Play" width="196" height="196"></div><b class="lks-scan">Scan with your Android phone</b><p class="lks-cam">Open your camera to get Lokali on Google Play.</p>' + badge
        : '<p class="lks-pts">45 languages<br>Works offline<br>No ads</p>' + badge + '<a class="lks-web" href="' + webUrl + '">Listen in your browser</a>') +
      "</div></div>";
  }
  function compact() {
    return '<button class="lks-x" aria-label="Close">&times;</button><div class="lks-row" role="button" tabindex="0" aria-label="Show more">' +
      '<img class="lks-thumb" src="' + shot + '" alt="" width="44" height="86"><div class="lks-mid">' +
      '<b class="lks-h">' + title + '</b><span class="lks-line">' + line + ' <u class="lks-more">More</u></span></div></div>' +
      '<a class="lks-go" href="' + playUrl + '" rel="nofollow" target="_blank"><img src="' + A + 'google-play-badge.png" alt="Get it on Google Play" width="140" height="54"></a>';
  }

  var css = ".lks{position:fixed;left:8px;right:8px;bottom:8px;z-index:80;background:#f6efe2;color:#1d1712;border-radius:16px;padding:12px;box-shadow:0 14px 50px rgba(0,0,0,.55);transform:translateY(130%);transition:transform .32s ease;max-width:520px;margin:0 auto;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;text-align:left}" +
    ".lks.on{transform:none}.lks-x{position:absolute;right:6px;top:4px;background:none;border:0;color:#1d1712;font-size:26px;line-height:1;cursor:pointer;padding:6px 10px}" +
    ".lks-tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#7a4a0c;background:#f5c97b;border-radius:99px;padding:3px 9px;margin-bottom:6px}" +
    ".lks-h{display:block;font-family:inherit;font-size:16px;font-weight:700;line-height:1.3;padding-right:30px;color:#1d1712}.lks-p{font-size:13px;color:#4a3f35;line-height:1.45;margin:5px 0 0}.lks-p b{color:#1d1712;font-weight:700}" +
    ".lks-row{display:flex;gap:10px;align-items:center;cursor:pointer;padding-right:26px}.lks-thumb{flex:none;width:44px;height:86px;object-fit:cover;object-position:top;border-radius:8px;box-shadow:0 0 0 2px #1d1712;background:#110c08}" +
    ".lks-mid{min-width:0;flex:1}.lks-mid .lks-tag{margin-bottom:4px}.lks-mid .lks-h{font-size:15px;padding-right:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    ".lks-line{display:block;font-size:12.5px;color:#4a3f35;margin-top:3px;line-height:1.4}.lks-line b{color:#7a4a0c}.lks-more{color:#7a5418;white-space:nowrap}" +
    ".lks-go{display:block;margin:8px auto 0;width:140px}.lks-go img{display:block;width:140px;height:auto}" +
    ".lks-body{display:flex;gap:14px;margin-top:10px;align-items:stretch}.lks-shot{flex:none;width:96px;border-radius:14px;overflow:hidden;background:#110c08;box-shadow:0 0 0 3px #1d1712}" +
    ".lks-shot img{display:block;width:100%;height:auto}.lks-side{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:10px}" +
    ".lks-pts{font-size:12.5px;font-weight:600;color:#1d1712;line-height:1.6;margin:0}.lks-badge img{display:block;width:150px;height:auto}" +
    ".lks-web{font-size:13px;color:#7a5418;font-weight:600;text-decoration:underline}" +
    ".lks.lks-desk{left:auto;right:24px;bottom:24px;width:560px;max-width:none;padding:20px 20px 18px;border-radius:18px}.lks-desk .lks-h{font-size:19px}.lks-desk .lks-p{font-size:14px}" +
    ".lks-desk .lks-shot{width:190px}.lks-qr{background:#fff;padding:10px;border-radius:6px}.lks-qr img{display:block;width:196px;height:196px}" +
    ".lks-scan{font-family:inherit;font-size:15px;font-weight:700;line-height:1.3;color:#1d1712}.lks-cam{font-size:13px;color:#4a3f35;line-height:1.4;margin:-4px 0 0}.lks-desk .lks-badge img{width:200px}";

  var el, shown = false;
  function show() {
    if (shown) return; shown = true;
    if (!document.getElementById("lks-css")) { var st = document.createElement("style"); st.id = "lks-css"; st.textContent = css; document.head.appendChild(st); }
    el = document.createElement("aside");
    el.className = "lks" + (desk ? " lks-desk" : " lks-mini");
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Get the Lokali app");
    el.innerHTML = desk ? full() : compact();
    el.addEventListener("click", onClick);
    document.body.appendChild(el);
    var gpb = document.getElementById("gpb"); if (gpb) gpb.classList.remove("show");
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("on"); }); });
    track("sheet_shown");
  }
  function expand() {
    el.classList.remove("lks-mini"); el.innerHTML = full(); track("sheet_expand");
  }
  function close() {
    el.classList.remove("on"); setTimeout(function () { el.remove(); }, 350);
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    track("sheet_close");
  }
  function onClick(e) {
    if (e.target.closest(".lks-x")) { close(); return; }
    var a = e.target.closest("a");
    if (a) { track("sheet_click", { target: a.className.replace("lks-", ""), href: a.href }); return; }
    if (e.target.closest(".lks-row")) expand();
  }

  if (demo) { setTimeout(show, 600); return; }
  var t0 = Date.now();
  setTimeout(show, 25000);
  window.addEventListener("scroll", function () {
    if (Date.now() - t0 < 10000) return;
    var h = document.documentElement;
    if ((h.scrollTop + innerHeight) / h.scrollHeight > 0.5) show();
  }, { passive: true });
})();
