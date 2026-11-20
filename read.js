/* Nyx — Read (一起读). The reading library, in the house's own hand.
   The library is 墨阅 next door (it collects, translates, writes the day's brief); the relay carries this page's
   requests to it (relay/nyx_read.py), so the house's key is the only key.
     #today[/YYYY-MM-DD]   the day's sheet: the brief by section, and what is worth reading
     #shelf                everything collected, newest first, by day
     #kept                 what is half read, and what was kept
     #a/<id>               one article, open — beside the list it came from, on a wide screen
   A wide screen is laid out as a spread: the spine on the left (the name, the day, and one instrument: tonight's moon
   with the days before and the three places going round it), the sheet beside it, and — once a piece is opened — the
   piece alone, or with the pile it came from beside it if that is asked for. A phone gets one column: the instrument
   is the head of the sheet, and an open piece takes the whole screen.
   The moon is one pencil study (eye/moon.webp), shown lit as it is on the night in question: tonight's at the hub,
   the days before on the inner track, and small ones that say how far a thing has been read (none: not opened — a
   swallow sits by it instead; an empty ring: opened; then waxing; full: read to the end). Each source's seal is a
   freehand pencil drawing (eye/seals.webp). A figure of a piece is shown where it stands in it. */
(function () {
  "use strict";
  var C = window.NYX || {}, RELAY = C.relay || "/relay", root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var key = null; try { key = localStorage.getItem("nyx_key"); } catch (e) {}
  if (!key) { location.replace("./"); return; }
  if (window.NyxPaper) window.NyxPaper.paint();
  var ask = window.NyxAsk, view = $("view"), sheet = $("sheet"), toastT = 0;
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  var WIDE = window.matchMedia("(min-width:1100px)"), wide = function () { return WIDE.matches; };
  var HAN = /[㐀-鿿]/;

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t) { var el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("on"); }, 2600); }
  function api(path, o) {
    o = o || {};
    var q = { method: o.method || "GET", headers: { "Authorization": "Bearer " + key }, cache: "no-store" };
    if (o.body) { q.headers["Content-Type"] = "application/json"; q.body = JSON.stringify(o.body); }
    if (o.keep) q.keepalive = true;
    return fetch(RELAY + (o.house ? "" : "/app/read/") + path, q).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && !o.house && d.detail === "unauthorized") { location.replace("./"); }
        if (!r.ok) { var e = new Error(d.error || (typeof d.detail === "string" ? d.detail : "") || String(r.status)); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function trouble(e) { return '<p class="none">' + (e && e.status >= 500 ? "书架那边没有应答，过一会儿再来。" : esc((e && e.message) || "没取到。")) + "</p>"; }
  var WAIT = '<p class="none wait"><i class="sw"></i>在取……</p>';

  /* ── days, as the library counts them (Shanghai) ── */
  var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function shDay(v) { var t = Date.parse(v || ""); return isFinite(t) ? new Date(t + 8 * 3600000).toISOString().slice(0, 10) : null; }
  function today() { return shDay(new Date().toISOString()); }
  function ago(day) { return Math.round((Date.parse(today() + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86400000); }
  function zhDate(v) { var d = shDay(v); if (!d) return ""; var p = d.split("-"), y = today().slice(0, 4); return (p[0] !== y ? p[0] + "年" : "") + (+p[1]) + "月" + (+p[2]) + "日"; }
  function latinDay(day) { var d = new Date(day + "T00:00:00Z"); return WD[d.getUTCDay()] + " · " + d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function dur(s) { s = Math.max(0, Math.round(+s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), z = function (n) { return (n < 10 ? "0" : "") + n; }; return (h ? h + ":" + z(m) : m) + ":" + z(s % 60); }
  function clock(v) { var t = Date.parse(v || ""); if (!isFinite(t)) return ""; var d = new Date(t + 8 * 3600000), z = function (n) { return (n < 10 ? "0" : "") + n; }, day = d.toISOString().slice(0, 10); return (day === today() ? "" : zhDate(v) + " ") + z(d.getUTCHours()) + ":" + z(d.getUTCMinutes()); }

  /* ── the pencil: moons and seals, each made once ── */
  var G = window.Gou, drawn = {};
  function dark() { return root.dataset.side === "moon"; }
  function sheetOf(w, h) { var S = 3, c = document.createElement("canvas"); c.width = w * S; c.height = h * S; var x = c.getContext("2d"); x.scale(S, S); return [c, x]; }
  /* the moon: one hand-drawn study of the full moon (eye/moon.webp — a freehand pencil outline, its seas hatched in blue
     pencil, cut along its own uneven edge), and for any night the part of it that is lit. What is in shadow is the same
     drawing, faint: there is no ruled circle anywhere. lit 0…1; waxing: lit on the right. */
  var moonSprite = new Image(), moonOk = false, BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", TAU = Math.PI * 2;
  moonSprite.onload = function () { moonOk = true; document.querySelectorAll("img[data-moon]").forEach(function (im) { var q = im.dataset.moon.split("|"); im.src = moonUrl(+q[0], q[1] === "1", +q[2], q[3] === "1"); }); };
  moonSprite.src = "eye/moon.webp";
  function moonUrl(lit, waxing, R, onDark) {
    if (!moonOk) return BLANK;
    var q = Math.round(Math.max(0, Math.min(1, lit)) * 24) / 24, k = "m" + q + (waxing ? "w" : "n") + "|" + R + "|" + (onDark ? 1 : 0); if (drawn[k]) return drawn[k];
    var W = Math.ceil(R * 2 + 4), cx = sheetOf(W, W), x = cx[1], whole = function () { x.drawImage(moonSprite, -R, -R, R * 2, R * 2); };
    x.translate(W / 2, W / 2); x.imageSmoothingQuality = "high";
    if (q < .98) { x.save(); x.globalAlpha = onDark ? .14 : .3; whole(); x.restore(); }   // the part in shadow: the same drawing, faint
    if (q > .02) {
      x.save(); x.rotate(-.3); if (!waxing) x.scale(-1, 1);
      x.beginPath();
      if (q >= .98) x.arc(0, 0, R + 2, 0, TAU);
      else { x.arc(0, 0, R + 2, -Math.PI / 2, Math.PI / 2, false); x.ellipse(0, 0, Math.max(.01, R * Math.abs(1 - 2 * q)), R + 2, 0, Math.PI / 2, -Math.PI / 2, q < .5); }   // the limb, then back along the terminator
      x.closePath(); x.clip();
      if (!waxing) x.scale(-1, 1); x.rotate(.3); whole(); if (R < 11 && !onDark) whole(); x.restore();   // a very small moon on paper is gone over twice, or it is only a smudge
    }
    return (drawn[k] = cx[0].toDataURL("image/png"));
  }
  function moonTag(lit, waxing, R, onDark, cls, size) { return '<img class="' + cls + '" alt="" width="' + size + '" height="' + size + '" data-moon="' + [lit, waxing ? 1 : 0, R, onDark ? 1 : 0].join("|") + '" src="' + moonUrl(lit, waxing, R, onDark) + '">'; }
  function phase(a) { return a.completed ? 4 : a.progress > .66 ? 3 : a.progress > .33 ? 2 : a.progress > .02 ? 1 : a.read ? 0 : -1; }
  var LIT = [0, .25, .5, .75, 1];                                              // how far a piece has been read, as a waxing moon
  function sky(day) { var d = new Date(day + "T12:00:00Z"); return G && G.moonAge ? { lit: G.moonLit(d), wax: G.moonAge(d) < 14.765 } : { lit: 1, wax: true }; }   // the moon that night
  /* a source's seal: its letter in a ring, drawn freehand in blue pencil and gone over twice (eye/seals.webp — twelve on
     one sheet, kept only as where the pencil went, so each is laid in the blue of whichever side is up) */
  var SEALS = { "qbitai": "量", "qbitai-xhs": "量", "latepost": "晚", "anthropic-engineering": "A", "anthropic-research": "A", "claude-articles": "C", "openai-codex": "O", "boris-cherny": "B", "thariq-shihipar": "T",
    "bilibili-d7": "D7", "bilibili-zhangxiaojun": "珺", "bilibili-whynottv": "W", "x-anthropic": "X", "x-openai-devs": "X", "x-karpathy": "X" };
  var SEAL_AT = { "量": 0, "晚": 1, "珺": 2, "A": 3, "C": 4, "O": 5, "X": 6, "W": 7, "B": 8, "T": 9, "D7": 10, "·": 11 };   // where each lies on the sheet, four to a row
  function sealImg(sourceId, cls) { var n = SEAL_AT[SEALS[sourceId] || "·"]; return '<i class="seal' + (cls ? " " + cls : "") + '" style="--sx:' + (n % 4) + ";--sy:" + (n / 4 | 0) + '" aria-hidden="true"></i>'; }

  /* ── swallows, as the home draws them (eye/birds.js): the outline of one instant of the wingbeat as a mask for small
     marks (--sw: on every piece not yet read, on the line that says how far down a piece one is, on the way back) ── */
  function swallowMask(hour) {
    var P = G && G.BIRDPTS && (G.BIRDPTS[hour] || G.BIRDPTS[11]); if (!P) return "";
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, d = "", i;
    for (i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); d += (i ? "L" : "M") + P[i].toFixed(3) + " " + P[i + 1].toFixed(3); }
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x0, y0, x1 - x0, y1 - y0].map(function (v) { return v.toFixed(3); }).join(" ") + '"><path d="' + d + 'Z"/></svg>') + '")';
  }
  if (G && G.BIRDPTS) root.style.setProperty("--sw", swallowMask(11));

  /* ── the instrument: the house's orbits about tonight's moon, and on two of its tracks the places to go (outer) and the
     days before (inner, one moon a day). On a wide screen it lies on the spine, the moon at its left; on a phone it is the
     head of the sheet, the moon rising at its foot. A ring is turned by hand — take hold anywhere and turn it about the
     moon, as the menu is turned on the home; let go and it comes to rest on the nearest mark, and that is opened — or by
     a wheel, or by touching a mark. The orbits behind are geared to both rings (G.orrery's `orb`); left alone they only
     flow. They are laid in the other side's hand, as the spine is the other side's ground: chalk by day, pencil by night. ── */
  var PLACES = [["today", "今日", "Today"], ["shelf", "书架", "Shelf"], ["kept", "收藏", "Kept"]], STEP_P = 27, STEP_D = 15, RADN = Math.PI / 180;
  var cal = { dates: [] }, dial = { built: false, v: "today", date: null, pi: 0, di: 0, orb: 0, to: 0, geo: null, clickAt: 0 }, hold = null;
  function daysOn() { return cal.dates.slice(0, 12); }
  function lim(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dialBuild() {   // laid again whenever the days become known
    var el = $("dial"); if (!el) return;
    var onDark = !dark(), t = today(), tn = sky(t);
    el.innerHTML = '<span class="hub">' + moonTag(tn.lit, tn.wax, 62, onDark, "", 128) + '</span><i class="hand"></i>' +
      '<div class="ring days">' + daysOn().map(function (d, i) { var k = sky(d); return '<a href="#today' + (d === t ? "" : "/" + d) + '" draggable="false" data-d="' + d + '" style="--a:' + (i * STEP_D) + 'deg" title="' + zhDate(d + "T04:00:00Z") + '的简报">' + moonTag(k.lit, k.wax, 12, onDark, "", 26) + "<i>" + (+d.slice(8)) + "</i></a>"; }).join("") + "</div>" +
      '<div class="ring places">' + PLACES.map(function (pl, i) { return '<a href="#' + pl[0] + '" draggable="false" data-v="' + pl[0] + '" style="--a:' + (i * STEP_P) + 'deg"><b></b><span><em>' + pl[1] + "</em><i>" + pl[2] + "</i></span></a>"; }).join("") + "</div>";
    dial.built = true; dialSet(dial.v, dial.date, true);
  }
  function dialTurn(pi, di) {   // the rings laid so that place pi and day di lie at the hand (between two marks, while a ring is in the hand)
    var el = $("dial"); dial.pi = pi; dial.di = di;
    el.style.setProperty("--tp", (-pi * STEP_P).toFixed(2) + "deg"); el.style.setProperty("--td", (-di * STEP_D).toFixed(2) + "deg");
    dial.to = pi * .5 + di * .2;   // the orbits behind are geared to both rings
  }
  function dialSet(v, date, still) {
    if (v) dial.v = v; if (date !== undefined) dial.date = date;
    var el = $("dial"); if (!el || !dial.built) return;
    var pi = Math.max(0, PLACES.findIndex(function (pl) { return pl[0] === dial.v; })), day = dial.date || today(), di = Math.max(0, daysOn().indexOf(day));
    if (still) el.classList.add("still");
    dialTurn(pi, di);
    el.querySelectorAll(".places a").forEach(function (l) { l.classList.toggle("on", l.dataset.v === dial.v); });
    el.querySelectorAll(".days a").forEach(function (l) { l.classList.toggle("on", dial.v === "today" && l.dataset.d === day); });
    if (still) { dial.orb = dial.to; void el.offsetWidth; el.classList.remove("still"); }
    $("stage").style.setProperty("--fly", (pi + di * .3).toFixed(2));   // the swallow behind the sheet flies on a little with every turn
  }
  function instrument() {
    var host = $("spine"), el = $("dial"), cv = document.createElement("canvas"), x = cv.getContext("2d"), born = performance.now(), w = 0, h = 0, dpr = 1, wd = null;
    cv.className = "plate"; cv.setAttribute("aria-hidden", "true"); host.insertBefore(cv, host.firstChild);
    (function frame() {
      var r = host.getBoundingClientRect(), now = performance.now(), moving = Math.abs(dial.to - dial.orb) > .0015, W = wide();
      if (r.width > 4 && r.bottom > 0 && !document.hidden && !host.classList.contains("stuck")) {
        var nd = Math.min(window.devicePixelRatio || 1, 2);
        if (Math.round(r.width) !== w || Math.round(r.height) !== h || nd !== dpr || W !== wd) {   // the measure of the spine: where the moon lies and how wide its tracks are
          w = Math.round(r.width); h = Math.round(r.height); dpr = nd; wd = W; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
          var g = W ? { cx: Math.round(w * .115), cy: Math.round(h * .55), rp: Math.min(w * .575, h * .28), dd: 1, sc: h / 1400 } : { cx: Math.round(w / 2), cy: h - 2, rp: Math.min(158, w * .405), dd: -1 };
          g.rd = g.rp * (W ? .64 : .57); g.hub = W ? g.rd : g.rp * .6; if (!W) g.sc = g.rp * .003;
          dial.geo = g;
          el.style.setProperty("--cx", g.cx + "px"); el.style.setProperty("--cy", g.cy + "px"); el.style.setProperty("--rp", g.rp.toFixed(1) + "px"); el.style.setProperty("--rd", g.rd.toFixed(1) + "px"); el.style.setProperty("--hub", g.hub.toFixed(1) + "px");
        }
        dial.orb = moving ? dial.orb + (dial.to - dial.orb) * (hold && hold.turn ? .3 : .085) : dial.to;
        if (G && G.orrery) {
          var sc = dial.geo.sc, k = sc * dpr;
          x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); x.setTransform(k, 0, 0, k, 0, 0);
          G.orrery(x, { cx: dial.geo.cx / sc, cy: dial.geo.cy / sc, K: .8, tilt: 58 * RADN, q: .62, night: !dark(), orb: dial.orb, time: now / 1000, a: dark() ? .34 : .46, rv: lim((now - born) / 2200, 0, 1), foot: null });
        }
      }
      if (moving || (hold && hold.turn)) requestAnimationFrame(frame); else setTimeout(frame, 75);
    })();
  }
  /* a ring in the hand. Which ring: the one whose track is nearer to where it was taken hold of. It follows the hand's
     angle about the moon; past its last mark it gives a little and no more. */
  function ringAt(x, y) { var g = dial.geo; return Math.hypot(x - g.cx, y - g.cy) < (g.rp + g.rd) / 2 && daysOn().length > 1 ? "d" : "p"; }
  function give(v, max) { return v < 0 ? v * .28 : v > max ? max + (v - max) * .28 : v; }
  function openAt(ring, n) {   // what lies at the hand is opened; if it was open already, the ring only settles back on it
    var t = today(), d = daysOn()[n], to = ring === "p" ? "#" + PLACES[n][0] : "#today" + (!d || d === t ? "" : "/" + d), now = location.hash || "#today";
    if (to === now || ($("reading").hidden && shown === to.slice(1))) dialSet(dial.v, dial.date); else location.hash = to;
  }
  function stick() { var host = $("spine"); if (host.offsetHeight) host.classList.toggle("stuck", !wide() && window.scrollY > host.offsetHeight - 56); }   // (while a piece is open the spine is away: nothing to measure)
  function hands() {
    var host = $("spine"), el = $("dial"), wheel = { acc: 0, at: 0, t: 0 };
    function at(e) { var r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    host.addEventListener("pointerdown", function (e) {
      if (e.button || !dial.geo || !dial.built || (e.target.closest && e.target.closest("button, .sp-top, .sp-foot"))) return;
      var p = at(e); hold = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ring: ringAt(p.x, p.y), acc: 0, pi0: dial.pi, di0: dial.di, va: 0, turn: false };
    });
    host.addEventListener("pointermove", function (e) {
      if (!hold || e.pointerId !== hold.id) return;
      var g = dial.geo, p = at(e), a1 = Math.atan2(p.y - g.cy, p.x - g.cx), now = performance.now();
      if (!hold.turn) {
        if (Math.hypot(e.clientX - hold.x0, e.clientY - hold.y0) < 7) return;
        hold.turn = true; hold.a = a1; hold.t = now; el.classList.add("held"); host.classList.add("held"); try { host.setPointerCapture(e.pointerId); } catch (er) {}
      }
      var da = ((a1 - hold.a + Math.PI) % TAU + TAU) % TAU - Math.PI, dt = Math.max(1, now - hold.t), deg;
      hold.a = a1; hold.t = now; hold.acc += da; hold.va = hold.va * .55 + (da / dt) * .45; deg = hold.acc / RADN;
      if (hold.ring === "p") dialTurn(give(hold.pi0 - deg / STEP_P, PLACES.length - 1), dial.di);
      else dialTurn(dial.pi, give(hold.di0 - g.dd * deg / STEP_D, daysOn().length - 1));
    });
    function letGo(e, lost) {
      if (!hold || e.pointerId !== hold.id) return; var h = hold; hold = null; if (!h.turn) return;
      el.classList.remove("held"); host.classList.remove("held"); dial.clickAt = performance.now();
      if (lost) { dialSet(dial.v, dial.date); return; }
      // carry on a little with the speed it had, then come to rest on a mark
      var p = h.ring === "p", stale = performance.now() - h.t > 90, step = (p ? STEP_P : STEP_D) * RADN, fling = stale ? 0 : lim(-(p ? 1 : dial.geo.dd) * h.va / step * 170, -1.2, 1.2);
      var was = p ? h.pi0 : h.di0, is = p ? dial.pi : dial.di, max = (p ? PLACES.length : daysOn().length) - 1, goal = Math.round(is + fling);
      if (goal === Math.round(was) && Math.abs(is - was) > .16) goal += is > was ? 1 : -1;
      openAt(h.ring, lim(goal, 0, max));
    }
    host.addEventListener("pointerup", function (e) { letGo(e); });
    host.addEventListener("pointercancel", function (e) { letGo(e, true); });
    el.addEventListener("click", function (e) { if (performance.now() - dial.clickAt < 400) { e.preventDefault(); e.stopPropagation(); } }, true);   // letting go of a ring is not a touch on the mark under the hand
    el.addEventListener("dragstart", function (e) { e.preventDefault(); });
    // with a wheel: a notch is a mark; what comes to the hand is opened once the wheel has stopped
    host.addEventListener("wheel", function (e) {
      if (!dial.geo || !dial.built || !wide()) return; e.preventDefault();
      var now = performance.now(), p = at(e), ring = wheel.ring && now - wheel.at < 600 ? wheel.ring : ringAt(p.x, p.y);
      wheel.acc += e.deltaY; if (Math.abs(wheel.acc) < 40 || now - wheel.at < 130) return;
      var s = wheel.acc > 0 ? 1 : -1, n; wheel.acc = 0; wheel.at = now; wheel.ring = ring;
      if (ring === "p") { n = lim(Math.round(dial.pi) + s, 0, PLACES.length - 1); dialTurn(n, dial.di); } else { n = lim(Math.round(dial.di) + s, 0, daysOn().length - 1); dialTurn(dial.pi, n); }
      clearTimeout(wheel.t); wheel.t = setTimeout(function () { openAt(ring, n); }, 420);
    }, { passive: false });
    // a phone: once the sheet has been pulled up over the instrument only its bar is left; a touch on the name brings it back
    window.addEventListener("scroll", stick, { passive: true }); window.addEventListener("resize", stick); stick();
    host.querySelector(".ttl").addEventListener("click", function () { if (!wide()) window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  /* ── covers: the first figure of a piece, small, fetched as the card comes near ── */
  var coverUrl = {}, coverIO = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { coverIO.unobserve(e.target); loadCover(e.target); } }); }, { rootMargin: "400px" }) : null;
  function loadCover(el) {
    var id = el.dataset.cover; if (!id) return;
    (coverUrl[id] || (coverUrl[id] = fetch(RELAY + "/app/read/cover/" + id, { headers: { "Authorization": "Bearer " + key } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) { return URL.createObjectURL(b); })))
      .then(function (u) { el.style.backgroundImage = 'url("' + u + '")'; el.classList.add("has"); }, function () { el.classList.add("gone"); });
  }
  function covers(scope) { scope.querySelectorAll(".cv[data-cover]:not(.has):not(.gone)").forEach(function (el) { if (coverIO) coverIO.observe(el); else loadCover(el); }); }
  /* ── a figure where it stands in a piece: shown as it is, fetched as the reading comes near (the relay makes it small) ── */
  var figUrl = {}, figIO = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { figIO.unobserve(e.target); loadFig(e.target); } }); }, { rootMargin: "900px" }) : null;
  function loadFig(el) {
    var k = el.dataset.fig; if (!k) return;
    (figUrl[k] || (figUrl[k] = fetch(RELAY + "/app/read/figure/" + k, { headers: { "Authorization": "Bearer " + key } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) { return URL.createObjectURL(b); })))
      .then(function (u) { var im = new Image(); im.alt = el.dataset.alt || ""; im.decoding = "async"; im.onload = function () { el.textContent = ""; el.appendChild(im); el.classList.add("has"); }; im.onerror = function () { el.parentNode.classList.add("gone"); }; im.src = u; },
        function () { el.parentNode.classList.add("gone"); });
  }
  function figures(scope) { scope.querySelectorAll(".pic[data-fig]:not(.has)").forEach(function (el) { if (figIO) figIO.observe(el); else loadFig(el); }); }
  function figuresGone() { Object.keys(figUrl).forEach(function (k) { figUrl[k].then(function (u) { URL.revokeObjectURL(u); }, function () {}); }); figUrl = {}; }

  /* ── a card ── */
  var byId = {};   // every card the page has been given, by id (so a card can be struck again when its state changes)
  function shortSource(n) { return String(n || "").replace(/\s*·\s*B站$/, "").replace(/\s*·\s*小红书$/, "").replace(/\s*·\s*X$/, ""); }
  function metaOf(a) {
    var m = [esc(shortSource(a.sourceName)), zhDate(a.publishedAt || a.fetchedAt) || esc(a.dateLabel || "")];
    if (a.video && a.video.duration) m.push("节目 " + dur(a.video.duration)); else if (a.readingMinutes) m.push(a.readingMinutes + " 分钟");
    return m.filter(Boolean).join(" · ");
  }
  function titles(a) { var zh = a.translatedTitle && a.translatedTitle !== a.title ? a.translatedTitle : ""; return { main: zh || a.title, orig: zh ? a.title : "", latin: !HAN.test(zh || a.title) }; }
  function thumb(a) { return a.cover ? '<span class="cv" data-cover="' + esc(a.id) + '"></span>' : a.video && a.video.duration ? '<span class="cv disc"><i>' + dur(a.video.duration) + "</i></span>" : ""; }
  function card(a, kind) {   // kind: "card" a line of the shelf; "ft" a feature, its cover on top
    byId[a.id] = a; kind = kind || "card";
    var t = titles(a), ph = phase(a), th = thumb(a);
    return '<a class="' + kind + (a.read ? "" : " new") + (th ? " pic" : "") + '" href="#a/' + esc(a.id) + '" data-id="' + esc(a.id) + '">' + (kind === "ft" ? th : "") + sealImg(a.sourceId) +
      '<span class="tx"><b class="tt' + (t.latin ? " la" : "") + '">' + esc(t.main) + "</b>" + (t.orig ? '<span class="ot" lang="en">' + esc(t.orig) + "</span>" : "") +
      (a.summary ? '<span class="sm">' + esc(a.summary) + "</span>" : "") +
      '<span class="mt">' + (ph >= 0 ? moonTag(LIT[ph], true, 9, dark(), "mn", 20) : "") + "<span>" + metaOf(a) + (a.favorite ? ' · <i class="kp">留着</i>' : "") + "</span></span></span>" + (kind === "ft" ? "" : th) + "</a>";
  }
  function strike(a) {   // the same card again, wherever it lies on the page, after its state has changed
    document.querySelectorAll('a.card[data-id="' + a.id + '"], a.ft[data-id="' + a.id + '"]').forEach(function (el) {
      var t = document.createElement("div"); t.innerHTML = card(a, el.classList.contains("ft") ? "ft" : "card"); var n = t.firstChild, host = el.parentNode; el.replaceWith(n); covers(host || document);
    });
  }
  function dayLabel(day, word) { return '<p class="day" data-ts="' + day + 'T04:00:00Z"><span>' + latinDay(day) + (word ? "<em>" + esc(word) + "</em>" : "") + "</span></p>"; }
  function stamps(el) { if (window.NyxPostmark) el.querySelectorAll(".day[data-ts]").forEach(function (d) { window.NyxPostmark(d, Date.parse(d.dataset.ts)); }); }
  function shown0() { $("browse").scrollTop = 0; if (!wide()) window.scrollTo(0, 0); }

  /* ── the pile an open piece came from: the rail beside it, and what "next" means ── */
  var ctx = [];   // [{id, title, sourceId, meta, read}]
  function pile(list) {
    var seen = {}; ctx = list.filter(function (c) { if (!c.id || seen[c.id]) return false; seen[c.id] = 1; return true; });
    if (!$("reading").hidden) { $("rail").dataset.n = ""; var id = (location.hash || "").slice(3); rail(id); if (A) { $("prev").disabled = at(-1) == null; $("next").disabled = at(1) == null; var nb = $("nextb"); if (nb) nb.hidden = at(1) == null; } }   // a piece opened before its pile had arrived
  }
  function ofCard(a) { var t = titles(a); return { id: a.id, title: t.main, sourceId: a.sourceId, meta: metaOf(a), read: a.read }; }

  /* ── the rest of the spine: the day in a line under the name, and at its foot how much is on the shelf and the last look for new things ── */
  var polling = 0;
  function spineFoot() {
    Promise.all([api("status"), api("articles?filter=unread&limit=1").catch(function () { return {}; })]).then(function (r) {
      var s = r[0];
      $("spFoot").innerHTML = "<p>" + (s.articleCount ? s.articleCount + " 篇" + (r[1].total ? " · " + r[1].total + " 没读" : "") : "") + "</p><p>" + (s.collecting ? "正在找新的……" : "上次去找 " + (clock(s.lastCollectionAt) || "还没有")) +
        ' · <button type="button" id="collect"' + (s.collecting ? " disabled" : "") + ">去找新的</button></p>";
      $("collect").onclick = function () {
        this.disabled = true;
        api("collect", { method: "POST", body: {} }).then(function () { toast("去找了，过一会儿回来看"); watch(); }, function (e) { toast(e.message || "没去成"); spineFoot(); });
      };
      if (s.collecting) watch();
    }).catch(function () {});
  }
  function watch() { clearTimeout(polling); polling = setTimeout(function () { api("status").then(function (s) { if (s.collecting) watch(); else { spineFoot(); if ($("reading").hidden) { shown = null; route(); } } }, watch); }, 6000); }

  /* ── Today: the day's sheet ── */
  var SECT = [["world", "世界局势", "The world"], ["business", "商业", "Business"], ["ai", "AI", "Artificial intelligence"], ["interview", "访谈", "Conversations"]];   // the library's order: the world first
  // when the day's sheet was written, if it was rewritten in the evening (the library writes one at 07:00 and, when news came in, again after 19:00)
  function written(brief) { var t = Date.parse((brief && brief.generatedAt) || ""); if (!isFinite(t)) return ""; var s = new Date(t + 8 * 3600000), h = s.getUTCHours(); return h >= 12 ? (h < 10 ? "0" : "") + h + ":" + (s.getUTCMinutes() < 10 ? "0" : "") + s.getUTCMinutes() + " 更新" : ""; }
  function early(k) { var e = RELAY === "/relay" && window.NYX_READ_EARLY, v = e && e[k]; if (e) e[k] = null; return v || null; }
  function viewToday(date) {
    view.className = "view today"; view.innerHTML = WAIT; shown0();
    var want = "briefs" + (date ? "?date=" + encodeURIComponent(date) : ""), e = RELAY === "/relay" && window.NYX_READ_EARLY, mine = [], picked = [], token = shown;
    var pb = e && e.brief === want && e.b ? early("b").catch(function () { return api(want); }) : api(want);
    var pr = (early("r") || api("recommendations")).catch(function () { return api("recommendations"); }).catch(function () { return null; });
    pb.then(function (b) {
      if (shown !== token) return;
      var items = (b.brief && b.brief.items) || [], seen = {}, n = 0, isToday = b.date === b.today, at = written(b.brief);
      var h = '<header class="hd"><h2>' + (isToday ? "今日新鲜事" : zhDate(b.date + "T04:00:00Z") + "的新鲜事") + "</h2><p>" + latinDay(b.date) + (items.length ? " · " + items.length + " 条" : "") + (at ? " · " + at : "") + (isToday ? "" : ' · <a href="#today">回到今天</a>') + "</p></header>" +
        '<div class="col brief">' + dayLabel(b.date, isToday ? "今日新鲜事" : "那天的新鲜事");
      if (items.length) {
        SECT.concat([["", "其他", "Other"]]).forEach(function (s) {
          var its = items.filter(function (it) { var k = it.itemId || it.articleId + "|" + it.headline; if (seen[k]) return false; return s[0] ? it.section === s[0] : true; });
          if (!its.length) return;
          h += '<h3 class="sec"><span>' + s[1] + "</span><i>" + s[2] + "</i></h3>";
          its.forEach(function (it) {
            seen[it.itemId || it.articleId + "|" + it.headline] = 1; n++;
            mine.push({ id: it.articleId, title: it.headline, sourceId: it.sourceId, meta: esc(it.sourceLabel || shortSource(it.sourceName)) + (it.publishedAt ? " · " + zhDate(it.publishedAt) : "") });
            h += '<a class="bi" href="#a/' + esc(it.articleId) + '" data-id="' + esc(it.articleId) + '"><i class="no">' + (n < 10 ? "0" : "") + n + '</i><span class="bx"><b class="hl">' + esc(it.headline) + "</b>" +
              (it.card ? '<span class="cd">' + esc(it.card) + "</span>" : "") + '<span class="sr">' + sealImg(it.sourceId) + "<em>" + esc(it.sourceLabel || shortSource(it.sourceName)) + "</em>" + (it.repeated ? "<u>" + esc(it.repeatLabel || "昨日已提及") + "</u>" : "") + "</span></span></a>";
          });
        });
      } else {
        h += '<p class="none">' + (isToday ? "今天的还没写好。" : "这一天没有简报。") + "</p>";
        if (isToday && b.budget && b.budget.modelAvailable && b.budget.remaining >= b.budget.required) h += '<p class="act"><button type="button" id="regen">现在写一份</button></p>';
      }
      h += '</div><div class="col picks" id="picks">' + WAIT + "</div>";
      view.innerHTML = h; stamps(view); pile(mine.concat(picked));
      if ((b.dates || []).join() !== cal.dates.join()) { cal.dates = b.dates || []; dialBuild(); }
      var rg = $("regen"); if (rg) rg.onclick = function () {
        ask.confirm("现在写今天的简报？", { body: "要用两次模型调用，今天还剩 " + b.budget.remaining + " 次。", ok: "写", cancel: "先不" }).then(function (yes) {
          if (!yes) return; rg.disabled = true; rg.textContent = "在写……";
          api("briefs/regenerate", { method: "POST", body: {} }).then(function () { shown = null; route(); }).catch(function (e2) { toast(e2.message || "没写成"); rg.disabled = false; rg.textContent = "现在写一份"; });
        });
      };
      return pr;
    }).then(function (rec) {
      if (shown !== token || !$("picks")) return;
      var inBrief = {}; mine.forEach(function (m) { inBrief[m.id] = 1; });
      var daily = ((rec && rec.daily) || []).filter(function (d) { return !inBrief[d.id]; }),
        weekly = ((rec && rec.weekly) || []).filter(function (w) { return !inBrief[w.id] && !daily.some(function (d) { return d.id === w.id; }); }), h = "";   // a piece is shown once on the sheet
      if (daily.length) h += '<h3 class="sec"><span>值得一读</span><i>Worth reading today</i></h3><div class="fts">' + daily.map(function (a) { return card(a, "ft"); }).join("") + "</div>";
      if (weekly.length) h += '<h3 class="sec"><span>这一周的</span><i>This week</i></h3><div class="list">' + weekly.map(function (a) { return card(a); }).join("") + "</div>";
      $("picks").innerHTML = h || '<p class="none">今天没有另外挑出来的。</p>'; covers($("picks"));
      picked = daily.map(ofCard).concat(weekly.map(ofCard)); pile(mine.concat(picked));
    }).catch(function (e2) { if (shown === token) view.innerHTML = trouble(e2); });
  }

  /* ── Shelf: everything, by day ── */
  var CATS = [["", "全部"], ["ai", "AI"], ["development", "编程"], ["perspectives", "访谈"], ["world", "世界"]];
  var shelf = { cat: "", unread: false, q: "", items: [], total: 0, busy: false };
  function groupName(a) { var d = shDay(a.publishedAt || a.fetchedAt); if (!d) return "日期未知"; var n = ago(d); return n <= 0 ? "今天" : n === 1 ? "昨天" : n < 7 ? "这一周" : "更早"; }
  function listHtml(items) {
    var h = "", last = null;
    items.forEach(function (a) { var g = groupName(a); if (g !== last) { h += '<h3 class="sec"><span>' + g + "</span></h3>"; last = g; } h += card(a); });
    return h;
  }
  function shelfLoad(more) {
    if (shelf.busy) return; shelf.busy = true;
    var q = "articles?limit=30&offset=" + (more ? shelf.items.length : 0) + "&filter=" + (shelf.unread ? "unread" : "all") + (shelf.cat ? "&category=" + shelf.cat : "") + (shelf.q ? "&q=" + encodeURIComponent(shelf.q) : "");
    if (!more && $("list")) $("list").innerHTML = WAIT;
    var first = !more && !shelf.unread && !shelf.cat && !shelf.q && early("list");
    (first ? first.catch(function () { return api(q); }) : api(q)).then(function (d) {
      shelf.busy = false; shelf.items = more ? shelf.items.concat(d.items) : d.items; shelf.total = d.total == null ? shelf.items.length : d.total;
      if (!$("list") || shown !== "shelf") return;
      $("list").innerHTML = shelf.items.length ? listHtml(shelf.items) : '<p class="none">' + (shelf.q ? "没找到。" : shelf.unread ? "都读过了。" : "架上还是空的。") + "</p>";
      $("more").hidden = shelf.items.length >= shelf.total;
      $("count").textContent = shelf.total ? shelf.total + " 篇" : "";
      covers($("list")); pile(shelf.items.map(ofCard));
    }).catch(function (e) { shelf.busy = false; if ($("list")) $("list").innerHTML = trouble(e); });
  }
  function viewShelf() {
    view.className = "view shelf"; shown0();
    view.innerHTML = '<header class="hd"><h2>书架</h2><p>Everything collected, newest first<span class="count" id="count"></span></p></header>' +
      '<div class="bar"><div class="flt" id="flt">' + CATS.map(function (c) { return '<button type="button" data-c="' + c[0] + '"' + (shelf.cat === c[0] ? ' class="on"' : "") + ">" + c[1] + "</button>"; }).join("") +
      '<button type="button" id="unr" class="tg' + (shelf.unread ? " on" : "") + '">只看没读过的</button></div>' +
      '<label class="find"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg><input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="找一篇：题目、来源、说到的东西" value="' + esc(shelf.q) + '"></label></div>' +
      '<div class="list grid" id="list"></div><p class="act"><button type="button" id="more" hidden>再往前</button></p>';
    $("flt").querySelectorAll("[data-c]").forEach(function (b) { b.onclick = function () { shelf.cat = b.dataset.c; viewShelf(); }; });
    $("unr").onclick = function () { shelf.unread = !shelf.unread; viewShelf(); };
    var t = 0; $("q").oninput = function () { clearTimeout(t); var v = this.value.trim(); t = setTimeout(function () { if (v !== shelf.q) { shelf.q = v; shelfLoad(); } }, 380); };
    $("more").onclick = function () { shelfLoad(true); };
    shelfLoad();
  }

  /* ── Kept: half read, and kept ── */
  function viewKept() {
    view.className = "view kept"; view.innerHTML = WAIT; shown0();
    Promise.all([api("articles?filter=continue&limit=30"), api("articles?filter=favorites&limit=60")]).then(function (r) {
      var h = '<header class="hd"><h2>收藏</h2><p>Half read, and kept</p></header>';
      if (r[0].items.length) h += '<h3 class="sec"><span>读到一半</span></h3><div class="list grid">' + r[0].items.map(function (a) { return card(a); }).join("") + "</div>";
      if (r[1].items.length) h += '<h3 class="sec"><span>留着的</span></h3><div class="list grid">' + r[1].items.map(function (a) { return card(a); }).join("") + "</div>";
      if (!r[0].items.length && !r[1].items.length) h += '<p class="none">还没有留下什么。读到想留的，在文章上面点「留着」。</p>';
      view.innerHTML = h; covers(view); pile(r[0].items.concat(r[1].items).map(ofCard));
    }).catch(function (e) { view.innerHTML = trouble(e); });
  }

  /* ── one article ── */
  var A = null, mode = null, rawView = false, hosts = {}, saveT = 0, saved = { blockId: null, progress: -1 }, cur = { blockId: null, progress: 0 }, listY = 0, heads = [];
  var IC = { size: '<path d="M4 19l5-13h1l5 13M6 14.5h7M15.5 19l3-7.5h.6l3 7.5M16.6 16.5h4.4"/>', keep: '<path d="M7 4h10v16l-5-3.6L7 20z"/>',
    out: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M17 14v5H5V7h5"/>', talk: '<path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.7-4.9A7.5 7.5 0 1 1 20 11.5Z"/>' };
  function ico(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + "</svg>"; }
  function blockText(b) { return String(!b ? "" : b.type === "image" ? (b.alt || b.text || "") : (b.text || "")); }
  function pairs(a) {
    var t = a.translation, bs = a.blocks || [];
    if (!t || t.status !== "ready" || t.targetLanguage !== "zh-CN" || !Array.isArray(t.blocks) || t.blocks.length !== bs.length) return null;
    var any = false, out = bs.map(function (b, i) { var x = t.blocks[i]; var ok = x && x.id === b.id && x.type === b.type && typeof x.text === "string" && b.type !== "code" && blockText(x) && blockText(x) !== blockText(b); if (ok) any = true; return ok ? x : null; });
    return any ? out : null;
  }
  function safeUrl(u) { try { var x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (e) { return ""; } }
  function blockHtml(b, cls, lang) {
    var t = esc(blockText(b)), at = ' class="' + cls + '"' + (lang ? ' lang="' + lang + '"' : "");
    if (b.type === "heading") { var n = Math.max(2, Math.min(4, +b.level || 2)); return "<h" + n + at + ">" + t + "</h" + n + ">"; }
    if (b.type === "code") return "<pre" + at + ">" + (b.language ? "<span>" + esc(b.language) + "</span>" : "") + "<code>" + t + "</code></pre>";
    if (b.type === "table") return "<pre" + ' class="' + cls + ' tb"' + ">" + t + "</pre>";
    if (b.type === "list") return "<p" + ' class="' + cls + ' li"' + (lang ? ' lang="' + lang + '"' : "") + ">" + t + "</p>";
    if (b.type === "quote") return "<blockquote" + at + ">" + t + "</blockquote>";
    if (b.speaker && typeof b.speaker === "string") {   // a conversation (the library's edited transcript): who is speaking stands before a turn; a turn that goes on has no name
      var who = b.speaker, own = b.turn && String(b.text || "").indexOf(who + "：") === 0;
      return "<p" + ' class="' + cls + (own ? " turn" : " cont") + (hosts[who] ? " q" : "") + '"' + (lang ? ' lang="' + lang + '"' : "") + ">" + (own ? '<b class="spk">' + esc(who) + "：</b>" + esc(String(b.text).slice(who.length + 1)) : t) + "</p>";
    }
    return "<p" + at + ">" + t + "</p>";
  }
  function figHtml(a, b, x, i) {   // the picture itself; under it what the piece says of it, and the way to the original
    var u = safeUrl(b.url), t = blockText(x || b), cap = t && !/^(图片|image|img|原文配图|配图)$/i.test(t.trim()) ? t : "";
    return '<figure class="fig' + (u ? "" : " gone") + '">' + (u ? '<a class="pic" data-fig="' + esc(a.id) + "/" + i + '" data-alt="' + esc(cap) + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"></a>' : "") +
      "<figcaption><span>" + esc(cap) + "</span>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">原图</a>' : "") + "</figcaption></figure>";
  }
  function coverage(a) {
    var ch = (a.chapters || []).length;
    return a.coverage === "description" ? (ch ? "依据节目简介与章节，没有口播内容" : "依据节目简介，没有口播内容") : a.coverage === "title" ? (ch ? "依据节目标题与章节，没有口播内容" : "依据节目标题，没有口播内容") :
      a.coverage === "post" ? "X 上的单条推文" : a.coverage === "caption" ? "视频简介，没有字幕" : a.coverage === "text-and-images" ? "图文正文，图里的字没有转录" : "";
  }
  function renderArticle() {
    var a = A, isVideo = /^bilibili-/.test(a.sourceId || "") || a.contentKind === "video";
    /* a programme's speech as the library edited it (punctuated, in paragraphs; a conversation turn by turn), or — asked for — the subtitles as they came */
    var edited = a.hasEditedBody && a.content && a.content.edited && Array.isArray(a.content.edited.originalBlocks) && a.content.edited.originalBlocks.length ? a.content.edited : null;
    if (!edited) rawView = false;
    var blocks = rawView ? edited.originalBlocks : (a.blocks || []), pr = rawView ? null : pairs(a);
    hosts = {}; ((edited && edited.speakers) || []).forEach(function (s) { if (s && /主持/.test(s.role || "")) hosts[s.name] = 1; });
    if (!pr) mode = "src"; else if (!mode || mode === "src0") mode = ls("read_lang") || (wide() ? "both" : "zh");
    var zhTitle = pr && a.translation.title && a.translation.title !== a.title ? a.translation.title : "";
    var meta = [a.author && a.author !== a.sourceName && shortSource(a.sourceName).indexOf(a.author) < 0 ? esc(a.author) : "", zhDate(a.publishedAt || a.fetchedAt) || esc(a.dateLabel || ""),
      a.video && a.video.duration ? "节目 " + dur(a.video.duration) : a.readingMinutes ? a.readingMinutes + " 分钟" : ""].filter(Boolean).join(" · ");
    var shownTitle = zhTitle && mode !== "src" ? zhTitle : a.title;
    var h = '<header class="top"><p class="meta">' + sealImg(a.sourceId) + "<b>" + esc(shortSource(a.sourceName)) + "</b><span>" + meta + "</span></p>";
    h += '<h1 class="title' + (shownTitle.length > 34 ? " long" : "") + '"' + (HAN.test(shownTitle) ? "" : ' lang="en"') + ">" + esc(shownTitle) + "</h1>";
    if (zhTitle && mode !== "src") h += '<p class="otitle" lang="en">' + esc(a.title) + "</p>";
    if ((a.tags || []).length) h += '<p class="tags">' + a.tags.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</p>";
    h += "</header>";
    if (a.summary || a.recommendation || a.evidence) h += '<aside class="lead"><b>导读</b>' + (a.summary ? "<p>" + esc(a.summary) + "</p>" : "") +
      (a.recommendation && a.recommendation !== a.evidence ? '<p class="how">' + esc(a.recommendation) + "</p>" : "") + (a.evidence || coverage(a) ? '<p class="how">' + esc(a.evidence || coverage(a)) + "</p>" : "") +
      (edited ? '<p class="how">' + (rawView ? "现在看的是" + (a.contentBasis === "transcript" ? "原转写" : "原字幕") + "，没有整理过。" : "这是整理稿：字幕加了标点、分了段，去掉了口头的重复" + (edited.speakers && edited.speakers.length ? "；谁在说话是整理时按上下文判断的，可能有错" : "") + "。") +
        '<button type="button" class="lnk" id="edn">' + (rawView ? "回到整理稿" : "看" + (a.contentBasis === "transcript" ? "原转写" : "原字幕")) + "</button></p>" : "") + "</aside>";
    var chapters = (a.chapters || []).filter(function (c) { return c && typeof c.title === "string" && c.title.indexOf("商单") < 0; });
    if (chapters.length) {   // the programme's chapters: beads on a line, each with its time
      var base = safeUrl(a.url);
      h += '<ol class="beads">' + chapters.map(function (c) { var s = Math.max(0, Math.round(+c.from || +c.start || 0)); return "<li>" + (base ? '<a href="' + esc(base + (base.indexOf("?") < 0 ? "?" : "&") + "t=" + s) + '" target="_blank" rel="noopener noreferrer">' : "<span>") + "<time>" + dur(s) + "</time>" + esc(c.title) + (base ? "</a>" : "</span>") + "</li>"; }).join("") + "</ol>";
    }
    if (a.blockId && a.progress > .03 && !a.completed) h += '<p class="resume"><button type="button" id="resume">上次读到 ' + Math.round(a.progress * 100) + "% ，接着读</button></p>";
    if (!a.hasReadableBody) h += '<p class="none">这一篇没有可读的正文' + (isVideo ? "，只有节目信息。" : "。") + "</p>";
    heads = [];
    h += '<div class="body ' + mode + '" id="body">' + blocks.map(function (b, i) {
      var x = pr && pr[i], inner;
      if (b.type === "heading" && i < 2 && (b.text === a.title || b.text === zhTitle)) return '<div class="blk dup" id="b-' + esc(b.id) + '" data-id="' + esc(b.id) + '"></div>';   // the title again, as the body's first line
      if (b.type === "image") return '<div class="blk figb" id="b-' + esc(b.id) + '" data-id="' + esc(b.id) + '">' + figHtml(a, b, x && mode !== "src" ? x : null, i) + "</div>";
      if (b.type === "heading") heads.push({ id: b.id, text: x && mode !== "src" ? x.text : b.text, level: Math.max(2, Math.min(4, +b.level || 2)) });
      if (x && mode === "both") inner = blockHtml(x, "zh", "zh-CN") + blockHtml(b, "src", "en");
      else if (x && mode === "zh") inner = blockHtml(x, "zh", "zh-CN");
      else inner = blockHtml(b, "one", pr ? "en" : "");
      return '<div class="blk' + (x && mode === "both" ? " pair" : "") + (b.type === "heading" ? " hd" : "") + '" id="b-' + esc(b.id) + '" data-id="' + esc(b.id) + '">' + inner + "</div>";
    }).join("") + "</div>";
    h += '<footer class="end"><p class="rate" id="rate"><span>这一篇值几颗月亮</span>' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-n="' + n + '" aria-label="' + n + ' 颗">' + moonTag((a.rating || 0) >= n ? 1 : 0, true, 11, dark(), "", 26) + '</button>'; }).join("") + "</p>" +
      '<p class="act"><button type="button" id="done"' + (a.completed ? ' class="on"' : "") + ">" + (a.completed ? "读完了 · 已记下" : "读完了") + '</button><button type="button" id="nextb">下一篇</button></p></footer>';
    sheet.innerHTML = h; sheet.dataset.size = ls("read_size") || "1"; $("ar").classList.toggle("both", mode === "both" && !!pr);
    tools(pr, edited); toc(); figures(sheet);
    var rs = $("resume"); if (rs) rs.onclick = function () { var el = document.getElementById("b-" + A.blockId); if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); rs.parentNode.remove(); };
    $("done").onclick = function () { state({ read: true, completed: !A.completed }).then(function () { $("done").textContent = A.completed ? "读完了 · 已记下" : "读完了"; $("done").classList.toggle("on", !!A.completed); }); };
    $("nextb").onclick = function () { step(1); }; $("nextb").hidden = at(1) == null;
    $("rate").querySelectorAll("button").forEach(function (b) { b.onclick = function () { var n = +b.dataset.n; state({ rating: A.rating === n ? null : n }).then(function () { $("rate").querySelectorAll("img").forEach(function (im, i) { var f = (A.rating || 0) > i ? 1 : 0; im.dataset.moon = [f, 1, 11, dark() ? 1 : 0].join("|"); im.src = moonUrl(f, true, 11, dark()); }); }); }; });
  }
  function tools(pr, edited) {
    var a = A, t = "";
    if (pr) t += '<span class="seg" id="seg">' + [["zh", "中文"], ["both", "对照"], ["src", "原文"]].map(function (m) { return '<button type="button" data-m="' + m[0] + '"' + (mode === m[0] ? ' class="on"' : "") + ">" + m[1] + "</button>"; }).join("") + "</span>";
    t += '<button type="button" class="tb" id="size" title="字的大小">' + ico("size") + '<span>字号</span></button><button type="button" class="tb' + (a.favorite ? " on" : "") + '" id="keep">' + ico("keep") + "<span>" + (a.favorite ? "留着了" : "留着") + "</span></button>" +
      '<button type="button" class="tb" id="orig">' + ico("out") + '<span>原文</span></button><button type="button" class="tb go" id="talk"><i class="sw"></i><span>拿去聊</span></button>';
    $("tools").innerHTML = t;
    if (edited && $("edn")) $("edn").onclick = function () { flush(); rawView = !rawView; renderArticle(); (wide() ? $("ar") : document.scrollingElement).scrollTop = 0; };   // the edited transcript, or the subtitles as they came
    if (pr) $("seg").querySelectorAll("button").forEach(function (b) { b.onclick = function () { var keepAt = cur.blockId; mode = b.dataset.m; ls("read_lang", mode); renderArticle(); var el = keepAt && document.getElementById("b-" + keepAt); if (el) el.scrollIntoView({ block: "start" }); }; });
    $("size").onclick = function () { var n = (+(ls("read_size") || 1) + 1) % 3; ls("read_size", String(n)); sheet.dataset.size = n; };
    $("keep").onclick = function () { state({ favorite: !A.favorite }).then(function () { $("keep").classList.toggle("on", !!A.favorite); $("keep").querySelector("span").textContent = A.favorite ? "留着了" : "留着"; spineFoot(); }); };
    $("orig").onclick = function () {
      if (a.sourceId !== "qbitai-xhs") { var u = safeUrl(a.url); if (u) window.open(u, "_blank", "noopener"); return; }
      toast("在找原帖……"); var w = window.open("", "_blank");
      api("articles/" + a.id + "/original/resolve", { method: "POST", body: {} }).then(function (d) { var u = safeUrl(d.url); if (w && u) w.location.href = u; else if (u) location.href = u; }).catch(function (e) { if (w) w.close(); toast(e.message || "原帖没找到"); });
    };
    $("talk").onclick = function () {
      ask.confirm("把这一篇递给 " + (C.aiName || "Claude") + "，一起读？", { body: "会在聊天里发一条：题目、导读，和取全文的办法。", ok: "递过去", cancel: "先不" }).then(function (yes) {
        if (!yes) return;
        var text = "一起读这篇：《" + (a.translation && a.translation.status === "ready" && a.translation.title ? a.translation.title : a.title) + "》\n" + shortSource(a.sourceName) + " · " + (zhDate(a.publishedAt || a.fetchedAt) || "") +
          (a.summary ? "\n导读：" + a.summary : "") + "\n（全文：read-article " + a.id + "）";
        api("/app/cc/say", { method: "POST", body: { text: text }, house: true }).then(function () { flush(true); location.href = "index.html#chat"; }).catch(function () { toast("没递过去"); });
      });
    };
  }
  /* the piece's own headings down the side: beads on a line; the one being read is filled */
  function toc() {
    var el = $("toc");
    if (heads.length < 3) { el.innerHTML = ""; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "<h4>这一篇</h4><ol>" + heads.map(function (h) { return '<li class="l' + h.level + '"><a href="#" data-b="' + esc(h.id) + '">' + esc(h.text) + "</a></li>"; }).join("") + "</ol>";
    el.querySelectorAll("a").forEach(function (l) { l.onclick = function (e) { e.preventDefault(); var b = document.getElementById("b-" + l.dataset.b); if (b) b.scrollIntoView({ block: "start", behavior: "smooth" }); }; });
  }
  function state(patch) {
    return api("articles/" + A.id + "/state", { method: "PATCH", body: patch }).then(function (s) { for (var k in s) A[k] = s[k]; return s; }).catch(function (e) { toast(e.message || "没记下"); throw e; });
  }
  /* where the reading has got to: the block at the top of the sheet, and how far down it */
  function place() {
    if (!A || $("reading").hidden) return;
    var body = $("body"); if (!body) return;
    var box = $("ar"), W = wide(), top = (W ? box.getBoundingClientRect().top : 0) + $("ah").offsetHeight + 14, kids = body.children, i, here = null, head = null;
    for (i = 0; i < kids.length; i++) { var r = kids[i].getBoundingClientRect(); if (r.height && r.bottom > top) { here = kids[i].dataset.id; break; } }
    for (i = 0; i < heads.length; i++) { var he = document.getElementById("b-" + heads[i].id); if (he && he.getBoundingClientRect().top <= top + 40) head = heads[i].id; }
    var max = W ? Math.max(1, box.scrollHeight - box.clientHeight) : Math.max(1, document.documentElement.scrollHeight - window.innerHeight), p = Math.max(0, Math.min(1, (W ? box.scrollTop : window.scrollY) / max));
    cur = { blockId: here, progress: Math.round(p * 1000) / 1000 };
    $("prog").textContent = Math.round(p * 100) + "%"; $("ah").style.setProperty("--p", (p * 100).toFixed(1) + "%");
    $("toc").querySelectorAll("a").forEach(function (l) { l.classList.toggle("on", l.dataset.b === head); });
    clearTimeout(saveT); saveT = setTimeout(flush, 3500);
  }
  function flush(keep) {
    clearTimeout(saveT);
    if (!A || rawView || !A.hasReadableBody || !cur.blockId || (cur.blockId === saved.blockId && Math.abs(cur.progress - saved.progress) < .01)) return;
    if (A.completed && cur.progress < A.progress) return;   // a finished piece is not un-read by scrolling back up
    saved = { blockId: cur.blockId, progress: cur.progress };
    api("articles/" + A.id + "/state", { method: "PATCH", body: saved, keep: keep === true }).then(function (s) { if (A) for (var k in s) A[k] = s[k]; }).catch(function () {});
  }
  function piled(open) {   // the pile beside the piece, or the piece alone
    $("reading").classList.toggle("piled", open); $("pileb").classList.toggle("on", open); $("pileb").setAttribute("aria-pressed", open ? "true" : "false");
    if (open) { var on = $("rail").querySelector("a.on"); if (on) on.scrollIntoView({ block: "center" }); }
  }
  function at(d) { if (!A) return null; for (var i = 0; i < ctx.length; i++) if (ctx[i].id === A.id) return ctx[i + d] ? ctx[i + d].id : null; return null; }
  function step(d) { var id = at(d); if (!id) return; history.replaceState(null, "", "#a/" + id); route(); }
  function rail(id) {
    var el = $("rail");
    if (el.dataset.n !== String(ctx.length) || !el.firstChild) {
      el.innerHTML = '<h4><span>这一叠</span><i>' + ctx.length + "</i></h4>" + ctx.map(function (c) { return '<a href="#a/' + esc(c.id) + '" data-id="' + esc(c.id) + '"' + (c.read === false ? ' class="new"' : "") + ">" + sealImg(c.sourceId) + "<span><b>" + esc(c.title) + "</b><small>" + c.meta + "</small></span></a>"; }).join("");
      el.dataset.n = String(ctx.length); $("pilen").textContent = ctx.length || "";
      el.querySelectorAll("a").forEach(function (l) { l.onclick = function (e) { e.preventDefault(); if (A && A.id === l.dataset.id) return; history.replaceState(null, "", "#a/" + l.dataset.id); route(); }; });
    }
    el.querySelectorAll("a").forEach(function (l) { var on = l.dataset.id === id; l.classList.toggle("on", on); if (on && l.scrollIntoView) l.scrollIntoView({ block: "nearest" }); });
  }
  function openArticle(id) {
    flush(true);
    if ($("reading").hidden) { listY = wide() ? $("browse").scrollTop : window.scrollY; $("browse").hidden = true; $("reading").hidden = false; root.classList.add("is-reading"); $("rail").dataset.n = ""; }
    rail(id);
    figuresGone(); $("tools").innerHTML = ""; $("prog").textContent = ""; $("ah").style.setProperty("--p", "0%"); $("toc").innerHTML = ""; sheet.innerHTML = WAIT; $("ar").scrollTop = 0; if (!wide()) window.scrollTo(0, 0);
    A = null; saved = { blockId: null, progress: -1 }; cur = { blockId: null, progress: 0 };
    api("articles/" + encodeURIComponent(id)).then(function (a) {
      if ((location.hash || "").slice(3) !== id) return;   // another piece was asked for meanwhile
      A = a; rawView = false; saved = { blockId: a.blockId, progress: a.progress || 0 }; mode = mode === "src" ? "src0" : mode; renderArticle();
      $("prev").disabled = at(-1) == null; $("next").disabled = at(1) == null;
      if (a.hasReadableBody && !a.read) api("articles/" + a.id + "/open", { method: "POST", body: {} }).then(function (s) { if (A && A.id === a.id) for (var k in s) A[k] = s[k]; remember(a.id, s); }).catch(function () {});
    }).catch(function (e) { sheet.innerHTML = trouble(e); });
  }
  function remember(id, s) {
    var c = byId[id], k; if (c) for (k in s) c[k] = s[k];
    for (var i = 0; i < ctx.length; i++) if (ctx[i].id === id && s.read != null) ctx[i].read = s.read;
    var l = $("rail").querySelector('a[data-id="' + id + '"]'); if (l && s.read) l.classList.remove("new");
  }
  function closeArticle() {
    flush(true);
    var a = A; $("reading").hidden = true; $("browse").hidden = false; root.classList.remove("is-reading"); sheet.innerHTML = ""; figuresGone();
    if (a) { var c = byId[a.id]; if (c) { ["read", "favorite", "completed", "progress", "blockId", "rating"].forEach(function (k) { c[k] = a[k]; }); strike(c); } }
    A = null; if (wide()) $("browse").scrollTop = listY; else window.scrollTo(0, listY);
    stick();
  }
  $("ar").addEventListener("scroll", place, { passive: true });
  window.addEventListener("scroll", function () { if (!wide()) place(); }, { passive: true });
  window.addEventListener("pagehide", function () { flush(true); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) flush(true); });

  /* ── which page is open ── */
  var shown = null;
  function route() {
    var h = (location.hash || "#today").slice(1), m = h.match(/^a\/([A-Za-z0-9_-]{1,128})$/);
    if (m) { if (!shown) { shown = "shelf"; dialSet("shelf", undefined, true); viewShelf(); } openArticle(m[1]); return; }
    if (!$("reading").hidden) closeArticle();
    var d = h.match(/^today\/(\d{4}-\d{2}-\d{2})$/), v = d ? "today" : (h === "shelf" || h === "kept") ? h : "today", id = v + (d ? "/" + d[1] : "");
    if (shown === id) return;
    shown = id; dialSet(v, v === "today" ? (d ? d[1] : null) : undefined);
    if (v === "today") viewToday(d && d[1]); else if (v === "shelf") viewShelf(); else viewKept();
  }
  window.addEventListener("hashchange", route);
  $("back").onclick = function () { location.href = "./"; };
  $("aback").onclick = function () { if (history.length > 1 && shown) history.back(); else location.hash = "#shelf"; };
  $("prev").onclick = function () { step(-1); }; $("next").onclick = function () { step(1); };
  $("pileb").onclick = function () { var o = !$("reading").classList.contains("piled"); ls("read_pile", o ? "1" : "0"); piled(o); };
  piled(ls("read_pile") === "1");
  document.addEventListener("keydown", function (e) {
    if (document.querySelector(".nyxask") || e.metaKey || e.ctrlKey || e.altKey) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "");
    if (!$("reading").hidden) {
      if (e.key === "Escape") $("aback").click();
      else if (!typing && (e.key === "j" || e.key === "ArrowRight")) step(1);
      else if (!typing && (e.key === "k" || e.key === "ArrowLeft")) step(-1);
    } else if (!typing && e.key === "/" && $("q")) { e.preventDefault(); $("q").focus(); }
    else if (typing && e.key === "Escape") e.target.blur();
  });
  /* the spine's edge goes off into grain, as the band does on the home: a strip of specks, thick at the spine and thinning
     away — to the right of the spine on a wide screen, under the band on a phone */
  function edge() {
    var W = 46, H = 420, r = G ? G.rng(77) : Math.random, ink = getComputedStyle(root).getPropertyValue("--ink").trim() || "#1B1B20";
    [["--edge", W, H, 0], ["--edgeh", H, 34, 1]].forEach(function (e) {
      var cx = sheetOf(e[1], e[2]), x = cx[1], n = e[3] ? 1250 : 1500, i; x.fillStyle = ink;
      for (i = 0; i < n; i++) { var u = r(), far = Math.pow(u, 2.6), s = .45 + r() * (1.15 - u * .6), along = r(); x.globalAlpha = .55 + r() * .45; if (e[3]) x.fillRect(along * e[1], far * e[2], s, s); else x.fillRect(far * e[1], along * e[2], s, s); }
      $("rdx").style.setProperty(e[0], 'url("' + cx[0].toDataURL("image/png") + '")');
    });
  }
  if (G) edge();
  $("spDate").textContent = latinDay(today());
  dialBuild(); instrument(); hands(); route(); setTimeout(spineFoot, 1200);
  setTimeout(function () { if (!cal.dates.length) api("briefs").then(function (b) { if (!cal.dates.length) { cal.dates = b.dates || []; dialBuild(); } }).catch(function () {}); }, 1500);   // the days before, when the page did not open on Today
})();
