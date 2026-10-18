/* lk-sheet.js — contextual "take the walk" bottom sheet for /explore/ attraction pages.
 *
 * Reads only what the page already contains (h1, the nearby rail, the hero photo),
 * so it needs no data and no API. Shows once the visitor is engaged — scrolled
 * past half the page or stayed 25 s — never in the first 10 s, never inside the
 * Android app (Capacitor), and not again for 7 days after it is closed.
 * On desktop it shows a QR card instead of an install button.
 * Events go to usage_events (sheet_shown / sheet_click / sheet_close).
 */
(function () {
  var KEY = "lk_sheet_closed_at", WEEK = 7 * 864e5, MAX_KM = 1.5;
  var PLAY = "https://play.google.com/store/apps/details?id=app.lokali.travel";
  var SB = "https://dwyajguhgyjbgkpzjaln.supabase.co/rest/v1/usage_events";
  var PK = "sb_publishable_9e0MpAV3FKmVGhMLw8u2ig_FL5ZqzHd";
  var demo = /[?&]lksheet=1/.test(location.search);

  if (window.Capacitor) return;
  // Styles travel with the script so a cached lk-1.css can't leave the sheet unstyled.
  var LKS_CSS = ".lks{position:fixed;left:0;right:0;bottom:0;z-index:80;background:#1d1712;border-top:1px solid rgba(245,183,91,.35);border-radius:22px 22px 0 0;padding:10px 16px 16px;box-shadow:0 -18px 50px rgba(0,0,0,.6);transform:translateY(105%);transition:transform .3s ease;max-width:560px;margin:0 auto}\n.lks.on{transform:none}\n.lks-handle{width:38px;height:4px;border-radius:9px;background:#4a3f35;margin:0 auto 8px}\n.lks-x{position:absolute;right:10px;top:8px;background:none;border:0;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}\n.lks-eb{display:block;font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:var(--gold);font-weight:700}\n.lks-h{display:block;font-family:var(--serif);font-weight:500;font-size:21px;line-height:1.2;margin:4px 0;color:var(--fg)}\n.lks-p{font-size:13px;color:var(--muted);line-height:1.5}\n.lks-route{display:flex;align-items:flex-start;gap:6px;margin:12px 0}\n.lks-stop{flex:1;text-align:center;font-size:11px;color:#e8dfd2;text-decoration:none;min-width:0}\n.lks-stop img{width:100%;height:58px;object-fit:cover;border-radius:10px;display:block;margin-bottom:5px;background:#2a221b}\n.lks-stop.here img{outline:2px solid var(--gold);outline-offset:1px}\n.lks-stop small{display:block;color:var(--gold);font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}\n.lks-arr{color:var(--gold);font-size:13px;margin-top:20px}\n.lks-btns{display:flex;gap:8px}\n.lks-go,.lks-web{flex:1;text-align:center;padding:11px 8px;border-radius:99px;font-size:13px;font-weight:700;text-decoration:none}\n.lks-go{background:var(--gold-grad);color:#110c08}.lks-web{border:1px solid rgba(249,244,236,.3);color:var(--fg)}\n.lks-meta{text-align:center;font-size:10.5px;color:var(--muted);margin-top:8px}\n.lks.lks-desk{left:auto;right:22px;bottom:22px;width:330px;border:1px solid rgba(245,183,91,.4);border-radius:18px;padding:14px;transform:translateY(130%)}\n.lks.lks-desk.on{transform:none}\n.lks-in{display:flex;gap:12px;align-items:center}\n.lks-qr{flex:none;background:#fff;border-radius:10px;padding:4px;width:112px;height:112px}\n.lks-qr img{display:block;width:104px;height:104px}\n.lks-desk .lks-h{font-size:16px}.lks-desk .lks-p{font-size:11.5px}\n.lks-desk .lks-stop img{height:64px}\n.lks-desk .lks-h{padding-right:20px}";
  if (!document.getElementById("lks-css")) { var st = document.createElement("style"); st.id = "lks-css"; st.textContent = LKS_CSS; document.head.appendChild(st); }
  try { var t = +localStorage.getItem(KEY); if (!demo && t && Date.now() - t < WEEK) return; } catch (e) {}

  var h1 = document.querySelector(".hero h1"); if (!h1) return;
  var here = h1.textContent.trim();
  var heroImg = document.querySelector(".hero > img");
  var lang = document.documentElement.lang || "en";
  var slug = location.pathname.split("/").pop().replace(/\.html$/, "");

  function km(s) { var m = /([\d.]+)\s*km/.exec(s || ""); return m ? parseFloat(m[1]) : 99; }
  var near = [].slice.call(document.querySelectorAll(".rail .pcard")).map(function (a) {
    var img = a.querySelector("img"), b = a.querySelector("b"), sm = a.querySelector("small");
    return { href: a.href, name: b ? b.textContent.trim() : "", img: img ? img.src : "", km: km(sm && sm.textContent) };
  }).filter(function (n) { return n.name && n.km <= MAX_KM; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 2);

  function dist(k) { return k < 1 ? Math.round(k * 1000 / 50) * 50 + " m" : k.toFixed(1) + " km"; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function anon() { try { var a = localStorage.getItem("lokali_anon_id"); if (!a) { a = crypto.randomUUID(); localStorage.setItem("lokali_anon_id", a); } return a; } catch (e) { return null; } }
  function track(ev, extra) {
    if (demo) return;
    try {
      var p = { page: slug, lang: lang, layout: desk ? "desktop" : "mobile", nearby: near.length };
      for (var k in extra || {}) p[k] = extra[k];
      fetch(SB, { method: "POST", keepalive: true, headers: { apikey: PK, Authorization: "Bearer " + PK, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ event: ev, anon_id: anon(), props: p }) });
    } catch (e) {}
  }

  var desk = window.matchMedia("(min-width: 900px)").matches;
  var utm = "&utm_source=seo&utm_medium=" + (desk ? "qr" : "sheet") + "&utm_campaign=" + lang + "&utm_content=" + encodeURIComponent(slug);
  var playUrl = PLAY + utm;

  var head, body;
  if (near.length) {
    head = esc(near[0].name) + " is " + dist(near[0].km) + " away";
    var names = [here].concat(near.map(function (n) { return n.name; }));
    body = "Hear " + esc(names.slice(0, -1).join(", ")) + " and " + esc(names[names.length - 1]) + " as one walk, in your language. Free, works offline.";
  } else {
    head = "Take " + esc(here) + " with you";
    body = "The full audio guide in your language. Free, works offline, no ticket or tour group.";
  }
  var stops = [{ name: here, img: heroImg ? heroImg.src : "", here: true }].concat(near);
  var route = stops.map(function (s, i) {
    return (i ? '<span class="lks-arr">&rarr;</span>' : "") + '<a class="lks-stop' + (s.here ? " here" : "") + '"' + (s.href ? ' href="' + s.href + '"' : "") +
      '><img src="' + s.img + '" alt="" loading="lazy"><small>' + (s.here ? "You are here" : dist(s.km)) + "</small>" + esc(s.name) + "</a>";
  }).join("");

  var el = document.createElement("aside");
  el.className = "lks" + (desk ? " lks-desk" : "");
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Get the Lokali app");
  el.innerHTML = desk
    ? '<button class="lks-x" aria-label="Close">&times;</button><div class="lks-in"><div class="lks-qr" data-qr></div><div><b class="lks-h">' + head +
      '</b><p class="lks-p">Scan to put this walk on your phone. ' + body + '</p></div></div><div class="lks-route">' + route + "</div>"
    : '<div class="lks-handle"></div><button class="lks-x" aria-label="Close">&times;</button><span class="lks-eb">You&rsquo;re at ' + esc(here) +
      '</span><b class="lks-h">' + head + '</b><p class="lks-p">' + body + '</p><div class="lks-route">' + route +
      '</div><div class="lks-btns"><a class="lks-go" href="' + playUrl + '" rel="nofollow" target="_blank">&#9654; Get the free app</a><a class="lks-web" href="https://lokali.travel/">Listen in browser</a></div><p class="lks-meta">45 languages &middot; offline &middot; no ads</p>';

  if (desk) {
    var q = el.querySelector("[data-qr]");
    var img = new Image(); img.alt = "QR code for Lokali on Google Play"; img.width = 104; img.height = 104;
    img.src = "/explore/assets/lk-qr.svg";
    q.appendChild(img);
  }

  var shown = false;
  function show() {
    if (shown) return; shown = true;
    document.body.appendChild(el);
    var gpb = document.getElementById("gpb"); if (gpb) gpb.classList.remove("show");
    requestAnimationFrame(function () { el.classList.add("on"); });
    track("sheet_shown");
  }
  function close() {
    el.classList.remove("on"); setTimeout(function () { el.remove(); }, 300);
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    track("sheet_close");
  }
  el.addEventListener("click", function (e) {
    var a = e.target.closest("a, .lks-x"); if (!a) return;
    if (a.classList.contains("lks-x")) { close(); return; }
    track("sheet_click", { target: a.className.replace("lks-", ""), href: a.href });
  });

  if (demo) { setTimeout(show, 600); return; }
  var t0 = Date.now();
  setTimeout(show, 25000);
  window.addEventListener("scroll", function () {
    if (Date.now() - t0 < 10000) return;
    var h = document.documentElement;
    if ((h.scrollTop + innerHeight) / h.scrollHeight > 0.5) show();
  }, { passive: true });
})();
