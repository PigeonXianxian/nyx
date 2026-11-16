/* Nyx — Read (一起读). The reading library, in the house's own hand.
   The library is 墨阅 next door (it collects, translates, writes the day's brief); the relay carries this page's
   requests to it (relay/nyx_read.py), so the house's key is the only key.
     #today[/YYYY-MM-DD]   the day's sheet: the brief by section, and what is worth reading
     #shelf                everything collected, newest first, by day
     #kept                 what is half read, and what was kept
     #a/<id>               one article, open — beside the list it came from, on a wide screen
   A wide screen is laid out as a spread: the spine on the left (the name, the day and its moon, where to go, the days
   before), the sheet in the middle, and — once a piece is opened — the pile it came from as a rail with the piece
   beside it. A phone gets one column: the spine is the head of the sheet, and an open piece takes the whole screen.
   What is drawn is drawn with the shared pencil case (G.sk, eye/orrery.js): the moon of the day, the days before as
   moons, each source's seal, and the small moons that say how far a thing has been read (none: not opened — a blue
   dot instead; new: opened; then waxing; full: read to the end). */
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
  var WAIT = '<p class="none wait">在取……</p>';

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
  var G = window.Gou, SK = G && G.sk, drawn = {};
  function dark() { return root.dataset.side === "moon"; }
  function sheetOf(w, h) { var S = 3, c = document.createElement("canvas"); c.width = w * S; c.height = h * S; var x = c.getContext("2d"); x.scale(S, S); return [c, x]; }
  function pens(x, onDark) { return { blue: SK.pen(x, onDark ? "rdBlueN" : "rdBlue", onDark ? [128, 138, 252] : [36, 46, 184], .92), lead: SK.pen(x, onDark ? "rdLeadN" : "rdLead", onDark ? [226, 223, 216] : [40, 40, 48], .6) }; }
  /* a phase of the moon about the middle of its own small sheet: i 0 new … 4 full … 7 the last sliver; onDark: for a dark ground */
  function moonImg(i, R, onDark) {
    var k = "m" + i + "|" + R + "|" + (onDark ? 1 : 0); if (drawn[k]) return drawn[k]; if (!SK || !window.rough) return "";
    var W = Math.ceil(R * 2 + 8), cx = sheetOf(W, W), x = cx[1], p = pens(x, onDark); x.translate(W / 2, W / 2); SK.wf(1);
    SK.put(x, SK.moon(window.rough.generator(), R, i, p.blue, p.lead, 300 + i * 17 + Math.round(R)));
    return (drawn[k] = cx[0].toDataURL("image/png"));
  }
  function moon(i) { return moonImg(i, 7.4, dark()); }                       // how far a piece has been read
  function phase(a) { return a.completed ? 4 : a.progress > .66 ? 3 : a.progress > .33 ? 2 : a.progress > .02 ? 1 : a.read ? 0 : -1; }
  function sky(day) { return G && G.moonAge ? Math.round(G.moonAge(new Date(day + "T12:00:00Z")) / 29.530588853 * 8) % 8 : 0; }   // the moon that night
  /* a source's seal: its mark in a ring struck a little crooked (a programme's in a square frame) */
  var SEALS = { "qbitai": "量", "qbitai-xhs": "量", "latepost": "晚", "anthropic-engineering": "A", "anthropic-research": "A", "claude-articles": "C", "openai-codex": "O", "boris-cherny": "B", "thariq-shihipar": "T",
    "bilibili-d7": "D7", "bilibili-zhangxiaojun": "珺", "bilibili-whynottv": "W", "x-anthropic": "X", "x-openai-devs": "X", "x-karpathy": "X" };
  function seal(sourceId, onDark) {
    var ch = SEALS[sourceId] || "·", od = onDark == null ? dark() : !!onDark, video = /^bilibili/.test(sourceId || ""), k = "s" + ch + (od ? 1 : 0) + (video ? "v" : "");
    if (drawn[k]) return drawn[k]; if (!SK || !window.rough) return "";
    var W = 34, cx = sheetOf(W, W), x = cx[1], p = pens(x, od), g = window.rough.generator(), n = ch.charCodeAt(0), r = G.rng(n * 31 + 7), O = SK.opts; SK.wf(1);
    x.translate(W / 2 + (r() - .5), W / 2 + (r() - .5)); x.rotate((r() - .5) * .22);
    SK.put(x, video ? [g.rectangle(-12.5, -12.5, 25, 25, O({ seed: 40 + n, roughness: 1.2, strokeWidth: 1.3, stroke: p.blue }))]
      : [g.circle(0, 0, 27, O({ seed: 40 + n, roughness: 1.4, bowing: 1.3, strokeWidth: 1.3, stroke: p.blue, curveFitting: .955 })),
        g.arc(0, 0, 20.5, 20, r() * 6.28, r() * 6.28 + 4.4, false, O({ seed: 60 + n, roughness: 1.5, strokeWidth: .8, stroke: p.blue }))]);
    x.fillStyle = p.blue; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = HAN.test(ch) ? "500 14px " + G.HAN : (ch.length > 1 ? "italic 600 13px " : "italic 600 17px ") + G.SERIF;
    x.fillText(ch, 0, HAN.test(ch) ? .5 : 1);
    return (drawn[k] = cx[0].toDataURL("image/png"));
  }
  function sealImg(sourceId, onDark, cls) { return '<img class="seal' + (cls ? " " + cls : "") + '" alt="" width="34" height="34" data-s="' + esc(sourceId || "") + '"' + (onDark == null ? "" : ' data-d="' + (onDark ? 1 : 0) + '"') + ' src="' + seal(sourceId, onDark) + '">'; }
  // the seals carry a letter: once the page's own types have arrived, strike them again in the right face
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    Object.keys(drawn).forEach(function (k) { if (k.charAt(0) === "s") delete drawn[k]; });
    document.querySelectorAll("img.seal").forEach(function (im) { im.src = seal(im.dataset.s, im.dataset.d == null ? null : im.dataset.d === "1"); });
  });

  /* ── covers: the first figure of a piece, small, fetched as the card comes near ── */
  var coverUrl = {}, coverIO = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { coverIO.unobserve(e.target); loadCover(e.target); } }); }, { rootMargin: "400px" }) : null;
  function loadCover(el) {
    var id = el.dataset.cover; if (!id) return;
    (coverUrl[id] || (coverUrl[id] = fetch(RELAY + "/app/read/cover/" + id, { headers: { "Authorization": "Bearer " + key } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) { return URL.createObjectURL(b); })))
      .then(function (u) { el.style.backgroundImage = 'url("' + u + '")'; el.classList.add("has"); }, function () { el.classList.add("gone"); });
  }
  function covers(scope) { scope.querySelectorAll(".cv[data-cover]:not(.has):not(.gone)").forEach(function (el) { if (coverIO) coverIO.observe(el); else loadCover(el); }); }

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
      '<span class="mt">' + (ph >= 0 ? '<img class="mn" alt="" width="20" height="20" src="' + moon(ph) + '">' : "") + "<span>" + metaOf(a) + (a.favorite ? ' · <i class="kp">留着</i>' : "") + "</span></span></span>" + (kind === "ft" ? "" : th) + "</a>";
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

  /* ── the spine: the day and its moon, the days before, the last look for new things ── */
  var cal = { dates: [], cur: null };
  function spineDay() {
    if (!G) return;
    var t = today(), d = new Date(t + "T00:00:00Z"), onDark = !dark();   // the spine is laid in the other side's ground
    $("spDay").innerHTML = '<b class="dn">' + d.getUTCDate() + '</b><span class="dm"><i>' + WEEKDAY[d.getUTCDay()] + "</i><i>" + MONTH[d.getUTCMonth()] + " " + d.getUTCFullYear() + "</i></span>" +
      '<span class="sk"><img class="sky" alt="" width="68" height="68" src="' + moonImg(sky(t), 30, onDark) + '"><small>the moon tonight<br>age ' + G.moonAge(new Date()).toFixed(1) + " d</small></span>";
  }
  function spineCal() {
    var onDark = !dark(), t = today(), list = cal.dates.slice(0, 12);
    $("spCal").innerHTML = list.length ? '<h4><span>往日简报</span><i>the days before</i></h4><div class="cal">' + list.map(function (d) {
      return '<a href="#today' + (d === t ? "" : "/" + d) + '"' + (d === cal.cur ? ' class="on"' : "") + ' title="' + zhDate(d + "T04:00:00Z") + '的简报"><img alt="" width="26" height="26" src="' + moonImg(sky(d), 9, onDark) + '"><i>' + (+d.slice(8)) + "</i></a>"; }).join("") + "</div>" : "";
  }
  var polling = 0;
  function spineFoot() {
    Promise.all([api("status"), api("articles?filter=unread&limit=1").catch(function () { return {}; }), api("articles?filter=favorites&limit=1").catch(function () { return {}; })]).then(function (r) {
      var s = r[0];
      $("nShelf").textContent = s.articleCount ? s.articleCount + " 篇" + (r[1].total ? " · " + r[1].total + " 没读" : "") : "";
      $("nKept").textContent = r[2].total ? r[2].total + " 篇" : "";
      $("spFoot").innerHTML = "<p>" + (s.collecting ? "正在找新的……" : "上次去找 · " + (clock(s.lastCollectionAt) || "还没有")) + '</p><button type="button" id="collect"' + (s.collecting ? " disabled" : "") + ">去找新的</button>";
      $("collect").onclick = function () {
        this.disabled = true;
        api("collect", { method: "POST", body: {} }).then(function () { toast("去找了，过一会儿回来看"); watch(); }, function (e) { toast(e.message || "没去成"); spineFoot(); });
      };
      if (s.collecting) watch();
    }).catch(function () {});
  }
  function watch() { clearTimeout(polling); polling = setTimeout(function () { api("status").then(function (s) { if (s.collecting) watch(); else { spineFoot(); if ($("reading").hidden) { shown = null; route(); } } }, watch); }, 6000); }

  /* ── Today: the day's sheet ── */
  var SECT = [["ai", "AI", "Artificial intelligence"], ["world", "世界局势", "The world"], ["business", "商业", "Business"], ["interview", "访谈", "Conversations"]];
  function early(k) { var e = RELAY === "/relay" && window.NYX_READ_EARLY, v = e && e[k]; if (e) e[k] = null; return v || null; }
  function viewToday(date) {
    view.className = "view today"; view.innerHTML = WAIT; shown0();
    var want = "briefs" + (date ? "?date=" + encodeURIComponent(date) : ""), e = RELAY === "/relay" && window.NYX_READ_EARLY, mine = [], picked = [], token = shown;
    var pb = e && e.brief === want && e.b ? early("b").catch(function () { return api(want); }) : api(want);
    var pr = (early("r") || api("recommendations")).catch(function () { return api("recommendations"); }).catch(function () { return null; });
    pb.then(function (b) {
      if (shown !== token) return;
      var items = (b.brief && b.brief.items) || [], seen = {}, n = 0, isToday = b.date === b.today;
      var h = '<header class="hd"><h2>' + (isToday ? "今日新鲜事" : zhDate(b.date + "T04:00:00Z") + "的新鲜事") + "</h2><p>" + latinDay(b.date) + (items.length ? " · " + items.length + " 条" : "") + (isToday ? "" : ' · <a href="#today">回到今天</a>') + "</p></header>" +
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
      var others = (b.dates || []).filter(function (d) { return d !== b.date; }).slice(0, 9);
      if (others.length) h += '<nav class="days"><span>前几天</span>' + (isToday ? "" : '<a href="#today">今天</a>') + others.map(function (d) { return '<a href="#today/' + d + '">' + (+d.slice(5, 7)) + "." + (+d.slice(8)) + "</a>"; }).join("") + "</nav>";
      h += '</div><div class="col picks" id="picks">' + WAIT + "</div>";
      view.innerHTML = h; stamps(view); pile(mine.concat(picked));
      cal.dates = b.dates || []; cal.cur = b.date; spineCal();
      var rg = $("regen"); if (rg) rg.onclick = function () {
        ask.confirm("现在写今天的简报？", { body: "要用两次模型调用，今天还剩 " + b.budget.remaining + " 次。", ok: "写", cancel: "先不" }).then(function (yes) {
          if (!yes) return; rg.disabled = true; rg.textContent = "在写……";
          api("briefs/regenerate", { method: "POST", body: {} }).then(function () { shown = null; route(); }).catch(function (e2) { toast(e2.message || "没写成"); rg.disabled = false; rg.textContent = "现在写一份"; });
        });
      };
      return pr;
    }).then(function (rec) {
      if (shown !== token || !$("picks")) return;
      var daily = (rec && rec.daily) || [], weekly = (rec && rec.weekly) || [], h = "";
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
  var A = null, mode = null, saveT = 0, saved = { blockId: null, progress: -1 }, cur = { blockId: null, progress: 0 }, listY = 0, heads = [];
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
    if (b.type === "image") { var u = safeUrl(b.url); return "<figure" + at + "><span>" + (t || "原文配图") + "</span>" + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">看原图</a>' : "") + "</figure>"; }
    return "<p" + at + ">" + t + "</p>";
  }
  function coverage(a) {
    var ch = (a.chapters || []).length;
    return a.coverage === "description" ? (ch ? "依据节目简介与章节，没有口播内容" : "依据节目简介，没有口播内容") : a.coverage === "title" ? (ch ? "依据节目标题与章节，没有口播内容" : "依据节目标题，没有口播内容") :
      a.coverage === "post" ? "X 上的单条推文" : a.coverage === "caption" ? "视频简介，没有字幕" : a.coverage === "text-and-images" ? "图文正文，图里的字没有转录" : "";
  }
  function renderArticle() {
    var a = A, pr = pairs(a), isVideo = /^bilibili-/.test(a.sourceId || "") || a.contentKind === "video";
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
      (a.recommendation && a.recommendation !== a.evidence ? '<p class="how">' + esc(a.recommendation) + "</p>" : "") + (a.evidence || coverage(a) ? '<p class="how">' + esc(a.evidence || coverage(a)) + "</p>" : "") + "</aside>";
    var chapters = (a.chapters || []).filter(function (c) { return c && typeof c.title === "string" && c.title.indexOf("商单") < 0; });
    if (chapters.length) {   // the programme's chapters: beads on a line, each with its time
      var base = safeUrl(a.url);
      h += '<ol class="beads">' + chapters.map(function (c) { var s = Math.max(0, Math.round(+c.from || +c.start || 0)); return "<li>" + (base ? '<a href="' + esc(base + (base.indexOf("?") < 0 ? "?" : "&") + "t=" + s) + '" target="_blank" rel="noopener noreferrer">' : "<span>") + "<time>" + dur(s) + "</time>" + esc(c.title) + (base ? "</a>" : "</span>") + "</li>"; }).join("") + "</ol>";
    }
    if (a.blockId && a.progress > .03 && !a.completed) h += '<p class="resume"><button type="button" id="resume">上次读到 ' + Math.round(a.progress * 100) + "% ，接着读</button></p>";
    if (!a.hasReadableBody) h += '<p class="none">这一篇没有可读的正文' + (isVideo ? "，只有节目信息。" : "。") + "</p>";
    heads = [];
    h += '<div class="body ' + mode + '" id="body">' + (a.blocks || []).map(function (b, i) {
      var x = pr && pr[i], inner;
      if (b.type === "heading" && i < 2 && (b.text === a.title || b.text === zhTitle)) return '<div class="blk dup" id="b-' + esc(b.id) + '" data-id="' + esc(b.id) + '"></div>';   // the title again, as the body's first line
      if (b.type === "heading") heads.push({ id: b.id, text: x && mode !== "src" ? x.text : b.text, level: Math.max(2, Math.min(4, +b.level || 2)) });
      if (x && mode === "both") inner = blockHtml(x, "zh", "zh-CN") + blockHtml(b, "src", "en");
      else if (x && mode === "zh") inner = blockHtml(x, "zh", "zh-CN");
      else inner = blockHtml(b, "one", pr ? "en" : "");
      return '<div class="blk' + (x && mode === "both" ? " pair" : "") + (b.type === "heading" ? " hd" : "") + '" id="b-' + esc(b.id) + '" data-id="' + esc(b.id) + '">' + inner + "</div>";
    }).join("") + "</div>";
    h += '<footer class="end"><p class="rate" id="rate"><span>这一篇值几颗月亮</span>' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-n="' + n + '" aria-label="' + n + ' 颗"><img alt="" width="24" height="24" src="' + moonImg((a.rating || 0) >= n ? 4 : 0, 8.4, dark()) + '"></button>'; }).join("") + "</p>" +
      '<p class="act"><button type="button" id="done"' + (a.completed ? ' class="on"' : "") + ">" + (a.completed ? "读完了 · 已记下" : "读完了") + '</button><button type="button" id="nextb">下一篇</button></p></footer>';
    sheet.innerHTML = h; sheet.dataset.size = ls("read_size") || "1"; $("ar").classList.toggle("both", mode === "both" && !!pr);
    tools(pr); toc();
    var rs = $("resume"); if (rs) rs.onclick = function () { var el = document.getElementById("b-" + A.blockId); if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); rs.parentNode.remove(); };
    $("done").onclick = function () { state({ read: true, completed: !A.completed }).then(function () { $("done").textContent = A.completed ? "读完了 · 已记下" : "读完了"; $("done").classList.toggle("on", !!A.completed); }); };
    $("nextb").onclick = function () { step(1); }; $("nextb").hidden = at(1) == null;
    $("rate").querySelectorAll("button").forEach(function (b) { b.onclick = function () { var n = +b.dataset.n; state({ rating: A.rating === n ? null : n }).then(function () { $("rate").querySelectorAll("img").forEach(function (im, i) { im.src = moonImg((A.rating || 0) > i ? 4 : 0, 8.4, dark()); }); }); }; });
  }
  function tools(pr) {
    var a = A, t = "";
    if (pr) t += '<span class="seg" id="seg">' + [["zh", "中文"], ["both", "对照"], ["src", "原文"]].map(function (m) { return '<button type="button" data-m="' + m[0] + '"' + (mode === m[0] ? ' class="on"' : "") + ">" + m[1] + "</button>"; }).join("") + "</span>";
    t += '<button type="button" class="tb" id="size" title="字的大小">' + ico("size") + '<span>字号</span></button><button type="button" class="tb' + (a.favorite ? " on" : "") + '" id="keep">' + ico("keep") + "<span>" + (a.favorite ? "留着了" : "留着") + "</span></button>" +
      '<button type="button" class="tb" id="orig">' + ico("out") + '<span>原文</span></button><button type="button" class="tb go" id="talk">' + ico("talk") + "<span>拿去聊</span></button>";
    $("tools").innerHTML = t;
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
    if (!A || !A.hasReadableBody || !cur.blockId || (cur.blockId === saved.blockId && Math.abs(cur.progress - saved.progress) < .01)) return;
    if (A.completed && cur.progress < A.progress) return;   // a finished piece is not un-read by scrolling back up
    saved = { blockId: cur.blockId, progress: cur.progress };
    api("articles/" + A.id + "/state", { method: "PATCH", body: saved, keep: keep === true }).then(function (s) { if (A) for (var k in s) A[k] = s[k]; }).catch(function () {});
  }
  function at(d) { if (!A) return null; for (var i = 0; i < ctx.length; i++) if (ctx[i].id === A.id) return ctx[i + d] ? ctx[i + d].id : null; return null; }
  function step(d) { var id = at(d); if (!id) return; history.replaceState(null, "", "#a/" + id); route(); }
  function rail(id) {
    var el = $("rail");
    if (el.dataset.n !== String(ctx.length) || !el.firstChild) {
      el.innerHTML = '<h4><span>这一叠</span><i>' + ctx.length + "</i></h4>" + ctx.map(function (c) { return '<a href="#a/' + esc(c.id) + '" data-id="' + esc(c.id) + '"' + (c.read === false ? ' class="new"' : "") + ">" + sealImg(c.sourceId) + "<span><b>" + esc(c.title) + "</b><small>" + c.meta + "</small></span></a>"; }).join("");
      el.dataset.n = String(ctx.length);
      el.querySelectorAll("a").forEach(function (l) { l.onclick = function (e) { e.preventDefault(); if (A && A.id === l.dataset.id) return; history.replaceState(null, "", "#a/" + l.dataset.id); route(); }; });
    }
    el.querySelectorAll("a").forEach(function (l) { var on = l.dataset.id === id; l.classList.toggle("on", on); if (on && l.scrollIntoView) l.scrollIntoView({ block: "nearest" }); });
  }
  function openArticle(id) {
    flush(true);
    if ($("reading").hidden) { listY = wide() ? $("browse").scrollTop : window.scrollY; $("browse").hidden = true; $("reading").hidden = false; root.classList.add("is-reading"); $("rail").dataset.n = ""; }
    rail(id);
    $("tools").innerHTML = ""; $("prog").textContent = ""; $("ah").style.setProperty("--p", "0%"); $("toc").innerHTML = ""; sheet.innerHTML = WAIT; $("ar").scrollTop = 0; if (!wide()) window.scrollTo(0, 0);
    A = null; saved = { blockId: null, progress: -1 }; cur = { blockId: null, progress: 0 };
    api("articles/" + encodeURIComponent(id)).then(function (a) {
      if ((location.hash || "").slice(3) !== id) return;   // another piece was asked for meanwhile
      A = a; saved = { blockId: a.blockId, progress: a.progress || 0 }; mode = mode === "src" ? "src0" : mode; renderArticle();
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
    var a = A; $("reading").hidden = true; $("browse").hidden = false; root.classList.remove("is-reading"); sheet.innerHTML = "";
    if (a) { var c = byId[a.id]; if (c) { ["read", "favorite", "completed", "progress", "blockId", "rating"].forEach(function (k) { c[k] = a[k]; }); strike(c); } }
    A = null; if (wide()) $("browse").scrollTop = listY; else window.scrollTo(0, listY);
  }
  $("ar").addEventListener("scroll", place, { passive: true });
  window.addEventListener("scroll", function () { if (!wide()) place(); }, { passive: true });
  window.addEventListener("pagehide", function () { flush(true); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) flush(true); });

  /* ── which page is open ── */
  var shown = null;
  function route() {
    var h = (location.hash || "#today").slice(1), m = h.match(/^a\/([A-Za-z0-9_-]{1,128})$/);
    if (m) { if (!shown) { shown = "shelf"; mark("shelf"); viewShelf(); } openArticle(m[1]); return; }
    if (!$("reading").hidden) closeArticle();
    var d = h.match(/^today\/(\d{4}-\d{2}-\d{2})$/), v = d ? "today" : (h === "shelf" || h === "kept") ? h : "today", id = v + (d ? "/" + d[1] : "");
    if (shown === id) return;
    shown = id; mark(v);
    if (v === "today") viewToday(d && d[1]); else if (v === "shelf") viewShelf(); else viewKept();
  }
  function mark(v) { $("spNav").querySelectorAll("a").forEach(function (a) { a.classList.toggle("on", a.dataset.v === v); }); }
  window.addEventListener("hashchange", route);
  $("back").onclick = function () { location.href = "./"; };
  $("aback").onclick = function () { if (history.length > 1 && shown) history.back(); else location.hash = "#shelf"; };
  $("prev").onclick = function () { step(-1); }; $("next").onclick = function () { step(1); };
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
  /* the spine's edge goes off into grain, as the band does on the home: a strip of specks, thick at the spine and thinning away */
  function edge() {
    var W = 46, H = 420, cx = sheetOf(W, H), x = cx[1], r = G ? G.rng(77) : Math.random, i;
    x.fillStyle = getComputedStyle(root).getPropertyValue("--ink").trim() || "#1B1B20";
    for (i = 0; i < 1500; i++) { var u = r(), px = W * Math.pow(u, 2.6), s = .45 + r() * (1.15 - u * .6); x.globalAlpha = .55 + r() * .45; x.fillRect(px, r() * H, s, s); }
    $("rdx").style.setProperty("--edge", 'url("' + cx[0].toDataURL("image/png") + '")');
  }
  if (G) edge();
  spineDay(); route(); setTimeout(spineFoot, 1200);   // the sheet first; the counts on the spine can follow
})();
