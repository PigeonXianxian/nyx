/* Nyx — the letter page's Claude Code controls, over relay/nyx_cc.py.
   Under the writing line, a legend in small italic, as under a plate: the permission mode · the model · the effort (a moon:
   the fuller, the harder it thinks) · a slash · the context. Each opens a slip of paper above the line to change it.
   Typing "/" opens the same slip as the list of commands, as Claude Code's own box does: the page does some itself (model,
   effort, mode, compact, a new window, sessions …); some are typed into the window and what it prints comes back as a card
   (/context, /mcp, /fast on …); skills go to the companion, who runs them and answers here.
   Sessions: every window, filed in groups (new, rename, fold, delete); open one, rename it, file it, archive it.
   NyxCC(o) → { paint(m), meter(m), input(), key(e) → handled, slash(text) → handled, sessions(), close() } */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var LEVELS = ["low", "medium", "high", "xhigh", "max"];
  var LV = { low: ["quick", "浅"], medium: ["steady", "中"], high: ["deep", "深"], xhigh: ["deeper", "更深"], max: ["deepest", "最深"] };
  var LV_DESC = { low: "Answers fast, thinks little.", medium: "A little thought first.", high: "Thinks it through.",
    xhigh: "Takes its time on hard things.", max: "Thinks longest; uses the most of your limits." };
  // the moon's lit part, waxing from the right: a sliver, half, gibbous, full; max is full with a ring round it
  var LIT = { low: '<path d="M8 2A6 6 0 0 1 8 14A3.5 6 0 0 0 8 2Z"/>', medium: '<path d="M8 2A6 6 0 0 1 8 14Z"/>',
    high: '<path d="M8 2A6 6 0 0 1 8 14A3.4 6 0 0 1 8 2Z"/>', xhigh: '<circle cx="8" cy="8" r="6"/>', max: '<circle cx="8" cy="8" r="6"/>' };
  function moon(lv) {
    return '<svg class="moon" viewBox="0 0 16 16" aria-hidden="true">' + (lv === "max" ? '<circle class="h" cx="8" cy="8" r="7.5"/>' : "") +
      '<g class="l">' + (LIT[lv] || "") + '</g><circle class="o" cx="8" cy="8" r="6"/></svg>';
  }
  var MODES = ["default", "acceptEdits", "plan", "auto"];
  var MODE = {
    default: { name: "ask first", zh: "先问", desc: "Asks before each edit and each command.", mark: '<circle cx="6.5" cy="5" r="3.3"/>' },
    acceptEdits: { name: "accept edits", zh: "可改文件", desc: "Edits files without asking; asks before commands.", mark: '<path d="M2 1.6l4.2 3.4L2 8.4z"/><path d="M7 1.6l4.2 3.4L7 8.4z"/>' },
    plan: { name: "plan", zh: "只想不做", desc: "Reads and plans; changes nothing.", mark: '<path d="M4.4 1.4v7.2M8.6 1.4v7.2"/>' },
    auto: { name: "auto", zh: "自动", desc: "Goes ahead; a check holds back anything risky.", mark: '<path d="M2 1.6l4.2 3.4L2 8.4z"/><path d="M7 1.6l4.2 3.4L7 8.4z"/>' },
    bypassPermissions: { name: "bypass", zh: "不问", desc: "Never asks.", mark: '<path d="M1.5 5h10M8 1.6l3.5 3.4L8 8.4"/>' }
  };
  function mark(md) { return '<svg class="mm m-' + esc(md) + '" viewBox="0 0 13 10" aria-hidden="true">' + ((MODE[md] || {}).mark || "") + "</svg>"; }
  var MODE_ARG = { ask: "default", default: "default", manual: "default", edits: "acceptEdits", accept: "acceptEdits", acceptedits: "acceptEdits", plan: "plan", auto: "auto" };
  var KIND = { here: ["here", "本页"], terminal: ["terminal", "终端"], skill: ["skills", "技能"] };
  var FALLBACK = [   // what the page can do even before the relay has said which commands there are
    ["model", "[model]", "Pick the model"], ["effort", "[low|medium|high|xhigh|max]", "How hard it thinks"], ["mode", "[ask|edits|plan|auto]", "Permission mode"],
    ["compact", "", "Summarise the window so far to free up context"], ["new", "", "A new window"], ["sessions", "", "All windows, in groups"],
    ["rename", "<title>", "Name this window"], ["usage", "", "Limits: 5 hours, the week, per model"], ["help", "", "What the slash commands do"]
  ].map(function (c) { return { name: c[0], hint: c[1], desc: c[2], kind: "here" }; });

  /* Claude's words are markdown: set them as a letter would — fenced code as a ruled block, headings in small capitals,
     list marks in the margin, tables kept as typed. Everything is escaped first; only these shapes are let back in. */
  function inline(s) {   // inline code is set aside first, so bold can run across it and nothing inside it is touched
    var codes = [];
    s = s.replace(/`([^`\n]+)`/g, function (all, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[^"'>=])(https?:\/\/[^\s<\u0000\u3000-\u9fff\uff00-\uffef]+[^\s<\u0000.,;:!?)\]'"，。！？）\u3000-\u9fff\uff00-\uffef])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    return s.replace(/\u0000(\d+)\u0000/g, function (all, i) { return "<code>" + codes[+i] + "</code>"; });
  }
  function md(src) {
    var lines = esc(String(src || "")).split("\n"), out = [], code = null, table = null;
    function flushTable() {   // a markdown table as a ruled table: the head row in small capitals, a hairline under each row
      if (!table) return;
      var rows = table.filter(function (r) { return !/^\|?[\s:|-]+\|?$/.test(r); }).map(function (r) { return r.replace(/^\||\|$/g, "").split("|").map(function (c) { return inline(c.trim()); }); });
      var head = table.length > 1 && /^\|?[\s:|-]+\|?$/.test(table[1]);
      out.push({ b: 1, h: '<div class="tbw"><table class="tb">' + rows.map(function (r, i) { var t = head && !i ? "th" : "td"; return "<tr>" + r.map(function (c) { return "<" + t + ">" + c + "</" + t + ">"; }).join("") + "</tr>"; }).join("") + "</table></div>" });
      table = null;
    }
    lines.forEach(function (ln) {
      if (/^\s*```/.test(ln)) {
        if (code) { out.push({ b: 1, h: '<pre class="code">' + code.join("\n") + "</pre>" }); code = null; } else { flushTable(); code = []; }
        return;
      }
      if (code) { code.push(ln); return; }
      if (/^\s*\|.*\|\s*$/.test(ln)) { (table = table || []).push(ln.trim()); return; }
      flushTable();
      var m;
      if (!ln.trim()) out.push({ gap: 1 });
      else if ((m = /^(#{1,4})\s+(.*)$/.exec(ln))) out.push({ b: 1, h: '<b class="h h' + m[1].length + '">' + inline(m[2]) + "</b>" });
      else if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) out.push({ b: 1, h: "<hr>" });
      else if ((m = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(ln))) out.push({ b: 1, h: '<span class="li" style="--d:' + Math.min(4, Math.floor(m[1].length / 2)) + '"><i>' + (/\d/.test(m[2]) ? m[2] : "·") + "</i>" + inline(m[3]) + "</span>" });
      else if ((m = /^&gt;\s?(.*)$/.exec(ln))) out.push({ b: 1, h: '<span class="bq">' + inline(m[1]) + "</span>" });
      else out.push({ h: inline(ln) });
    });
    if (code) out.push({ b: 1, h: '<pre class="code">' + code.join("\n") + "</pre>" });
    flushTable();
    var h = "", prev = null;
    out.forEach(function (x) {
      if (x.gap) { if (prev && !prev.gap) h += '<span class="pg"></span>'; prev = x; return; }
      if (prev && !prev.gap && !prev.b && !x.b) h += "<br>";
      h += x.h; prev = x;
    });
    return h;
  }

  var ask = window.NyxAsk || { confirm: function (q, o) { return Promise.resolve(confirm(q + (o && o.body ? "\n\n" + o.body : ""))); },
    prompt: function (q, o) { var v = prompt(q, (o && o.value) || ""); return Promise.resolve(v == null ? null : v.trim()); } };   // the house's own questions (ask.js), the browser's if it's missing

  window.NyxCC = function (o) {
    var M = null, cmds = FALLBACK.slice(), cmdsAt = 0, $ = function (id) { return document.getElementById(id); };
    var text = o.text, write = document.querySelector("footer.write");
    function post(path, body) { return o.api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }); }
    function why(e) { var s = String(e && e.message || e); return /409/.test(s) ? "it's busy or waiting on a question" : /503/.test(s) ? "the window isn't open" : s; }

    /* ---------- the legend under the writing line ---------- */
    var strip = document.createElement("div"); strip.className = "cc"; strip.id = "cc"; strip.hidden = true;
    strip.innerHTML = '<button type="button" data-k="mode" aria-label="Permission mode"></button><i class="sep"></i>' +
      '<button type="button" data-k="model" aria-label="Model"></button><i class="sep"></i>' +
      '<button type="button" data-k="effort" aria-label="Effort"></button><span class="fill"></span>' +
      '<button type="button" data-k="slash" class="sl" aria-label="Commands"><b>/</b></button>' +
      '<button type="button" data-k="ctx" class="cx" aria-label="Context"><em></em><i><b></b></i></button>';
    write.appendChild(strip);
    var slip = document.createElement("div"); slip.className = "slip"; slip.id = "slip"; slip.hidden = true;
    write.insertBefore(slip, write.firstChild);

    function modelName(m) { var x = m && m.model; return x ? String(x.name || x.id || "").replace(/^Default \(recommended\)$/, "default") : ""; }
    function paint(m) {
      M = m || M; m = M;
      strip.hidden = !(m && m.cc);
      if (strip.hidden) return;
      var md = m.mode || "", pend = m.pending || {};
      strip.querySelector('[data-k="mode"]').innerHTML = mark(md) + "<span>" + esc((MODE[md] || {}).name || md || "mode") + "</span>";
      strip.querySelector('[data-k="mode"]').className = md === "plan" ? "plan" : "";
      strip.querySelector('[data-k="model"]').innerHTML = "<span>" + esc(modelName(m) || "model") + "</span>" + (pend.model ? '<small>→ ' + esc(pend.model) + "</small>" : "");
      strip.querySelector('[data-k="effort"]').innerHTML = moon(m.effort) + "<span>" + esc(m.effort || "effort") + "</span>" + (pend.effort && pend.effort !== m.effort ? '<small>→ ' + esc(pend.effort) + "</small>" : "");
      var c = m.context || {}, used = o.used ? o.used() : 0, size = c.size || 1e6, pct = used ? 100 * used / size : c.used_pct;
      strip.querySelector(".cx em").textContent = used ? (used >= 1000 ? Math.round(used / 1000) + "k" : used) : pct != null ? Math.round(pct) + "%" : "";
      strip.querySelector(".cx i b").style.width = Math.max(0, Math.min(100, pct || 0)) + "%";
      strip.querySelector(".cx").hidden = pct == null && !used;
      if (!slip.hidden && slip.dataset.k && slip.dataset.k !== "slash") open(slip.dataset.k, true);
    }
    strip.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-k]"); if (!b) return;
      var k = b.dataset.k;
      if (k === "ctx") { o.openMeter(); return; }
      if (k === "slash") { if (!text.value.trim()) { text.value = "/"; o.grow(); } text.focus(); input(); return; }
      if (!slip.hidden && slip.dataset.k === k) { close(); return; }
      open(k);
    });

    /* ---------- the slip: a picker for mode, model, effort; or the list of commands ---------- */
    var rows = [], sel = 0, moreOpen = false;
    function head(t, zh) { return '<div class="sh"><i></i><b>' + t + "</b>" + (zh ? "<small>" + zh + "</small>" : "") + "</div>"; }
    function open(k, keep) {
      var m = M || {}, h = "";
      slip.dataset.k = k; rows = [];
      if (k === "mode") {
        h = head("Permission", "权限") + (m.modes || MODES.map(function (x) { return { id: x }; })).map(function (x) {
          var d = MODE[x.id] || {}; rows.push({ act: function () { setMode(x.id); } });
          return '<button type="button" class="r md' + (x.id === m.mode ? " cur" : "") + '" data-i="' + (rows.length - 1) + '">' + mark(x.id) +
            '<span class="nm">' + esc(d.name || x.name || x.id) + "<small>" + esc(d.zh || "") + '</small></span><span class="ds">' + esc(d.desc || "") + "</span></button>";
        }).join("") + '<p class="sf">shift+tab in Claude Code · 切换立即生效</p>';
      } else if (k === "model") {
        var ms = m.models || [], cur = m.model || {}, main = ms.filter(function (x) { return !x.more; }), more = ms.filter(function (x) { return x.more; });
        var row = function (x) {
          rows.push({ act: function () { setModel(x.id); } });
          var on = x.id === cur.id || (!ms.some(function (y) { return y.id === cur.id; }) && x.model === cur.model && x.id !== "default");
          return '<button type="button" class="r mo' + (on ? " cur" : "") + '" data-i="' + (rows.length - 1) + '"><span class="nm">' + esc(x.id === "default" ? "Default" : x.name) +
            '</span><span class="hn">' + esc(x.id === "default" ? ((x.desc || "").split(" · ")[0] || "") : x.id) + '</span><span class="ds">' + esc(x.id === "default" ? "recommended · " + ((x.desc || "").split(" · ")[1] || "") : x.desc || "") + "</span></button>";
        };
        h = head("Model", "模型") + (ms.length ? main.map(row).join("") : '<p class="sf">The window hasn’t said which models there are yet.</p>') +
          (more.length ? '<button type="button" class="r more" data-more="1"><span class="nm">' + (moreOpen ? "fewer" : "older models") + '</span><span class="hn">' + more.length + "</span></button>" + (moreOpen ? more.map(row).join("") : "") : "") +
          '<p class="sf">' + (m.pending && m.pending.model ? "→ " + esc(m.pending.model) + " once it has finished this turn" : "This window only; your default stays") + "</p>";
      } else if (k === "effort") {
        var lv = m.efforts && m.efforts.length ? m.efforts : LEVELS;
        h = head("Effort", "思考") + '<div class="moons">' + lv.map(function (x) {
          rows.push({ act: function () { setEffort(x); }, lv: x });
          return '<button type="button" class="r mn' + (x === m.effort ? " cur" : "") + '" data-i="' + (rows.length - 1) + '">' + moon(x) + '<span class="nm">' + esc(x) + "</span><small>" + esc(LV[x][1]) + "</small></button>";
        }).join("") + '</div><p class="sf" id="lvDesc">' + esc(LV_DESC[(m.pending && m.pending.effort) || m.effort] || "How hard it thinks before it answers.") + "</p>";
      }
      slip.innerHTML = h; slip.hidden = false; slip.classList.toggle("wide", k === "slash");
      if (!keep) { var c0 = slip.querySelector(".r.cur[data-i]"); sel = c0 ? +c0.dataset.i : 0; }
      mark_sel();
    }
    function close() { slip.hidden = true; slip.dataset.k = ""; rows = []; }
    function place() {   // the slip stands on the writing frame: its left edge on the margin's rule, as wide as the frame
      var line = write.querySelector(".line"); if (!line) return;
      slip.style.left = Math.max(0, line.offsetLeft - 1) + "px";
      slip.style.right = Math.max(0, write.clientWidth - line.offsetLeft - line.offsetWidth) + "px";
    }
    new MutationObserver(function () { if (!slip.hidden) place(); }).observe(slip, { attributes: true, attributeFilter: ["hidden"] });
    window.addEventListener("resize", function () { if (!slip.hidden) place(); });
    function mark_sel() {
      slip.querySelectorAll(".r.on").forEach(function (b) { b.classList.remove("on"); });
      var b = slip.querySelector('.r[data-i="' + sel + '"]'); if (b) { b.classList.add("on"); if (b.scrollIntoView && slip.dataset.k === "slash") b.scrollIntoView({ block: "nearest" }); }
      var r = rows[sel], d = $("lvDesc"); if (d && r && r.lv) d.textContent = LV_DESC[r.lv];
    }
    slip.addEventListener("click", function (e) {
      if (e.target.closest("[data-more]")) { moreOpen = !moreOpen; open("model", true); return; }
      var b = e.target.closest(".r[data-i]"); if (!b) return;
      var r = rows[+b.dataset.i]; if (r) r.act(e);
    });
    slip.addEventListener("pointermove", function (e) { var b = e.target.closest(".r[data-i]"); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark_sel(); } });
    document.addEventListener("pointerdown", function (e) { if (!slip.hidden && !e.target.closest("#slip, #cc, #text")) close(); });

    /* ---------- the / list as you type ---------- */
    function loadCmds() {
      if (Date.now() - cmdsAt < 600000) return;
      cmdsAt = Date.now();
      o.api("/app/cc/commands").then(function (d) { if (d.commands && d.commands.length) { cmds = d.commands; if (!slip.hidden && slip.dataset.k === "slash") input(); } }).catch(function () { cmdsAt = 0; });
    }
    function find(name) { name = String(name || "").toLowerCase(); return cmds.filter(function (c) { return c.name === name || (c.aliases || []).indexOf(name) >= 0; })[0] || null; }
    function input() {
      var v = text.value;
      if (!/^\/\S*( |$)/.test(v) || /\n/.test(v)) { if (slip.dataset.k === "slash") close(); return; }
      loadCmds();
      var sp = v.indexOf(" "), q = (sp < 0 ? v.slice(1) : v.slice(1, sp)).toLowerCase(), arg = sp < 0 ? null : v.slice(sp + 1);
      slip.dataset.k = "slash"; rows = [];
      var h;
      if (arg !== null) {   // the command is chosen: its arguments
        var c = find(q); if (!c) { close(); return; }
        h = argRows(c, arg.trim().toLowerCase());
      } else {
        var hits = cmds.map(function (c) {
          var n = c.name, s = !q ? 1 : n.indexOf(q) === 0 ? 0 : n.indexOf(q) > 0 ? 2 : (c.desc || "").toLowerCase().indexOf(q) >= 0 ? 3 : -1;
          return { c: c, s: s };
        }).filter(function (x) { return x.s >= 0; });
        var order = { here: 0, terminal: 1, skill: 2 };
        if (q) hits.sort(function (a, b) { return a.s - b.s || order[a.c.kind] - order[b.c.kind] || a.c.name.localeCompare(b.c.name); });
        else hits.sort(function (a, b) { return order[a.c.kind] - order[b.c.kind]; });   // nothing typed yet: the page's own first, in their order
        var last = null; h = "";
        hits.slice(0, 80).forEach(function (x) {
          var c = x.c;
          if (!q && c.kind !== last) { h += '<div class="sec">' + KIND[c.kind][0] + "<small>" + KIND[c.kind][1] + "</small></div>"; last = c.kind; }
          rows.push({ cmd: c, act: function (ev) { pick(c, ev && ev.type === "click"); } });
          h += '<button type="button" class="r cmd k-' + c.kind + '" data-i="' + (rows.length - 1) + '"><span class="nm"><b>/</b>' + esc(c.name) + '</span><span class="hn">' + esc(c.hint || "") +
            '</span><span class="kd">' + (c.kind === "here" ? "" : KIND[c.kind][0]) + '</span><span class="ds">' + esc(c.desc || "") + "</span></button>";
        });
        if (!rows.length) h = '<p class="sf">No command starts with “/' + esc(q) + '”. Sent as it is, it goes to ' + esc(o.name()) + " as a message.</p>";
      }
      sel = Math.min(sel, Math.max(0, rows.length - 1)); if (slip.dataset.q !== v.split(" ")[0]) sel = 0; slip.dataset.q = v.split(" ")[0];
      slip.innerHTML = h; slip.hidden = !h; slip.classList.add("wide"); mark_sel();
    }
    function argRows(c, a) {
      var m = M || {}, opts = [];
      if (c.name === "effort") opts = (m.efforts || LEVELS).map(function (x) { return { v: x, html: moon(x) + '<span class="nm">' + x + '</span><span class="ds">' + esc(LV_DESC[x]) + "</span>", cur: x === m.effort }; });
      else if (c.name === "mode") opts = MODES.map(function (x) { return { v: x === "default" ? "ask" : x === "acceptEdits" ? "edits" : x, html: mark(x) + '<span class="nm">' + MODE[x].name + '</span><span class="ds">' + esc(MODE[x].desc) + "</span>", cur: x === m.mode }; });
      else if (c.name === "model") opts = (m.models || []).filter(function (x) { return !x.more || a; }).map(function (x) { return { v: x.id, html: '<span class="nm">' + esc(x.id) + '</span><span class="hn">' + esc(x.name) + '</span><span class="ds">' + esc(x.desc) + "</span>", cur: x.id === (m.model || {}).id }; });
      else if (c.hint && /^\[[^\]]*\|/.test(c.hint)) opts = c.hint.replace(/^\[|\].*$/g, "").split("|").filter(function (x) { return x && !/[<\s]/.test(x); }).map(function (x) { return { v: x, html: '<span class="nm">' + esc(x) + "</span>" }; });
      opts = opts.filter(function (x) { return !a || x.v.indexOf(a) === 0; });
      var h = '<div class="sec">/' + esc(c.name) + "<small>" + esc(c.hint || "") + "</small></div>";
      opts.forEach(function (x) { rows.push({ act: function () { text.value = "/" + c.name + " " + x.v; o.grow(); go(); } }); h += '<button type="button" class="r arg' + (x.cur ? " cur" : "") + '" data-i="' + (rows.length - 1) + '">' + x.html + "</button>"; });
      if (!opts.length) h += '<p class="sf">' + esc(c.desc || "") + (c.kind === "skill" ? " · goes to " + esc(o.name()) : c.kind === "terminal" ? " · typed into the window" : "") + "</p>";
      return h;
    }
    function needsArg(c) { return /^</.test(c.hint || ""); }
    // a command picked from the list: /model, /effort, /mode show their choices; one that needs words after it (or, tapped,
    // one that can take some) waits in the box for them; anything else goes at once
    function pick(c, tapped) {
      var choices = c.kind === "here" && ["model", "effort", "mode"].indexOf(c.name) >= 0;
      if (choices || needsArg(c) || (tapped && c.hint)) { text.value = "/" + c.name + " "; o.grow(); text.focus(); input(); return; }
      text.value = "/" + c.name; o.grow(); go();
    }
    function go() { close(); o.send(); }
    function key(e) {
      if (slip.hidden || !rows.length || e.isComposing || e.keyCode === 229) { if (e.key === "Escape" && !slip.hidden) { close(); return true; } return false; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = (sel + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length; mark_sel(); e.preventDefault(); return true; }
      if (e.key === "Escape") { close(); e.preventDefault(); return true; }
      var r = rows[sel];
      if (e.key === "Tab" && r) { e.preventDefault(); if (r.cmd) { text.value = "/" + r.cmd.name + " "; o.grow(); input(); } else r.act(); return true; }
      if (e.key === "Enter" && !e.shiftKey && r) {
        if (slip.dataset.k !== "slash") { r.act(); e.preventDefault(); return true; }
        if (r.cmd && text.value.trim() !== "/" + r.cmd.name) { e.preventDefault(); pick(r.cmd); return true; }
        if (!r.cmd) { e.preventDefault(); r.act(); return true; }   // choosing one of the command's choices
      }
      return false;
    }

    /* ---------- doing it ---------- */
    function after(r, what, viaSlash) {
      if (r && r.pending) o.toast(what + " once it has finished this turn");
      else if (r && r.confirmed === false) o.toast(what + " — sent; the window didn’t confirm");
      else o.toast(what);
      setTimeout(o.reload, 900); setTimeout(o.reload, 4000);
    }
    function setModel(id, note) {
      close(); var x = ((M && M.models) || []).filter(function (y) { return y.id === id; })[0];
      return post("/app/cc/model", { model: id, note: !!note }).then(function (r) { after(r, "Model → " + (x ? (x.id === "default" ? "default" : x.name) : id)); }, function (e) { o.toast("Model didn’t change: " + why(e)); });
    }
    function setEffort(lv, note) {
      close();
      return post("/app/cc/effort", { level: lv, note: !!note }).then(function (r) { if (M) M.effort = r.pending ? M.effort : lv; paint(); after(r, "Effort → " + lv); }, function (e) { o.toast("Effort didn’t change: " + why(e)); });
    }
    function setMode(md, note) {
      close(); if (M) { M.mode = md; paint(); }
      return post("/app/cc/mode", { mode: md, note: !!note }).then(function () { after(null, "Mode → " + MODE[md].name); }, function (e) { o.toast("Mode didn’t change: " + why(e)); o.reload(); });
    }
    function runTerminal(t) {
      var g = o.ghost(t, "typing it into the window…");
      return post("/app/cc/run", { text: t, side: document.documentElement.dataset.side }).then(function (d) {
          if (!o.ccmode || !o.ccmode()) { o.put(d.cmd); o.put(d.out); return; }
          if (d.out && d.out.meta && d.out.meta.dialog) o.local(d.out.text, t.split(" ")[0]);   // a dialog never reaches the transcript
          setTimeout(function () { if (g.isConnected && g.classList.contains("pending")) g.remove(); }, 5000);
        },
        function (e) { o.fail(g, /409/.test(e.message) ? "busy — send it once it has finished" : "not run: " + why(e), t); });
    }
    function help() {
      var g = function (k) { return cmds.filter(function (c) { return c.kind === k; }).map(function (c) { return "/" + c.name + (c.hint ? " " + c.hint : "") + "\n    " + c.desc; }).join("\n"); };
      o.local("HERE · the page does these\n" + g("here") + "\n\nTERMINAL · typed into the window, what it prints comes back\n" + g("terminal") + "\n\nSKILLS · " + o.name() + " runs them and answers here\n" + cmds.filter(function (c) { return c.kind === "skill"; }).map(function (c) { return "/" + c.name; }).join("  "), "/help");
    }
    // a line starting with "/" on send: true if handled here (else it goes as a message, a skill with a note to run it)
    function slash(t) {
      var m = /^\/([A-Za-z0-9][A-Za-z0-9:_-]*)(?:\s+([\s\S]*))?$/.exec(t.trim()); if (!m) return false;
      var name = m[1].toLowerCase(), arg = (m[2] || "").trim(), c = find(name);
      close();
      if (!c) return false;
      if (c.kind === "skill") return false;
      if (c.kind === "terminal") { if (!M || !M.cc) { o.toast("Only with Claude Code"); return true; } runTerminal(t.trim()); return true; }
      switch (c.name) {
        case "model":
          if (!arg) { open("model"); return true; }
          var ms = (M && M.models) || [], x = ms.filter(function (y) { return y.id === arg.toLowerCase(); })[0] || ms.filter(function (y) { return y.name.toLowerCase().indexOf(arg.toLowerCase()) === 0 || y.model === arg; })[0];
          if (!x) { o.toast("No model “" + arg + "”"); open("model"); return true; }
          setModel(x.id, true); return true;
        case "effort":
          if (LEVELS.indexOf(arg.toLowerCase()) < 0) { open("effort"); return true; }
          setEffort(arg.toLowerCase(), true); return true;
        case "mode":
          var md = MODE_ARG[arg.toLowerCase().replace(/\s+/g, "")];
          if (!md) { open("mode"); return true; }
          setMode(md, true); return true;
        case "compact": o.compact(arg); return true;
        case "clear": case "new": o.newWin(); return true;
        case "sessions": case "resume": sessions(); return true;
        case "rename":
          (arg ? Promise.resolve(arg) : ask.prompt("Name this session", { placeholder: "a title", ok: "name it" })).then(function (t2) {
            if (!t2) return;
            o.api("/app/window").then(function (w) { if (!w.sid) throw new Error("no window"); return post("/app/cc/sessions/meta", { sid: w.sid, title: t2 }); })
              .then(function () { o.toast("Named “" + t2 + "”"); }, function (e) { o.toast("Couldn’t name it: " + why(e)); });
          });
          return true;
        case "usage": o.openMeter(); return true;
        case "help": help(); return true;
      }
      return false;
    }

    /* ---------- the gauge: effort and mode rows ---------- */
    function meter(m) {
      M = m || M; m = M; var e = $("mEffort"), d = $("mMode");
      if (!e || !d) return;
      e.hidden = d.hidden = !(m && m.cc);
      if (e.hidden) return;
      e.querySelector("div").innerHTML = (m.efforts && m.efforts.length ? m.efforts : LEVELS).map(function (x) {
        return '<button type="button" data-lv="' + x + '"' + (x === m.effort ? ' class="on"' : "") + ">" + moon(x) + "<span>" + x + "</span></button>";
      }).join("");
      d.querySelector("div").innerHTML = (m.modes || []).map(function (x) {
        return '<button type="button" data-md="' + x.id + '"' + (x.id === m.mode ? ' class="on"' : "") + ">" + mark(x.id) + "<span>" + esc((MODE[x.id] || x).name) + "</span></button>";
      }).join("");
      var p = m.pending || {};
      e.querySelector("p").textContent = p.effort && p.effort !== m.effort ? "→ " + p.effort + " once it has finished this turn" : LV_DESC[m.effort] || "";
      d.querySelector("p").textContent = (MODE[m.mode] || {}).desc || "";
    }
    document.addEventListener("click", function (ev) {
      var b = ev.target.closest("#mEffort button[data-lv], #mMode button[data-md]"); if (!b) return;
      if (b.dataset.lv) setEffort(b.dataset.lv).then(function () { meter(); }); else setMode(b.dataset.md).then(function () { meter(); });
    });

    /* ---------- sessions: every window, in groups ---------- */
    var S = null, data = { sessions: [], groups: [] }, openRow = null, showArch = false, q = "";
    function when(iso) {
      if (!iso) return ""; var d = new Date(iso), n = new Date(), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      var y = new Date(n); y.setDate(n.getDate() - 1);
      return (d.toDateString() === n.toDateString() ? "today " : d.toDateString() === y.toDateString() ? "yesterday " : (d.getMonth() + 1) + "/" + d.getDate() + " ") + hm;
    }
    function sessions() {
      close();
      if (!S) {
        S = document.createElement("div"); S.className = "meter sess"; S.id = "sess"; S.hidden = true;
        S.innerHTML = '<div class="sheet" role="dialog" aria-label="Sessions"><div class="sh2"><b>Sessions</b><small>会话</small><button type="button" class="x">Done</button></div>' +
          '<div class="stools"><input type="search" placeholder="find" aria-label="Find a session"><button type="button" data-a="gnew">+ group</button><button type="button" data-a="new">+ window</button></div>' +
          '<div class="sb"></div><p class="hint" id="sessNote"></p></div>';
        (document.getElementById("room") || document.body).appendChild(S);
        S.addEventListener("click", onClick);
        wireDrag();
        S.querySelector("input").addEventListener("input", function () { q = this.value.trim().toLowerCase(); render(); });
      }
      S.hidden = false; S.querySelector(".sb").innerHTML = '<p class="none">Looking…</p>'; note("");
      load();
    }
    function note(t) { if (S) S.querySelector("#sessNote").textContent = t || ""; }
    function load() { return o.api("/app/cc/sessions").then(function (d) { data = d; render(); }, function (e) { S.querySelector(".sb").innerHTML = '<p class="none">Couldn’t get the list: ' + esc(why(e)) + "</p>"; }); }
    function sname(w) { return w.title || (w.current ? "this window" : "untitled"); }
    var CC = function () { return !!(o.ccmode && o.ccmode()); };
    // a row: tap it to open that conversation; ⋯ for the rest (carry it on here, rename, file under a group, archive);
    // with a mouse it can also be dragged onto a group's heading
    function rowHTML(w) {
      var groups = data.groups || [], open_ = openRow === w.sid, showing = CC() && o.viewing && o.viewing() === w.sid;
      var meta = [w.current ? '<b class="now">live</b>' : "", w.elsewhere ? '<b class="away">' + (w.elsewhere === "vscode" ? "open in VS Code" : "open elsewhere") + "</b>" : "", w.folder ? '<b class="away">' + esc(w.folder) + " · read only</b>" : "", esc(when(w.last) || when(w.started)), w.messages ? w.messages + (w.messages === 1 ? " message" : " messages") : "", w.usage_tokens ? Math.round(w.usage_tokens / 1000) + "k" : "", esc(String(w.model || "").replace(/^claude-/, ""))].filter(Boolean).join(" · ");
      return '<div class="srow' + (w.current ? " cur" : "") + (showing ? " shown" : "") + (w.archived ? " arch" : "") + (open_ ? " open" : "") + '" data-sid="' + esc(w.sid) + '"' + (fine ? ' draggable="true"' : "") + ">" +
        '<button type="button" class="st" data-a="pick"><i class="dot"></i><span class="tt">' + esc(sname(w)) + '</span><span class="mt">' + meta + "</span>" +
        (w.last_text && w.last_text !== w.title ? '<span class="lx">' + esc(w.last_text) + "</span>" : "") + "</button>" +
        '<button type="button" class="more" data-a="row" aria-label="More for this session" aria-expanded="' + open_ + '"><i></i><i></i><i></i></button>' +
        (open_ ? '<div class="sa">' + (CC() && !w.current && !w.readonly ? '<button type="button" data-a="carry">carry it on here</button>' : "") + '<button type="button" data-a="rename">rename</button>' +
          '<span class="fl"><em>group</em>' + [{ id: "", name: "none" }].concat(groups).map(function (g) { return '<button type="button" data-a="file" data-g="' + esc(g.id) + '"' + ((w.group || "") === g.id ? ' class="on"' : "") + ">" + esc(g.name) + "</button>"; }).join("") +
          '<button type="button" data-a="file" data-g="+" class="add">+ new</button></span>' + (w.current ? "" : '<button type="button" data-a="arch">' + (w.archived ? "unarchive" : "archive") + "</button>") + "</div>" : "") + "</div>";
    }
    var fine = !(window.matchMedia && matchMedia("(pointer: coarse)").matches);   // anything but a finger: rows can be dragged
    function render() {
      if (!S) return;
      var ws = (data.sessions || []).filter(function (w) { return !q || (sname(w) + " " + (w.last_text || "") + " " + (w.first_text || "")).toLowerCase().indexOf(q) >= 0; });
      var live = ws.filter(function (w) { return !w.archived; }), arch = ws.filter(function (w) { return w.archived; }), h = "", gs = data.groups || [];
      gs.forEach(function (g) {
        var in_ = live.filter(function (w) { return w.group === g.id; });
        h += '<div class="gbox" data-g="' + esc(g.id) + '"><div class="gh' + (g.fold ? " fold" : "") + '" data-g="' + esc(g.id) + '"><button type="button" data-a="fold" class="gn"><i></i>' + esc(g.name) + "<small>" + in_.length + "</small></button>" +
          '<span class="ga"><button type="button" data-a="gnewin" title="A new window in this group">+ window</button><button type="button" data-a="gren">rename</button><button type="button" data-a="gdel">delete</button></span></div>';
        if (!g.fold) h += in_.length ? in_.map(rowHTML).join("") : '<p class="none sm">' + (fine ? "Drag a session here, or file it from its ⋯." : "File a session here from its ⋯.") + "</p>";
        h += "</div>";
      });
      var loose = live.filter(function (w) { return !w.group; });
      if (loose.length || !gs.length) h += '<div class="gbox" data-g="">' + (gs.length ? '<div class="gh loose" data-g=""><span class="gn"><i></i>ungrouped<small>' + loose.length + "</small></span></div>" : "") + (loose.length ? loose.map(rowHTML).join("") : '<p class="none">No sessions yet.</p>') + "</div>";
      if (arch.length) h += '<div class="gh arch' + (showArch ? "" : " fold") + '"><button type="button" data-a="showarch" class="gn"><i></i>archived<small>' + arch.length + "</small></button></div>" + (showArch ? arch.map(rowHTML).join("") : "");
      if (data.chat === "cc") h += '<p class="none sm foot">The same sessions as Claude Code in this folder, VS Code’s included. One session is best open in one place at a time.</p>';
      S.querySelector(".sb").innerHTML = h;
    }
    function find_(sid) { return (data.sessions || []).filter(function (w) { return w.sid === sid; })[0]; }
    function setMeta(sid, b) { return post("/app/cc/sessions/meta", Object.assign({ sid: sid }, b)).then(load, function (e) { note("Didn’t save: " + why(e)); }); }
    function group(b) { return post("/app/cc/sessions/group", b).then(function (r) { return load().then(function () { return r; }); }, function (e) { note("Didn’t work: " + why(e)); }); }
    function onClick(e) {
      if (e.target === S || e.target.closest(".x")) { S.hidden = true; return; }
      var b = e.target.closest("[data-a]"); if (!b || b.tagName === "SELECT") return;
      var a = b.dataset.a, row = b.closest(".srow"), sid = row && row.dataset.sid, w = sid && find_(sid), gh = b.closest(".gh"), gid = gh && gh.dataset.g;
      var g = gid && (data.groups || []).filter(function (x) { return x.id === gid; })[0];
      if (a === "row") { openRow = openRow === sid ? null : sid; render(); }
      else if (a === "pick" && w && CC()) { S.hidden = true; o.view(sid); }   // open it: the live one to write in, any other to read
      else if (a === "pick" && w) {
        if (w.current) { S.hidden = true; return; }
        ask.confirm("Go back to “" + sname(w) + "”?", { body: "The window in use now closes; it stays here too.", ok: "go back" }).then(function (yes) {
          if (!yes) return;
          note("Switching…");
          o.api("/app/window").then(function (d) { return d.sid || ""; }, function () { return ""; }).then(function (before) {
            return post("/app/window/switch", { sid: sid }).then(function () { S.hidden = true; o.verify(before, "Switched windows."); });
          }).catch(function (e2) { note("Didn’t switch: " + why(e2)); });
        });
      }
      else if (a === "carry" && w) { S.hidden = true; o.view(sid); o.carry(sid, w.elsewhere); }
      else if (a === "rename" && w) ask.prompt("Name this session", { value: w.title || "", placeholder: "a title", ok: "name it" }).then(function (t) { if (t != null) setMeta(sid, { title: t }); });
      else if (a === "arch" && w) setMeta(sid, { archived: !w.archived }).then(function () { openRow = null; render(); });
      else if (a === "fold" && g) group({ op: "fold", id: gid, fold: !g.fold });
      else if (a === "showarch") { showArch = !showArch; render(); }
      else if (a === "gren" && g) ask.prompt("Rename the group", { value: g.name, ok: "rename" }).then(function (n) { if (n) group({ op: "rename", id: gid, name: n }); });
      else if (a === "gdel" && g) ask.confirm("Delete the group “" + g.name + "”?", { body: "Its sessions stay, ungrouped.", ok: "delete", danger: true }).then(function (yes) { if (yes) group({ op: "delete", id: gid }); });
      else if (a === "gnew") ask.prompt("A new group", { placeholder: "its name", ok: "make it" }).then(function (gn) { if (gn) group({ op: "new", name: gn }); });
      else if (a === "file" && w) {   // filing it: one of the groups, none, or a new one made for it
        var to = b.dataset.g;
        if (to === "+") ask.prompt("A new group for “" + sname(w) + "”", { placeholder: "its name", ok: "make it" }).then(function (gn) { if (gn) group({ op: "new", name: gn, sids: [sid] }); });
        else if ((w.group || "") !== to) setMeta(sid, { group: to || null });
      }
      else if (a === "new" || a === "gnewin") newIn(a === "gnewin" ? g : null);
    }
    // with a mouse: drag a session onto a group — its heading, one of its sessions, anywhere in it — to file it there
    var dragSid = null;
    function wireDrag() {
      S.addEventListener("dragstart", function (e) { var r = e.target.closest && e.target.closest(".srow[draggable]"); if (!r) return; dragSid = r.dataset.sid; r.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", dragSid); e.dataTransfer.effectAllowed = "move"; } catch (x) {} });
      S.addEventListener("dragend", function () { dragSid = null; S.querySelectorAll(".dragging, .drop").forEach(function (n) { n.classList.remove("dragging", "drop"); }); });
      function box(e) { return dragSid && e.target.closest ? e.target.closest(".gbox[data-g]") : null; }   // the group under the pointer: its heading, its sessions, its empty line
      S.addEventListener("dragover", function (e) { var b = box(e); if (!b) return; e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch (x) {} S.querySelectorAll(".gbox.drop").forEach(function (n) { if (n !== b) n.classList.remove("drop"); }); b.classList.add("drop"); });
      S.addEventListener("dragleave", function (e) { var b = e.target.closest && e.target.closest(".gbox.drop"); if (b && !b.contains(e.relatedTarget)) b.classList.remove("drop"); });
      S.addEventListener("drop", function (e) { var b = box(e); if (!b) return; e.preventDefault(); b.classList.remove("drop"); var sid = dragSid, w = find_(sid); dragSid = null; if (w && (w.group || "") !== b.dataset.g) setMeta(sid, { group: b.dataset.g || null }); });
    }
    function newIn(g) {
      ask.confirm("Open a new window" + (g ? " in “" + g.name + "”" : "") + "?", { body: "The one in use closes; it stays in this list. " + o.carryNote(), ok: "open it" }).then(function (yes) {
        if (!yes) return;
        S.hidden = true;
        var where = g ? " in “" + g.name + "”" : "";
        o.opening(where);   // the letter says so, and follows the window to its new session when it's up
        var before = null;
        o.api("/app/window").then(function (d) { return d.sid || ""; }, function () { return ""; }).then(function (b0) {
          before = b0; return post("/app/cc/sessions/new", g ? { group: g.id } : {});
        }).then(function () { o.verify(before, "New window open" + where + "."); }, function (e) {
          if (before !== null && /50[024]|fetch|network/i.test(String(e.message))) o.verify(before, "New window open" + where + ".");   // the proxy gave up waiting; the window may well be up
          else o.openingFailed("Didn’t open: " + why(e));
        });
      });
    }


    loadCmds();
    return { paint: paint, meter: meter, input: input, key: key, slash: slash, sessions: sessions, close: close, setModel: setModel };
  };
  window.NyxCC.md = md;
})();
