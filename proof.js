/* 构成 — the proof: a look at a file that was handed over, without downloading it. A printer pulls a proof to see the pages
   before they are printed; this is that. The pages of a deck, a document, a sheet or a PDF (set as pictures on the server,
   relay/nyx_proof.py), or the text of a note, a table or some code, laid in a frame drawn by hand in pencil — 拙, the lines
   run on past the corners and are gone over twice — with crop marks at the corners and a register mark above, the page's
   number in the margin under it as on the plates, and, under a deck, its speaker notes.
   On a wide screen the letter moves over to make room: it slides left to the fold and the proof comes in on the right of it.
   Where the screen is not wide enough for the plate as well, the plate goes, the way a leaf is turned, and comes back when
   the proof is put away. On a phone the proof is a sheet over the letter: swipe between pages, pinch to look closer, pull
   the notes up.
   NyxProof(o) → { open(att), close(), card(el, att), arrived(att), isOpen() };  NyxProof.kind(name) → "pages"|"text"|"image"|""
   o: api(path) → JSON · blob(url) → an object URL, fetched with the key · download(url, name) · size(n) · toast(t) · md(text) */
(function () {
  "use strict";
  var OFFICE = "pptx ppt pps ppsx potx odp key docx doc dotx odt rtf xlsx xls ods pdf".split(" ");
  var TEXT = "txt md markdown csv tsv json jsonl yaml yml toml ini cfg conf log xml html htm css js mjs ts tsx jsx py sh bash zsh sql rs go java kt swift c h cc cpp hpp rb php r lua tex bib srt vtt diff patch".split(" ");
  var IMAGE = "png jpg jpeg gif webp svg".split(" ");
  var TEXT_MAX = 3 * 1024 * 1024;
  function ext(n) { var m = /\.([A-Za-z0-9]+)$/.exec(n || ""); return m ? m[1].toLowerCase() : ""; }
  function kind(n) { var e = ext(n); return OFFICE.indexOf(e) >= 0 ? "pages" : TEXT.indexOf(e) >= 0 ? "text" : IMAGE.indexOf(e) >= 0 ? "image" : ""; }
  function family(n) { return String(n || "").replace(/\.[^.]*$/, "").replace(/ \(\d+\)$/, "").trim().toLowerCase() + "." + ext(n); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function roman(n) {
    if (n < 1 || n > 3999) return String(n);
    var r = "", t = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    t.forEach(function (p) { while (n >= p[0]) { r += p[1]; n -= p[0]; } });
    return r;
  }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; }
  var WIDE = window.matchMedia("(min-width:1000px) and (min-aspect-ratio:5/4)");

  function NyxProof(o) {
    var room = document.getElementById("room"), el = null, stage, track, frameCv, msg, folio, strip, notes, nt, head, figs = [], pages = [];
    var cur = null, man = null, at = 0, seq = 0, fitw = false, seed = 1, cache = new Map(), known = new Map(), shown = new Map();

    /* what the relay says about a file — asked once; a failure is asked again next time */
    function peek(a) {
      var p = a.outbox;
      if (!cache.has(p)) cache.set(p, o.api("/app/proof?path=" + encodeURIComponent(p)).then(function (m) { if (m.kind === "none") cache.delete(p); else known.set(p, m); return m; },
        function (e) { cache.delete(p); throw e; }));
      return cache.get(p);
    }

    function build() {
      el = document.createElement("aside"); el.id = "proof"; el.hidden = true; el.setAttribute("aria-label", "Proof");
      el.innerHTML =
        '<header class="pf-h"><span class="pf-t"><small>proof</small><b class="pf-n"></b></span><span class="pf-v"></span>' +
        '<span class="pf-acts"><button type="button" class="pf-w" data-a="get">download</button><button type="button" class="pf-w pf-big" data-a="full">enlarge</button><button type="button" class="pf-w pf-x" data-a="x">close</button></span></header>' +
        '<div class="pf-stage"><div class="pf-track"></div><canvas class="pf-frame" aria-hidden="true"></canvas>' +
        '<button type="button" class="pf-ar pf-prev" data-a="prev" aria-label="Previous page">‹</button><button type="button" class="pf-ar pf-next" data-a="next" aria-label="Next page">›</button>' +
        '<div class="pf-msg" hidden></div></div>' +
        '<div class="pf-folio"></div><nav class="pf-strip" aria-label="Pages"></nav>' +
        '<section class="pf-notes" hidden><button type="button" class="pf-nh" data-a="notes"><small>notes</small><span>讲稿</span></button><div class="pf-nt"></div></section>';
      room.appendChild(el);
      head = el.querySelector(".pf-h"); stage = el.querySelector(".pf-stage"); track = el.querySelector(".pf-track"); frameCv = el.querySelector(".pf-frame");
      msg = el.querySelector(".pf-msg"); folio = el.querySelector(".pf-folio"); strip = el.querySelector(".pf-strip"); notes = el.querySelector(".pf-notes"); nt = el.querySelector(".pf-nt");
      el.addEventListener("click", onClick);
      track.addEventListener("click", function (e) {   // on a wide screen a click on the page reads it at full width, and back
        var im = e.target.closest(".pf-pg img"); if (!im || !WIDE.matches || !pages.length || pages[at].text) return;
        fitw = !fitw; figs.forEach(function (f, i) { f.classList.toggle("fitw", fitw && i === at); }); lay();
        if (fitw) figs[at].scrollTop = 0;
      });
      var settle = 0;   // a swipe between pages: which one it came to rest on
      track.addEventListener("scroll", function () { clearTimeout(settle); settle = setTimeout(function () { if (WIDE.matches || !figs.length) return; var i = Math.round(track.scrollLeft / (track.clientWidth || 1)); if (i !== at) turned(i); }, 90); }, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(function () { if (!el.hidden) lay(); }).observe(stage);
      if (WIDE.addEventListener) WIDE.addEventListener("change", function () { fitw = false; figs.forEach(function (f) { f.classList.remove("fitw"); }); full(false); unzoom(); });
      new MutationObserver(function () { if (!el.hidden) frame(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-side"] });
      pinch();
    }

    function onClick(e) {
      var b = e.target.closest("[data-a]"); if (!b || !el.contains(b)) return;
      var a = b.dataset.a;
      if (a === "x") close();
      else if (a === "get") { if (cur) o.download(cur.url, cur.name); }
      else if (a === "full") full(!el.classList.contains("full"));
      else if (a === "prev") go(at - 1);
      else if (a === "next") go(at + 1);
      else if (a === "page") go(+b.dataset.n);
      else if (a === "notes") { if (!WIDE.matches) notes.classList.toggle("open"); }
      else if (a === "ver") { var v = man && man.versions && man.versions[+b.dataset.n]; if (v && v.path !== cur.outbox) open({ kind: "file", outbox: v.path, name: v.name, size: v.size, url: v.url }); }
    }
    function full(on) { el.classList.toggle("full", on); el.querySelector(".pf-big").textContent = on ? "beside" : "enlarge"; }

    /* ---------- open, close ---------- */
    function open(a) {
      if (!a || !a.outbox) return;
      if (!el) build();
      var my = ++seq, again = cur && cur.outbox === a.outbox && !el.hidden;
      cur = a; man = null; fitw = false; seed = hash(a.outbox) % 9000;
      paintHead();
      if (!again) { clear(); say("setting the proof", true); }
      show();
      marks();
      peek(a).then(function (m) {
        if (my !== seq) return;
        man = m; paintHead();
        if (m.kind === "pages" && m.pages && m.pages.length) setPages(m.pages, m.notes);
        else if (m.kind === "image") setPages([{ url: a.url, image: true }], null);
        else if (m.kind === "text") setText(a, m);
        else { clear(); say(esc(cap(m.why || "there’s nothing to show")) + ".", false, true); }
      }, function (e) { if (my === seq) { clear(); say("Couldn’t get it: " + esc(e.message || "no answer") + ".", false, true); } });
    }
    function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
    function show() {
      var log = document.getElementById("log"), was = !el.hidden && el.classList.contains("in");
      if (was) return;
      var low = log && log.scrollHeight - log.scrollTop - log.clientHeight < 140, card = room.querySelector('.att .file.on');
      el.hidden = false; void el.offsetWidth;
      el.classList.add("in"); room.classList.add("proofing");
      frameCv.classList.remove("drawn"); void frameCv.offsetWidth; frameCv.classList.add("drawn");
      follow(log, low, card);
    }
    // the letter changes measure as it moves; keep its end in sight, or the card that was opened
    function follow(log, low, card) {
      if (!log || !WIDE.matches) return;
      var t0 = performance.now();
      (function step() {
        if (low) log.scrollTop = log.scrollHeight;
        if (performance.now() - t0 < 800) requestAnimationFrame(step);
        else if (!low && card && card.isConnected) card.scrollIntoView({ block: "nearest" });
      })();
    }
    function close() {
      if (!el || el.hidden) return;
      seq++; cur = null; marks();
      var log = document.getElementById("log"), low = log && log.scrollHeight - log.scrollTop - log.clientHeight < 140;
      el.classList.remove("in"); full(false); room.classList.remove("proofing");
      follow(log, low, null);
      setTimeout(function () { if (!el.classList.contains("in")) { el.hidden = true; clear(); } }, 700);
    }
    function isOpen() { return !!(el && !el.hidden && el.classList.contains("in")); }
    // the card of the file that is open is marked in the letter
    function marks() { document.querySelectorAll(".att .file[data-ob]").forEach(function (c) { c.classList.toggle("on", !!cur && c.dataset.ob === cur.outbox); }); }

    function paintHead() {
      el.querySelector(".pf-n").textContent = cur ? cur.name || "file" : "";
      el.querySelector(".pf-n").title = cur ? cur.name || "" : "";
      var vs = (man && man.versions) || [], v = el.querySelector(".pf-v");
      v.innerHTML = vs.length > 1 ? vs.map(function (x, i) { return '<button type="button" data-a="ver" data-n="' + i + '" class="' + (x.path === cur.outbox ? "on" : "") + '" title="' + esc(x.name + " · " + new Date(x.mtime * 1000).toLocaleString()) + '">v' + (i + 1) + "</button>"; }).join("") : "";
    }
    function say(html, wait, offer) {
      msg.hidden = false; msg.className = "pf-msg" + (wait ? " wait" : "");
      msg.innerHTML = "<p>" + html + "</p>" + (offer && cur ? '<button type="button" class="pf-w" data-a="get">download it instead</button>' : "");
    }
    function clear() {
      figs = []; pages = []; at = 0; track.innerHTML = ""; strip.innerHTML = ""; folio.innerHTML = ""; notes.hidden = true; notes.classList.remove("open");
      el.classList.remove("one"); frame();
    }

    /* ---------- pages ---------- */
    function setPages(list, nts) {
      clear(); msg.hidden = true;
      pages = list.map(function (p, i) { return { w: p.w, h: p.h, url: p.url, thumb: p.thumb, image: p.image, note: nts ? nts[i] : undefined }; });
      track.innerHTML = pages.map(function (p, i) { return '<figure class="pf-pg" aria-label="Page ' + (i + 1) + '"><img alt="" draggable="false"></figure>'; }).join("");
      figs = Array.prototype.slice.call(track.children);
      el.classList.toggle("one", pages.length < 2);
      strip.innerHTML = pages.length > 1 ? pages.map(function (p, i) { return '<button type="button" class="pf-th" data-a="page" data-n="' + i + '" aria-label="Page ' + (i + 1) + '"><img alt=""></button>'; }).join("") : "";
      pages.forEach(function (p, i) { if (p.thumb) o.blob(p.thumb).then(function (u) { var t = strip.children[i]; if (t) t.firstChild.src = u; }, function () {}); });
      notes.hidden = !nts || !nts.some(function (x) { return x; });
      lay(); go(0, true);
    }
    function load(i) {
      var p = pages[i], f = figs[i]; if (!p || !f || p.text || f.dataset.l) return;
      f.dataset.l = "1";
      var im = f.querySelector("img");
      o.blob(p.url).then(function (u) {
        im.onload = function () {
          if (p.image && !p.w) { p.w = im.naturalWidth || 4; p.h = im.naturalHeight || 3; lay(); }
          f.classList.add("ld");
        };
        im.src = u;
      }, function () { f.dataset.l = ""; f.classList.add("bad"); });
    }
    function go(i, now) {
      if (!pages.length) return;
      i = clamp(i, 0, pages.length - 1);
      if (fitw && i !== at) { fitw = false; figs.forEach(function (f) { f.classList.remove("fitw"); }); lay(); }
      var f = figs[i]; if (f) track.scrollTo({ left: f.offsetLeft, behavior: now ? "auto" : "smooth" });
      turned(i);
    }
    // the page now in the frame: its number, its notes, its thumbnail marked; the next ones fetched
    function turned(i) {
      if (i !== at) unzoom();
      at = i;
      [i, i + 1, i - 1, i + 2].forEach(load);
      if (pages.length > 4) setTimeout(function () { pages.forEach(function (p, j) { if (Math.abs(j - at) < 6) load(j); }); }, 600);
      var tot = pages.length;
      folio.innerHTML = tot > 1 ? "<em>" + roman(i + 1) + "</em><span>/</span>" + roman(tot) + (man && man.total > tot ? '<small>the first ' + tot + " of " + man.total + "</small>" : "") : "";
      Array.prototype.forEach.call(strip.children, function (t, j) { t.classList.toggle("on", j === i); });
      var th = strip.children[i];
      if (th) { var l = th.offsetLeft - strip.offsetLeft, r = l + th.offsetWidth; if (l < strip.scrollLeft + 10) strip.scrollTo({ left: l - 24, behavior: "smooth" }); else if (r > strip.scrollLeft + strip.clientWidth - 10) strip.scrollTo({ left: r - strip.clientWidth + 24, behavior: "smooth" }); }
      if (!notes.hidden) { var n = pages[i] && pages[i].note; nt.textContent = n || "No notes on this page."; nt.classList.toggle("none", !n); nt.scrollTop = 0; }
      el.querySelector(".pf-prev").disabled = i <= 0; el.querySelector(".pf-next").disabled = i >= tot - 1;
      frame();
    }
    // each page as large as the frame lets it be, its own shape kept
    function lay() {
      if (!figs.length) { frame(); return; }
      var pp = parseFloat(getComputedStyle(stage).getPropertyValue("--pp")) || 20, W = track.clientWidth - pp * 2, H = track.clientHeight - pp * 2;
      figs.forEach(function (f, i) {
        var p = pages[i]; if (!p) return;
        var box = f.firstChild;
        if (p.text) { box.style.width = W + "px"; box.style.height = H + "px"; return; }
        if (!p.w || !p.h) return;
        var a = p.w / p.h, w, h;
        if (fitw && i === at) { w = W; h = W / a; } else if (W / H > a) { h = H; w = H * a; } else { w = W; h = W / a; }
        box.style.width = Math.max(10, w) + "px"; box.style.height = Math.max(10, h) + "px";
      });
      var f = figs[at]; if (f) track.scrollLeft = f.offsetLeft;
      frame();
    }

    /* ---------- text: a note, a table, some code, set on a sheet ---------- */
    function setText(a, m) {
      if ((m.size || 0) > TEXT_MAX) { clear(); say("It’s too long to set here (" + esc(o.size(m.size)) + ").", false, true); return; }
      var my = seq;
      o.blob(a.url).then(function (u) { return fetch(u).then(function (r) { return r.text(); }); }).then(function (t) {
        if (my !== seq) return;
        clear(); msg.hidden = true;
        var e = ext(a.name), html;
        if (e === "md" || e === "markdown") html = '<div class="md">' + (o.md ? o.md(t) : "<pre>" + esc(t) + "</pre>") + "</div>";
        else if (e === "csv" || e === "tsv") html = table(t, e === "tsv" ? "\t" : ",");
        else {
          if (e === "json") { try { t = JSON.stringify(JSON.parse(t), null, 2); } catch (x) {} }
          var ls = t.replace(/\n$/, "").split("\n");
          html = ls.length <= 6000 ? '<pre class="code">' + ls.map(function (l) { return '<span class="l">' + (esc(l) || " ") + "</span>"; }).join("") + "</pre>" : '<pre class="code plain">' + esc(t) + "</pre>";
        }
        pages = [{ text: true }];
        track.innerHTML = '<figure class="pf-pg pf-tx ld"><div class="pf-sheet">' + html + "</div></figure>";
        figs = [track.firstChild]; el.classList.add("one");
        lay(); turned(0);
      }, function (e) { if (my === seq) { clear(); say("Couldn’t get it: " + esc(e.message || "no answer") + ".", false, true); } });
    }
    function table(t, sep) {
      var rows = [], row = [], cell = "", q = false, i, c;
      for (i = 0; i < t.length; i++) {
        c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
        else if (c === '"') q = true;
        else if (c === sep) { row.push(cell); cell = ""; }
        else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; if (rows.length >= 2000) break; }
        else cell += c;
      }
      if (cell || row.length) { row.push(cell); rows.push(row); }
      if (!rows.length) return "<p></p>";
      return '<table class="tb"><thead><tr>' + rows[0].map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        rows.slice(1).map(function (r) { return "<tr>" + r.map(function (d) { return "<td>" + esc(d) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
    }

    /* ---------- the frame, in pencil: a rule round the page that runs on past the corners, crop marks, a register mark ---------- */
    function frame() {
      if (!frameCv) return;
      var W = stage.clientWidth, H = stage.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
      if (frameCv.width !== Math.round(W * d) || frameCv.height !== Math.round(H * d)) { frameCv.width = Math.round(W * d); frameCv.height = Math.round(H * d); }
      var x = frameCv.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, frameCv.width, frameCv.height);
      var f = figs[at], box = f && f.firstChild;
      if (!box || fitw || !W) return;
      var w = parseFloat(box.style.width), h = parseFloat(box.style.height); if (!w || !h) return;
      var G = window.Gou, SK = G && G.sk; if (!SK || !window.rough) return;
      x.setTransform(d, 0, 0, d, 0, 0);
      var X = (W - w) / 2, Y = (H - h) / 2, night = document.documentElement.dataset.side === "moon", room = Math.min(X, Y);
      var lead = function (a) { return SK.pen(x, night ? "pfLeadN" : "pfLead", night ? [222, 219, 212] : [34, 34, 40], a); };
      var blue = function (a) { return SK.pen(x, night ? "pfBlueN" : "pfBlue", night ? [128, 138, 252] : [36, 46, 184], a); };
      var g = window.rough.generator(), O = SK.opts, s = 3000 + seed, m = room > 22 ? 8 : 5, ov = room > 22 ? 9 : 4, r = G.rng(s);
      SK.wf(1);
      var L = X - m, T = Y - m, R = X + w + m, B = Y + h + m, j = function () { return (r() - .5) * 1.6; };
      var line = function (x1, y1, x2, y2, k, a, wd) { return SK.longLine(g, x1, y1, x2, y2, O({ seed: s + k, roughness: 1.05, bowing: .9, strokeWidth: wd || 1.05, stroke: lead(a), disableMultiStroke: k % 2 === 1 })); };
      SK.put(x, line(L - ov, T + j(), R + ov * .6, T + j(), 1, .5));
      SK.put(x, line(R + j(), T - ov * .7, R + j(), B + ov, 2, .46));
      SK.put(x, line(R + ov * .5, B + j(), L - ov * .8, B + j(), 3, .52));
      SK.put(x, line(L + j(), B + ov * .6, L + j(), T - ov, 4, .44));
      if (room < 26) return;
      // crop marks: where the page would be cut, out past the frame
      var c = 15, gap = m + 7, k = 10;
      [[X, Y, -1, -1], [X + w, Y, 1, -1], [X, Y + h, -1, 1], [X + w, Y + h, 1, 1]].forEach(function (p) {
        SK.put(x, g.line(p[0] + p[2] * gap, p[1], p[0] + p[2] * (gap + c), p[1] + j() * .5, O({ seed: s + k++, roughness: .7, strokeWidth: .9, stroke: lead(.36), disableMultiStroke: true })));
        SK.put(x, g.line(p[0], p[1] + p[3] * gap, p[0] + j() * .5, p[1] + p[3] * (gap + c), O({ seed: s + k++, roughness: .7, strokeWidth: .9, stroke: lead(.36), disableMultiStroke: true })));
      });
      // the register mark, above the middle of the page
      var cx = X + w / 2 + j(), cy = T - Math.min(15, room - 9), rr = 4.6;
      SK.put(x, [g.circle(cx, cy, rr * 2, O({ seed: s + 40, roughness: 1, strokeWidth: 1, stroke: blue(.72), curveFitting: .95 })),
        g.line(cx - rr * 1.9, cy, cx + rr * 1.9, cy + .3, O({ seed: s + 41, roughness: .6, strokeWidth: .9, stroke: blue(.7), disableMultiStroke: true })),
        g.line(cx, cy - rr * 1.9, cx - .3, cy + rr * 1.9, O({ seed: s + 42, roughness: .6, strokeWidth: .9, stroke: blue(.7), disableMultiStroke: true }))]);
    }

    /* ---------- a closer look on a phone: pinch, or tap twice; drag about while it is close ---------- */
    var z = { s: 1, x: 0, y: 0 };
    function zimg() { var f = figs[at]; return f && f.querySelector("img"); }
    function zset(s, zx, zy, ease) {
      var im = zimg(); if (!im) return;
      var w = parseFloat(im.style.width) || 0, h = parseFloat(im.style.height) || 0, mx = Math.max(0, (w * s - track.clientWidth) / 2 + 20), my = Math.max(0, (h * s - track.clientHeight) / 2 + 20);
      z.s = s; z.x = clamp(zx, -mx, mx); z.y = clamp(zy, -my, my);
      im.style.transition = ease ? "transform .25s ease" : "none";
      im.style.transform = s > 1.01 ? "translate(" + z.x + "px," + z.y + "px) scale(" + s + ")" : "";
      track.classList.toggle("zoomed", s > 1.01);
    }
    function unzoom() { if (z.s > 1) zset(1, 0, 0); else track.classList.remove("zoomed"); }
    function pinch() {
      var p0 = null, pan = null, tap = 0, moved = false;
      function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
      track.addEventListener("touchstart", function (e) {
        if (WIDE.matches || !pages.length || pages[at].text) return;
        moved = false;
        if (e.touches.length === 2) { p0 = { d: dist(e.touches), s: z.s, x: z.x, y: z.y }; pan = null; e.preventDefault(); }
        else if (e.touches.length === 1 && z.s > 1.01) { pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: z.x, oy: z.y }; }
      }, { passive: false });
      track.addEventListener("touchmove", function (e) {
        if (p0 && e.touches.length === 2) { var s = clamp(p0.s * dist(e.touches) / p0.d, 1, 4); zset(s, p0.x * s / p0.s, p0.y * s / p0.s); moved = true; e.preventDefault(); }
        else if (pan && e.touches.length === 1) { zset(z.s, pan.ox + e.touches[0].clientX - pan.x, pan.oy + e.touches[0].clientY - pan.y); moved = true; e.preventDefault(); }
        else moved = true;
      }, { passive: false });
      track.addEventListener("touchend", function (e) {
        if (e.touches.length < 2) p0 = null;
        if (!e.touches.length) {
          pan = null;
          if (z.s > 1 && z.s < 1.08) zset(1, 0, 0, true);
          if (!moved && !WIDE.matches && pages.length && !pages[at].text) {
            var now = Date.now();
            if (now - tap < 320) { tap = 0; var t = e.changedTouches[0], im = zimg(), rc = im && im.getBoundingClientRect();
              if (z.s > 1.01 || !rc) zset(1, 0, 0, true); else zset(2.4, (rc.left + rc.width / 2 - t.clientX) * 1.4, (rc.top + rc.height / 2 - t.clientY) * 1.4, true); }
            else tap = now;
          }
        }
      });
    }

    /* ---------- the keys: ← → through the pages, Esc to put it away (not while writing) ---------- */
    document.addEventListener("keydown", function (e) {
      if (!isOpen() || e.defaultPrevented) return;
      var t = e.target, typing = t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable);
      if (typing || document.querySelector(".meter:not([hidden]), .nyxask, #zoom")) return;
      if (e.key === "Escape") { if (el.classList.contains("full")) full(false); else close(); e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "PageDown") { go(at + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { go(at - 1); e.preventDefault(); }
    });

    /* ---------- the card in the letter: the first page on it as a small print, and how many there are ---------- */
    var queue = [], busy = 0;
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); queue.push(e.target); pump(); } });
    }, { rootMargin: "240px" }) : null;
    function pump() {
      while (busy < 2 && queue.length) {
        var n = queue.shift(); busy++;
        (function (n) { peek(n._pf).then(function (m) { fill(n, m); }, function () {}).then(function () { busy--; pump(); }); })(n);
      }
    }
    function fill(n, m) {
      var pc = n.querySelector(".pc"), th = n.querySelector(".th");
      if (m.kind !== "pages" || !m.pages || !m.pages.length) { n.classList.add("flat"); return; }
      if (pc) pc.textContent = m.total + (m.total === 1 ? " page · " : " pages · ");
      var p = m.pages[0];
      if (!th) return;
      th.style.aspectRatio = p.w + " / " + p.h;
      var im = th.querySelector("img");
      if (shown.has(p.thumb)) { im.src = shown.get(p.thumb); th.classList.add("ld", "now"); return; }   // the card was set again: no fade
      o.blob(p.thumb).then(function (u) { im.onload = function () { shown.set(p.thumb, u); th.classList.add("ld"); }; im.src = u; }, function () {});
    }
    function card(n, a) {
      if (!a || !a.outbox || kind(a.name) !== "pages") return;
      n._pf = a;
      if (known.has(a.outbox)) { fill(n, known.get(a.outbox)); return; }
      if (io) io.observe(n); else { queue.push(n); pump(); }
    }
    /* a new file came in the letter: if it is a new version of the one open, the proof turns to it */
    function arrived(a) {
      if (!isOpen() || !cur || !a || !a.outbox || a.outbox === cur.outbox || family(a.name) !== family(cur.name)) return;
      open(a); if (o.toast) o.toast("A new version came — it’s in the proof");
    }

    return { open: open, close: close, card: card, arrived: arrived, isOpen: isOpen, marks: marks };
  }
  NyxProof.kind = kind;
  window.NyxProof = NyxProof;
})();
