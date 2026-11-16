/* Nyx — Plan (日程). What is to be done, day by day, in the house's own hand.
   The entries are kept by the relay (relay/nyx_plan.py, /app/plan). They get here two ways: the companion writes down
   what its human says in the chat (relay/plan.py), and the human writes on this page.
   The head of the page is a band — the sky of the days: every day's moon, lit as it is that night, riding one dotted
   track (a tick where a day meets the next, a small cross where a week begins); two fainter tracks of stars go by
   behind, more slowly. Take hold of the band and pull, and the days go by; let go and it comes to rest on a day.
   A wide screen lays a week open under it: a column a day under its own moon, today first; beside them a line to write
   on and what has no column (what is overdue, what has no day yet, what lies further on, what is done). A thing is
   moved to another day by carrying it there. A phone shows one day at a time: the moon in the middle of the band is the
   day that is open; the page is turned sideways, or a moon is touched.
   A thing to do is ticked with a moon (eye/moon.webp): faint until it is done, then full. */
(function () {
  "use strict";
  var C = window.NYX || {}, RELAY = C.relay || "/relay", root = document.documentElement, AI = C.aiName || "AI", ME = C.meName || "Me";
  var $ = function (id) { return document.getElementById(id); };
  var key = null; try { key = localStorage.getItem("nyx_key"); } catch (e) {}
  if (!key) { location.replace("./"); return; }
  if (window.NyxPaper) window.NyxPaper.paint();
  var ask = window.NyxAsk, G = window.Gou, toastT = 0, TAU = Math.PI * 2;
  var WIDE = window.matchMedia("(min-width:1100px)"), wide = function () { return WIDE.matches; };

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t) { var el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("on"); }, 2600); }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function lim(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dark() { return root.dataset.side === "moon"; }
  function api(path, body) {
    var q = { method: body ? "POST" : "GET", headers: { "Authorization": "Bearer " + key }, cache: "no-store" };
    if (body) { q.headers["Content-Type"] = "application/json"; q.body = JSON.stringify(body); }
    return fetch(RELAY + "/app/plan" + path, q).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) location.replace("./");
        if (!r.ok) { var e = new Error((typeof d.detail === "string" && d.detail) || String(r.status)); e.status = r.status; throw e; }
        return d;
      });
    });
  }

  /* ── days: counted from 1970, on this device's own calendar ── */
  var WDZ = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"], WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], MZ = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  function dayIdx(s) { var p = String(s).split("-"); return Math.round(Date.UTC(+p[0], p[1] - 1, +p[2]) / 864e5); }
  function idxDay(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function dOf(n) { return new Date(n * 864e5); }   // read it with getUTC…
  function todayIdx() { var d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  var T = todayIdx();
  function rel(n) { var k = n - T; return k === 0 ? "今天" : k === 1 ? "明天" : k === 2 ? "后天" : k === -1 ? "昨天" : k === -2 ? "前天" : ""; }
  function zhDay(n) { var d = dOf(n); return (d.getUTCFullYear() !== dOf(T).getUTCFullYear() ? d.getUTCFullYear() + "年" : "") + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日"; }
  function dayWords(n) { return zhDay(n) + " " + (rel(n) || WDZ[dOf(n).getUTCDay()]); }

  /* ── the pencil ── */
  function sheetOf(w, h) { var S = 3, c = document.createElement("canvas"); c.width = w * S; c.height = h * S; var x = c.getContext("2d"); x.scale(S, S); return [c, x]; }
  /* the moon: one hand-drawn study of the full moon (eye/moon.webp), and for any night the part of it that is lit; what
     is in shadow is the same drawing, faint (ghost: how faint). lit 0…1; waxing: lit on the right. (As on Read.) */
  var moonSprite = new Image(), moonOk = false, drawn = {}, BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  moonSprite.onload = function () { moonOk = true; document.querySelectorAll("img[data-moon]").forEach(function (im) { var q = im.dataset.moon.split("|"); im.src = moonUrl(+q[0], q[1] === "1", +q[2], q[3] === "1", +q[4]); });
    document.querySelectorAll("img[data-tick]").forEach(function (im) { im.src = tickUrl(im.dataset.tick === "1"); }); };
  moonSprite.src = "eye/moon.webp";
  function moonUrl(lit, waxing, R, onDark, ghost) {
    if (!moonOk) return BLANK;
    var q = Math.round(lim(lit, 0, 1) * 24) / 24, k = [q, waxing ? "w" : "n", R, onDark ? 1 : 0, ghost].join("|"); if (drawn[k]) return drawn[k];
    var W = Math.ceil(R * 2 + 4), cx = sheetOf(W, W), x = cx[1], whole = function () { x.drawImage(moonSprite, -R, -R, R * 2, R * 2); };
    x.translate(W / 2, W / 2); x.imageSmoothingQuality = "high";
    if (q < .98) { x.save(); x.globalAlpha = ghost || (onDark ? .14 : .3); whole(); x.restore(); }
    if (q > .02) {
      x.save(); x.rotate(-.3); if (!waxing) x.scale(-1, 1);
      x.beginPath();
      if (q >= .98) x.arc(0, 0, R + 2, 0, TAU);
      else { x.arc(0, 0, R + 2, -Math.PI / 2, Math.PI / 2, false); x.ellipse(0, 0, Math.max(.01, R * Math.abs(1 - 2 * q)), R + 2, 0, Math.PI / 2, -Math.PI / 2, q < .5); }
      x.closePath(); x.clip();
      if (!waxing) x.scale(-1, 1); x.rotate(.3); whole(); if (R < 12 && !onDark) whole(); x.restore();   // a very small moon on paper is gone over twice, or it is only a smudge
    }
    return (drawn[k] = cx[0].toDataURL("image/png"));
  }
  function moonTag(lit, waxing, R, onDark, size, ghost) { ghost = ghost || 0; return '<img alt="" width="' + size + '" height="' + size + '" draggable="false" data-moon="' + [lit, waxing ? 1 : 0, R, onDark ? 1 : 0, ghost].join("|") + '" src="' + moonUrl(lit, waxing, R, onDark, ghost) + '">'; }
  function skyOf(n) { var d = new Date(n * 864e5 + 432e5); return G && G.moonAge ? { lit: G.moonLit(d), wax: G.moonAge(d) < 14.765 } : { lit: 1, wax: true }; }   // the moon that night
  /* the tick of a thing to do: a ring — the moon's own uneven edge, kept as where the pencil went — with the moon faint
     inside it; done, the moon is there whole, gone over in blue pencil */
  function tickUrl(done) {
    var night = dark(), k = "tick" + (done ? 1 : 0) + (night ? 1 : 0); if (drawn[k]) return drawn[k]; if (!moonOk) return BLANK;
    var W = 24, R = 10.6, cx = sheetOf(W, W), x = cx[1], rg = sheetOf(W, W), r = rg[1], blue = night ? "#8C95FF" : "#2933C4", cut = R - 1.45;
    var put = function (c, q) { c.drawImage(moonSprite, -q, -q, q * 2, q * 2); };
    r.translate(W / 2, W / 2); r.imageSmoothingQuality = "high"; put(r, R); r.globalCompositeOperation = "destination-out"; put(r, cut);
    r.globalCompositeOperation = "source-in"; r.fillStyle = done ? blue : night ? "rgba(236,233,226,.7)" : "rgba(27,27,32,.6)"; r.fillRect(-W, -W, W * 2, W * 2);
    x.translate(W / 2, W / 2); x.imageSmoothingQuality = "high";
    if (done) { put(x, R); put(x, R); x.globalCompositeOperation = "source-atop"; x.globalAlpha = night ? .3 : .4; x.fillStyle = blue; x.fillRect(-W, -W, W * 2, W * 2); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; }
    else { x.globalAlpha = night ? .13 : .2; put(x, cut); x.globalAlpha = 1; }
    x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(rg[0], 0, 0);
    return (drawn[k] = cx[0].toDataURL("image/png"));
  }
  function tick(done) { return '<img alt="" width="24" height="24" draggable="false" data-tick="' + (done ? 1 : 0) + '" src="' + tickUrl(done) + '">'; }
  /* the swallow, as the home draws it (eye/birds.js): one instant of the wingbeat as a mask for small marks (--sw) */
  function swallowMask(hour) {
    var P = G && G.BIRDPTS && (G.BIRDPTS[hour] || G.BIRDPTS[11]); if (!P) return "";
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, d = "", i;
    for (i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); d += (i ? "L" : "M") + P[i].toFixed(3) + " " + P[i + 1].toFixed(3); }
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x0, y0, x1 - x0, y1 - y0].map(function (v) { return v.toFixed(3); }).join(" ") + '"><path d="' + d + 'Z"/></svg>') + '")';
  }
  if (G && G.BIRDPTS) root.style.setProperty("--sw", swallowMask(11));
  /* the band's foot goes off into grain, as the band does on the home */
  function edge() {
    var W = 420, H = 34, r = G ? G.rng(77) : Math.random, cx = sheetOf(W, H), x = cx[1], i;
    x.fillStyle = getComputedStyle(root).getPropertyValue("--ink").trim() || "#1B1B20";
    for (i = 0; i < 1250; i++) { var u = r(), far = Math.pow(u, 2.6), s = .45 + r() * (1.15 - u * .6), along = r(); x.globalAlpha = .55 + r() * .45; x.fillRect(along * W, far * H, s, s); }
    $("plx").style.setProperty("--edgeh", 'url("' + cx[0].toDataURL("image/png") + '")');
  }

  /* ── a line as it is written: "周五 15:00 交报告" → the day, the hour, the thing. Only what stands at its head is
     read as a day or an hour; "…前" after either makes it a last day. With `fixed` (written into a day's own column)
     no day is looked for. ── */
  var HAN7 = "一二三四五六日";
  function dayFromWord(w) {
    var m, d, t = dOf(T), wd = (t.getUTCDay() + 6) % 7;   // Monday 0
    if (w === "今天" || w === "今晚") return T; if (w === "明天" || w === "明晚") return T + 1; if (w === "后天") return T + 2; if (w === "大后天") return T + 3;
    if ((m = w.match(/^(下?)(?:周|星期|礼拜)([一二三四五六日天])$/))) { d = HAN7.indexOf(m[2] === "天" ? "日" : m[2]); return m[1] ? T - wd + 7 + d : T + ((d - wd) % 7 + 7) % 7; }
    if ((m = w.match(/^(?:(\d{4})[-年])?(\d{1,2})[-月\/](\d{1,2})[日号]?$/))) {
      var y = +(m[1] || t.getUTCFullYear()), n = Math.round(Date.UTC(y, m[2] - 1, +m[3]) / 864e5), back = dOf(n);
      if (back.getUTCMonth() !== m[2] - 1 || back.getUTCDate() !== +m[3]) return null;
      if (!m[1] && T - n > 180) n = Math.round(Date.UTC(y + 1, m[2] - 1, +m[3]) / 864e5);   // "1月5日", said in December, is next January's
      return n;
    }
    return null;
  }
  var TIME_RE = /^(上午|早上|中午|下午|晚上)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:(半)|(\d{1,2})分?)?)/;
  function timeAt(s, pm) {   // an hour at the head of s → [HH:MM, how much of s it took], or null
    var m = s.match(TIME_RE); if (!m) return null;
    var h = +m[2], mi = m[3] ? +m[3] : m[4] ? 30 : m[5] ? +m[5] : 0;
    if ((pm || /下午|晚上/.test(m[1] || "")) && h < 12) h += 12; if (m[1] === "中午" && h < 11) h += 12;
    return h < 24 && mi < 60 ? [two(h) + ":" + two(mi), m[0].length] : null;
  }
  function readTime(s) {   // the hour as typed on the slip: 15:30, 1530, 15, 下午3点半 → HH:MM; "" for none; null if it can't be read
    s = s.trim(); if (!s) return "";
    var m = s.match(/^(\d{1,2})[:：.](\d{2})$/) || s.match(/^(\d{2})(\d{2})$/) || s.match(/^(\d{1,2})()$/), t;
    if (m) return +m[1] < 24 && +(m[2] || 0) < 60 ? two(+m[1]) + ":" + two(+(m[2] || 0)) : null;
    t = timeAt(s); return t && t[1] === s.length ? t[0] : null;
  }
  function parseLine(s, fixed) {
    var all = s.trim(), rest = all, out = { title: all, date: null, time: "", due: false }, m, d, t, pm = false, SEP = /^\s*(之前|以前|前)?[\s,，、]*/;
    if (!fixed && (m = rest.match(/^(今天|今晚|明天|明晚|后天|大后天|下?(?:周|星期|礼拜)[一二三四五六日天]|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}[日号]?|\d{1,2}\/\d{1,2}(?![\d\/]))/)) && (d = dayFromWord(m[1])) != null) {
      out.date = d; pm = /晚$/.test(m[1]); rest = rest.slice(m[0].length); m = rest.match(SEP); if (m[1]) out.due = true; rest = rest.slice(m[0].length);
    }
    if ((t = timeAt(rest, pm))) { out.time = t[0]; rest = rest.slice(t[1]); m = rest.match(SEP); if (m[1]) out.due = true; rest = rest.slice(m[0].length); }
    if (!rest.trim()) return { title: all, date: null, time: "", due: false };   // nothing was left to do: it was not a day and an hour after all
    if (out.time && out.date == null && !fixed) out.date = T;   // an hour and no day: today
    out.title = rest.trim(); return out;
  }

  /* ── what is written down ── */
  var items = [], rev = -1, byDay = {}, loaded = false, busy = 0, seq = 0, showDone = false;
  function find(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
  function order(a, b) { var x = a.time || "99:99", y = b.time || "99:99"; return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (x < y ? -1 : x > y ? 1 : 0) || a.no - b.no; }
  function index() { byDay = {}; items.forEach(function (it) { if (it.date) (byDay[it.date] = byDay[it.date] || []).push(it); }); for (var k in byDay) byDay[k].sort(order); }
  function take(d) { if (!d || d.same || !d.items) return false; rev = d.rev; items = d.items; index(); return true; }
  function load() {
    if (busy) return Promise.resolve();
    return api("?rev=" + rev).then(function (d) {
      if (busy) return;
      var t = todayIdx(), turned = t !== T; T = t;
      if (turned) { take(d); rebuild(); } else if (take(d)) paintAll();
    });
  }
  function wrote(r) { busy--; if (r === rev + 1) rev = r; else if (!busy) setTimeout(function () { load().catch(function () {}); }, 60); }   // someone else wrote in between: read it all again
  function add(o) {
    var tmp = { id: "tmp" + (++seq), no: 1e9 + seq, title: o.title, note: "", date: o.date || "", time: o.time || "", due: !!(o.due && o.date), done: false, by: ME };
    items.push(tmp); index(); paintAll(); busy++;
    return api("", { title: tmp.title, date: tmp.date, time: tmp.time, due: tmp.due, by: ME }).then(function (d) {
      var r = d.rev, k; delete d.rev; for (k in d) tmp[k] = d[k]; index(); paintAll(); wrote(r); return tmp;
    }, function (e) { busy--; var i = items.indexOf(tmp); if (i >= 0) items.splice(i, 1); index(); paintAll(); toast("没记上" + (e && e.status ? "（" + e.status + "）" : "") + "，再试一次"); });
  }
  function change(id, patch) {
    var it = find(id), was = {}, k; if (!it || /^tmp/.test(id)) return Promise.resolve();
    for (k in patch) { was[k] = it[k]; it[k] = patch[k]; }
    if (!it.date && it.due) { was.due = true; it.due = false; }
    index(); paintAll(); busy++;
    return api("/" + id, patch).then(function (d) { var r = d.rev; delete d.rev; for (k in d) it[k] = d[k]; index(); wrote(r); },
      function (e) { busy--; for (k in was) it[k] = was[k]; index(); paintAll(); toast("没改成" + (e && e.status ? "（" + e.status + "）" : "") + "，再试一次"); });
  }
  function remove(id) {
    var it = find(id), at = items.indexOf(it); if (!it) return;
    items.splice(at, 1); index(); paintAll(); busy++;
    api("/" + id, { delete: true }).then(function (d) { wrote(d.rev); }, function () { busy--; items.splice(at, 0, it); index(); paintAll(); toast("没删掉，再试一次"); });
  }

  /* ── the band and the days under it. `cur` is the day at the hand — the first column of a wide screen, the middle moon
     of a phone — and may lie between two days while the band is in the hand; `to` is where it is going. Only the days
     in sight are kept on the page. ── */
  var band = $("band"), heads = $("heads"), strip = $("strip"), cols = $("cols"), sky = $("sky"), skyX = sky.getContext("2d");
  var cur = T, to = T, geo = null, colEl = {}, headEl = {}, shownAt = null, raf = 0, hold = null, clickAt = 0, slip = null;
  var MORE = '<button type="button" class="more"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11"/></svg>写一件</button>';
  function measure() {
    var W = wide(), r = heads.getBoundingClientRect(), g = { wide: W, W: r.width, H: r.height, dpr: Math.min(window.devicePixelRatio || 1, 2) };
    if (W) { g.N = lim(Math.floor(g.W / 180), 4, 7); g.cw = g.W / g.N; g.hw = g.cw; g.r = 40; g.anchor = g.cw / 2; g.ax = g.W * .66; g.y0 = Math.round(g.H * .5); g.k = 46 / (g.ax * g.ax); }
    else { g.N = 1; g.cw = strip.getBoundingClientRect().width; g.hw = g.W / (g.W > 560 ? 9 : 7); g.r = 21; g.anchor = g.W / 2; g.ax = g.W / 2; g.y0 = 74; g.k = 24 / (g.ax * g.ax); }
    heads.style.setProperty("--hw", g.hw.toFixed(1) + "px"); cols.style.setProperty("--cw", g.cw.toFixed(2) + "px");
    sky.width = Math.round(g.W * g.dpr); sky.height = Math.round(g.H * g.dpr);
    var redo = !geo || geo.wide !== W; geo = g; return redo;
  }
  function arcY(x) { var d = x - geo.ax; return geo.y0 + geo.k * d * d; }   // the track the moons ride: highest a little right of the middle on a wide screen, in the middle on a phone
  function undone(it) { return !it.done; }

  function enHtml(it, withDay) {
    var n = it.date ? dayIdx(it.date) : null, late = !it.done && n != null && n < T, d = n != null ? dOf(n) : null;
    return '<li class="en' + (it.done ? " done" : "") + (late ? " late" : "") + '" data-id="' + esc(it.id) + '">' +
      '<button type="button" class="tk" aria-pressed="' + !!it.done + '" title="' + (it.done ? "还没做完" : "做完了") + '">' + tick(it.done) + "</button>" +
      '<div class="ex">' + (withDay && d ? '<span class="dy" data-i="' + n + '" title="去那一天">' + (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "<small>" + (rel(n) || WDZ[d.getUTCDay()]) + "</small></span>" : "") +
      (it.time ? '<span class="tm">' + esc(it.time) + "</span>" : "") + (it.due ? "<u>截止</u>" : "") + '<span class="tt">' + esc(it.title) + "</span>" + (it.note ? '<p class="nt">' + esc(it.note) + "</p>" : "") + "</div></li>";
  }
  function makeCol(i) {
    var el = document.createElement("section"); el.dataset.i = i; el.dataset.d = idxDay(i);
    el.innerHTML = '<h3></h3><ul class="ens"></ul><p class="free" hidden>空着</p><div class="add">' + MORE + "</div>";
    cols.appendChild(el); colEl[i] = el; paintCol(i); return el;
  }
  function paintCol(i) {
    var el = colEl[i]; if (!el) return;
    var d = dOf(i), wd = d.getUTCDay(), list = byDay[idxDay(i)] || [], r = rel(i);
    el.className = "col" + (i === T ? " today" : i < T ? " past" : "") + (wd === 0 || wd === 6 ? " we" : "");
    el.children[0].innerHTML = esc(r || WDZ[wd]) + "<i>" + d.getUTCDate() + " " + MONTH[d.getUTCMonth()] + "</i>" + (r ? "<em>" + WDZ[wd] + "</em>" : "");
    el.children[1].innerHTML = list.map(function (it) { return enHtml(it); }).join("");
    el.children[2].hidden = !loaded || list.length > 0;
  }
  function makeHead(i) {
    var el = document.createElement("div"), k = skyOf(i), d = dOf(i);
    el.setAttribute("role", "button"); el.dataset.i = i; el.title = zhDay(i) + " " + WDZ[d.getUTCDay()];
    el.innerHTML = '<span class="mw">' + moonTag(k.lit, k.wax, geo.r, !dark(), geo.r * 2, dark() ? .16 : 0) + (i === T ? '<i class="sw"></i>' : "") + '</span><span class="dt"><b>' + d.getUTCDate() + "</b><em></em><u></u></span>";
    el._mw = el.firstChild; heads.appendChild(el); headEl[i] = el; paintHead(i); return el;
  }
  function paintHead(i) {
    var el = headEl[i]; if (!el) return;
    var wd = dOf(i).getUTCDay(), n = (byDay[idxDay(i)] || []).filter(undone).length;
    el.className = "hd" + (i === T ? " today" : "") + (wd === 0 || wd === 6 ? " we" : "") + (!geo.wide && Math.round(cur) === i ? " on" : "");
    el.querySelector("em").textContent = i === T ? "今天" : WDZ[wd];
    el.querySelector("u").innerHTML = new Array(Math.min(4, n) + 1).join("<s></s>");
  }

  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function star(x, px, py, k, col) { x.fillStyle = col; x.beginPath(); x.moveTo(px, py - k); x.quadraticCurveTo(px, py, px + k, py); x.quadraticCurveTo(px, py, px, py + k); x.quadraticCurveTo(px, py, px - k, py); x.quadraticCurveTo(px, py, px, py - k); x.fill(); }
  function drawSky() {
    var g = geo, x = skyX, k = g.dpr; if (!g.W) return;
    x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, g.W, g.H);
    var chalk = !dark(), ink = chalk ? "236,233,226" : "27,27,32", blue = chalk ? "140,149,255" : "41,51,196";
    var n = Math.max(4, Math.round(g.hw / 9.5)), step = g.hw / n, u0 = cur * g.hw - (g.anchor - g.hw / 2), j, px, py, L = g.wide ? 6 : 4, a;
    // the track the moons ride: dotted by hand; a tick where one day meets the next; where a week begins, a small cross
    for (j = Math.floor(u0 / step) - 1; (px = j * step - u0) < g.W + 6; j++) {
      py = arcY(px);
      if (((j % n) + n) % n === 0) {
        var mon = dOf(Math.round(j / n)).getUTCDay() === 1;
        x.strokeStyle = "rgba(" + ink + "," + (mon ? .82 : .5) + ")"; x.lineWidth = 1; x.lineCap = "round";
        x.beginPath(); x.moveTo(px + (hash(j) - .5) * 1.6, py - L); x.lineTo(px + (hash(j + 5) - .5) * 1.6, py + L); x.stroke();
        if (mon) { x.beginPath(); x.moveTo(px - L, py + (hash(j + 9) - .5) * 1.4); x.lineTo(px + L, py + (hash(j + 3) - .5) * 1.4); x.stroke(); }
        continue;
      }
      x.fillStyle = "rgba(" + ink + "," + (.28 + .42 * hash(j)).toFixed(2) + ")"; x.beginPath(); x.arc(px, py + (hash(j + 13) - .5) * 1.3, .6 + .6 * hash(j + 71), 0, TAU); x.fill();
    }
    // two tracks further out, going by more slowly (the stars are far off): broken lines of dots, a star now and then
    [[.5, g.r * 1.4 + 30, .2], [.26, g.r * 1.4 + (g.wide ? 68 : 52), .14]].forEach(function (tr, ti) {
      var sp = g.wide ? 13 : 10, w0 = cur * g.hw * tr[0] + ti * 37, h;
      for (j = Math.floor(w0 / sp) - 1; (px = j * sp - w0) < g.W + 6; j++) {
        h = hash(j * 3.7 + ti * 101); py = arcY(px) - tr[1];
        if (h > .62 || py < -6) continue;
        if (h < .03) { star(x, px, py, g.wide ? 4.5 : 3.5, "rgba(" + (hash(j) < .5 ? blue : ink) + ",.78)"); continue; }
        a = tr[2] + .18 * hash(j + 1); x.fillStyle = "rgba(" + ink + "," + a.toFixed(2) + ")"; x.beginPath(); x.arc(px, py, .55 + .5 * hash(j + 2), 0, TAU); x.fill();
      }
    });
  }

  function lay() {
    var g = geo, c = cur, i, el, a = Math.floor(c) - 1, b = Math.floor(c) + g.N + 1, x, s;
    for (i in colEl) if (+i < a || +i > b) { colEl[i].remove(); delete colEl[i]; }
    for (i = a; i <= b; i++) { el = colEl[i] || makeCol(i); el.style.transform = "translate3d(" + ((i - c) * g.cw).toFixed(2) + "px,0,0)"; }
    var span = g.wide ? 0 : Math.ceil(g.W / g.hw / 2) + 1; a = Math.floor(c) - (g.wide ? 1 : span); b = Math.floor(c) + (g.wide ? g.N + 1 : span);
    for (i in headEl) if (+i < a || +i > b) { headEl[i].remove(); delete headEl[i]; }
    for (i = a; i <= b; i++) {
      el = headEl[i] || makeHead(i); x = g.anchor + (i - c) * g.hw; s = g.wide ? (i === T ? 1 : .7) : 1 - .38 * Math.min(1, Math.abs(i - c));
      el.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
      el._mw.style.transform = "translate3d(0," + (arcY(x) - 2 * g.r + 2).toFixed(2) + "px,0) scale(" + s.toFixed(3) + ")";
      if (!g.wide) el.classList.toggle("on", Math.round(c) === i);
    }
    drawSky();
    var at = Math.round(c);
    if (at !== shownAt) {   // the month the hand is in
      shownAt = at; var d = dOf(at);
      $("bMonth").innerHTML = MONTH[d.getUTCMonth()] + " " + d.getUTCFullYear() + "<i>" + MZ[d.getUTCMonth()] + "月</i>";
      $("goToday").classList.toggle("here", at === T);
    }
  }
  function fit() { if (geo.wide) { strip.style.height = ""; return; } var el = colEl[Math.round(cur)]; if (el) strip.style.height = Math.max(260, el.offsetHeight) + "px"; }   // a phone's page is as tall as the day that is open
  function rest() { paintSide(); fit(); strip.style.setProperty("--fly", lim(cur - T, -30, 30).toFixed(1)); }
  function frame() {
    raf = 0;
    if (hold && hold.pan) { lay(); return; }
    var d = to - cur; cur = Math.abs(d) < .003 ? to : cur + d * .17;
    lay(); if (cur !== to) kick(); else rest();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function go(i) { to = i; kick(); }
  function paintAll() { var i; for (i in colEl) paintCol(+i); for (i in headEl) paintHead(+i); paintSide(); fit(); }
  function rebuild() {   // the screen is another shape, or the day has turned: lay everything again
    var i; for (i in colEl) colEl[i].remove(); for (i in headEl) headEl[i].remove(); colEl = {}; headEl = {}; shownAt = null;
    measure(); $("bDate").textContent = WD[dOf(T).getUTCDay()] + " · " + dOf(T).getUTCDate() + " " + MON[dOf(T).getUTCMonth()] + " " + dOf(T).getUTCFullYear();
    lay(); rest();
  }

  /* ── beside the days ── */
  function sec(zh, en, more) { return '<h2 class="sec">' + zh + "<i>" + en + "</i>" + (more || "") + "</h2>"; }
  function box(name, inner) { return '<div class="bx" data-box="' + name + '">' + inner + "</div>"; }
  function list(a, withDay) { return '<ul class="ens">' + a.map(function (it) { return enHtml(it, withDay); }).join("") + "</ul>"; }
  function paintSide() {
    var today = idxDay(T), open = items.filter(undone), byDate = function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : order(a, b); };
    var late = open.filter(function (it) { return it.date && it.date < today; }).sort(byDate);
    var loose = open.filter(function (it) { return !it.date; }).sort(function (a, b) { return a.no - b.no; });
    var after = idxDay(Math.max(Math.round(to) + (geo.wide ? geo.N - 1 : 0), T - 1)), later = open.filter(function (it) { return it.date > after; }).sort(byDate);
    var done = items.filter(function (it) { return it.done; }).sort(function (a, b) { return (b.done_at || "") < (a.done_at || "") ? -1 : 1; }), h = "";
    if (loaded && !items.length) h += '<p class="empty">这里还空着。在聊天里跟 ' + esc(AI) + " 说一声要做的事，它会替你记到这里；也可以自己写在上面。</p>";
    if (late.length) h += sec("过了的", "Overdue") + box("late", list(late, true));
    h += sec("没定日子", "Someday") + box("loose", loose.length ? list(loose) : '<p class="none">想到要做、还没定哪天的，放在这里。' + (geo.wide ? "把它拖到某一天上，就定下来了。" : "") + "</p>");
    if (later.length) h += sec("往后", "Later") + box("later", list(later.slice(0, 12), true) + (later.length > 12 ? '<p class="none">后面还有 ' + (later.length - 12) + " 件。</p>" : ""));
    if (done.length) h += sec("做完的", "Done", '<button type="button" data-act="done">' + (showDone ? "收起" : done.length + " 件") + "</button>") + (showDone ? box("done", list(done.slice(0, 24), true)) : "");
    $("lists").innerHTML = h;
    $("foot").textContent = items.length ? "在聊天里说到要做的事，" + AI + " 会替你记在这里。" : "";
  }

  /* ── writing ── */
  var HINT = "可以这样写：周五 15:00 交报告";
  function words(p) { return (p.date != null ? dayWords(p.date) : "没定日子") + (p.time ? " " + p.time : "") + (p.due ? " 前" : ""); }
  $("jotHint").textContent = HINT;
  $("jotIn").addEventListener("input", function () { var v = this.value.trim(); if (!v) { $("jotHint").textContent = HINT; return; } var p = parseLine(v); $("jotHint").innerHTML = "→ <b>" + words(p) + "</b> · " + esc(p.title); });
  $("jot").addEventListener("submit", function (e) {
    e.preventDefault(); var inp = $("jotIn"), v = inp.value.trim(); if (!v) { inp.focus(); return; }
    var p = parseLine(v); add({ title: p.title, date: p.date != null ? idxDay(p.date) : "", time: p.time, due: p.due });
    inp.value = ""; $("jotHint").textContent = HINT; toast("记下了 · " + words(p));
  });
  function write(col) {   // a line to write on, in a day's own column
    var boxEl = col.querySelector(".add"); if (boxEl.querySelector(".wr")) { boxEl.querySelector("input").focus(); return; }
    boxEl.innerHTML = '<form class="wr" autocomplete="off"><input type="text" maxlength="200" placeholder="15:00 做什么" enterkeyhint="done" aria-label="在这一天写一件"><button type="submit">记下</button></form>';
    var f = boxEl.firstChild, inp = f.firstChild;
    function shut() { if (f.isConnected) { boxEl.innerHTML = MORE; fit(); } }
    f.addEventListener("submit", function (e) { e.preventDefault(); var v = inp.value.trim(); if (!v) { shut(); return; } var p = parseLine(v, true); add({ title: p.title, date: col.dataset.d, time: p.time, due: p.due }); inp.value = ""; inp.focus(); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); shut(); } });
    inp.addEventListener("blur", function () { setTimeout(function () { if (!inp.value.trim() && document.activeElement !== inp) shut(); }, 180); });
    inp.focus({ preventScroll: true }); fit();
  }

  /* ── a thing, opened: what it is, which day (a few near ones, or any from the month), the hour, a note ── */
  var CH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>', CHR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
  function openSlip(id) {
    var it = find(id); if (!it || /^tmp/.test(id) || slip) return;
    var st = { date: it.date || "", due: !!it.due }, el = document.createElement("div"), base = it.date ? dOf(dayIdx(it.date)) : dOf(T);
    st.y = base.getUTCFullYear(); st.m = base.getUTCMonth();
    el.className = "slipbg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = '<form class="slip" autocomplete="off"><input class="s-t" type="text" maxlength="200" aria-label="做什么">' +
      '<div class="s-row"><label>哪天</label><div><div class="chips"></div><div class="cal"></div></div></div>' +
      '<div class="s-row"><label>几点</label><div class="s-hr"><input class="s-h" type="text" maxlength="8" placeholder="15:30" aria-label="几点" autocapitalize="off"><button type="button" class="s-due">这天是最后期限</button></div></div>' +
      '<div class="s-row"><label>备注</label><textarea class="s-n" rows="2" maxlength="2000" aria-label="备注"></textarea></div>' +
      '<p class="s-by"></p><div class="a"><button type="button" class="del">删掉</button><i></i><button type="button" class="no">算了</button><button type="submit" class="ok">存好</button></div></form>';
    var f = el.firstChild, tIn = f.querySelector(".s-t"), hIn = f.querySelector(".s-h"), nIn = f.querySelector(".s-n"), wrote_ = Date.parse(it.ts || "");
    tIn.value = it.title; hIn.value = it.time || ""; nIn.value = it.note || "";
    f.querySelector(".s-by").textContent = (it.by ? it.by + " " : "") + (isFinite(wrote_) ? "记于 " + (new Date(wrote_).getMonth() + 1) + "月" + new Date(wrote_).getDate() + "日" : "") + (it.done ? " · 已经做完" : "");
    function days() {
      var wd = (dOf(T).getUTCDay() + 6) % 7, near = [["今天", T], ["明天", T + 1], ["后天", T + 2], ["下周一", T - wd + 7]];
      f.querySelector(".chips").innerHTML = near.map(function (c) { var d = idxDay(c[1]); return '<button type="button" data-d="' + d + '"' + (st.date === d ? ' class="on"' : "") + ">" + c[0] + "</button>"; }).join("") +
        '<button type="button" data-d=""' + (st.date ? "" : ' class="on"') + ">没定</button>";
      var first = Math.round(Date.UTC(st.y, st.m, 1) / 864e5), lead = (dOf(first).getUTCDay() + 6) % 7, n = new Date(Date.UTC(st.y, st.m + 1, 0)).getUTCDate(), rows = Math.ceil((lead + n) / 7), h = "", i, k, d;
      for (i = 0; i < rows * 7; i++) { k = first - lead + i; d = idxDay(k); h += '<button type="button" data-d="' + d + '" class="' + (k < first || k >= first + n ? "out " : "") + (k === T ? "now " : "") + (st.date === d ? "on " : "") + ((byDay[d] || []).some(undone) ? "has" : "") + '">' + dOf(k).getUTCDate() + "</button>"; }
      f.querySelector(".cal").innerHTML = '<div class="cal-h"><b>' + MONTH[st.m] + " " + st.y + "<i>" + MZ[st.m] + '月</i></b><button type="button" data-m="-1" aria-label="上个月">' + CH + '</button><button type="button" data-m="1" aria-label="下个月">' + CHR + "</button></div>" +
        '<div class="cal-g">' + "一二三四五六日".split("").map(function (c) { return "<span>" + c + "</span>"; }).join("") + h + "</div>";
      f.querySelector(".s-due").classList.toggle("on", st.due && !!st.date); f.querySelector(".s-due").hidden = !st.date;
    }
    function close() { el.remove(); slip = null; }
    function save() {
      var title = tIn.value.trim(), time = readTime(hIn.value), note = nIn.value.trim(), p = {}, due = st.due && !!st.date;
      if (!title) { tIn.focus(); return; }
      if (time == null) { hIn.classList.remove("bad"); void hIn.offsetWidth; hIn.classList.add("bad"); hIn.focus(); toast("钟点写成 15:30 这样"); return; }
      if (title !== it.title) p.title = title; if (st.date !== (it.date || "")) p.date = st.date; if (time !== (it.time || "")) p.time = time; if (due !== !!it.due) p.due = due; if (note !== (it.note || "")) p.note = note;
      close(); if (!Object.keys(p).length) return;
      change(it.id, p); if ("date" in p) toast(p.date ? "挪到了 " + dayWords(dayIdx(p.date)) : "放回「没定日子」了");
    }
    el.addEventListener("click", function (e) {
      var t = e.target, b;
      if (t === el || t.closest(".no")) { close(); return; }
      if (t.closest(".del")) { ask.confirm("删掉这一件？", { body: it.title, ok: "删掉", cancel: "留着", danger: true }).then(function (yes) { if (yes) { close(); remove(it.id); } }); return; }
      if ((b = t.closest("[data-m]"))) { st.m += +b.dataset.m; if (st.m < 0) { st.m = 11; st.y--; } else if (st.m > 11) { st.m = 0; st.y++; } days(); return; }
      if ((b = t.closest("[data-d]"))) { st.date = b.dataset.d; if (st.date) { var d = dOf(dayIdx(st.date)); st.y = d.getUTCFullYear(); st.m = d.getUTCMonth(); } days(); return; }
      if (t.closest(".s-due")) { st.due = !st.due; days(); }
    });
    f.addEventListener("submit", function (e) { e.preventDefault(); save(); });
    f.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target === nIn && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); } });
    days(); document.body.appendChild(el); slip = { close: close };
    if (wide()) setTimeout(function () { tIn.focus(); tIn.setSelectionRange(tIn.value.length, tIn.value.length); }, 30);
  }

  /* ── the hand. On the band or on the days: take hold and pull, and the days go by (a phone's page is turned one day at a
     time; its band runs a day a moon). On a wide screen a thing taken hold of is carried instead: let go of it over another
     day, or beside the days where nothing has a day, and it is moved there; held at either end of the week, the days come
     along. ── */
  function hands() {
    var ghost = null, dropEl = null, edgeT = 0;
    function target(e) { var el = document.elementFromPoint(e.clientX, e.clientY); if (!el || !el.closest) return null; return el.closest(".col") || (el.closest(".side") ? $("lists").querySelector('[data-box="loose"]') : null); }
    function down(zone, host) {
      host.addEventListener("pointerdown", function (e) {
        if (e.button || slip || hold) return;
        var t = e.target, en = t.closest(".en");
        if (t.closest("button, input, textarea, form, .b-top")) return;
        if (zone === "side" && !en) return;
        hold = { id: e.pointerId, zone: zone, host: host, x0: e.clientX, y0: e.clientY, c0: cur, x: e.clientX, t: performance.now(), v: 0, pan: false, carry: false, dir: 0,
          en: en && geo.wide && e.pointerType === "mouse" ? en : null };
        if (zone !== "side") to = cur;   // caught in mid-flight
      });
    }
    down("band", band); down("strip", strip); down("side", $("side"));
    window.addEventListener("pointermove", function (e) {
      var h = hold; if (!h || e.pointerId !== h.id) return;
      var dx = e.clientX - h.x0, dy = e.clientY - h.y0, now = performance.now();
      if (!h.pan && !h.carry) {
        if (Math.hypot(dx, dy) < 7) return;
        if (h.en) {
          h.it = find(h.en.dataset.id); if (!h.it || /^tmp/.test(h.it.id)) { hold = null; return; }
          h.carry = true; ghost = document.createElement("div"); ghost.className = "ghost";
          ghost.innerHTML = (h.it.time ? '<span class="tm">' + esc(h.it.time) + "</span>" : "") + esc(h.it.title); document.body.appendChild(ghost);
          document.querySelectorAll('.en[data-id="' + h.it.id + '"]').forEach(function (n) { n.classList.add("lift"); });
          try { window.getSelection().removeAllRanges(); } catch (er) {}
        } else if (h.zone === "side" || (!geo.wide && h.zone === "strip" && Math.abs(dy) > Math.abs(dx))) { hold = null; return; }   // the page is being scrolled, not the days
        else { h.pan = true; h.host.classList.add("held"); }
        try { h.host.setPointerCapture(e.pointerId); } catch (er) {}
      }
      if (h.pan) {
        h.v = h.v * .6 + ((e.clientX - h.x) / Math.max(1, now - h.t)) * .4; h.x = e.clientX; h.t = now;
        cur = to = h.c0 - dx / (h.zone === "band" ? geo.hw : geo.cw); kick(); return;
      }
      ghost.style.transform = "translate(" + (e.clientX + 14) + "px," + (e.clientY - 20) + "px) rotate(-1.5deg)";
      var t = target(e); if (t !== dropEl) { if (dropEl) dropEl.classList.remove("drop"); dropEl = t; if (t) t.classList.add("drop"); }
      var r = strip.getBoundingClientRect(), dir = e.clientX > r.right - 54 ? 1 : e.clientX > r.left && e.clientX < r.left + 34 ? -1 : 0;
      if (dir !== h.dir) { h.dir = dir; clearInterval(edgeT); if (dir) edgeT = setInterval(function () { to = Math.round(to) + dir; kick(); }, 430); }
    });
    function up(e, lost) {
      var h = hold; if (!h || e.pointerId !== h.id) return; hold = null;
      if (h.carry) {
        clearInterval(edgeT); if (ghost) ghost.remove(); ghost = null; clickAt = performance.now();
        document.querySelectorAll(".en.lift").forEach(function (n) { n.classList.remove("lift"); });
        if (dropEl) dropEl.classList.remove("drop"); dropEl = null;
        var t = lost ? null : target(e), d = t && t.classList.contains("col") ? t.dataset.d : "";
        if (t && d !== (h.it.date || "")) { change(h.it.id, { date: d }); toast(d ? "挪到了 " + dayWords(dayIdx(d)) : "放回「没定日子」了"); }
        return;
      }
      if (!h.pan) return;
      h.host.classList.remove("held"); clickAt = performance.now();
      var unit = h.zone === "band" ? geo.hw : geo.cw, f = lost || performance.now() - h.t > 90 ? 0 : -h.v * 190 / unit, goal;
      if (!geo.wide && h.zone === "strip") { goal = Math.round(cur + lim(f, -.6, .6)); if (goal === Math.round(h.c0) && Math.abs(cur - h.c0) > .18) goal += cur > h.c0 ? 1 : -1; goal = lim(goal, Math.round(h.c0) - 1, Math.round(h.c0) + 1); }
      else goal = Math.round(cur + lim(f, -4, 4));
      to = goal; kick();
    }
    window.addEventListener("pointerup", function (e) { up(e); });
    window.addEventListener("pointercancel", function (e) { up(e, true); });
    band.addEventListener("dragstart", function (e) { e.preventDefault(); }); strip.addEventListener("dragstart", function (e) { e.preventDefault(); });
    document.addEventListener("selectstart", function (e) { if (hold && (hold.pan || hold.carry)) e.preventDefault(); });

    // a wheel: a day a notch; two fingers along a trackpad pull the days directly
    var wheel = { acc: 0, at: 0, t: 0 };
    $("plx").addEventListener("wheel", function (e) {
      if (!geo.wide || slip || e.ctrlKey || e.target.closest(".side")) return;
      var col = e.target.closest(".col"), now = performance.now();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault(); cur = to = cur + e.deltaX / geo.cw; lay();
        clearTimeout(wheel.t); wheel.t = setTimeout(function () { to = Math.round(cur); kick(); }, 150); return;
      }
      if (col && !e.shiftKey && col.scrollHeight > col.clientHeight + 2) return;   // a day with more than fits: its own list is what scrolls
      e.preventDefault(); if (now - wheel.at > 400) wheel.acc = 0; wheel.acc += e.deltaY * (e.deltaMode === 1 ? 33 : 1);
      if (Math.abs(wheel.acc) >= 40 && now - wheel.at > 110) { to = Math.round(to) + (wheel.acc > 0 ? 1 : -1); wheel.acc = 0; wheel.at = now; kick(); }
    }, { passive: false });
  }

  document.addEventListener("click", function (e) {
    var t = e.target, b; if (!t.closest || slip) return;
    if (performance.now() - clickAt < 350) { e.preventDefault(); return; }   // the end of a pull, or of a carry, is not a touch
    if ((b = t.closest(".tk"))) { var id = b.closest(".en").dataset.id, it = find(id); if (it) change(id, { done: !it.done }); return; }
    if ((b = t.closest(".more"))) { write(b.closest(".col")); return; }
    if ((b = t.closest('[data-act="done"]'))) { showDone = !showDone; paintSide(); return; }
    if ((b = t.closest(".dy"))) { go(+b.dataset.i); if (!geo.wide) band.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if ((b = t.closest(".en"))) { openSlip(b.dataset.id); return; }
    if ((b = t.closest(".hd"))) { go(+b.dataset.i); return; }
    if (geo.wide && (b = t.closest(".col")) && !t.closest(".add")) write(b);   // anywhere on a day: write there
  });
  $("back").onclick = function () { location.href = "./"; };
  $("goToday").onclick = function () { go(T); };
  $("goPrev").onclick = function () { go(Math.round(to) - 7); };
  $("goNext").onclick = function () { go(Math.round(to) + 7); };
  document.addEventListener("keydown", function (e) {
    if (document.querySelector(".nyxask") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (slip) { if (e.key === "Escape") { e.preventDefault(); slip.close(); } return; }
    if (/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) { if (e.key === "Escape") e.target.blur(); return; }
    var n = geo.wide && e.shiftKey ? 7 : 1;
    if (e.key === "ArrowRight") go(Math.round(to) + n); else if (e.key === "ArrowLeft") go(Math.round(to) - n);
    else if (e.key === "PageDown") go(Math.round(to) + 7); else if (e.key === "PageUp") go(Math.round(to) - 7);
    else if (e.key === "Home" || e.key === "t" || e.key === "T") go(T);
    else if (e.key === "n" || e.key === "N" || e.key === "/") { e.preventDefault(); $("jotIn").focus(); }
  });

  /* ── begin ── */
  if (G) edge();
  rebuild(); hands();
  var sized = 0;
  window.addEventListener("resize", function () { clearTimeout(sized); sized = setTimeout(function () { var w = geo.wide; if (measure() || w !== geo.wide) rebuild(); else { lay(); rest(); } }, 120); });
  function first(d) { loaded = true; take(d); paintAll(); }
  (window.NYX_PLAN_EARLY || Promise.reject()).then(first, function () { return api("").then(first); }).catch(function () { loaded = true; $("lists").innerHTML = '<p class="empty">日程那边没有应答，过一会儿再来。</p>'; });
  function poll() { if (!document.hidden && loaded) load().catch(function () {}); }
  setInterval(poll, 25000); document.addEventListener("visibilitychange", poll); window.addEventListener("focus", poll);
})();
