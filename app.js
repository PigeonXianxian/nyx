/* Nyx — the chat page. Talks to a companion relay:
   GET  {relay}/app/history?since=&limit=   → { messages:[{id, ts, from:"human"|"ai", kind, text, meta}] }
   GET  {relay}/app/stream                   → server-sent events, one JSON per "data:" line
   POST {relay}/app/send  {text, side, quote} → { id }
   Every call carries "Authorization: Bearer <key>". */
(function () {
  "use strict";
  var C = window.NYX || {}, HOME = C.relay || "/relay", ME = C.meName || "Me";
  // the chat talks to whoever you picked on the contacts page (nyx_relay / nyx_chat_key / nyx_ai); everything else in the house — the hold, town, listen, kitchen, attic — stays with the first companion (HOME + nyx_key)
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var RELAY = ls("nyx_relay") || HOME, AI = (RELAY !== HOME && ls("nyx_ai")) || C.aiName || "Companion";
  var GROUP = /\/g$/.test(RELAY);   // the group chat: the first companion's relay at /g; nobody's gauge, every answer says who it's from
  var root = document.documentElement, $ = function (id) { return document.getElementById(id); };
  var ask = window.NyxAsk || { confirm: function (q, o) { return Promise.resolve(confirm(q + (o && o.body ? "\n\n" + o.body : ""))); },   // the house's own questions (ask.js)
    prompt: function (q, o) { var v = prompt(q, (o && o.value) || ""); return Promise.resolve(v == null ? null : v.trim()); } };
  var key = null, hkey = null, lastId = 0, byId = new Map(), drafts = new Map(), quote = null, cc = null;   // cc: the Claude Code controls (cc.js)
  // CCMODE: the chat is the Claude Code window itself — the page reads its session transcript (GET /app/cc/log, "cc" events)
  // and what you write is typed into it (POST /app/cc/say). view: the session on the page; liveSid: the one the window has open.
  var CCMODE = false, view = "", liveSid = "", viewInfo = {}, tools = new Map(), carrying = false;
  var log = $("log"), text = $("text"), sendBtn = $("send");

  var paintSide = NyxPaper.paint;
  function flip() {
    var from = root.dataset.side, to = from === "moon" ? "sun" : "moon";
    root.dataset.side = to;
    try { localStorage.setItem("nyx_side", to); } catch (e) {}
    paintSide(); if (window.NyxSplash && homeKind() !== "eye") NyxSplash(from, to, C.splash);
    if (home) setTimeout(home.refresh, 400);
  }
  $("flip").onclick = flip; $("flip2").onclick = flip;

  /* ---------- home, drawer ---------- */
  var APPS = (C.apps && C.apps.length ? C.apps : [{ id: "chat", en: "Chat", zh: "聊天" }]), home = null;
  function show(which) {
    $("home").hidden = which !== "home"; $("room").hidden = which !== "room";
    if (which === "home") { $("glyph").textContent = root.dataset.side === "moon" ? "\u263E" : "\u2609"; home.refresh(); }
    if (which === "room") { toBottom(); }
    try { history.replaceState(null, "", which === "room" ? "#chat" : "#"); } catch (e) {}
  }
  var hold = null;   // the board and the heart (hold.js), made once the key is in
  function openApp(a) {
    closeDrawer();
    if (a.id === "chat") show("room");
    else if (a.apps && hold) hold.folder(a, openApp);
    else if (a.id === "sessions") { show("room"); openSessions(); }   // pick an earlier conversation (cc.js)
    else if ((a.id === "board" || a.id === "heart") && hold) hold[a.id]();
    else if (a.href) location.href = a.href;
    else if (a.id === "memory" && hold) hold.memory();
  }
  $("back").onclick = function () { show("home"); };
  function openDrawer() { $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); }
  function closeDrawer() { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); }
  $("menu").onclick = openDrawer; $("drawer").querySelector(".sh").onclick = closeDrawer;
  $("drawerTitle").textContent = C.title || "Nyx"; $("homeTitle").textContent = (C.title || "Nyx").toUpperCase();
  // the drawer: a line icon on each row; a folder becomes a small clay heading with its rooms under it
  var IC = { chat: '<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/>',
    listen: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    attic: '<path d="M3 10l9-6 9 6"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/><path d="M8 12h.01M16 12h.01"/>',
    room: '<path d="M6 20V9a6 6 0 0 1 12 0v11"/><path d="M4 20h16"/><path d="M14.5 14h.01"/>',
    bedroom: '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 18h18M5 10V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V10"/><path d="M7 10h4v-2H7zM13 10h4v-2h-4z"/>',
    memory: '<path d="M12 3.5c.8 5 3.5 7.7 8.5 8.5-5 .8-7.7 3.5-8.5 8.5-.8-5-3.5-7.7-8.5-8.5 5-.8 7.7-3.5 8.5-8.5Z"/>',
    board: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M9 4v16M15 4v16"/><path d="M5.5 8h1.8M11 8h1.8M11 11.5h1.8M17 8h1.8"/>',
    sessions: '<path d="M7 4.5h11.5v13"/><path d="M4.5 7h11.5v13H4.5z"/><path d="M7.5 11h5.5M7.5 14h5.5M7.5 17h3"/>',
    heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z"/><path d="M7 12h2.5l1.2-2.2 2 4.4 1.3-2.2H17"/>',
    kitchen: '<path d="M4 11h16"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M9 6.5c0-1 1-1.5 1-2.5M13 6.5c0-1 1-1.5 1-2.5"/><path d="M12 18v2.5M8.5 20.5h7"/>',
    link: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M17 14v5H5V7h5"/>' };
  function icon(a) { var d = a.svg || IC[a.icon || a.id] || IC.link; return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + "</svg>"; }
  var rows = [], row = function (a) { rows.push(a); return '<button type="button" class="ctr" data-r="' + (rows.length - 1) + '">' + icon(a) + "<span>" + esc(a.en) + (a.zh ? "<small>" + esc(a.zh) + "</small>" : "") + "</span></button>"; };
  $("drawerList").innerHTML = APPS.map(function (a) {
    return a.apps ? '<div class="gp">' + esc(a.en) + (a.zh ? "<small>" + esc(a.zh) + "</small>" : "") + "</div>" + a.apps.map(row).join("") : row(a);
  }).join("");
  $("drawerList").querySelectorAll(".ctr").forEach(function (b) { b.onclick = function () { openApp(rows[+b.dataset.r]); }; });
  // swipe right opens the drawer, left closes it (home only)
  (function () { var sx = null, sy = 0, H = $("home");
    H.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    document.addEventListener("touchend", function (e) { if (sx === null) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return; if (dx > 0 && !H.hidden) openDrawer(); else closeDrawer(); }, { passive: true }); })();

  /* two homes: NyxInk (the river poster) and NyxTree; the choice is kept per device */
  function homeKind() { var k = null; try { k = localStorage.getItem("nyx_home"); } catch (e) {} if (k !== "tree" && k !== "ink" && k !== "eye") k = C.home; if (k === "eye" && !window.NyxEye) k = "ink"; return k === "tree" || k === "eye" ? k : "ink"; }
  function makeHome() {
    if (home && home.stop) home.stop();
    var kind = homeKind();
    document.documentElement.dataset.home = kind;
    home = kind === "eye" ? NyxEye($("poster"), APPS, openApp, { drawer: openDrawer })
      : kind === "tree" && window.NyxTree ? NyxTree($("poster"), APPS, openApp, { photo: C.treePhoto })
      : NyxHome($("poster"), APPS, openApp, C.tagline, { me: C.meName, drawer: openDrawer, ask: C.clawd && C.clawd.path ? askClawd : null, agents: function () { return api("/app/agents").then(function (d) { return d.agents; }); } });
    document.querySelectorAll("#homes button").forEach(function (b) { b.classList.toggle("on", b.dataset.h === kind); });
  }
  document.querySelectorAll("#homes button").forEach(function (b) { b.onclick = function () {
    try { localStorage.setItem("nyx_home", b.dataset.h); } catch (e) {}
    closeDrawer(); makeHome(); if (!$("home").hidden) home.refresh();
  }; });

  /* Clawd on the home poster talks to whatever your relay mounts at NYX.clawd.path (see README) */
  function askClawd(text, side, history) {
    return api(C.clawd.path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text, side: side, history: history }) })
      .then(function (d) { return d.reply; });
  }

  /* ---------- relay ---------- */
  function api(path, opt) { return call(RELAY, key, path, opt); }        // the one you're chatting with
  function hapi(path, opt) { return call(HOME, hkey, path, opt); }       // the house: hold sheets
  /* small door for add-on scripts (thinkcrab.js) to reach the relay you are chatting with */
  window.NyxChat = Object.assign(window.NyxChat || {}, { api: function (p, o) { return api(p, o); } });
  function call(base, k, path, opt) {
    opt = opt || {}; opt.headers = Object.assign({ "Authorization": "Bearer " + k }, opt.headers || {});
    return fetch(base + path, opt).then(function (r) {
      if (r.status === 401) { var e = new Error("unauthorized"); e.auth = true; throw e; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  var stateLabel = "offline", spinT = 0, typingOn = false, busy = null;
  function setState(on, label) {
    $("state").classList.toggle("on", !!on);
    stateLabel = label || (on ? "online" : "offline");
    paintState();
  }
  // the line under its name: online / offline; while it's working, the Claude Code star turning and either what it's
  // doing (running a command · 12s) or a new word every two seconds; stuck on a question → say so (GET /app/busy)
  var SPIN = ["\u00b7", "\u2722", "\u2736", "\u273b", "\u273d", "\u273b", "\u2736", "\u2722"];
  var VERBS = C.verbs || ["Pondering", "Noodling", "Percolating", "Mulling", "Brewing", "Musing", "Doodling", "Simmering", "Whisking", "Daydreaming", "Scheming", "Painting"];
  function secsText(n) { n = n || 0; return n >= 3600 ? Math.floor(n / 3600) + "h " + Math.floor(n % 3600 / 60) + "m" : n >= 60 ? Math.floor(n / 60) + "m " + (n % 60) + "s" : n + "s"; }
  function paintState() {
    var em = $("state").querySelector("em"), working = typingOn || (busy && busy.state === "busy");
    $("state").title = busy && busy.state === "busy" ? [busy.tool, busy.detail, busy.secs ? "this turn " + secsText(busy.secs) : ""].filter(Boolean).join(" \u00b7 ") : "";
    if (working && !spinT) {
      var pick = function (p) { var v; do { v = VERBS[Math.floor(Math.random() * VERBS.length)]; } while (v === p && VERBS.length > 1); return v; };
      var verb = pick(), i = 0, n = 0, t0 = Date.now();
      em.innerHTML = '<b class="spin">\u00b7</b><span></span>';
      var sp = em.querySelector(".spin"), vb = em.querySelector("span");
      var word = function () { vb.textContent = busy && busy.state === "busy" && busy.tool ? busy.tool + " \u00b7 " + secsText((busy.tool_secs || 0) + Math.round((Date.now() - (busy.at || Date.now())) / 1000)) : verb + "\u2026"; };
      word();
      spinT = setInterval(function () { i = (i + 1) % SPIN.length; sp.textContent = SPIN[i]; if (++n % 17 === 0) verb = pick(verb); if (n % 8 === 0) word(); }, 120);
    } else if (!working) {
      if (spinT) { clearInterval(spinT); spinT = 0; }
      em.textContent = busy && busy.state === "waiting" ? "waiting for a yes at the terminal" : busy && busy.state === "offline" ? "the window isn't open" : stateLabel;
    }
  }
  function spin(on) { typingOn = on; paintState(); }
  var busyT = 0;
  function pollBusy() {
    clearTimeout(busyT);
    if (GROUP) return;
    if (!key || document.hidden || $("room").hidden) { busyT = setTimeout(pollBusy, 5000); return; }
    api("/app/busy").then(function (d) { var was = busy && busy.state; d.at = Date.now(); busy = d; paintState(); if (CCMODE && view === liveSid) typing(d.state === "busy");
      if (CCMODE && (was === "offline") !== (d.state === "offline")) refreshLive(); }).catch(function () { busy = null; })
      .then(function () { busyT = setTimeout(pollBusy, busy && busy.state === "busy" ? 2500 : 5000); });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) pollBusy(); });

  var streamCtl = null, retry = 0, watchdog = 0;
  function openStream() {
    if (streamCtl) streamCtl.abort();
    var ctl = streamCtl = new AbortController();
    fetch(RELAY + "/app/stream", { headers: { "Authorization": "Bearer " + key }, signal: ctl.signal, cache: "no-store" }).then(function (r) {
      if (!r.ok || !r.body) throw new Error("stream " + r.status);
      // a half-written reply from before the drop won't get the rest of its pieces; the finished message comes through catchUp
      retry = 0; setState(true); drafts.forEach(function (d) { d.el.remove(); }); drafts.clear(); catchUp(); refreshLive();
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump() {
        return rd.read().then(function (c) {
          if (c.done) throw new Error("stream closed");
          kick(); buf += dec.decode(c.value, { stream: true });
          var cut; while ((cut = buf.indexOf("\n\n")) >= 0) { frame(buf.slice(0, cut)); buf = buf.slice(cut + 2); }
          return pump();
        });
      }
      kick(); return pump();
    }).catch(function () {
      if (ctl.signal.aborted && ctl !== streamCtl) return;
      setState(false, "reconnecting…");
      setTimeout(openStream, Math.min(15000, 1000 * Math.pow(2, retry++)));
    });
  }
  // the relay pings every 15 s; if nothing arrives for 40 s the line is dead even if the socket says otherwise
  function kick() { clearTimeout(watchdog); watchdog = setTimeout(function () { if (streamCtl) streamCtl.abort(); streamCtl = null; openStream(); }, 40000); }
  function frame(block) {
    var data = block.split("\n").filter(function (l) { return l.indexOf("data:") === 0; }).map(function (l) { return l.slice(5).trim(); }).join("\n");
    if (!data) return;
    try { onEvent(JSON.parse(data)); } catch (e) {}
  }
  function onEvent(ev) {
    if (CCMODE) {
      if (ev.type === "cc") { if (ev.sid === view) (ev.messages || []).forEach(put); return; }
      if (ev.type === "cc_sid") { liveTo(ev.sid || ""); return; }
      if (ev.id != null && ev.from) { if (ev.kind === "term" && ev.meta && ev.meta.note) localCard(ev.text, "", true); return; }   // the relay's own log is not this chat
    }
    if (ev.id != null && ev.from) { put(ev); return; }
    switch (ev.type) {
      case "typing": typing(ev.active); break;
      case "reply_delta": case "thinking_delta": draft(ev); break;
    }
  }
  function catchUp() {
    if (CCMODE) return view ? api("/app/cc/log?sid=" + view + "&after=" + lastId).then(function (d) { (d.messages || []).forEach(put); }).catch(function (e) { if (e.auth) logout(); }) : Promise.resolve();
    return api("/app/history?since=" + lastId + "&limit=200").then(function (d) { (d.messages || []).forEach(put); }).catch(function (e) { if (e.auth) logout(); });
  }
  /* ---------- Claude Code mode: which session is on the page ---------- */
  function ccLog(sid) {
    return api("/app/cc/log?sid=" + encodeURIComponent(sid || "") + "&tail=200").then(function (d) { view = d.sid || sid; viewInfo = d; return d; });
  }
  function openView(sid) {   // show a session: the live one to write in, or any other to read (and carry on here if you like)
    view = sid; log.innerHTML = ""; byId.clear(); msgs.clear(); tools.clear(); lastId = 0; loadDeleted();
    return ccLog(sid).then(function (d) { (d.messages || []).forEach(put); earlier(d.more); paintRo(); toBottom(); }).catch(function (e) { toast("Couldn't open it: " + e.message); });
  }
  function earlier(more) {   // a "further back" mark at the head of the letter
    var b = $("earlier"); if (b) b.remove(); if (!more) return;
    b = document.createElement("button"); b.type = "button"; b.id = "earlier"; b.textContent = "further back";
    b.onclick = function () {
      var first = null; byId.forEach(function (el, id) { if (first === null || id < first) first = id; });
      var h = log.scrollHeight;
      api("/app/cc/log?sid=" + view + "&before=" + first + "&tail=200").then(function (d) { (d.messages || []).forEach(put); earlier(d.more); log.scrollTop += log.scrollHeight - h; });
    };
    log.insertBefore(b, log.firstChild);
  }
  function paintRo() {   // reading a session the window doesn't have open: say so, and offer to carry it on here
    var ro = $("ro"), off = CCMODE && view && view !== liveSid;
    if (!ro) { ro = document.createElement("div"); ro.id = "ro"; document.querySelector("footer.write").insertBefore(ro, document.querySelector("footer.write .line")); }
    ro.hidden = !off; text.disabled = !!off; root.classList.toggle("reading", !!off);
    if (!off) return;
    var away = viewInfo.elsewhere ? (viewInfo.elsewhere === "vscode" ? "open in VS Code right now" : "open in another Claude Code right now") : "";
    if (carrying) { ro.innerHTML = "<span>Opening it in the window…</span>"; ro.onclick = null; return; }
    ro.innerHTML = (liveSid ? '<span>Reading an earlier window' + (away ? " · <b>" + away + "</b>" : "") + ".</span>" : "<span>The window isn’t open right now.</span>") +
      (viewInfo.readonly ? "" : '<button type="button" data-a="go">' + (liveSid ? "carry it on here" : "open it with this session") + "</button>") +
      (liveSid ? '<button type="button" data-a="back">back to the live one</button>' : "");
    ro.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.a === "back") { openView(liveSid); return; }
      carryOn(view, viewInfo.elsewhere);
    };
  }
  /* a new window is on its way (Sessions, the gauge): say so in the letter, and follow the window to its new session */
  function opening(where) {
    carrying = true; closeMeter(); toast("Opening a new window" + (where || "") + "…");
    var old = log.querySelector(".msg.opening"); if (old) old.remove();
    var n = build({ id: "", from: "ai", kind: "term", text: "opening a new window" + (where || "") + "…", ts: new Date().toISOString(), meta: { note: true } });
    n.classList.add("opening"); log.appendChild(n); toBottom();
  }
  function openingDone() { var n = log.querySelector(".msg.opening"); if (n) n.remove(); }
  function openingFailed(msg) { carrying = false; openingDone(); toast(msg); }
  /* which session the window has now (an event, or asked): follow it if we were on the live one or are carrying one on */
  function liveTo(sid) {
    if (sid === liveSid && !carrying) { paintRo(); return; }
    var follow = (view === liveSid || carrying) && sid;
    liveSid = sid;
    if (sid) { carrying = false; openingDone(); }
    if (follow) openView(sid); else paintRo();
  }
  function refreshLive() { if (CCMODE) api("/app/cc/where").then(function (w) { liveTo((w && w.sid) || ""); }, function () {}); }
  function carryOn(sid, elsewhere) {   // the window closes its session and opens this one (--resume); the page follows it
    if (carrying) { toast("Already opening it…"); return; }
    var away = elsewhere ? (elsewhere === "vscode" ? "open in VS Code right now" : "open in another Claude Code right now") : "";
    ask.confirm("Carry this session on here?", { body: (away ? "It is " + away + "; two windows on one session don't see each other's new turns. " : "") + "The window in use now closes; it stays in Sessions.", ok: "carry it on" }).then(function (yes) {
      if (!yes) return;
      var before = liveSid; carrying = true; toast("Opening it in the window…"); paintRo();
      api("/app/window/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid: sid }) })
        .then(function () { toast("This session is open here now."); refreshLive(); setTimeout(refreshLive, 3000); setTimeout(function () { if (carrying) { carrying = false; refreshLive(); } }, 60000); loadWin(); loadMeter(); },
          function (e2) { carrying = false; toast(/409/.test(e2.message) ? "It's already opening a window — a moment." : "Didn't switch: " + e2.message); refreshLive(); });
    });
  }

  /* ---------- rendering ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var STK = /\[(?:sticker|表情)[:：]([^\]\n]{1,40})\]/g;
  function rich(s) {
    var short = C.home === "eye" && (s || "").length < 60 && ((s || "").match(/\n/g) || []).length === 1;   // 构成: one break in a short line is a pause, drawn as a blue dot
    return esc(s || "")
      .replace(STK, function (all, name) { return C.stickers ? '<img class="stk" alt="' + name + '" src="' + C.stickers + encodeURIComponent(name) + '.png" data-n="' + encodeURIComponent(name) + '">' : all; }).replace(/https?:\/\/[^\s<\u3000-\u9fff\uff00-\uffef]+[^\s<.,;:!?)\]'"，。！？）\u3000-\u9fff\uff00-\uffef]/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>"; }).replace(/\n/g, short ? '<i class="nl"></i>' : "<br>");
  }
  function hm(ts) { var d = new Date(ts); return isNaN(d) ? "" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function dayOf(ts) { var d = new Date(ts); return isNaN(d) ? "" : d.toDateString(); }
  function dayLabel(ts) {
    var d = new Date(ts), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Today";
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
  }

  // uploads sit behind the key, so images are fetched with the header and shown from a local blob (the key never goes in a URL)
  var blobs = new Map();
  function blobOf(url) {
    if (!blobs.has(url)) blobs.set(url, fetch(url, { headers: { "Authorization": "Bearer " + key } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(URL.createObjectURL));
    return blobs.get(url);
  }
  function wireAtts(el, atts) {
    el.querySelectorAll(".att [data-i]").forEach(function (n) {
      var a = atts[+n.dataset.i]; if (!a || !a.url) return;
      if (n.tagName === "IMG") { blobOf(a.url).then(function (u) { n.src = u; n.onload = function () { if (nearBottom(300)) toBottom(); }; }).catch(function () { n.alt = "image unavailable"; });
        n.onclick = function () { var z = document.createElement("div"); z.id = "zoom"; z.innerHTML = '<img src="' + n.src + '">'; z.onclick = function () { z.remove(); }; document.body.appendChild(z); }; }
      else n.onclick = function () { blobOf(a.url).then(function (u) { var l = document.createElement("a"); l.href = u; l.download = a.name || "file"; l.click(); }); };
    });
  }
  // a sticker may be .png, .gif, .jpg or .webp — try them in turn, then fall back to the bracketed name
  var EXT = [".png", ".gif", ".jpg", ".webp"];
  function stkFallback(im) { var i = 0; im.onerror = function () { if (++i < EXT.length) im.src = C.stickers + im.dataset.n + EXT[i]; else im.replaceWith(document.createTextNode("[" + decodeURIComponent(im.dataset.n) + "]")); }; }
  /* ---------- local delete: hides messages on this device only, the relay keeps them ---------- */
  function delKey() { return "nyx_deleted:" + RELAY + (CCMODE ? ":" + view : ""); }
  var deleted = new Set(), msgs = new Map();
  function loadDeleted() { deleted = new Set(); try { (JSON.parse(ls(delKey()) || "[]") || []).forEach(function (k) { deleted.add(String(k)); }); } catch (e) {} }
  loadDeleted();
  function delMsgs(ids) {
    ids.forEach(function (id) {
      deleted.add(String(id)); msgs.delete(+id);
      var el = byId.get(+id); if (!el) return;
      var pv = el.previousElementSibling, nx = el.nextElementSibling; el.remove(); byId.delete(+id);
      if (pv && pv.classList.contains("day") && (!nx || nx.classList.contains("day"))) pv.remove();   // no orphan day labels
    });
    try { localStorage.setItem(delKey(), JSON.stringify(Array.from(deleted).slice(-5000))); } catch (e) {}
    toast(ids.length > 1 ? "Deleted " + ids.length : "Deleted");
  }
  function toast(t) { var o = document.createElement("div"); o.className = "toast"; o.textContent = t; document.body.appendChild(o); setTimeout(function () { o.remove(); }, 1800); }
  function snip(m, n) {
    var t = String(m.text || "").replace(STK, "[sticker]").trim(); STK.lastIndex = 0;
    var atts = (m.meta && m.meta.attachments) || [];
    if (atts.length) t = (atts.some(function (a) { return a.kind === "image"; }) ? "[image]" : "[file]") + (t ? " " + t : "");
    return t.length > n ? t.slice(0, n) + "…" : t;
  }
  function copyText(t) {
    function old() { var ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;top:-1000px;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(old); else old();
  }
  /* long-press (or right-click) a bubble: copy · quote · select · delete */
  function bubbleMenu(el, m) {
    if (root.classList.contains("selecting")) return;
    var old = $("bubMenu"); if (old) old.remove();
    var p = document.createElement("div"); p.id = "bubMenu";
    p.innerHTML = (m.text ? '<button type="button" data-a="copy">Copy</button>' : "") + '<button type="button" data-a="quote">Quote</button><button type="button" data-a="select">Select</button><button type="button" data-a="del" class="danger">Delete</button>';
    document.body.appendChild(p);
    var r = el.querySelector(".body").getBoundingClientRect(), h = p.offsetHeight, w = p.offsetWidth;
    var top = r.top - h - 8; if (top < 8) top = Math.min(innerHeight - h - 8, r.bottom + 8);
    p.style.top = top + "px"; p.style.left = Math.min(innerWidth - w - 8, Math.max(8, m.from === "human" ? r.right - w : r.left)) + "px";
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    function off(e) { if (!p.contains(e.target)) close(); }
    function close() { p.remove(); document.removeEventListener("pointerdown", off, true); }
    p.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return; close();
      if (b.dataset.a === "copy") copyText(m.text || "");
      else if (b.dataset.a === "quote") setQuote({ id: +m.id, who: m.from === "human" ? ME : ((m.meta && m.meta.speaker) || AI), text: snip(m, 120) });
      else if (b.dataset.a === "select") startSel(+m.id);
      else if (b.dataset.a === "del") delMsgs([+m.id]);
    };
    setTimeout(function () { document.addEventListener("pointerdown", off, true); }, 0);
  }
  /* select mode: tap bubbles to tick them, then delete them together */
  var sel = new Set();
  function paintSel() { var bar = $("selBar"); if (bar) { bar.querySelector(".n").textContent = sel.size + " selected"; bar.querySelector(".del").disabled = !sel.size; } }
  function startSel(id) {
    sel.clear(); if (id) sel.add(id);
    var bar = $("selBar");
    if (!bar) {
      bar = document.createElement("div"); bar.id = "selBar";
      bar.innerHTML = '<span class="n"></span><button type="button" class="del danger">Delete</button><button type="button" class="x">Cancel</button>';
      bar.querySelector(".del").onclick = function () { if (!sel.size) return; (sel.size > 1 ? ask.confirm("Delete " + sel.size + " messages?", { body: "From this device only; the relay keeps them.", ok: "delete", danger: true }) : Promise.resolve(true)).then(function (yes) { if (yes) { delMsgs(Array.from(sel)); endSel(); } }); };
      bar.querySelector(".x").onclick = endSel;
      document.querySelector("footer.write").before(bar);
    }
    bar.hidden = false; root.classList.add("selecting");
    log.querySelectorAll(".msg.sel").forEach(function (n) { n.classList.remove("sel"); });
    if (id && byId.get(id)) byId.get(id).classList.add("sel");
    paintSel();
  }
  function endSel() { sel.clear(); root.classList.remove("selecting"); if ($("selBar")) $("selBar").hidden = true; log.querySelectorAll(".msg.sel").forEach(function (n) { n.classList.remove("sel"); }); }
  log.addEventListener("click", function (e) {
    if (!root.classList.contains("selecting")) return;
    e.preventDefault(); e.stopPropagation();
    var n = e.target.closest(".msg[data-id]"); if (!n || !/^\d+$/.test(n.dataset.id)) return;
    var id = +n.dataset.id; if (sel.has(id)) { sel.delete(id); n.classList.remove("sel"); } else { sel.add(id); n.classList.add("sel"); }
    paintSel();
  }, true);
  // the delivery mark on your own bubbles: a hollow new moon while it travels, a crescent once the relay has it
  var MARK_SENT = '<i class="mark" aria-label="sent"><svg viewBox="0 0 12 12"><path d="M8.6 2.1A4.3 4.3 0 1 0 9.9 8.4 3.5 3.5 0 0 1 8.6 2.1Z"/></svg></i>';
  var MARK_WAIT = '<i class="mark wait" aria-label="sending"><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.6"/></svg></i>';
  function build(m) {
    var me = m.from === "human", kind = m.kind || "reply", el = document.createElement("div"), note = kind === "term" && m.meta && m.meta.note;
    if (kind === "note") { kind = "term"; note = true; }
    el.className = "msg " + (me ? "me" : "ai") + (kind === "thinking" ? " think" : kind === "act" ? " act" : kind === "cmd" ? " cmd" : kind === "term" ? " term" + (note ? " note" : "") : kind === "tool" ? " tool" : "");
    el.dataset.id = m.id; el.dataset.from = m.from; el.dataset.ts = m.ts;
    var q = m.meta && m.meta.quote, inner = q ? '<span class="q">' + esc((q.who ? q.who + "  " : "") + (q.text || "")) + "</span>" : "";
    var who = !me && m.meta && m.meta.speaker; if (who) inner = '<span class="who">' + esc(who) + "</span>" + inner;
    if (kind === "thinking") inner += '<details><summary>thinking…</summary>' + rich(m.text) + "</details>";
    else if (kind === "cmd") inner += '<span class="pr">❯</span>' + esc(m.text);   // a command typed into the window from here (cc.js)
    else if (kind === "tool") inner += '<button type="button" class="tl"><i></i><b>' + esc((m.meta && m.meta.tool) || "tool") + "</b>" + (m.text ? "<span>" + esc(m.text) + "</span>" : "") + '</button><pre class="res" hidden></pre>';   // a tool call; its result folds in under it
    else if (kind === "reply" && CCMODE && window.NyxCC && NyxCC.md) inner += NyxCC.md(m.text);   // Claude's words are markdown
    else if (kind === "term") inner += note ? '<span class="nt">' + esc(m.text) + "</span>"   // …and what the window printed back
      : '<span class="th">' + (m.meta && m.meta.local ? "" : m.meta && m.meta.dialog ? "window · " : "terminal · ") + "/" + esc((m.meta && m.meta.cmd) || "") + "</span><pre>" + esc(m.text) + "</pre>";
    else {
      var atts = (m.meta && m.meta.attachments) || [];
      if (atts.length) inner += '<div class="att">' + atts.map(function (a, i) { return a.kind === "image" ? '<img data-i="' + i + '" alt="">' : '<span class="file" data-i="' + i + '">' + esc(a.name || "file") + "</span>"; }).join("") + "</div>";
      inner += me && /^\/[A-Za-z0-9][\w:-]*/.test(m.text || "") ? rich(m.text).replace(/^\/[A-Za-z0-9][\w:-]*/, function (c) { return '<b class="cmdn">' + c + "</b>"; }) : rich(m.text);   // a /skill sent to the companion
      if (C.stickers && !atts.length && String(m.text || "").replace(STK, "").trim() === "" && STK.test(m.text || "")) el.classList.add("only-stk");
      if (!String(m.text || "").trim() && atts.length === 1 && /^sticker-/.test(atts[0].name || "")) el.classList.add("only-stk", "stk-att");   // your own sticker went up as a picture; show it like a sticker
      STK.lastIndex = 0;
    }
    el.innerHTML = '<div class="body">' + inner + '<span class="t">' + hm(m.ts) + (me ? (m.id !== "" && m.id != null ? MARK_SENT : MARK_WAIT) : "") + "</span></div>";
    wireAtts(el, (m.meta && m.meta.attachments) || []);
    el.querySelectorAll("img.stk").forEach(stkFallback);
    if (m.id !== "" && m.id != null) {
      el.oncontextmenu = function (e) { e.preventDefault(); bubbleMenu(el, m); };
      var lp = null, sx = 0, sy = 0;   // iOS doesn't always fire contextmenu on a long press, so count it ourselves
      el.addEventListener("pointerdown", function (e) { sx = e.clientX; sy = e.clientY; clearTimeout(lp); lp = setTimeout(function () { bubbleMenu(el, m); }, 520); });
      el.addEventListener("pointermove", function (e) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clearTimeout(lp); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { el.addEventListener(t, function () { clearTimeout(lp); }); });
      if (sel.has(+m.id)) el.classList.add("sel");
    }
    el.ondblclick = function () { if (!root.classList.contains("selecting")) setQuote({ id: m.id, who: me ? ME : (who || AI), text: snip(m, 120) }); };
    return el;
  }
  // put one message in its place by id (history and stream can both deliver it; the second copy just replaces)
  function put(m) {
    if (!m || m.id == null) return;
    var id = +m.id; if (id > lastId) lastId = id;
    if (m.kind === "result") {   // a tool's result goes under its call, folded
      var t = tools.get(m.meta && m.meta.tid); if (!t) return;
      var pre = t.querySelector(".res"); pre.textContent = m.text || "(nothing)"; t.classList.add("done"); if (m.meta.error) t.classList.add("err");
      return;
    }
    if (m.meta && m.meta.stream_id) dropDraft(m.meta.stream_id + ":" + (m.kind === "thinking" ? "thinking" : "reply"));
    var p = null;
    if (m.from === "human") {
      p = log.querySelector('.msg.pending[data-text="' + CSS.escape(m.text || "") + '"]');
      if (!p && CCMODE && (m.kind === "user" || m.kind === "cmd")) p = log.querySelector(".msg.pending");   // the window may add a quote or file paths to it
      if (p) p.remove();
    }
    if (deleted.has(String(m.id))) return;
    msgs.set(id, m);
    var el = build(m), old = byId.get(id), stick = nearBottom();
    // the real copy of a just-sent image fetches it back from the relay; borrow the local preview so the bubble isn't blank meanwhile
    if (p) { var lp = p.querySelectorAll(".att img"), np = el.querySelectorAll(".att img"); for (var j = 0; j < np.length && j < lp.length; j++) if (lp[j].src && !np[j].getAttribute("src")) np[j].src = lp[j].src; }
    if (m.kind === "tool" && m.meta && m.meta.tid) { tools.set(m.meta.tid, el); el.querySelector(".tl").onclick = function () { var r = el.querySelector(".res"); r.hidden = !r.hidden; el.classList.toggle("open", !r.hidden); }; }
    if (old) { old.replaceWith(el); byId.set(id, el); return; }
    byId.set(id, el);
    var after = null; // walk back to the last message older than this one
    for (var n = log.lastElementChild; n; n = n.previousElementSibling) if (n.dataset && n.dataset.id && +n.dataset.id < id) { after = n; break; }
    var ref = after ? after.nextSibling : log.firstChild;
    var prevDay = after ? dayOf(after.dataset.ts) : null;
    if (dayOf(m.ts) !== prevDay) { var dd = document.createElement("div"); dd.className = "day"; dd.textContent = dayLabel(m.ts); if (window.NyxPostmark) NyxPostmark(dd, m.ts); log.insertBefore(dd, ref); }   // a hand-struck postmark (eye/postmark.js)
    else if (after && after.dataset.from === m.from) el.classList.add("cont");
    if (after && dayOf(m.ts) === prevDay && Date.parse(m.ts) - Date.parse(after.dataset.ts) > 9e5) el.classList.add("gap");   // a quarter of an hour of quiet: the time goes in the margin
    log.insertBefore(el, ref);
    keepTyping(); if (stick) toBottom();
  }
  function draft(ev) {
    var k = ev.stream_id + ":" + (ev.type === "thinking_delta" ? "thinking" : "reply"), d = drafts.get(k);
    if (!d) {
      d = { text: "", el: build({ id: "", from: "ai", kind: ev.type === "thinking_delta" ? "thinking" : "reply", text: "", ts: new Date().toISOString(), meta: {} }) };
      d.el.classList.add("draft"); drafts.set(k, d); log.appendChild(d.el); keepTyping();
    }
    d.text += ev.text || "";
    var b = d.el.querySelector(".body");
    if (ev.type === "thinking_delta") b.querySelector("details").innerHTML = "<summary>thinking…</summary>" + rich(d.text);
    else b.innerHTML = rich(d.text);
    if (nearBottom(160)) toBottom();
  }
  function dropDraft(k) { var d = drafts.get(k); if (d) { d.el.remove(); drafts.delete(k); } }
  /* for cc.js: a command on its way into the window (the relay's copy replaces it), a failed one, a card only this page sees */
  function ghost(t, label) {
    var el = build({ id: "", from: "human", kind: "cmd", text: t, ts: new Date().toISOString(), meta: {} });
    el.classList.add("pending"); el.dataset.text = t; el.querySelector(".t").textContent = label || "";
    log.appendChild(el); keepTyping(); toBottom(); return el;
  }
  function failGhost(el, label, t) {
    el.classList.remove("pending"); el.classList.add("failed"); el.querySelector(".t").textContent = label + " · tap to put it back";
    el.onclick = function () { el.remove(); text.value = t; grow(); text.focus(); };
  }
  function localCard(t, cmd, note) { var el = build({ id: "", from: "ai", kind: "term", text: t, ts: new Date().toISOString(), meta: { cmd: String(cmd || "").replace(/^\//, ""), local: true, note: !!note } }); log.appendChild(el); keepTyping(); toBottom(); }

  // typing flickers on and off while the companion thinks; hiding the dots at once makes the log jump, so let them linger a moment
  var typingEl = null, typingOffT = 0;
  function typing(on) {
    spin(on); clearTimeout(typingOffT);
    if (on && !typingEl) { typingEl = document.createElement("div"); typingEl.id = "typing"; typingEl.innerHTML = "<i></i><i></i><i></i>"; log.appendChild(typingEl); if (nearBottom(160)) toBottom(); }
    if (!on && typingEl) typingOffT = setTimeout(function () { if (typingEl) { typingEl.remove(); typingEl = null; } }, 2500);
  }
  function keepTyping() { if (typingEl) log.appendChild(typingEl); }
  function nearBottom(px) { return log.scrollHeight - log.scrollTop - log.clientHeight < (px || 80); }
  function toBottom() { log.scrollTop = log.scrollHeight; }

  /* ---------- writing ---------- */
  function setQuote(q) {
    quote = q; var box = $("quote");
    if (!q) { box.hidden = true; return; }
    box.querySelector("span").textContent = q.who + ": " + q.text; box.hidden = false; text.focus();
  }
  $("quote").querySelector("button").onclick = function () { setQuote(null); };
  function grow() { text.style.height = "auto"; text.style.height = Math.min(text.scrollHeight, innerHeight * .4) + "px"; }
  text.addEventListener("input", grow);
  // on a phone Enter is a new line and the send button sends; with a keyboard Enter sends and Shift+Enter breaks the line
  var touchInput = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  if (touchInput) text.setAttribute("enterkeyhint", "enter");
  text.addEventListener("input", function () { if (cc) cc.input(); });
  text.addEventListener("keydown", function (e) {
    if (cc && cc.key(e)) return;   // the / list is open: arrows, Tab, Enter and Esc are its
    // never while an input method is still composing (Chinese, Japanese…)
    if (e.key === "Enter" && !e.shiftKey && !touchInput && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
  });
  sendBtn.onclick = send;
  /* attachments: pick → upload right away → they ride along with the next send */
  var tray = [], trayEl = $("tray");
  // big photos are shrunk before upload (longest side 2048, JPEG 0.9); GIFs and small files go as they are
  function prep(f) {
    return new Promise(function (ok) {
      if (!/^image\//.test(f.type || "") || /gif$/i.test(f.type) || f.size < 350 * 1024) { ok(f); return; }
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        try {
          var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, 2048 / Math.max(w, h)), c = document.createElement("canvas");
          c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
          c.toBlob(function (b) { ok(b && b.size < f.size ? new File([b], (f.name || "image").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : f); }, "image/jpeg", .9);
        } catch (e) { URL.revokeObjectURL(u); ok(f); }
      };
      im.onerror = function () { URL.revokeObjectURL(u); ok(f); };
      im.src = u;
    });
  }
  // one upload; on a flaky line it tries twice more before giving up
  function upload(it, tries) {
    tries = tries || 0; it.done = null;
    it.job = fetch(RELAY + "/app/upload?name=" + encodeURIComponent(it.file.name), { method: "POST", headers: { "Authorization": "Bearer " + key, "Content-Type": it.file.type || "application/octet-stream" }, body: it.file })
      .then(function (r) { if (!r.ok) throw new Error("upload " + r.status); return r.json(); })
      .then(function (a) { it.done = a; it.el.classList.remove("up"); },
        function () { if (tries < 2) return new Promise(function (ok) { setTimeout(ok, 1200); }).then(function () { return upload(it, tries + 1); }); it.el.classList.remove("up"); it.el.style.outline = "1px solid var(--accent)"; });
    return it.job;
  }
  $("clip").onclick = function () { $("file").click(); };
  // files into the tray: from the paperclip, pasted (a screenshot, a copied file), or dropped on the page
  function addFiles(files) {
    Array.prototype.forEach.call(files || [], function (f) {
      if (!f || !f.size && !f.type) return;
      if (!f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name)) {   // a screenshot has no name of its own
        var ext = ((f.type || "").split("/")[1] || "png").replace("jpeg", "jpg"), d = new Date();
        try { f = new File([f], "pasted-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0") + "." + ext, { type: f.type }); } catch (e) {}
      }
      var it = { name: f.name, done: null, el: document.createElement("div") };
      it.el.className = "it up"; it.el.innerHTML = '<button type="button" aria-label="Remove">×</button>' + ((f.type || "").indexOf("image/") ? esc(f.name.slice(0, 14)) : "");
      if (!(f.type || "").indexOf("image/")) { it.local = URL.createObjectURL(f); it.el.style.backgroundImage = "url(" + it.local + ")"; }
      it.el.querySelector("button").onclick = function () { tray = tray.filter(function (x) { return x !== it; }); it.el.remove(); trayEl.hidden = !tray.length; };
      trayEl.appendChild(it.el); trayEl.hidden = false; tray.push(it);
      it.file = f; it.job = prep(f).then(function (ff) { it.file = ff; return upload(it); });
    });
  }
  $("file").onchange = function () { addFiles(this.files); this.value = ""; };
  function clipFiles(dt) {   // the files a paste or a drop carries (some browsers only give them as items)
    if (!dt) return [];
    var fs = Array.prototype.slice.call(dt.files || []);
    if (!fs.length && dt.items) Array.prototype.forEach.call(dt.items, function (i) { if (i.kind === "file") { var f = i.getAsFile(); if (f) fs.push(f); } });
    return fs;
  }
  text.addEventListener("paste", function (e) {
    var fs = clipFiles(e.clipboardData); if (!fs.length) return;   // only words: pasted as words
    e.preventDefault(); addFiles(fs); toast(fs.length > 1 ? fs.length + " files on the tray" : /^image\//.test(fs[0].type || "") ? "Picture on the tray" : "File on the tray");
  });
  // dropping files anywhere on the letter page puts them on the tray; the writing frame shows where they'll go
  (function () {
    var room = $("room"), depth = 0;
    function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, "Files") >= 0; }
    function lit(on) { root.classList.toggle("dropping", on); }
    room.addEventListener("dragenter", function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; lit(true); });
    room.addEventListener("dragover", function (e) { if (!hasFiles(e)) return; e.preventDefault(); try { e.dataTransfer.dropEffect = "copy"; } catch (x) {} });
    room.addEventListener("dragleave", function (e) { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; lit(false); } });
    room.addEventListener("drop", function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; lit(false); if (CCMODE && view !== liveSid) { toast("This is an earlier window — carry it on here first"); return; } addFiles(clipFiles(e.dataTransfer)); text.focus(); });
  })();
  /* emoji & stickers: emoji go into the text, a sticker is sent on its own straight away */
  var EMO = "😀😂🥹😭🥺😳😌😏🙃🤔😴🤤😤😵‍💫🫠🤍🖤💛🧡🔥✨🌙☀️👀🙏👍👏🫶🤝🦀🍜☕️".match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu) || [];
  /* Your own stickers and kaomoji live on this device (nyx_stickers: [{id, data}], nyx_kaomoji: ["…"]) and share one grid
     with the relay's stickers. ＋ saves pictures from the album, long-press removes one, and tapping a sticker the
     companion sent offers to keep it. */
  var MY_STK = "nyx_stickers", MY_KAO = "nyx_kaomoji";
  /* Sticker pictures live in IndexedDB, not localStorage: a few dozen stickers plus avatars overflow Safari's ~5 MB
     localStorage quota, and every save after that fails. A list left in localStorage by an older version moves over on load. */
  var myStk = [], stkIDB = null;
  function stkDB() { return stkIDB || (stkIDB = new Promise(function (ok, no) { var r = indexedDB.open("nyx-stickers", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; })); }
  function stkPut(v) { return stkDB().then(function (db) { return new Promise(function (ok, no) { var t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, MY_STK); t.oncomplete = function () { ok(); }; t.onerror = function () { no(t.error); }; }); }); }
  function stkGet() { return stkDB().then(function (db) { return new Promise(function (ok) { var q = db.transaction("kv").objectStore("kv").get(MY_STK); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); }
  function stkSet(v) { try { var a = JSON.parse(v); myStk = Array.isArray(a) ? a : []; } catch (e) { myStk = []; } document.dispatchEvent(new Event("nyxstk")); }
  (function () {
    var old = ls(MY_STK);
    if (old) { stkSet(old); stkPut(old).then(function () { try { localStorage.removeItem(MY_STK); } catch (e) {} }).catch(function () {}); }
    else stkGet().then(function (v) { if (v) stkSet(v); });
  })();
  function loadList(k) { if (k === MY_STK) return myStk.slice(); try { var a = JSON.parse(ls(k) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveList(k, a) {
    if (k === MY_STK) { myStk = a.slice(); stkPut(JSON.stringify(myStk)).catch(function () { toast("Couldn't save"); }); return true; }
    try { localStorage.setItem(k, JSON.stringify(a)); return true; } catch (e) { toast("Couldn't save"); return false; }
  }
  function shrinkSticker(f) {   // 240px is plenty for a sticker; small GIFs keep their animation
    return new Promise(function (ok) {
      if (f.type === "image/gif" && f.size < 400 * 1024) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { ok(null); }; r.readAsDataURL(f); return; }
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 240 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        var d = c.toDataURL("image/webp", .86); if (d.indexOf("data:image/webp") !== 0) d = c.toDataURL("image/png"); ok(d);
      };
      im.onerror = function () { URL.revokeObjectURL(u); ok(null); };
      im.src = u;
    });
  }
  function nid() { return Date.now() + "-" + Math.random().toString(36).slice(2, 6); }
  (function () { var pop = $("emoPop"), stk = (C.stickers && C.stickerList) || [];
    document.addEventListener("nyxstk", function () { paint(); });
    function paint() {
      var mine = loadList(MY_STK), kao = loadList(MY_KAO);
      pop.innerHTML = '<div class="stks"><button type="button" class="add" data-act="add" aria-label="Add a sticker">＋</button>' +
        mine.map(function (x) { return '<button type="button" data-my="' + esc(x.id) + '"><img src="' + x.data + '" alt=""></button>'; }).join("") +
        stk.map(function (n) { return '<button type="button" data-s="' + esc(n) + '"><img class="stk" data-n="' + encodeURIComponent(n) + '" alt="' + esc(n) + '" src="' + C.stickers + encodeURIComponent(n) + '.png"></button>'; }).join("") + "</div>" +
        '<div class="kao">' + kao.map(function (t, i) { return '<button type="button" data-k="' + i + '">' + esc(t) + "</button>"; }).join("") + '<button type="button" class="add" data-act="kao">＋ kaomoji</button></div>' +
        '<div class="emos">' + EMO.map(function (e) { return '<button type="button" data-e="' + e + '">' + e + "</button>"; }).join("") + "</div>";
      pop.querySelectorAll("img.stk").forEach(stkFallback);
    }
    paint();
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true; inp.hidden = true; document.body.appendChild(inp);
    inp.onchange = function () {
      var fs = Array.prototype.slice.call(inp.files || []), list = loadList(MY_STK); inp.value = "";
      fs.reduce(function (p, f) { return p.then(function () { return shrinkSticker(f).then(function (d) { if (d) list.unshift({ id: nid(), data: d }); }); }); }, Promise.resolve())
        .then(function () { if (saveList(MY_STK, list)) paint(); });
    };
    function sendMine(x) {   // upload the saved picture, then send it on its own
      var parts = x.data.split(","), mime = (parts[0].match(/data:([^;]+)/) || [])[1] || "image/png", bin = atob(parts[1]), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      api("/app/upload?name=" + encodeURIComponent("sticker-" + x.id + "." + (mime.split("/")[1] || "png")), { method: "POST", headers: { "Content-Type": mime }, body: new Blob([u], { type: mime }) })
        .then(function (a) { return api("/app/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "", side: root.dataset.side, attachments: [a] }) }); })
        .then(function () { setTimeout(catchUp, 1500); }, function () { toast("Sticker not sent"); });
    }
    var lpT = 0, pressed = false, caret = null;
    text.addEventListener("blur", function () { caret = [text.selectionStart, text.selectionEnd]; });
    pop.addEventListener("pointerdown", function (e) {
      var my = e.target.closest("[data-my]"), k = e.target.closest("[data-k]"); pressed = false; if (!my && !k) return;
      lpT = setTimeout(function () {
        pressed = true;
        if (k) ask.confirm("Remove this kaomoji?", { ok: "remove", danger: true }).then(function (yes) { if (yes) { var a = loadList(MY_KAO); a.splice(+k.dataset.k, 1); saveList(MY_KAO, a); paint(); } });
        if (my) ask.confirm("Remove this sticker?", { ok: "remove", danger: true }).then(function (yes) { if (yes) { saveList(MY_STK, loadList(MY_STK).filter(function (x) { return x.id !== my.dataset.my; })); paint(); } });
      }, 550);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { pop.addEventListener(t, function () { clearTimeout(lpT); }); });
    pop.addEventListener("contextmenu", function (e) { if (e.target.closest("[data-my],[data-k]")) e.preventDefault(); });
    function insert(w) { var c = caret || [text.selectionStart || text.value.length, text.selectionEnd || text.value.length]; text.value = text.value.slice(0, c[0]) + w + text.value.slice(c[1]); caret = [c[0] + w.length, c[0] + w.length]; grow(); }
    pop.onclick = function (e) { var b = e.target.closest("button"); if (!b) return;
      if (pressed) { pressed = false; return; }
      if (b.dataset.act === "add") inp.click();
      else if (b.dataset.act === "kao") {   // saves what's in the box, or asks
        var t0 = text.value.trim(), fromBox = !!t0;
        (t0 ? Promise.resolve(t0) : ask.prompt("Save a kaomoji", { placeholder: "(｡•ᴗ•｡)", ok: "save" })).then(function (t) {
          if (!t) return;
          var a = loadList(MY_KAO); if (a.indexOf(t) >= 0) { toast("Already saved"); return; }
          a.push(t.slice(0, 40)); if (saveList(MY_KAO, a)) { if (fromBox) { text.value = ""; grow(); caret = null; } paint(); toast("Saved"); }
        });
      }
      else if (b.dataset.e) insert(b.dataset.e);
      else if (b.dataset.k != null) insert(loadList(MY_KAO)[+b.dataset.k] || "");
      else if (b.dataset.my) { var x = loadList(MY_STK).filter(function (y) { return y.id === b.dataset.my; })[0]; if (x) { pop.hidden = true; sendMine(x); } }
      else if (b.dataset.s) { var keep = text.value; text.value = "[sticker:" + b.dataset.s + "]"; send(); text.value = keep; grow(); pop.hidden = true; } };
    $("emo").onclick = function () { pop.hidden = !pop.hidden; };
    log.addEventListener("click", function (e) {
      pop.hidden = true;
      var im = e.target.closest && e.target.closest(".msg.ai img.stk"); if (!im || root.classList.contains("selecting")) return;
      ask.confirm("Keep this sticker?", { ok: "keep it" }).then(function (yes) { if (yes) keepSticker(im); });
    });
    function keepSticker(im) {
      fetch(im.currentSrc || im.src).then(function (r) { return r.blob(); }).then(function (bl) {
        return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsDataURL(bl); });
      }).then(function (d) {
        var list = loadList(MY_STK); if (list.some(function (x) { return x.data === d; })) { toast("Already saved"); return; }
        list.unshift({ id: nid(), data: d }); if (saveList(MY_STK, list)) { paint(); toast("Saved"); }
      }).catch(function () { toast("Couldn't save"); });
    } })();
  // sending drops the bubble in at once, with blurred local previews of any images still uploading; the message itself
  // goes out once they're up. If an image never makes it, nothing is sent and a tap retries just the missing ones.
  function send() {
    var t = text.value.trim(); if ((!t && !tray.length) || !key) return;
    if (CCMODE && view !== liveSid) { toast("This is an earlier window — carry it on here first"); return; }
    if (cc && !tray.length && t.charAt(0) === "/" && cc.slash(t)) { text.value = ""; grow(); return; }   // a / command the page or the window takes (cc.js)
    var items = tray.slice(), q = quote;
    tray = []; trayEl.innerHTML = ""; trayEl.hidden = true;
    text.value = ""; grow(); setQuote(null);
    var local = items.map(function (x) { return x.local ? { kind: "image", name: x.name } : { kind: "file", name: x.name }; });
    var pending = build({ id: "", from: "human", text: t, ts: new Date().toISOString(), meta: Object.assign(q ? { quote: q } : {}, { attachments: local }) });
    pending.querySelectorAll(".att img[data-i]").forEach(function (im) { var x = items[+im.dataset.i]; if (x && x.local) im.src = x.local; });
    pending.classList.add("pending"); pending.dataset.text = t; log.appendChild(pending); keepTyping(); toBottom();
    function mark(state, label, onTap) { pending.classList.remove("pending", "failed"); pending.classList.add(state); if (label) pending.querySelector(".t").textContent = label; pending.onclick = onTap || null; }
    function fail(e) { mark("failed", e && e.auth ? "key rejected" : "not sent" + (CCMODE && e && e.message && !/HTTP/.test(e.message) ? ": " + e.message : "") + " — tap to retry", function () { pending.remove(); text.value = t; grow(); send(); }); if (e && e.auth) logout(); }
    function missing() { return items.some(function (x) { return x.file && !x.done; }); }
    function retry() {
      mark("pending"); pending.querySelector(".t").innerHTML = hm(new Date().toISOString()) + MARK_WAIT;
      Promise.all(items.map(function (x) { return x.file && !x.done ? upload(x) : null; })).then(function () {
        if (missing()) { mark("failed", "image still not up — tap again later", retry); return; }
        go();
      });
    }
    function go() {
      var atts = items.filter(function (x) { return x.done; }).map(function (x) { return x.done; });
      if (!t && !atts.length) { fail(); return; }
      var body = { text: t, side: root.dataset.side }; if (q) body.quote = q; if (atts.length) body.attachments = atts;
      if (CCMODE) return api("/app/cc/say", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })   // typed into the window as a prompt
        .then(function (r) { if (r && r.queued) pending.querySelector(".t").textContent = "queued — after this turn"; typing(true); setTimeout(pollBusy, 1500); })
        .catch(function (e) { fail(/409/.test(e.message) ? { message: "it's waiting on a question at the terminal" } : e); });
      return api("/app/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function () { setTimeout(catchUp, 1500); }).catch(fail);   // the stream normally echoes it; this is the safety net
    }
    Promise.all(items.map(function (x) { return x.job || null; })).then(function () {
      if (missing()) { mark("failed", "image didn't upload — tap to retry", retry); return; }
      return go();
    }).catch(fail);
  }

  /* ---------- the floating ball: GET /app/meter, POST /app/model ---------- */
  var meterData = null, meterT = 0, modelPin = null;
  function pct(v) { return v == null ? null : Math.max(0, Math.min(100, Math.round(v))); }
  function whenReset(t) {
    if (!t) return "";
    var d = new Date(t * 1000), now = new Date(), hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return d.toDateString() === now.toDateString() ? hm : (d.getMonth() + 1) + "/" + d.getDate() + " " + hm;
  }
  function paintOrb() {
    var m = meterData, orb = $("orb");
    orb.hidden = false; $("fan").querySelector('[data-k="gauge"]').hidden = !m;   // the board and the heart are there even before a meter
    if (!m) { orb.querySelector(".a1").setAttribute("stroke-dasharray", "0 100"); orb.querySelector(".a2").setAttribute("stroke-dasharray", "0 100"); $("orbNum").textContent = "\u00b7"; return; }
    var ls = m.limits || [], wide = ls.filter(function (l) { return /^(weekly_all|seven_day)$/.test(l.key); })[0] || ls[ls.length - 1], narrow = ls.length > 1 ? ls[0] : null;
    orb.querySelector(".a1").setAttribute("stroke-dasharray", (pct(wide && wide.used) || 0) + " 100");
    orb.querySelector(".a2").setAttribute("stroke-dasharray", (pct(narrow ? narrow.used : m.context && m.context.used_pct) || 0) + " 100");
    $("orbNum").textContent = wide && wide.used != null ? pct(wide.used) : "·";
    orb.classList.toggle("hot", ls.some(function (l) { return l.used >= 90; }));
  }
  function ringHTML(l) {
    var v = pct(l.used) || 0;
    return '<div class="ring' + (v >= 90 ? " hot" : "") + '"><svg viewBox="0 0 76 76"><circle class="tk" cx="38" cy="38" r="33"/>' +
      '<circle class="v" cx="38" cy="38" r="33" pathLength="100" stroke-dasharray="' + v + ' 100"/></svg><b>' + (l.used == null ? "–" : v + "%") + "</b>" +
      "<span>" + esc(l.label || l.key) + "</span><small>" + (l.resets_at ? "resets " + whenReset(l.resets_at) : "") + "</small></div>";
  }
  function paintMeter() {
    var m = meterData; if (!m) return;
    $("mModel").textContent = (m.model && (m.model.name || m.model.id)) || AI;
    $("mPlan").textContent = [m.backend, m.plan].filter(Boolean).join(" · ");
    $("mRings").innerHTML = (m.limits || []).map(ringHTML).join("") || '<p class="none">no usage limits reported</p>';
    $("mAsOf").textContent = m.limits_at ? "as Claude Code reported at " + whenReset(m.limits_at) : m.limits_stale || (m.cc && m.limits && m.limits.length) ? "from the status line — may be old" : "";
    var c = m.context || {}, cv = pct(c.used_pct);
    $("mCtx").hidden = cv == null;
    $("mCtx").querySelector("b").style.width = (cv || 0) + "%";
    $("mCtx").querySelector("em").textContent = cv == null ? "" : cv + "%";
    var pin = modelPin && Date.now() < modelPin.until ? modelPin : null;
    var actual = m.model && m.model.id, live = m.model_applies === "live";
    var listed = (m.models || []).some(function (x) { return x.id === actual; });
    var cur = (pin && pin.id) || (live && listed ? actual : m.chosen || actual);
    $("mList").innerHTML = (m.models || []).filter(function (x) { return !x.more || x.id === cur; }).map(function (x) {   // older models: in the strip's picker
      return '<button type="button" data-id="' + esc(x.id) + '"' + (x.id === cur ? ' class="on"' : "") + ' title="' + esc(x.desc || "") + '">' + esc(x.id === "default" ? "Default" : x.name || x.id) + "</button>";
    }).join("");
    if (cc) cc.meter(m);
    $("mNote").textContent = pin ? pin.note : m.cc ? (m.pending && m.pending.model ? "→ " + m.pending.model + " once it has finished this turn." : "Applies right away, to this window only.") : live ? "A new pick applies right away." :
      m.model_applies === "next" ? "A new pick applies from the next message." :
      m.model_applies === "restart" ? "A new pick applies the next time the session starts." : "";
  }
  /* the window: context line, compact, new window, old windows (GET /app/window …) */
  var win = null, winRaw = "", winCheck = false, winResult = null;
  function kfmt(n) { return n >= 1000 ? Math.round(n / 1000) + "k" : String(n || 0); }
  function paintWin() {
    var w = win; $("mWin").hidden = !w; if (!w) return;
    if (document.activeElement !== $("mLine")) $("mLine").value = w.line_k || 0;
    var k = +$("mLine").value; $("mLineV").textContent = k ? k + "k" : "none";
    var cy = w.carry || {}; if (document.activeElement !== $("mCarryH") && cy.hours != null) $("mCarryH").value = cy.hours;
    if (document.activeElement !== $("mCarryC") && cy.chars != null) $("mCarryC").value = cy.chars; carryLabels();
    var ctx = $("mCtx"); ctx.hidden = false;
    var size = w.size || (meterData && meterData.context && meterData.context.size) || 1000000;
    // the label reads "used / line", so with a line set the bar is measured against the line, not the whole window
    if (w.used) ctx.querySelector("b").style.width = Math.min(100, 100 * w.used / (w.line_k ? w.line_k * 1000 : size)) + "%";
    else if (!(meterData && meterData.context && meterData.context.used_pct != null)) ctx.querySelector("b").style.width = "0%";
    ctx.querySelector("em").textContent = kfmt(w.used) + (w.line_k ? " / " + w.line_k + "k" : "");
    var s0 = w.started_at, sec = typeof s0 === "number" ? (s0 > 1e12 ? s0 / 1000 : s0) : s0 ? Date.parse(s0) / 1000 : 0;   // ms, s or ISO
    if (winCheck) return;
    var line = sec ? "This window opened " + whenReset(sec) + (winRaw ? " · id " + winRaw.slice(0, 8) : "") + "." : winRaw ? "This window · id " + winRaw.slice(0, 8) + "." : "";
    if (winResult && Date.now() - winResult.at > 600000) winResult = null;
    $("mWinNote").textContent = winResult ? winResult.text + (winResult.same ? "" : " " + line) : line;
  }
  /* a 200 only means the relay ran the script, so ask who is actually running: the sid has to change */
  function winSec(s0) { return typeof s0 === "number" ? (s0 > 1e12 ? s0 / 1000 : s0) : s0 ? Date.parse(s0) / 1000 : 0; }
  function verifyWin(before, label) {
    var start = Date.now(), last = "", lastAt = 0;
    winCheck = true; winResult = null; $("mWinNote").textContent = "Checking the window really changed…";
    function finish(text, same) { winCheck = false; winResult = { text: text, same: same, at: Date.now() }; openingDone(); refreshLive(); loadWin(); loadMeter(); paintWin(); toast(text); }
    (function tick() {
      api("/app/window").then(function (d) { return d; }, function () { return null; }).then(function (d) {
        if (d && d.sid) { last = d.sid; lastAt = d.started_at; }
        if (d && d.sid && d.sid !== before) {
          var sec = winSec(d.started_at);
          return finish(label + (sec ? " It opened " + whenReset(sec) + "," : "") + " id " + d.sid.slice(0, 8) + ".", true);
        }
        if (Date.now() - start < 90000) return void setTimeout(tick, 4000);
        if (last && last === before) finish("It did NOT change: you're still in the old window, id " + before.slice(0, 8) + ".", true);
        else finish("Couldn't confirm: no window is answering yet. Check again in a minute.", true);
      });
    })();
  }
  function loadWin() { if (GROUP) return Promise.resolve(); return api("/app/window").then(function (d) { win = d; winRaw = d.sid || ""; paintWin(); if (cc) cc.paint(); }).catch(function () { win = null; winRaw = ""; paintWin(); }); }
  function carryNote() { return +$("mCarryH").value ? "It is handed the last " + $("mCarryHV").textContent + " of your talk (up to " + $("mCarryCV").textContent + " characters); the rest comes from memory." : "Nothing is carried over; only memory comes along."; }
  var lineT = 0;
  $("mLine").addEventListener("input", function () { var k = +this.value; $("mLineV").textContent = k ? k + "k" : "none";
    clearTimeout(lineT); lineT = setTimeout(function () { api("/app/window/line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_k: k }) }).then(loadWin).catch(function () {}); }, 500); });
  function carryLabels() { var h = +$("mCarryH").value; $("mCarryHV").textContent = h ? h + "h" : "none"; $("mCarryCV").textContent = Math.round($("mCarryC").value / 1000) + "k"; }
  var carryT = 0;   // a new window is handed the last hours of talk word for word, up to this many characters (two gates, whichever comes first)
  ["mCarryH", "mCarryC"].forEach(function (id) { $(id).addEventListener("input", function () { carryLabels(); clearTimeout(carryT);
    carryT = setTimeout(function () { api("/app/window/carry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: +$("mCarryH").value, chars: +$("mCarryC").value }) }).catch(function () {}); }, 500); }); });
  function winAct(path, q, done) {
    if (q) { ask.confirm(q).then(function (yes) { if (yes) winAct(path, "", done); }); return; }
    $("mWinNote").textContent = "…";
    api(path, { method: "POST" }).then(function (r) { $("mWinNote").textContent = r && r.started === false ? "Sent, but it hasn't visibly started." : done; setTimeout(function () { loadWin(); loadMeter(); }, 2500); })
      .catch(function (e) { $("mWinNote").textContent = /409/.test(e.message) ? "It's busy or waiting on a question, so it did NOT go through. Try again when it has finished." : "Didn't work: " + e.message; });
  }
  function newWin(q, body) {
    ask.confirm(q, { body: body, ok: "open it" }).then(function (yes) { if (yes) newWinGo(); });
  }
  function newWinGo() {
    opening("");
    winCheck = true; winResult = null; $("mWinNote").textContent = "…";
    api("/app/window").then(function (d) { return d.sid || ""; }, function () { return winRaw; }).then(function (before) {
      return api("/app/window/new", { method: "POST" }).then(function () { verifyWin(before, "New window open."); }, function (e) {
        if (/500/.test(e.message)) return verifyWin(before, "The first start failed, but a window is back up.");
        if (/50[24]|fetch|network|abort|timeout/i.test(e.message)) return verifyWin(before, "New window open.");
        winCheck = false; winResult = { text: /409/.test(e.message) ? "It's busy restarting already, so nothing changed." : "Didn't work: " + e.message + ". Still the old window.", same: false, at: Date.now() }; paintWin(); openingFailed(winResult.text);
      });
    });
  }
  $("mCompact").onclick = function () { winAct("/app/window/compact", "", "Compacting — give it a minute."); };
  $("mNew").onclick = function () { newWin("Open a new window for " + AI + "?", "This one closes. " + carryNote() + " You can come back to this one from Sessions."); };
  $("mWins").onclick = function () { if (cc && meterData && meterData.cc) { closeMeter(); cc.sessions(); return; } if (!hold) return; var before = winRaw; api("/app/window").then(function (d) { if (d.sid) before = d.sid; }, function () {});
    hold.windows(function () { verifyWin(before, "Switched windows."); }); };
  function loadMeter() {
    if (!key || GROUP) return Promise.resolve();
    return api("/app/meter").then(function (d) { meterData = d; paintOrb(); if (cc) cc.paint(d); if (!$("meter").hidden) { paintMeter(); paintWin(); } }).catch(function () { meterData = null; paintOrb(); });
  }
  /* keys for the companion's environment (relay/nyx_keys.py): a value goes in once and never comes back to the page */
  var KEY_HINT = $("mKeyNote").textContent;
  function keyNote(t) { $("mKeyNote").textContent = t || KEY_HINT; }
  function paintKeys(d) {
    var ks = (d && d.keys) || [];
    $("mKeys").hidden = !d;
    $("mKeysCount").textContent = ks.length ? ks.length + " saved" : "none";
    $("mKeyList").innerHTML = ks.map(function (k) {
      return '<div class="k"><span><em>' + esc(k.label || "(no label)") + "</em><b>" + esc(k.name) + " <i>" + esc(k.tail) + "</i></b></span>" +
        '<button type="button" data-lab="' + esc(k.name) + '">label</button><button type="button" data-del="' + esc(k.name) + '">remove</button></div>';
    }).join("");
  }
  function loadKeys() { if (!key || GROUP) return; api("/app/keys").then(paintKeys).catch(function () { paintKeys(null); }); }
  function keysPost(path, body, done) {
    keyNote("\u2026");
    return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (d) { paintKeys(d); keyNote(done); })
      .catch(function (e) { keyNote(/400/.test(e.message) ? "Name: capital letters, digits and _ (like GEMINI_API_KEY); the value on one line." : "Didn't save: " + e.message); });
  }
  $("mKeysOpen").onclick = function () {
    var open = $("mKeysBody").hidden; $("mKeysBody").hidden = !open; this.setAttribute("aria-expanded", String(open)); if (open) keyNote();
  };
  $("mKeyForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("mKeyName").value.trim().toUpperCase(), value = $("mKeyVal").value.trim(), label = $("mKeyLabel").value.trim();
    if (!name || !value) return keyNote("Fill in the name and the key; the label is just for you.");
    $("mKeyVal").value = "";
    keysPost("/app/keys", { name: name, value: value, label: label }, "Saved " + name + ". It can use it from its next command.")
      .then(function () { $("mKeyName").value = ""; $("mKeyLabel").value = ""; });
  });
  $("mKeyList").addEventListener("click", function (e) {
    var l = e.target.closest("button[data-lab]");
    if (l) {
      var cur = l.closest(".k").querySelector("em").textContent;
      ask.prompt("Label for " + l.dataset.lab, { body: "Just for you.", value: cur === "(no label)" ? "" : cur, ok: "save" }).then(function (t) { if (t != null) keysPost("/app/keys", { name: l.dataset.lab, label: t }, "Label saved."); });
      return;
    }
    var b = e.target.closest("button[data-del]"); if (!b) return;
    ask.confirm("Remove " + b.dataset.del + "?", { body: "The companion can't use it after this.", ok: "remove", danger: true }).then(function (yes) { if (yes) keysPost("/app/keys/delete", { name: b.dataset.del }, "Removed " + b.dataset.del + "."); });
  });
  function openMeter() { paintMeter(); paintWin(); $("meter").hidden = false; loadMeter(); loadWin(); loadKeys(); }
  function closeMeter() { $("meter").hidden = true; }
  $("meter").addEventListener("click", function (e) { if (e.target === $("meter")) closeMeter(); });
  $("mList").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-id]"); if (!b) return;
    $("mNote").textContent = "…";
    if (cc && meterData && meterData.cc) { cc.setModel(b.dataset.id).then(function () { setTimeout(loadMeter, 1200); }); return; }
    function pinModel(id, note) { modelPin = { id: id, note: note, until: Date.now() + 60000 }; paintMeter(); setTimeout(loadMeter, 1500); }
    api("/app/model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: b.dataset.id }) })
      .then(function (r) {
        if (meterData) meterData.chosen = b.dataset.id;
        if (r && r.confirmed) pinModel(b.dataset.id, "Switched. The window confirmed it.");
        else if (r && r.applied) pinModel(null, "Sent to the window, but it can't be confirmed from here. The next start keeps the old pick.");
        else pinModel(null, "Saved. It applies per this backend's note.");
      })
      .catch(function (err) { pinModel(null, /409/.test(err.message) ? "It's busy right now, so it did NOT switch. Try again when it has finished." : "Did NOT switch: " + err.message); });
  });
  (function drag() {
    var orb = $("orb"), sx, sy, ox, oy, moved = false;
    try { var p = JSON.parse(localStorage.getItem("nyx_orb") || "null"); if (p) { orb.style.right = p.r + "px"; orb.style.bottom = p.b + "px"; } } catch (e) {}
    orb.addEventListener("pointerdown", function (e) { sx = e.clientX; sy = e.clientY; ox = parseFloat(getComputedStyle(orb).right); oy = parseFloat(getComputedStyle(orb).bottom); moved = false; orb.setPointerCapture(e.pointerId); });
    orb.addEventListener("pointermove", function (e) {
      if (sx == null) return; var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 6) return; moved = true;
      var room = $("room").getBoundingClientRect();
      orb.style.right = Math.max(6, Math.min(room.width - 58, ox - dx)) + "px";
      orb.style.bottom = Math.max(70, Math.min(room.height - 120, oy - dy)) + "px";
    });
    orb.addEventListener("pointerup", function () {
      sx = null;
      if (moved) { try { localStorage.setItem("nyx_orb", JSON.stringify({ r: parseFloat(orb.style.right), b: parseFloat(orb.style.bottom) })); } catch (e) {} }
      else fan(!$("fan").classList.contains("open"));
    });
  })();
  function openSessions() { if (cc) cc.sessions(); else if (hold) hold.windows(); }
  // tap the ball: three fan out to its left — the gauge, sessions, the heart
  function fan(open) {
    var f = $("fan"), orb = $("orb");
    if (open) { f.style.right = (parseFloat(getComputedStyle(orb).right) + 58) + "px"; f.style.bottom = (parseFloat(getComputedStyle(orb).bottom) + 4) + "px"; }
    f.classList.toggle("open", open); f.setAttribute("aria-hidden", open ? "false" : "true");
  }
  $("fan").addEventListener("click", function (e) {
    var b = e.target.closest("[data-k]"); if (!b) return; fan(false);
    if (b.dataset.k === "gauge") openMeter(); else if (b.dataset.k === "sessions") openSessions(); else if (hold) hold[b.dataset.k]();
  });
  document.addEventListener("pointerdown", function (e) { if ($("fan").classList.contains("open") && !e.target.closest("#fan, #orb")) fan(false); });
  setInterval(function () { if (!document.hidden && !$("room").hidden) loadMeter(); }, 60000);

  // the newest 200 messages: one request on a relay that knows ?tail=; an older relay pages from the start, so page forward to the end and keep the last 200
  function latest() {
    return api("/app/history?tail=200&limit=200").then(function (d) {
      var all = d.messages || [];
      if (all.length < 200) return { messages: all };
      function more(since) {
        return api("/app/history?since=" + since + "&limit=500").then(function (n) {
          var got = n.messages || []; all = all.concat(got).slice(-200);
          return got.length === 500 ? more(got[got.length - 1].id) : { messages: all };
        });
      }
      return more(all[all.length - 1].id);
    });
  }
  /* ---------- gate ---------- */
  function backHome() {   // the picked contact's key stopped working: fall back to the first companion instead of locking the door
    ["nyx_relay", "nyx_chat_key", "nyx_ai"].forEach(function (x) { try { localStorage.removeItem(x); } catch (e) {} });
    RELAY = HOME; AI = C.aiName || "Companion"; key = hkey;
  }
  function enter(k) {
    hkey = k; key = RELAY === HOME ? k : (ls("nyx_chat_key") || k);
    return (RELAY === HOME ? Promise.resolve() : hapi("/app/status")).then(function () {
      return GROUP ? null : api("/app/cc/where").catch(function (e) { if (e.auth && RELAY === HOME) throw e; return null; });   // an older relay has no /app/cc: the letter as before
    }).then(function (w) {
      CCMODE = !!(w && w.chat === "cc"); root.classList.toggle("ccmode", CCMODE);
      if (CCMODE) { liveSid = w.sid || ""; return liveSid ? ccLog(liveSid) : { messages: [] }; }
      return latest().catch(function (e) { if (e.auth && RELAY !== HOME) { backHome(); return latest(); } throw e; });
    }).then(function (d) {
      try { localStorage.setItem("nyx_key", k); } catch (e) {}
      try {   // the first contact's key follows the door's, or a tap there would hand the old one back
        var cl = JSON.parse(localStorage.getItem("nyx_contacts") || "[]"), hit = cl.filter(function (c) { return c.relay === HOME; })[0];
        if (hit && hit.key !== k) { hit.key = k; localStorage.setItem("nyx_contacts", JSON.stringify(cl)); }
      } catch (e) {}
      $("gate").hidden = true; $("aiName").textContent = AI;
      log.innerHTML = ""; byId.clear(); msgs.clear(); tools.clear(); lastId = 0; loadDeleted();
      (d.messages || []).forEach(put); if (CCMODE) { earlier(d.more); paintRo(); } openStream(); loadMeter();
      if (!hold && window.NyxHold) hold = NyxHold(hapi, { me: ME, chat: api });
      if (!cc && window.NyxCC && !GROUP) cc = NyxCC({ api: api, text: text, grow: grow, send: send, put: put, toast: toast, openMeter: openMeter, reload: function () { loadMeter(); loadWin(); },
        name: function () { return AI; }, used: function () { return win && win.used; }, ghost: ghost, fail: failGhost, local: localCard, verify: verifyWin,
        ccmode: function () { return CCMODE; }, view: function (sid) { openView(sid); }, carry: carryOn, viewing: function () { return view; },
        opening: opening, openingFailed: openingFailed,
        newWin: function () { $("mNew").onclick(); }, carryNote: carryNote, compact: function () {
          api("/app/window/compact", { method: "POST" }).then(function (r) { toast(r && r.started === false ? "Sent; it hasn't visibly started" : "Compacting — give it a minute"); setTimeout(loadWin, 30000); },
            function (e) { toast(/409/.test(e.message) ? "Busy — compact once it has finished" : "Didn't compact: " + e.message); }); } });
      loadWin();
      pollBusy();
      if (!home) makeHome();
      show(location.hash === "#chat" ? "room" : "home");
    });
  }
  function logout() {
    key = null; hkey = null; if (streamCtl) streamCtl.abort(); streamCtl = null;
    try { localStorage.removeItem("nyx_key"); } catch (e) {}
    $("room").hidden = true; $("home").hidden = true; $("gate").hidden = false;
  }
  $("gateTitle").textContent = C.title || "Nyx"; document.title = C.title || document.title;
  $("gateForm").onsubmit = function (e) {
    e.preventDefault(); var k = $("gateKey").value.trim(); if (!k) return;
    $("gateErr").textContent = "";
    enter(k).catch(function (err) { $("gateErr").textContent = err.auth ? "That key didn't open it." : "Can't reach the relay right now."; key = null; });
  };
  document.addEventListener("visibilitychange", function () { if (!document.hidden && key) { catchUp(); if (!streamCtl) openStream(); } });

  /* iOS pushes the whole page up when the keyboard opens: the header slides off and a gap opens under the box.
     Size the chat to the visible viewport instead while the keyboard is up. */
  (function () {
    var vv = window.visualViewport, room = $("room"); if (!vv || !room) return;
    function apply() {
      var kb = (window.innerHeight || 0) - vv.height > 80;
      root.classList.toggle("kb", kb);
      if (kb) { room.style.height = vv.height + "px"; room.style.top = vv.offsetTop + "px"; room.style.bottom = "auto"; }
      else { room.style.height = room.style.top = room.style.bottom = ""; }
      if (kb && document.activeElement === text) toBottom();
    }
    var t = 0;
    vv.addEventListener("resize", function () { apply(); clearTimeout(t); t = setTimeout(apply, 120); });
    vv.addEventListener("scroll", apply);
    text.addEventListener("focus", function () { [0, 80, 350, 700].forEach(function (d) { setTimeout(apply, d); }); });
    text.addEventListener("blur", function () { [80, 350].forEach(function (d) { setTimeout(apply, d); }); });
  })();

  if (window.NyxSplash && homeKind() !== "eye") NyxSplash(root.dataset.side, root.dataset.side, C.splash);
  var saved = null; try { saved = localStorage.getItem("nyx_key"); } catch (e) {}
  if (saved) enter(saved).catch(function (e) { if (e.auth) logout(); else { $("gate").hidden = true; $("room").hidden = false; $("aiName").textContent = AI; setState(false, "reconnecting…"); setTimeout(function () { enter(saved).catch(function () {}); }, 3000); } });
  else $("gate").hidden = false;
})();
