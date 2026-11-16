/* Nyx — Plan (日程). A team's plan — four people, and what is to be done day by day — in the house's flat hand.
   The entries are kept by the relay (relay/nyx_plan.py, /app/plan): each is one of the four's (they took it on) or
   nobody's yet. They get here two ways: the companion writes down what its human says in the chat (relay/plan.py), and
   people write on this page. Who is looking is chosen here, on each device (the four discs in the corner block): that
   one is the blue one, their lane is washed blue, and what they take on goes to them.
   The sheet is a chart. Across its head the days: every day's moon, drawn as the home draws its moons (a flat disc,
   the dark of it crumbling into grains), riding one dotted track — a tick where a day meets the next, a small cross
   where a week begins — with two fainter tracks of stars going by behind. Take hold and pull, and the days go by.
   Under one heavy rule hang four lanes, one a person; a column a day; the plumb line hangs down today's. A thing is
   carried by hand: to another day, into another's lane, or out again to wait. Touch the blank of a lane on some day
   and a line opens to write on. Beside the board: a line for things nobody has taken yet, and the lists that have no
   place on the board (waiting to be taken on, overdue, further on, done).
   A phone shows one day at a time under a week of moons (the middle one is the day that is open), the four under one
   another. */
(function () {
  "use strict";
  var C = window.NYX || {}, RELAY = C.relay || "/relay", root = document.documentElement, AI = C.aiName || "AI", ME = C.meName || "Me";
  var $ = function (id) { return document.getElementById(id); };
  var key = null; try { key = localStorage.getItem("nyx_key"); } catch (e) {}
  if (!key) { location.replace("./"); return; }
  if (window.NyxPaper) window.NyxPaper.paint();
  var ask = window.NyxAsk, G = window.Gou, toastT = 0, TAU = Math.PI * 2;
  var WIDE = window.matchMedia("(min-width:1100px)"), wide = function () { return WIDE.matches; };
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };

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

  /* ── the flat hand: moons as the home draws them (eye/core.js, G.moon: the lit part a flat disc, the rest crumbling
     into grains), each made once ── */
  var drawn = {};
  function sheetOf(w, h) { var S = 3, c = document.createElement("canvas"); c.width = w * S; c.height = h * S; var x = c.getContext("2d"); x.scale(S, S); return [c, x]; }
  function inkOf(a) { return "rgba(" + (dark() ? "236,233,226" : "27,27,32") + "," + a + ")"; }
  function blueOf() { return dark() ? "#8C95FF" : "#2933C4"; }
  function moonUrl(lit, waxing, R, col) {   // lit 0…1; waxing: lit on the right
    var q = Math.round(lim(lit, 0, 1) * 24) / 24, k = ["m", q, waxing ? 1 : 0, R, col].join("|"); if (drawn[k]) return drawn[k];
    var W = R * 2 + 6, cx = sheetOf(W, W), x = cx[1];
    x.translate(W / 2, W / 2); if (waxing) x.scale(-1, 1);   // G.moon lights the left limb
    if (G && G.moon) G.moon(x, 0, 0, R, q, col, G.rng(Math.round(q * 24) * 13 + R), .3);
    return (drawn[k] = cx[0].toDataURL("image/png"));
  }
  function skyOf(n) { var d = new Date(n * 864e5 + 432e5); return G && G.moonAge ? { lit: G.moonLit(d), wax: G.moonAge(d) < 14.765 } : { lit: 1, wax: true }; }   // the moon that night
  /* the tick of a thing to do: a ring with a few grains in it (a moon not yet begun); done, a full disc in blue */
  function tickUrl(done) {
    var k = "tick" + (done ? 1 : 0) + (dark() ? 1 : 0); if (drawn[k]) return drawn[k];
    var W = 22, R = 8.4, cx = sheetOf(W, W), x = cx[1], ink = inkOf(.8);
    if (!G || !G.moon) return "";
    if (done) G.moon(x, W / 2, W / 2, R + .8, 1, blueOf(), G.rng(5), 0);
    else { G.moon(x, W / 2, W / 2, R - .6, 0, inkOf(.62), G.rng(9), -.6); x.strokeStyle = ink; x.lineWidth = 1.35; x.beginPath(); x.arc(W / 2, W / 2, R, 0, TAU); x.stroke(); }
    return (drawn[k] = cx[0].toDataURL("image/png"));
  }
  function tick(done) { return '<img alt="" width="22" height="22" draggable="false" src="' + tickUrl(done) + '">'; }
  /* the swallow, as the home draws it (eye/birds.js): one instant of the wingbeat as a mask for small marks (--sw) */
  function swallowMask(hour) {
    var P = G && G.BIRDPTS && (G.BIRDPTS[hour] || G.BIRDPTS[11]); if (!P) return "";
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, d = "", i;
    for (i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); d += (i ? "L" : "M") + P[i].toFixed(3) + " " + P[i + 1].toFixed(3); }
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x0, y0, x1 - x0, y1 - y0].map(function (v) { return v.toFixed(3); }).join(" ") + '"><path d="' + d + 'Z"/></svg>') + '")';
  }
  if (G && G.BIRDPTS) root.style.setProperty("--sw", swallowMask(11));
  /* the corner block goes off into grain, as the block does on the home: a strip of specks, thick at the block and
     thinning away — to its right (--edge) and under it (--edgeh) */
  function edge() {
    var r = G ? G.rng(77) : Math.random, ink = getComputedStyle(root).getPropertyValue("--ink").trim() || "#1B1B20";
    [["--edge", 46, 420, 0], ["--edgeh", 420, 34, 1]].forEach(function (e) {
      var cx = sheetOf(e[1], e[2]), x = cx[1], n = e[3] ? 1250 : 1500, i; x.fillStyle = ink;
      for (i = 0; i < n; i++) { var u = r(), far = Math.pow(u, 2.6), s = .45 + r() * (1.15 - u * .6), along = r(); x.globalAlpha = .55 + r() * .45; if (e[3]) x.fillRect(along * e[1], far * e[2], s, s); else x.fillRect(far * e[1], along * e[2], s, s); }
      $("plx").style.setProperty(e[0], 'url("' + cx[0].toDataURL("image/png") + '")');
    });
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
    if (!m[1] && !pm && !m[3] && h >= 1 && h <= 6) h += 12;   // "3点", said of something to do, is the afternoon's (3:00 written out is taken at its word)
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

  /* ── the four, and what is written down ── */
  var IDS = ["m1", "m2", "m3", "m4"], members = [{ id: "m1", name: ME }, { id: "m2", name: "乙" }, { id: "m3", name: "丙" }, { id: "m4", name: "丁" }];
  var me = ls("plan_me"); if (IDS.indexOf(me) < 0) me = "m1";   // who is looking, on this device
  var items = [], rev = -1, byCell = {}, byDay = {}, loaded = false, busy = 0, seq = 0, showDone = false;
  function nameOf(id) { for (var i = 0; i < members.length; i++) if (members[i].id === id) return members[i].name; return ""; }
  function initial(name) { var c = Array.from(String(name || "?").trim())[0] || "?"; return /[a-z]/.test(c) ? c.toUpperCase() : c; }
  function pd(id, cls, more) { return '<span class="pd' + (id === me ? " me" : "") + (cls ? " " + cls : "") + '"' + (more || "") + ' title="' + esc(nameOf(id)) + '">' + esc(initial(nameOf(id))) + "</span>"; }
  function find(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
  function undone(it) { return !it.done; }
  function order(a, b) { var x = a.time || "99:99", y = b.time || "99:99"; return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (x < y ? -1 : x > y ? 1 : 0) || a.no - b.no; }
  function index() {
    byCell = {}; byDay = {};
    items.forEach(function (it) { if (it.date && !it.done) byDay[it.date] = (byDay[it.date] || 0) + 1; if (it.owner) { var k = (it.date || "") + "|" + it.owner; (byCell[k] = byCell[k] || []).push(it); } });
    for (var k in byCell) byCell[k].sort(order);
  }
  function take(d) {
    if (!d || d.same || !d.items) return false;
    rev = d.rev; items = d.items; if (d.members && d.members.length === 4) members = d.members; index(); return true;
  }
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
    var tmp = { id: "tmp" + (++seq), no: 1e9 + seq, title: o.title, note: "", date: o.date || "", time: o.time || "", due: !!(o.due && o.date), owner: o.owner || "", done: false, by: nameOf(me) };
    items.push(tmp); index(); paintAll(); busy++;
    return api("", { title: tmp.title, date: tmp.date, time: tmp.time, due: tmp.due, owner: tmp.owner, by: tmp.by }).then(function (d) {
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
  function moved(p) {   // a word on where a thing has gone
    var who = "owner" in p ? (p.owner ? "交给 " + nameOf(p.owner) + " 了" : "放回待认领了") : "", day = "date" in p ? (p.date ? dayWords(dayIdx(p.date)) : "没定日子") : "";
    return who && day ? who + " · " + day : who || (p.date ? "挪到了 " + day : "不定日子了");
  }

  /* ── the days across the head, and the board under them. `cur` is the day at the hand — the first column of a wide
     screen, the middle moon of a phone — and may lie between two days while the days are in the hand; `to` is where it
     is going. Only the days in sight are kept on the page. ── */
  var band = $("band"), heads = $("heads"), strip = $("strip"), cols = $("cols"), sky = $("sky"), skyX = sky.getContext("2d"), plumb = $("plumb");
  var cur = T, to = T, geo = null, colEl = {}, headEl = {}, shownAt = null, raf = 0, hold = null, clickAt = 0, slip = null, whoBuilt = false;
  function measure() {
    var W = wide(), r = heads.getBoundingClientRect(), g = { wide: W, W: r.width, H: r.height, dpr: Math.min(window.devicePixelRatio || 1, 2) };
    if (W) { g.N = lim(Math.floor(g.W / 150), 4, 7); g.cw = g.W / g.N; g.hw = g.cw; g.r = 34; g.anchor = g.cw / 2; g.ax = g.W * .66; g.y0 = Math.round(g.H * .5); g.k = 40 / (g.ax * g.ax); }
    else { g.N = 1; g.cw = strip.getBoundingClientRect().width; g.hw = g.W / (g.W > 560 ? 9 : 7); g.r = 20; g.anchor = g.W / 2; g.ax = g.W / 2; g.y0 = 70; g.k = 22 / (g.ax * g.ax); }
    heads.style.setProperty("--hw", g.hw.toFixed(1) + "px"); cols.style.setProperty("--cw", g.cw.toFixed(2) + "px");
    sky.width = Math.round(g.W * g.dpr); sky.height = Math.round(g.H * g.dpr);
    var redo = !geo || geo.wide !== W; geo = g; return redo;
  }
  function arcY(x) { var d = x - geo.ax; return geo.y0 + geo.k * d * d; }   // the track the moons ride: highest a little right of the middle on a wide screen, in the middle on a phone

  /* a thing, as a line. o.day: say which day (the lists beside the board); o.who: say whose; o.pool: nobody's yet — no ring to tick, a word to take it on */
  function enHtml(it, o) {
    o = o || {};
    var n = it.date ? dayIdx(it.date) : null, late = !it.done && n != null && n < T, d = n != null ? dOf(n) : null;
    return '<li class="en' + (it.done ? " done" : "") + (late ? " late" : "") + '" data-id="' + esc(it.id) + '">' +
      (o.pool ? '<span class="open" title="还没有人认领"></span>' : '<button type="button" class="tk" aria-pressed="' + !!it.done + '" title="' + (it.done ? "还没做完" : "做完了") + '">' + tick(it.done) + "</button>") +
      '<div class="ex">' + (o.who && it.owner ? pd(it.owner, "s") : "") +
      (o.day && d ? '<span class="dy" data-i="' + n + '" title="去那一天">' + (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "<small>" + (rel(n) || WDZ[d.getUTCDay()]) + "</small></span>" : "") +
      (it.time ? '<span class="tm">' + esc(it.time) + "</span>" : "") + (it.due ? "<u>截止</u>" : "") + '<span class="tt">' + esc(it.title) + "</span>" + (it.note ? '<p class="nt">' + esc(it.note) + "</p>" : "") + "</div>" +
      (o.pool ? '<button type="button" class="take">认领</button>' : "") + "</li>";
  }
  function makeCol(i) {
    var el = document.createElement("section"); el.dataset.i = i; el.dataset.d = idxDay(i);
    el.innerHTML = "<h3></h3>" + IDS.map(function (id) { return '<div class="cell" data-m="' + id + '"><div class="ch"></div><ul class="ens"></ul><div class="add"></div></div>'; }).join("");
    cols.appendChild(el); colEl[i] = el; paintCol(i); return el;
  }
  function paintCol(i) {
    var el = colEl[i]; if (!el) return;
    var d = dOf(i), wd = d.getUTCDay(), day = idxDay(i), r = rel(i);
    el.className = "col" + (i === T ? " today" : i < T ? " past" : "") + (wd === 0 || wd === 6 ? " we" : "");
    el.children[0].innerHTML = esc(r || WDZ[wd]) + "<i>" + d.getUTCDate() + " " + MONTH[d.getUTCMonth()] + "</i>" + (r ? "<em>" + WDZ[wd] + "</em>" : "");
    IDS.forEach(function (id, k) {
      var c = el.children[k + 1];
      c.className = "cell" + (id === me ? " me" : "");
      c.children[0].innerHTML = pd(id, "s") + esc(nameOf(id)) + "<i>＋</i>";
      c.children[1].innerHTML = (byCell[day + "|" + id] || []).map(function (it) { return enHtml(it); }).join("");
    });
  }
  function makeHead(i) {
    var el = document.createElement("div"), k = skyOf(i), d = dOf(i), R = geo.r;
    el.setAttribute("role", "button"); el.dataset.i = i; el.title = zhDay(i) + " " + WDZ[d.getUTCDay()];
    el.innerHTML = '<span class="mw"><img alt="" draggable="false" src="' + moonUrl(k.lit, k.wax, R, i === T ? blueOf() : inkOf(1)) + '">' + (i === T ? '<i class="sw"></i>' : "") + '</span><span class="dt"><b>' + d.getUTCDate() + "</b><em></em><u></u></span>";
    el._mw = el.firstChild; heads.appendChild(el); headEl[i] = el; paintHead(i); return el;
  }
  function paintHead(i) {
    var el = headEl[i]; if (!el) return;
    var wd = dOf(i).getUTCDay();
    el.className = "hd" + (i === T ? " today" : "") + (wd === 0 || wd === 6 ? " we" : "") + (!geo.wide && Math.round(cur) === i ? " on" : "");
    el.querySelector("em").textContent = i === T ? "今天" : WDZ[wd];
    el.querySelector("u").innerHTML = new Array(Math.min(4, byDay[idxDay(i)] || 0) + 1).join("<s></s>");
  }

  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function star(x, px, py, k, col) { x.fillStyle = col; x.beginPath(); x.moveTo(px, py - k); x.quadraticCurveTo(px, py, px + k, py); x.quadraticCurveTo(px, py, px, py + k); x.quadraticCurveTo(px, py, px - k, py); x.quadraticCurveTo(px, py, px, py - k); x.fill(); }
  function drawSky() {
    var g = geo, x = skyX, k = g.dpr; if (!g.W) return;
    x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, g.W, g.H);
    var ink = dark() ? "236,233,226" : "27,27,32", blue = dark() ? "140,149,255" : "41,51,196";
    var n = Math.max(4, Math.round(g.hw / 9.5)), step = g.hw / n, u0 = cur * g.hw - (g.anchor - g.hw / 2), j, px, py, L = g.wide ? 6 : 4, a;
    // the track the moons ride: dotted by hand; a tick where one day meets the next; where a week begins, a small cross
    for (j = Math.floor(u0 / step) - 1; (px = j * step - u0) < g.W + 6; j++) {
      py = arcY(px);
      if (((j % n) + n) % n === 0) {
        var mon = dOf(Math.round(j / n)).getUTCDay() === 1;
        x.strokeStyle = "rgba(" + ink + "," + (mon ? .9 : .6) + ")"; x.lineWidth = 1; x.lineCap = "round";
        x.beginPath(); x.moveTo(px + (hash(j) - .5) * 1.6, py - L); x.lineTo(px + (hash(j + 5) - .5) * 1.6, py + L); x.stroke();
        if (mon) { x.beginPath(); x.moveTo(px - L, py + (hash(j + 9) - .5) * 1.4); x.lineTo(px + L, py + (hash(j + 3) - .5) * 1.4); x.stroke(); }
        continue;
      }
      x.fillStyle = "rgba(" + ink + "," + (.34 + .46 * hash(j)).toFixed(2) + ")"; x.beginPath(); x.arc(px, py + (hash(j + 13) - .5) * 1.3, .6 + .6 * hash(j + 71), 0, TAU); x.fill();
    }
    // two tracks further out, going by more slowly (the stars are far off): broken lines of dots, a star now and then
    [[.5, g.r * 1.44 + 30, .24], [.26, g.r * 1.44 + (g.wide ? 62 : 48), .17]].forEach(function (tr, ti) {
      var sp = g.wide ? 13 : 10, w0 = cur * g.hw * tr[0] + ti * 37, h;
      for (j = Math.floor(w0 / sp) - 1; (px = j * sp - w0) < g.W + 6; j++) {
        h = hash(j * 3.7 + ti * 101); py = arcY(px) - tr[1];
        if (h > .62 || py < -6) continue;
        if (h < .03) { star(x, px, py, g.wide ? 4.5 : 3.5, "rgba(" + (hash(j) < .5 ? blue : ink) + ",.8)"); continue; }
        a = tr[2] + .2 * hash(j + 1); x.fillStyle = "rgba(" + ink + "," + a.toFixed(2) + ")"; x.beginPath(); x.arc(px, py, .55 + .5 * hash(j + 2), 0, TAU); x.fill();
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
      el = headEl[i] || makeHead(i); x = g.anchor + (i - c) * g.hw; s = g.wide ? (i === T ? 1 : .72) : 1 - .38 * Math.min(1, Math.abs(i - c));
      el.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)";
      el._mw.style.transform = "translate3d(0," + (arcY(x) - 2 * g.r - 2).toFixed(2) + "px,0) scale(" + s.toFixed(3) + ")";
      if (!g.wide) el.classList.toggle("on", Math.round(c) === i);
    }
    drawSky();
    if (g.wide) { x = (T - c) * g.cw; plumb.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)"; plumb.style.visibility = x > -1.5 && x < g.W - 2 ? "" : "hidden"; }
    var at = Math.round(c);
    if (at !== shownAt) {   // the month the hand is in
      shownAt = at; var d = dOf(at);
      $("bMonth").innerHTML = MONTH[d.getUTCMonth()] + " " + d.getUTCFullYear() + "<i>" + MZ[d.getUTCMonth()] + "月</i>";
      $("goToday").classList.toggle("here", at === T);
    }
  }
  function fit() { if (geo.wide) { strip.style.height = ""; return; } var el = colEl[Math.round(cur)]; if (el) strip.style.height = Math.max(240, el.offsetHeight) + "px"; }   // a phone's page is as tall as the day that is open
  function rest() { paintSide(); fit(); }
  function frame() {
    raf = 0;
    if (hold && hold.pan) { lay(); return; }
    var d = to - cur; cur = Math.abs(d) < .003 ? to : cur + d * .17;
    lay(); if (cur !== to) kick(); else rest();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function go(i) { to = i; kick(); }
  function paintAll() { var i; for (i in colEl) paintCol(+i); for (i in headEl) paintHead(+i); paintWho(); paintSide(); fit(); }
  function rebuild() {   // the screen is another shape, or the day has turned: lay everything again
    var i; for (i in colEl) colEl[i].remove(); for (i in headEl) headEl[i].remove(); colEl = {}; headEl = {}; shownAt = null;
    measure(); $("bDate").textContent = WD[dOf(T).getUTCDay()] + " · " + dOf(T).getUTCDate() + " " + MON[dOf(T).getUTCMonth()] + " " + dOf(T).getUTCFullYear();
    lay(); paintWho(); rest();
  }

  /* ── the four ── */
  function paintIam() {
    $("iam").innerHTML = "<span>我是</span>" + members.map(function (m) { return '<button type="button" class="pd' + (m.id === me ? " me" : "") + '" data-me="' + m.id + '" title="' + esc(m.name) + (m.id === me ? "（现在是你）" : "：换成这一位") + '">' + esc(initial(m.name)) + "</button>"; }).join("") +
      '<button type="button" class="nm" id="rename">改名字</button>';
  }
  function paintWho() {   // where each lane begins: who it is, how much they have on, and what of it has no day yet
    var host = $("who");
    if (!whoBuilt) { host.innerHTML = IDS.map(function (id) { return '<section class="lane" data-m="' + id + '"><header class="lh"></header><ul class="ens"></ul><div class="add"></div></section>'; }).join(""); whoBuilt = true; }
    members.forEach(function (m, k) {
      var el = host.children[k], n = items.filter(function (it) { return it.owner === m.id && !it.done; }).length, latin = /^[\x20-\x7e]+$/.test(m.name);
      el.className = "lane" + (m.id === me ? " me" : "");
      el.children[0].innerHTML = '<button type="button" class="pd' + (m.id === me ? " me" : "") + '" data-me="' + m.id + '" title="' + (m.id === me ? "现在是你" : "换成这一位") + '">' + esc(initial(m.name)) + "</button><b" + (latin ? ' lang="en"' : "") + ' title="' + esc(m.name) + '">' + esc(m.name) + "</b><i>" + (n || "") + "</i>";
      el.children[1].innerHTML = (byCell["|" + m.id] || []).map(function (it) { return enHtml(it); }).join("");
    });
  }
  function setMe(id) { if (id === me || IDS.indexOf(id) < 0) return; me = id; ls("plan_me", id); paintIam(); paintAll(); toast("现在是 " + nameOf(id)); }

  /* ── beside the board ── */
  function sec(zh, en, more) { return '<h2 class="sec">' + zh + "<i>" + en + "</i>" + (more || "") + "</h2>"; }
  function box(name, inner) { return '<div class="bx" data-box="' + name + '">' + inner + "</div>"; }
  function list(a, o) { return '<ul class="ens">' + a.map(function (it) { return enHtml(it, o); }).join("") + "</ul>"; }
  function paintSide() {
    var today = idxDay(T), open = items.filter(undone), byDate = function (a, b) { var x = a.date || "9999", y = b.date || "9999"; return x < y ? -1 : x > y ? 1 : order(a, b); };
    var pool = open.filter(function (it) { return !it.owner; }).sort(byDate);
    var late = open.filter(function (it) { return it.owner && it.date && it.date < today; }).sort(byDate);
    var loose = geo.wide ? [] : open.filter(function (it) { return it.owner && !it.date; });   // (on a wide screen these stand at the head of each lane)
    var after = idxDay(Math.max(Math.round(to) + (geo.wide ? geo.N - 1 : 0), T - 1)), later = open.filter(function (it) { return it.owner && it.date > after; }).sort(byDate);
    var done = items.filter(function (it) { return it.done; }).sort(function (a, b) { return (b.done_at || "") < (a.done_at || "") ? -1 : 1; }), h = "";
    h += sec("待认领", "To take on") + box("pool", pool.length ? list(pool, { pool: true, day: true }) :
      '<p class="none">' + (loaded && !items.length ? "这里还空着。" : "") + "还没人认领的待办放在这里：谁来做，就点「认领」" + (geo.wide ? "，或者把它拖进谁的那一道里" : "") + "。</p>");
    if (late.length) h += sec("过了的", "Overdue") + box("late", list(late, { day: true, who: true }));
    if (loose.length) h += sec("没定日子", "Someday") + box("loose", list(loose, { who: true }));
    if (later.length) h += sec("往后", "Later") + box("later", list(later.slice(0, 12), { day: true, who: true }) + (later.length > 12 ? '<p class="none">后面还有 ' + (later.length - 12) + " 件。</p>" : ""));
    if (done.length) h += sec("做完的", "Done", '<button type="button" data-act="done">' + (showDone ? "收起" : done.length + " 件") + "</button>") + (showDone ? box("done", list(done.slice(0, 24), { day: true, who: true })) : "");
    $("lists").innerHTML = h;
    $("foot").textContent = "点某个人在某一天的空白处，可以直接替他写在那里。在聊天里说到要做的事，" + AI + " 会替你记进来。";
  }

  /* ── writing ── */
  var HINT = "先放在待认领里。可以这样写：周五 15:00 交报告";
  function words(p) { return (p.date != null ? dayWords(p.date) : "没定日子") + (p.time ? " " + p.time : "") + (p.due ? " 前" : ""); }
  $("jotHint").textContent = HINT;
  $("jotIn").addEventListener("input", function () { var v = this.value.trim(); if (!v) { $("jotHint").textContent = HINT; return; } var p = parseLine(v); $("jotHint").innerHTML = "→ <b>" + words(p) + "</b> · " + esc(p.title); });
  $("jot").addEventListener("submit", function (e) {
    e.preventDefault(); var inp = $("jotIn"), v = inp.value.trim(); if (!v) { inp.focus(); return; }
    var p = parseLine(v); add({ title: p.title, date: p.date != null ? idxDay(p.date) : "", time: p.time, due: p.due, owner: "" });
    inp.value = ""; $("jotHint").textContent = HINT; toast("放进待认领了 · " + words(p));
  });
  function write(host) {   // a line to write on, in someone's lane: on a day (a cell of the board), or with no day (where the lane begins)
    var boxEl = host.querySelector(".add"); if (!boxEl) return; if (boxEl.firstChild) { boxEl.querySelector("input").focus(); return; }
    var col = host.closest(".col"), day = col ? col.dataset.d : "", who = host.dataset.m;
    boxEl.innerHTML = '<form class="wr" autocomplete="off"><input type="text" maxlength="200" placeholder="' + (day ? "15:00 做什么" : "做什么") + '" enterkeyhint="done" aria-label="' + esc(nameOf(who)) + (day ? " 这一天要做的" : " 要做的（没定日子）") + '"><button type="submit">记下</button></form>';
    var f = boxEl.firstChild, inp = f.firstChild;
    function shut() { if (f.isConnected) { boxEl.innerHTML = ""; fit(); } }
    f.addEventListener("submit", function (e) { e.preventDefault(); var v = inp.value.trim(); if (!v) { shut(); return; } var p = day ? parseLine(v, true) : { title: v, time: "", due: false }; add({ title: p.title, date: day, time: p.time, due: p.due, owner: who }); inp.value = ""; inp.focus(); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); shut(); } });
    inp.addEventListener("blur", function () { setTimeout(function () { if (!inp.value.trim() && document.activeElement !== inp) shut(); }, 180); });
    inp.focus({ preventScroll: true }); fit();
  }

  /* ── a thing, opened: what it is, whose, which day (a few near ones, or any from the month), the hour, a note ── */
  var CH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>', CHR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
  function sheet(html) {
    var el = document.createElement("div"); el.className = "slipbg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.innerHTML = html;
    slip = { el: el, close: function () { el.remove(); slip = null; } }; return el;
  }
  function openSlip(id) {
    var it = find(id); if (!it || /^tmp/.test(id) || slip) return;
    var st = { date: it.date || "", due: !!it.due, owner: it.owner || "" }, base = it.date ? dOf(dayIdx(it.date)) : dOf(T);
    st.y = base.getUTCFullYear(); st.m = base.getUTCMonth();
    var el = sheet('<form class="slip" autocomplete="off"><input class="s-t" type="text" maxlength="200" aria-label="做什么">' +
      '<div class="s-row"><label>谁来</label><div class="chips own"></div></div>' +
      '<div class="s-row"><label>哪天</label><div><div class="chips days"></div><div class="cal"></div></div></div>' +
      '<div class="s-row"><label>几点</label><div class="s-hr"><input class="s-h" type="text" maxlength="8" placeholder="15:30" aria-label="几点" autocapitalize="off"><button type="button" class="s-due">这天是最后期限</button></div></div>' +
      '<div class="s-row"><label>备注</label><textarea class="s-n" rows="2" maxlength="2000" aria-label="备注"></textarea></div>' +
      '<p class="s-by"></p><div class="a"><button type="button" class="del">删掉</button><i></i><button type="button" class="no">算了</button><button type="submit" class="ok">存好</button></div></form>');
    var f = el.firstChild, tIn = f.querySelector(".s-t"), hIn = f.querySelector(".s-h"), nIn = f.querySelector(".s-n"), at = Date.parse(it.ts || ""), close = slip.close;
    tIn.value = it.title; hIn.value = it.time || ""; nIn.value = it.note || "";
    f.querySelector(".s-by").textContent = (it.by ? it.by + " " : "") + (isFinite(at) ? "记于 " + (new Date(at).getMonth() + 1) + "月" + new Date(at).getDate() + "日" : "") + (it.done ? " · 已经做完" : "");
    function own() {
      f.querySelector(".own").innerHTML = members.map(function (m) { return '<button type="button" data-o="' + m.id + '"' + (st.owner === m.id ? ' class="on"' : "") + ">" + pd(m.id, "s") + esc(m.name) + "</button>"; }).join("") +
        '<button type="button" data-o="" class="none' + (st.owner ? "" : " on") + '">待认领</button>';
    }
    function days() {
      var wd = (dOf(T).getUTCDay() + 6) % 7, near = [["今天", T], ["明天", T + 1], ["后天", T + 2], ["下周一", T - wd + 7]];
      f.querySelector(".days").innerHTML = near.map(function (c) { var d = idxDay(c[1]); return '<button type="button" data-d="' + d + '"' + (st.date === d ? ' class="on"' : "") + ">" + c[0] + "</button>"; }).join("") +
        '<button type="button" data-d=""' + (st.date ? "" : ' class="on"') + ">没定</button>";
      var first = Math.round(Date.UTC(st.y, st.m, 1) / 864e5), lead = (dOf(first).getUTCDay() + 6) % 7, n = new Date(Date.UTC(st.y, st.m + 1, 0)).getUTCDate(), rows = Math.ceil((lead + n) / 7), h = "", i, k, d;
      for (i = 0; i < rows * 7; i++) { k = first - lead + i; d = idxDay(k); h += '<button type="button" data-d="' + d + '" class="' + (k < first || k >= first + n ? "out " : "") + (k === T ? "now " : "") + (st.date === d ? "on " : "") + (byDay[d] ? "has" : "") + '">' + dOf(k).getUTCDate() + "</button>"; }
      f.querySelector(".cal").innerHTML = '<div class="cal-h"><b>' + MONTH[st.m] + " " + st.y + "<i>" + MZ[st.m] + '月</i></b><button type="button" data-m="-1" aria-label="上个月">' + CH + '</button><button type="button" data-m="1" aria-label="下个月">' + CHR + "</button></div>" +
        '<div class="cal-g">' + "一二三四五六日".split("").map(function (c) { return "<span>" + c + "</span>"; }).join("") + h + "</div>";
      f.querySelector(".s-due").classList.toggle("on", st.due && !!st.date); f.querySelector(".s-due").hidden = !st.date;
    }
    function save() {
      var title = tIn.value.trim(), time = readTime(hIn.value), note = nIn.value.trim(), p = {}, due = st.due && !!st.date;
      if (!title) { tIn.focus(); return; }
      if (time == null) { hIn.classList.remove("bad"); void hIn.offsetWidth; hIn.classList.add("bad"); hIn.focus(); toast("钟点写成 15:30 这样"); return; }
      if (title !== it.title) p.title = title; if (st.owner !== (it.owner || "")) p.owner = st.owner; if (st.date !== (it.date || "")) p.date = st.date;
      if (time !== (it.time || "")) p.time = time; if (due !== !!it.due) p.due = due; if (note !== (it.note || "")) p.note = note;
      close(); if (!Object.keys(p).length) return;
      change(it.id, p); if ("date" in p || "owner" in p) toast(moved(p));
    }
    el.addEventListener("click", function (e) {
      var t = e.target, b;
      if (t === el || t.closest(".no")) { close(); return; }
      if (t.closest(".del")) { ask.confirm("删掉这一件？", { body: it.title, ok: "删掉", cancel: "留着", danger: true }).then(function (yes) { if (yes) { close(); remove(it.id); } }); return; }
      if ((b = t.closest("[data-o]"))) { st.owner = b.dataset.o; own(); return; }
      if ((b = t.closest("[data-m]"))) { st.m += +b.dataset.m; if (st.m < 0) { st.m = 11; st.y--; } else if (st.m > 11) { st.m = 0; st.y++; } days(); return; }
      if ((b = t.closest("[data-d]"))) { st.date = b.dataset.d; if (st.date) { var d = dOf(dayIdx(st.date)); st.y = d.getUTCFullYear(); st.m = d.getUTCMonth(); } days(); return; }
      if (t.closest(".s-due")) { st.due = !st.due; days(); }
    });
    f.addEventListener("submit", function (e) { e.preventDefault(); save(); });
    f.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target === nIn && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); } });
    own(); days(); document.body.appendChild(el);
    if (wide()) setTimeout(function () { tIn.focus(); tIn.setSelectionRange(tIn.value.length, tIn.value.length); }, 30);
  }
  /* what each of the four is called */
  function namesSlip() {
    if (slip) return;
    var el = sheet('<form class="slip" autocomplete="off"><h2>The four<i>四个人</i></h2><p class="s-say">每人一个名字；圆点里是名字的头一个字。</p>' +
      members.map(function (m) { return '<div class="s-name">' + pd(m.id) + '<input type="text" maxlength="12" data-n="' + m.id + '" value="' + esc(m.name) + '" aria-label="名字"></div>'; }).join("") +
      '<div class="a"><i></i><button type="button" class="no">算了</button><button type="submit" class="ok">存好</button></div></form>'), f = el.firstChild, close = slip.close;
    el.addEventListener("click", function (e) { if (e.target === el || e.target.closest(".no")) close(); });
    f.addEventListener("submit", function (e) {
      e.preventDefault(); var names = {}, was = members.map(function (m) { return { id: m.id, name: m.name }; });
      f.querySelectorAll("input[data-n]").forEach(function (inp) { var v = inp.value.trim().slice(0, 12); if (v && v !== nameOf(inp.dataset.n)) names[inp.dataset.n] = v; });
      close(); if (!Object.keys(names).length) return;
      members = members.map(function (m) { return { id: m.id, name: names[m.id] || m.name }; }); paintIam(); paintAll(); busy++;
      api("/members", { names: names }).then(function (d) { if (d.members) members = d.members; wrote(d.rev); }, function () { busy--; members = was; paintIam(); paintAll(); toast("名字没改成，再试一次"); });
    });
    document.body.appendChild(el);
  }

  /* ── the hand. On the head or on the board: take hold and pull, and the days go by (a phone's page is turned one day at
     a time; its head runs a day a moon). On a wide screen a thing taken hold of is carried instead: let go of it over a
     lane on some day and it is that person's, that day; where a lane begins, theirs with no day; beside the board, it
     waits to be taken on again. Held at either end of the week, the days come along. ── */
  function hands() {
    var ghost = null, dropEl = null, edgeT = 0;
    function target(e) { var el = document.elementFromPoint(e.clientX, e.clientY); if (!el || !el.closest) return null; return el.closest(".cell") || el.closest(".lane") || el.closest(".side"); }
    function down(zone, host) {
      host.addEventListener("pointerdown", function (e) {
        if (e.button || slip || hold) return;
        var t = e.target, en = t.closest(".en"), pans = zone === "band" || zone === "strip";
        if (t.closest("button, input, textarea, form")) return;
        if (!pans && !en) return;
        hold = { id: e.pointerId, zone: zone, host: host, pans: pans, x0: e.clientX, y0: e.clientY, c0: cur, x: e.clientX, t: performance.now(), v: 0, pan: false, carry: false, dir: 0,
          en: en && geo.wide && e.pointerType === "mouse" ? en : null };
        if (pans) to = cur;   // caught in mid-flight
      });
    }
    down("band", band); down("strip", strip); down("side", $("side")); down("who", $("who"));
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
        } else if (!h.pans || (!geo.wide && h.zone === "strip" && Math.abs(dy) > Math.abs(dx))) { hold = null; return; }   // the page is being scrolled, not the days
        else { h.pan = true; h.host.classList.add("held"); }
        try { h.host.setPointerCapture(e.pointerId); } catch (er) {}
      }
      if (h.pan) {
        h.v = h.v * .6 + ((e.clientX - h.x) / Math.max(1, now - h.t)) * .4; h.x = e.clientX; h.t = now;
        cur = to = h.c0 - dx / (h.zone === "band" ? geo.hw : geo.cw); kick(); return;
      }
      ghost.style.transform = "translate(" + (e.clientX + 14) + "px," + (e.clientY - 20) + "px) rotate(-1.5deg)";
      var t = target(e); if (t !== dropEl) { if (dropEl) dropEl.classList.remove("drop"); dropEl = t; if (t) t.classList.add("drop"); }
      var r = strip.getBoundingClientRect(), dir = e.clientX > r.right - 50 ? 1 : 0;   // at the far end of the week, the days come along
      if (dir !== h.dir) { h.dir = dir; clearInterval(edgeT); if (dir) edgeT = setInterval(function () { to = Math.round(to) + dir; kick(); }, 430); }
    });
    function up(e, lost) {
      var h = hold; if (!h || e.pointerId !== h.id) return; hold = null;
      if (h.carry) {
        clearInterval(edgeT); if (ghost) ghost.remove(); ghost = null; clickAt = performance.now();
        document.querySelectorAll(".en.lift").forEach(function (n) { n.classList.remove("lift"); });
        if (dropEl) dropEl.classList.remove("drop"); dropEl = null;
        var t = lost ? null : target(e), it = h.it, p = {}, want = null;
        if (t && t.classList.contains("cell")) want = { owner: t.dataset.m, date: t.closest(".col").dataset.d };
        else if (t && t.classList.contains("lane")) want = { owner: t.dataset.m, date: "" };
        else if (t) want = { owner: "" };   // beside the board: it waits to be taken on again (its day stays)
        if (!want) return;
        if (want.owner !== (it.owner || "")) p.owner = want.owner; if ("date" in want && want.date !== (it.date || "")) p.date = want.date;
        if (Object.keys(p).length) { change(it.id, p); toast(moved(p)); }
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
      var cell = e.target.closest(".cell, .lane"), now = performance.now();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault(); cur = to = cur + e.deltaX / geo.cw; lay();
        clearTimeout(wheel.t); wheel.t = setTimeout(function () { to = Math.round(cur); kick(); }, 150); return;
      }
      if (cell && !e.shiftKey && cell.scrollHeight > cell.clientHeight + 2) return;   // a lane with more on a day than fits: its own list is what scrolls
      e.preventDefault(); if (now - wheel.at > 400) wheel.acc = 0; wheel.acc += e.deltaY * (e.deltaMode === 1 ? 33 : 1);
      if (Math.abs(wheel.acc) >= 40 && now - wheel.at > 110) { to = Math.round(to) + (wheel.acc > 0 ? 1 : -1); wheel.acc = 0; wheel.at = now; kick(); }
    }, { passive: false });
  }

  document.addEventListener("click", function (e) {
    var t = e.target, b, it; if (!t.closest || slip) return;
    if (performance.now() - clickAt < 350) { e.preventDefault(); return; }   // the end of a pull, or of a carry, is not a touch
    if ((b = t.closest(".take"))) { change(b.closest(".en").dataset.id, { owner: me }); toast("归 " + nameOf(me) + " 了"); return; }
    if ((b = t.closest(".tk"))) { it = find(b.closest(".en").dataset.id); if (it) change(it.id, { done: !it.done }); return; }
    if (t.closest("#rename")) { namesSlip(); return; }
    if ((b = t.closest("[data-me]"))) { setMe(b.dataset.me); return; }
    if ((b = t.closest('[data-act="done"]'))) { showDone = !showDone; paintSide(); return; }
    if ((b = t.closest(".dy"))) { go(+b.dataset.i); if (!geo.wide) band.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if ((b = t.closest(".en"))) { openSlip(b.dataset.id); return; }
    if ((b = t.closest(".hd"))) { go(+b.dataset.i); return; }
    if ((b = t.closest(".cell, .lane")) && !t.closest(".add")) write(b);   // the blank of a lane: write there
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
  paintIam(); rebuild(); hands();
  var sized = 0;
  window.addEventListener("resize", function () { clearTimeout(sized); sized = setTimeout(function () { var w = geo.wide; if (measure() || w !== geo.wide) rebuild(); else { lay(); rest(); } }, 120); });
  function first(d) { loaded = true; take(d); paintIam(); paintAll(); }
  (window.NYX_PLAN_EARLY || Promise.reject()).then(first, function () { return api("").then(first); }).catch(function () { loaded = true; $("lists").innerHTML = '<p class="empty">日程那边没有应答，过一会儿再来。</p>'; });
  function poll() { if (!document.hidden && loaded) load().then(paintIam, function () {}); }
  setInterval(poll, 25000); document.addEventListener("visibilitychange", poll); window.addEventListener("focus", poll);
})();
