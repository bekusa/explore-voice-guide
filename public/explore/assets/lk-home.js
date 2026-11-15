/* Explore home pages (/explore/index.html, /explore/<lang>/index.html). Written by hand; one file for every
 * language. The page's own words and its place-of-the-day list come from <script id="lk-home-data">
 * (scripts/lk_home.py). Search reads assets/search/<lang>.json + /explore/search-index.json; "Near me"
 * reads assets/geo/<lang>.json (+ geo/en.json) and works out distances on the device: the position is
 * never sent anywhere. */
(function () {
  var el = document.getElementById("lk-home-data");
  if (!el) return;
  var C = JSON.parse(el.textContent), T = C.t, LANG = C.lang, EN = LANG === "en";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var norm = function (s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var getJSON = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw r.status; return r.json(); }); };

  // device: which store badge, and the QR only where there is no phone in hand
  var ua = navigator.userAgent || "", root = document.documentElement;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) root.classList.add("lk-ios");
  else if (/Android/.test(ua)) root.classList.add("lk-android");
  if (window.matchMedia && matchMedia("(pointer:coarse)").matches) root.classList.add("lk-touch");

  // hero photos
  var imgs = [].slice.call(document.querySelectorAll("#hero>img")), hi = 0;
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (imgs.length > 1 && !still) setInterval(function () {
    imgs[hi].style.opacity = 0; hi = (hi + 1) % imgs.length; imgs[hi].style.opacity = 1;
  }, 6500);

  // place of the day: the same list the page was built with, picked by today's date
  if (C.potd && C.potd.length && $("potd-n")) {
    var day = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 864e5), p = C.potd[((day % C.potd.length) + C.potd.length) % C.potd.length];
    if ($("potd-n").textContent !== p.n) {
      $("potd-a").href = p.u; $("potd-u").href = p.u;
      $("potd-i").src = p.i; $("potd-i").alt = p.n;
      $("potd-n").textContent = p.n; $("potd-l").textContent = p.l; $("potd-m").textContent = p.m;
    }
  }

  // travel by region
  [].forEach.call(document.querySelectorAll(".hm-tab"), function (b) {
    b.addEventListener("click", function () {
      [].forEach.call(document.querySelectorAll(".hm-tab"), function (x) { x.classList.remove("on"); x.setAttribute("aria-selected", "false"); });
      [].forEach.call(document.querySelectorAll(".hm-pane"), function (x) { x.classList.remove("on"); });
      b.classList.add("on"); b.setAttribute("aria-selected", "true");
      var pane = document.querySelector('.hm-pane[data-p="' + b.getAttribute("data-t") + '"]');
      if (pane) pane.classList.add("on");
    });
  });

  // collections behind the tiles
  [].forEach.call(document.querySelectorAll(".hm-theme"), function (b) {
    b.addEventListener("click", function () {
      var s = $(b.getAttribute("data-theme")); if (!s) return;
      var open = s.hasAttribute("hidden");
      if (open) s.removeAttribute("hidden"); else s.setAttribute("hidden", "");
      b.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) s.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    });
  });

  // ------------------------------------------------------------- search
  var q = $("q"), res = $("res"), data = null, hl = -1;
  var KIND = { City: T.kind_city, Place: T.kind_place, Country: T.kind_country };
  function load() {
    if (data) return Promise.resolve(data);
    var own = EN ? Promise.resolve([]) : getJSON("/explore/assets/search/" + LANG + ".json").catch(function () { return []; });
    var en = getJSON("/explore/search-index.json").catch(function () { return []; });
    return Promise.all([own, en]).then(function (r) {
      var twins = {}, out = [];
      r[0].forEach(function (x) { if (x.e) twins[x.e] = 1; x.own = 1; out.push(x); });
      r[1].forEach(function (x) { if (!twins[x.u]) { x.own = EN ? 1 : 0; out.push(x); } });
      out.forEach(function (x) { x.n = norm(x.t); x.ns = norm(x.s); });
      return (data = out);
    });
  }
  function render() {
    var v = norm(q.value.trim());
    if (!v) { res.classList.remove("on"); res.innerHTML = ""; return; }
    load().then(function (d) {
      var hits = d.filter(function (x) { return x.n.indexOf(v) > -1 || x.ns.indexOf(v) > -1; });
      hits.sort(function (a, b) {
        var sa = a.n.indexOf(v) === 0 ? 0 : 1, sb = b.n.indexOf(v) === 0 ? 0 : 1;
        if (sa !== sb) return sa - sb;
        if (a.own !== b.own) return b.own - a.own;
        if (a.k !== b.k) return a.k === "City" ? -1 : b.k === "City" ? 1 : a.k === "Country" ? -1 : 1;
        return a.t.localeCompare(b.t);
      });
      hits = hits.slice(0, 12); hl = -1;
      res.innerHTML = hits.length ? hits.map(function (x) {
        return '<a href="' + esc(x.u) + '"><img src="' + esc(x.i) + '" alt="" loading="lazy"><span><span class="t">' + esc(x.t) +
          '</span><br><span class="s">' + esc(x.s) + '</span></span><span class="k' + (x.own ? "" : " en") + '">' +
          esc(KIND[x.k] || x.k) + (x.own ? "" : " · EN") + "</span></a>";
      }).join("") : '<div class="none">' + esc(T.search_none) + "</div>";
      res.classList.add("on");
    });
  }
  if (q) {
    q.addEventListener("focus", load);
    q.addEventListener("input", render);
    q.addEventListener("keydown", function (e) {
      var a = res.querySelectorAll("a"); if (!a.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (hl > -1) a[hl].classList.remove("hl");
        hl = (hl + (e.key === "ArrowDown" ? 1 : -1) + a.length) % a.length; a[hl].classList.add("hl"); a[hl].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") { location.href = a[Math.max(hl, 0)].href; }
    });
    $("qgo").addEventListener("click", function () { var a = res.querySelector("a"); if (a) location.href = a.href; else q.focus(); });
    document.addEventListener("click", function (e) { if (!e.target.closest(".search")) res.classList.remove("on"); });
  }

  // ------------------------------------------------------------- near me
  var box = $("nearbox"), btn = $("near"), geo = null;
  function km(a, b, c, d) {
    var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  function dist(k) { return k < 1 ? Math.max(10, Math.round(k * 100) * 10) + " m" : (k < 10 ? k.toFixed(1) : Math.round(k)) + " km"; }
  function show(h) { box.innerHTML = h; box.classList.add("on"); }
  function loadGeo() {
    if (geo) return Promise.resolve(geo);
    var own = getJSON("/explore/assets/geo/" + LANG + ".json");
    var en = EN ? own : getJSON("/explore/assets/geo/en.json").catch(function () { return { c: [], p: [] }; });
    return Promise.all([own, en]).then(function (r) {
      var o = r[0], e = r[1], pts = [], cities = [], twin = {}, seenCity = {};
      o.p.forEach(function (x) { if (x[5]) twin[x[5]] = 1; pts.push({ la: x[0], lo: x[1], n: x[2], u: "/explore/" + LANG + "/" + x[3] + ".html", c: (o.c[x[4]] || [])[0] || "" }); });
      o.c.forEach(function (x) { seenCity[x[1]] = 1; cities.push({ n: x[0], u: "/explore/" + LANG + "/" + x[1] + ".html", la: x[2], lo: x[3] }); });
      if (!EN) {
        e.p.forEach(function (x) { if (!twin[x[3]]) pts.push({ la: x[0], lo: x[1], n: x[2], u: "/explore/en/" + x[3] + ".html", c: (e.c[x[4]] || [])[0] || "" }); });
        e.c.forEach(function (x) { if (!seenCity[x[1]]) cities.push({ n: x[0], u: "/explore/en/" + x[1] + ".html", la: x[2], lo: x[3] }); });
      }
      return (geo = { p: pts, c: cities });
    });
  }
  function nearby(la, lo) {
    loadGeo().then(function (g) {
      var near = g.p.map(function (x) { return [km(la, lo, x.la, x.lo), x]; }).filter(function (t) { return t[0] <= 50; })
        .sort(function (a, b) { return a[0] - b[0]; });
      // one place, two pages ("Peace Bridge" / "Bridge of Peace"): same spot and a shared word -> list it once
      var words = function (n) { return norm(n).split(/[^a-z0-9\u00c0-\uffff]+/).filter(function (w) { return w.length > 3; }); };
      var twice = function (x, y) {
        if (km(x.la, x.lo, y.la, y.lo) > 0.03) return false;
        var a = words(x.n); return words(y.n).some(function (w) { return a.indexOf(w) > -1; });
      };
      var seen = {}, list = [];
      near.forEach(function (t) {
        var k = norm(t[1].n);
        if (seen[k] || list.length >= 8 || list.some(function (u) { return twice(u[1], t[1]); })) return;
        seen[k] = 1; list.push(t);
      });
      var li = function (t, sub) { return '<li><a href="' + esc(t[1].u) + '"><b>' + esc(t[1].n) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</b><span>" + dist(t[0]) + "</span></a></li>"; };
      if (list.length) {
        show("<h4>" + esc(T.near_title) + "</h4><ul>" + list.map(function (t) { return li(t, t[1].c); }).join("") + '</ul><p class="pv">' + esc(T.near_privacy) + "</p>");
      } else {
        var cs = g.c.map(function (x) { return [km(la, lo, x.la, x.lo), x]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, 4);
        show("<p>" + esc(T.near_none) + "</p><ul>" + cs.map(function (t) { return li(t, ""); }).join("") + '</ul><p class="pv">' + esc(T.near_privacy) + "</p>");
      }
    }).catch(function () { show("<p>" + esc(T.near_fail) + "</p>"); }).then(function () { btn.removeAttribute("aria-busy"); });
  }
  if (btn && box) btn.addEventListener("click", function () {
    if (box.classList.contains("on") && !btn.hasAttribute("aria-busy")) { box.classList.remove("on"); return; }
    if (!navigator.geolocation) { show("<p>" + esc(T.near_fail) + "</p>"); return; }
    btn.setAttribute("aria-busy", "true");
    show("<p>" + esc(T.near_wait) + "</p>");
    loadGeo().catch(function () {});
    navigator.geolocation.getCurrentPosition(function (pos) {
      nearby(pos.coords.latitude, pos.coords.longitude);
    }, function (err) {
      btn.removeAttribute("aria-busy");
      show("<p>" + esc(err && err.code === 1 ? T.near_denied : T.near_fail) + "</p>");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });
})();
