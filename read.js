/* Nyx — Read (一起读). The reading library, in the house's own hand.
   The library is 墨阅 next door (it collects, translates, writes the day's brief); the relay carries this page's
   requests to it (relay/nyx_read.py), so the house's key is the only key.
     #today[/YYYY-MM-DD]   the day's sheet: a postmark, the brief by section, what is worth reading
     #shelf                everything collected, newest first, by day
     #kept                 what is half read, and what was kept
     #a/<id>               one article, open
   What is drawn is drawn with the shared pencil case (G.sk, eye/orrery.js): the day's postmark (eye/postmark.js) and the
   small moons that say how far a thing has been read — none: not opened (a blue dot instead); new: opened; then waxing;
   full: read to the end. */
(function () {
  "use strict";
  var C = window.NYX || {}, RELAY = C.relay || "/relay", root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var key = null; try { key = localStorage.getItem("nyx_key"); } catch (e) {}
  if (!key) { location.replace("./"); return; }
  if (window.NyxPaper) window.NyxPaper.paint();
  var ask = window.NyxAsk, view = $("view"), sheet = $("sheet"), toastT = 0;
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t) { var el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("on"); }, 2400); }
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

  /* ── days, as the library counts them (Shanghai) ── */
  var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  function shDay(v) { var t = Date.parse(v || ""); return isFinite(t) ? new Date(t + 8 * 3600000).toISOString().slice(0, 10) : null; }
  function today() { return shDay(new Date().toISOString()); }
  function ago(day) { return Math.round((Date.parse(today() + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86400000); }
  function zhDate(v) { var d = shDay(v); if (!d) return ""; var p = d.split("-"), y = today().slice(0, 4); return (p[0] !== y ? p[0] + "年" : "") + (+p[1]) + "月" + (+p[2]) + "日"; }
  function latinDay(day) { var d = new Date(day + "T00:00:00Z"); return WD[d.getUTCDay()] + " · " + d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function dur(s) { s = Math.max(0, Math.round(+s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), z = function (n) { return (n < 10 ? "0" : "") + n; }; return (h ? h + ":" + z(m) : m) + ":" + z(s % 60); }

  /* ── the small moons: how far a thing has been read, in blue pencil ── */
  var moons = {};
  function moon(i) {
    var dark = root.dataset.side === "moon", k = (dark ? "n" : "d") + i; if (moons[k]) return moons[k];
    var G = window.Gou, SK = G && G.sk; if (!SK || !window.rough) return "";
    var S = 3, W = 24, c = document.createElement("canvas"); c.width = c.height = W * S;
    var x = c.getContext("2d"); x.scale(S, S); x.translate(W / 2, W / 2); SK.wf(1);
    var blue = SK.pen(x, dark ? "rdBlueN" : "rdBlue", dark ? [128, 138, 252] : [36, 46, 184], .92), lead = SK.pen(x, dark ? "rdLeadN" : "rdLead", dark ? [226, 223, 216] : [40, 40, 48], .6);
    SK.put(x, SK.moon(window.rough.generator(), 8.4, i, blue, lead, 300 + i * 17));
    return (moons[k] = c.toDataURL("image/png"));
  }
  function phase(a) { return a.completed ? 4 : a.progress > .66 ? 3 : a.progress > .33 ? 2 : a.progress > .02 ? 1 : a.read ? 0 : -1; }

  /* ── one line of the shelf ── */
  function shortSource(n) { return String(n || "").replace(/\s*·\s*B站$/, "").replace(/\s*·\s*小红书$/, "").replace(/\s*·\s*X$/, ""); }
  function row(a) {
    var zh = a.translatedTitle && a.translatedTitle !== a.title ? a.translatedTitle : "", ph = phase(a), meta = [esc(shortSource(a.sourceName))];
    meta.push(zhDate(a.publishedAt || a.fetchedAt) || esc(a.dateLabel || ""));
    if (a.video && a.video.duration) meta.push("节目 " + dur(a.video.duration)); else if (a.readingMinutes) meta.push(a.readingMinutes + " 分钟");
    return '<a class="row' + (a.read ? "" : " new") + '" href="#a/' + esc(a.id) + '" data-id="' + esc(a.id) + '">' +
      '<span class="tx"><b class="tt' + (/[\u3400-\u9fff]/.test(zh || a.title) ? "" : " la") + '">' + esc(zh || a.title) + "</b>" + (zh ? '<span class="ot" lang="en">' + esc(a.title) + "</span>" : "") +
      (a.summary ? '<span class="sm">' + esc(a.summary) + "</span>" : "") + '<span class="mt">' + meta.filter(Boolean).join(" · ") + (a.favorite ? ' · <i class="kp">留着</i>' : "") + "</span></span>" +
      (ph >= 0 ? '<img class="mn" alt="" width="24" height="24" src="' + moon(ph) + '">' : "") + "</a>";
  }
  function dayLabel(day, word) { return '<p class="day" data-ts="' + day + 'T04:00:00Z"><span>' + latinDay(day) + (word ? "<em>" + esc(word) + "</em>" : "") + "</span></p>"; }
  function stamps(el) { if (window.NyxPostmark) el.querySelectorAll(".day[data-ts]").forEach(function (d) { window.NyxPostmark(d, Date.parse(d.dataset.ts)); }); }
  var WAIT = '<p class="none wait">在取……</p>';

  /* ── Today: the day's sheet ── */
  var SECT = [["ai", "AI"], ["world", "世界局势"], ["business", "商业"], ["interview", "访谈"]];
  function viewToday(date) {
    view.innerHTML = WAIT;
    Promise.all([api("briefs" + (date ? "?date=" + encodeURIComponent(date) : "")), date ? null : api("recommendations").catch(function () { return null; })]).then(function (r) {
      var b = r[0], rec = r[1], h = dayLabel(b.date, b.date === b.today ? "今日新鲜事" : "那天的新鲜事"), items = (b.brief && b.brief.items) || [], seen = {};
      if (items.length) {
        h += '<div class="brief">';
        SECT.concat([["", "其他"]]).forEach(function (s) {
          var mine = items.filter(function (it) { if (seen[it.itemId || it.articleId + "|" + it.headline]) return false; return s[0] ? it.section === s[0] : true; });
          if (!mine.length) return;
          h += '<h3 class="sec"><span>' + s[1] + "</span></h3>";
          mine.forEach(function (it) {
            seen[it.itemId || it.articleId + "|" + it.headline] = 1;
            h += '<div class="bi"><button class="bh" type="button" aria-expanded="false"><span class="hl">' + esc(it.headline) + "</span><em>" + esc(it.sourceLabel || shortSource(it.sourceName)) + "</em></button>" +
              '<div class="bc" hidden><p>' + esc(it.card || "") + "</p><p class=\"go\"><a href=\"#a/" + esc(it.articleId) + '">读全文</a>' + (it.repeated ? "<span>" + esc(it.repeatLabel || "昨日已提及") + "</span>" : "") + "</p></div></div>";
          });
        });
        h += "</div>";
      } else {
        h += '<p class="none">' + (b.date === b.today ? "今天的还没写好。" : "这一天没有简报。") + "</p>";
        if (b.date === b.today && b.budget && b.budget.modelAvailable && b.budget.remaining >= b.budget.required) h += '<p class="act"><button type="button" id="regen">现在写一份</button></p>';
      }
      var others = (b.dates || []).filter(function (d) { return d !== b.date; }).slice(0, 9);
      if (others.length) h += '<nav class="days"><span>前几天</span>' + (b.date !== b.today ? '<a href="#today">今天</a>' : "") + others.map(function (d) { return '<a href="#today/' + d + '">' + (+d.slice(5, 7)) + "." + (+d.slice(8)) + "</a>"; }).join("") + "</nav>";
      if (rec && ((rec.daily || []).length || (rec.weekly || []).length)) {
        if ((rec.daily || []).length) h += '<h3 class="sec wide"><span>值得一读</span></h3><div class="list">' + rec.daily.map(row).join("") + "</div>";
        if ((rec.weekly || []).length) h += '<h3 class="sec wide"><span>这一周的</span></h3><div class="list">' + rec.weekly.map(row).join("") + "</div>";
      }
      view.innerHTML = h; stamps(view);
      view.querySelectorAll(".bh").forEach(function (bt) { bt.onclick = function () { var c = bt.nextElementSibling, open = c.hidden; c.hidden = !open; bt.setAttribute("aria-expanded", String(open)); bt.parentNode.classList.toggle("open", open); }; });
      var rg = $("regen"); if (rg) rg.onclick = function () {
        ask.confirm("现在写今天的简报？", { body: "要用两次模型调用，今天还剩 " + b.budget.remaining + " 次。", ok: "写", cancel: "先不" }).then(function (yes) {
          if (!yes) return; rg.disabled = true; rg.textContent = "在写……";
          api("briefs/regenerate", { method: "POST", body: {} }).then(function () { viewToday(); }).catch(function (e) { toast(e.message || "没写成"); rg.disabled = false; rg.textContent = "现在写一份"; });
        });
      };
    }).catch(function (e) { view.innerHTML = trouble(e); });
  }

  /* ── Shelf: everything, by day ── */
  var CATS = [["", "全部"], ["ai", "AI"], ["development", "编程"], ["perspectives", "访谈"], ["world", "世界"]];
  var shelf = { cat: "", unread: false, q: "", items: [], total: 0, busy: false };
  function groupName(a) { var d = shDay(a.publishedAt || a.fetchedAt); if (!d) return "日期未知"; var n = ago(d); return n <= 0 ? "今天" : n === 1 ? "昨天" : n < 7 ? "这一周" : "更早"; }
  function listHtml(items) {
    var h = "", last = null;
    items.forEach(function (a) { var g = groupName(a); if (g !== last) { h += '<h3 class="sec wide"><span>' + g + "</span></h3>"; last = g; } h += row(a); });
    return h;
  }
  function shelfLoad(more) {
    if (shelf.busy) return; shelf.busy = true;
    var q = "articles?limit=30&offset=" + (more ? shelf.items.length : 0) + "&filter=" + (shelf.unread ? "unread" : "all") + (shelf.cat ? "&category=" + shelf.cat : "") + (shelf.q ? "&q=" + encodeURIComponent(shelf.q) : "");
    var list = $("list"); if (!more && list) list.innerHTML = WAIT;
    api(q).then(function (d) {
      shelf.busy = false; shelf.items = more ? shelf.items.concat(d.items) : d.items; shelf.total = d.total == null ? shelf.items.length : d.total;
      if (!$("list")) return;
      $("list").innerHTML = shelf.items.length ? listHtml(shelf.items) : '<p class="none">' + (shelf.q ? "没找到。" : shelf.unread ? "都读过了。" : "架上还是空的。") + "</p>";
      $("more").hidden = shelf.items.length >= shelf.total;
      $("count").textContent = shelf.total ? shelf.total + " 篇" : "";
    }).catch(function (e) { shelf.busy = false; if ($("list")) $("list").innerHTML = trouble(e); });
  }
  function viewShelf() {
    view.innerHTML = '<div class="flt" id="flt">' + CATS.map(function (c) { return '<button type="button" data-c="' + c[0] + '"' + (shelf.cat === c[0] ? ' class="on"' : "") + ">" + c[1] + "</button>"; }).join("") +
      '<button type="button" id="unr"' + (shelf.unread ? ' class="on"' : "") + '>没读过的</button><span class="count" id="count"></span></div>' +
      '<label class="find"><span>找</span><input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="题目、来源、说到的东西" value="' + esc(shelf.q) + '"></label>' +
      '<div class="list" id="list"></div><p class="act"><button type="button" id="more" hidden>再往前</button></p>';
    $("flt").querySelectorAll("[data-c]").forEach(function (b) { b.onclick = function () { shelf.cat = b.dataset.c; viewShelf(); }; });
    $("unr").onclick = function () { shelf.unread = !shelf.unread; viewShelf(); };
    var t = 0; $("q").oninput = function () { clearTimeout(t); var v = this.value.trim(); t = setTimeout(function () { if (v !== shelf.q) { shelf.q = v; shelfLoad(); } }, 380); };
    $("more").onclick = function () { shelfLoad(true); };
    shelfLoad();
  }

  /* ── Kept: half read, and kept ── */
  function viewKept() {
    view.innerHTML = WAIT;
    Promise.all([api("articles?filter=continue&limit=30"), api("articles?filter=favorites&limit=60")]).then(function (r) {
      var h = "";
      if (r[0].items.length) h += '<h3 class="sec wide"><span>读到一半</span></h3><div class="list">' + r[0].items.map(row).join("") + "</div>";
      if (r[1].items.length) h += '<h3 class="sec wide"><span>留着的</span></h3><div class="list">' + r[1].items.map(row).join("") + "</div>";
      view.innerHTML = h || '<p class="none">还没有留下什么。读到想留的，在文章里点「留着」。</p>';
    }).catch(function (e) { view.innerHTML = trouble(e); });
  }

  /* ── one article ── */
  var A = null, mode = null, saveT = 0, saved = { blockId: null, progress: -1 }, cur = { blockId: null, progress: 0 }, listY = 0;
  var wide = function () { return window.matchMedia("(min-width:1000px)").matches; };
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
    var meta = [esc(shortSource(a.sourceName)), a.author && a.author !== a.sourceName && shortSource(a.sourceName).indexOf(a.author) < 0 ? esc(a.author) : "", zhDate(a.publishedAt || a.fetchedAt) || esc(a.dateLabel || ""),
      a.video && a.video.duration ? "节目 " + dur(a.video.duration) : a.readingMinutes ? a.readingMinutes + " 分钟" : ""].filter(Boolean).join(" · ");
    var h = '<p class="meta">' + meta + "</p>";
    var shownTitle = zhTitle && mode !== "src" ? zhTitle : a.title;
    h += '<h1 class="title' + (shownTitle.length > 34 ? " long" : "") + '"' + (zhTitle && mode !== "src" ? "" : ' lang="' + (/[㐀-鿿]/.test(a.title) ? "zh-CN" : "en") + '"') + ">" + esc(shownTitle) + "</h1>";
    if (zhTitle && mode !== "src") h += '<p class="otitle" lang="en">' + esc(a.title) + "</p>";
    if ((a.tags || []).length) h += '<p class="tags">' + a.tags.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</p>";
    if (a.summary || a.recommendation || a.evidence) h += '<aside class="lead"><b>导读</b>' + (a.summary ? "<p>" + esc(a.summary) + "</p>" : "") +
      (a.recommendation && a.recommendation !== a.evidence ? '<p class="how">' + esc(a.recommendation) + "</p>" : "") + (a.evidence || coverage(a) ? '<p class="how">' + esc(a.evidence || coverage(a)) + "</p>" : "") + "</aside>";
    var chapters = (a.chapters || []).filter(function (c) { return c && typeof c.title === "string" && c.title.indexOf("商单") < 0; });
    if (chapters.length) {   // the programme's chapters: beads on the plumb line
      var base = safeUrl(a.url);
      h += '<ol class="beads">' + chapters.map(function (c) { var s = Math.max(0, Math.round(+c.from || +c.start || 0)); return "<li>" + (base ? '<a href="' + esc(base + (base.indexOf("?") < 0 ? "?" : "&") + "t=" + s) + '" target="_blank" rel="noopener noreferrer">' : "<span>") + "<time>" + dur(s) + "</time>" + esc(c.title) + (base ? "</a>" : "</span>") + "</li>"; }).join("") + "</ol>";
    }
    if (a.blockId && a.progress > .03 && !a.completed) h += '<p class="resume"><button type="button" id="resume">上次读到 ' + Math.round(a.progress * 100) + "% ，接着读</button></p>";
    if (!a.hasReadableBody) h += '<p class="none">这一篇没有可读的正文' + (isVideo ? "，只有节目信息。" : "。") + "</p>";
    h += '<div class="body ' + mode + '" id="body">' + (a.blocks || []).map(function (b, i) {
      var x = pr && pr[i], inner;
      if (x && mode === "both") inner = blockHtml(x, "zh", "zh-CN") + blockHtml(b, "src", "en");
      else if (x && mode === "zh") inner = blockHtml(x, "zh", "zh-CN");
      else inner = blockHtml(b, "one", pr ? "en" : "");
      if (b.type === "heading" && i < 2 && (b.text === a.title || b.text === zhTitle)) return '<div class="blk dup" id="b-' + esc(b.id) + '" data-id="' + esc(b.id) + '"></div>';   // the title again, as the body's first line
      return '<div class="blk' + (x && mode === "both" ? " pair" : "") + (b.type === "heading" ? " hd" : "") + '" id="b-' + esc(b.id) + '" data-id="' + esc(b.id) + '">' + inner + "</div>";
    }).join("") + "</div>";
    h += '<footer class="end"><p class="rate" id="rate" aria-label="几颗月亮">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-n="' + n + '" aria-label="' + n + '"><img alt="" width="24" height="24" src="' + moon((a.rating || 0) >= n ? 4 : 0) + '"></button>'; }).join("") + "</p>" +
      '<p class="act"><button type="button" id="done">' + (a.completed ? "读完了 · 已记下" : "读完了") + "</button></p></footer>";
    sheet.innerHTML = h; sheet.dataset.size = ls("read_size") || "1";
    tools(pr);
    var rs = $("resume"); if (rs) rs.onclick = function () { var el = document.getElementById("b-" + A.blockId); if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); rs.parentNode.remove(); };
    $("done").onclick = function () { state({ read: true, completed: !A.completed }).then(function () { $("done").textContent = A.completed ? "读完了 · 已记下" : "读完了"; }); };
    $("rate").querySelectorAll("button").forEach(function (b) { b.onclick = function () { var n = +b.dataset.n; state({ rating: A.rating === n ? null : n }).then(function () { $("rate").querySelectorAll("img").forEach(function (im, i) { im.src = moon((A.rating || 0) > i ? 4 : 0); }); }); }; });
  }
  function tools(pr) {
    var a = A, t = "";
    if (pr) t += '<span class="seg" id="seg">' + [["zh", "中文"], ["both", "对照"], ["src", "原文"]].map(function (m) { return '<button type="button" data-m="' + m[0] + '"' + (mode === m[0] ? ' class="on"' : "") + ">" + m[1] + "</button>"; }).join("") + "</span>";
    t += '<button type="button" id="size" aria-label="字的大小">字</button><button type="button" id="keep"' + (a.favorite ? ' class="on"' : "") + ">" + (a.favorite ? "留着了" : "留着") + "</button>" +
      '<button type="button" id="orig">原文</button><button type="button" id="talk">拿去聊</button>';
    $("tools").innerHTML = t;
    if (pr) $("seg").querySelectorAll("button").forEach(function (b) { b.onclick = function () { var at = cur.blockId; mode = b.dataset.m; ls("read_lang", mode); renderArticle(); var el = at && document.getElementById("b-" + at); if (el) el.scrollIntoView({ block: "start" }); }; });
    $("size").onclick = function () { var n = (+(ls("read_size") || 1) + 1) % 3; ls("read_size", String(n)); sheet.dataset.size = n; };
    $("keep").onclick = function () { state({ favorite: !A.favorite }).then(function () { $("keep").classList.toggle("on", !!A.favorite); $("keep").textContent = A.favorite ? "留着了" : "留着"; }); };
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
  function state(patch) {
    return api("articles/" + A.id + "/state", { method: "PATCH", body: patch }).then(function (s) { for (var k in s) A[k] = s[k]; return s; }).catch(function (e) { toast(e.message || "没记下"); throw e; });
  }
  /* where the reading has got to: the block at the top of the window, and how far down the sheet */
  function place() {
    if (!A || $("ar").hidden) return;
    var body = $("body"); if (!body) return;
    var kids = body.children, top = 76, i, at = null;
    for (i = 0; i < kids.length; i++) { if (kids[i].getBoundingClientRect().bottom > top) { at = kids[i].dataset.id; break; } }
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight), p = Math.max(0, Math.min(1, window.scrollY / max));
    cur = { blockId: at, progress: Math.round(p * 1000) / 1000 };
    $("prog").textContent = Math.round(p * 100) + "%";
    clearTimeout(saveT); saveT = setTimeout(flush, 3500);
  }
  function flush(keep) {
    clearTimeout(saveT);
    if (!A || !A.hasReadableBody || !cur.blockId || (cur.blockId === saved.blockId && Math.abs(cur.progress - saved.progress) < .01)) return;
    if (A.completed && cur.progress < A.progress) return;   // a finished piece is not un-read by scrolling back up
    saved = { blockId: cur.blockId, progress: cur.progress };
    api("articles/" + A.id + "/state", { method: "PATCH", body: saved, keep: keep === true }).then(function (s) { for (var k in s) A[k] = s[k]; }).catch(function () {});
  }
  function openArticle(id) {
    listY = window.scrollY; $("rd").hidden = true; $("ar").hidden = false; $("tools").innerHTML = ""; $("prog").textContent = ""; sheet.innerHTML = WAIT; window.scrollTo(0, 0);
    A = null; saved = { blockId: null, progress: -1 }; cur = { blockId: null, progress: 0 };
    api("articles/" + encodeURIComponent(id)).then(function (a) {
      A = a; saved = { blockId: a.blockId, progress: a.progress || 0 }; mode = mode === "src" ? "src0" : mode; renderArticle();
      if (a.hasReadableBody && !a.read) api("articles/" + a.id + "/open", { method: "POST", body: {} }).then(function (s) { for (var k in s) A[k] = s[k]; }).catch(function () {});
    }).catch(function (e) { sheet.innerHTML = trouble(e); });
  }
  function closeArticle() {
    flush(true);
    var a = A; $("ar").hidden = true; $("rd").hidden = false; sheet.innerHTML = "";
    if (a) view.querySelectorAll('a.row[data-id="' + a.id + '"]').forEach(function (el) { var t = document.createElement("div"); t.innerHTML = row(Object.assign({}, a, { translatedTitle: a.translation && a.translation.status === "ready" ? a.translation.title : "" })); el.replaceWith(t.firstChild); });
    A = null; window.scrollTo(0, listY);
  }
  window.addEventListener("scroll", function () { if (!$("ar").hidden) place(); }, { passive: true });
  window.addEventListener("pagehide", function () { flush(true); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) flush(true); });

  /* ── which page is open ── */
  var shown = null;
  function route() {
    var h = (location.hash || "#today").slice(1), m = h.match(/^a\/([A-Za-z0-9_-]{1,128})$/);
    if (m) { if (!shown) { shown = "shelf"; mark("shelf"); viewShelf(); } openArticle(m[1]); return; }
    if (!$("ar").hidden) closeArticle();
    var d = h.match(/^today\/(\d{4}-\d{2}-\d{2})$/), v = d ? "today" : (h === "shelf" || h === "kept") ? h : "today", id = v + (d ? "/" + d[1] : "");
    if (shown === id) return;
    shown = id; mark(v); window.scrollTo(0, 0);
    if (v === "today") viewToday(d && d[1]); else if (v === "shelf") viewShelf(); else viewKept();
  }
  function mark(v) { $("tabs").querySelectorAll("a").forEach(function (a) { a.classList.toggle("on", a.dataset.v === v); }); }
  window.addEventListener("hashchange", route);
  $("back").onclick = function () { location.href = "./"; };
  $("aback").onclick = function () { if (history.length > 1 && shown) history.back(); else location.hash = "#shelf"; };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("ar").hidden && !document.querySelector(".nyxask")) $("aback").click(); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(route, route);
})();
