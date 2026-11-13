/* 构成 — Listen, laid out as 396's page: the song's name at the top left, the record (a stair seen straight down, its lit
   treads turning) hanging off the right edge with the time gone as a blue arc round it, a swallow at its foot, three
   lines of the words, and under them one plumb line with the play mark at its end.
   listen.js keeps doing all the work (queue, audio, lyrics, NetEase): this only draws its state and passes taps on to
   its own buttons. The list of tracks is the old page, kept behind "tracks". Loaded after listen.js. */
(function () {
  "use strict";
  var G = window.Gou; if (!G) return;
  var C = G.C, TAU = G.TAU, RAD = G.RAD, $ = function (id) { return document.getElementById(id); };
  var audio = $("audio"), root = document.documentElement;
  var cv = document.createElement("canvas"), x = cv.getContext("2d"); cv.id = "gl"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "Now playing");
  document.body.appendChild(cv);
  var listBtn = document.createElement("button"); listBtn.id = "glList"; listBtn.type = "button"; listBtn.textContent = "tracks"; document.body.appendChild(listBtn);
  var closeBtn = document.createElement("button"); closeBtn.id = "glClose"; closeBtn.type = "button"; closeBtn.textContent = "×"; closeBtn.setAttribute("aria-label", "Close the list"); document.body.appendChild(closeBtn);
  listBtn.onclick = function () { document.body.classList.add("gl-list"); }; closeBtn.onclick = function () { document.body.classList.remove("gl-list"); };
  $("list").addEventListener("click", function (e) { if (e.target.closest(".row")) setTimeout(function () { document.body.classList.remove("gl-list"); kick(); }, 250); });

  var w = 0, h = 0, s = 1, k = 1, ox = 0, oy = 0, hits = [], raf = 0, spin = 0, last = 0, drag = false, dust = null;
  var wide = false, TX = 0, RS = 1, LO = { x: 0, y: 0 }, flow = 0;   // a wide screen: the page is laid on its side — see layout()
  var D = { x: 721, y: 551, R: 333 };   // the record: centre and the radius of its outer ring (page units, 1000 wide) — her measures
  function night() { return root.dataset.side === "moon"; }
  function ink(a) { return night() ? "rgba(240,237,230," + a + ")" : "rgba(27,27,32," + a + ")"; }
  function mmss(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2); }
  function txt(id) { var e = $(id); return e ? (e.textContent || "").trim() : ""; }

  function layout() {
    var nw = innerWidth, nh = innerHeight; if (nw === w && nh === h) return;
    w = nw; h = nh; var dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + "px"; cv.style.height = h + "px";
    s = Math.min(w / 1000, h / 1500); k = s * dpr; ox = (w / s - 1000) / 2; oy = Math.max(0, (h / s - 1788) * .4); dust = null;
    // A wide screen is not a tall page with margins. The same things are laid across it: the song, its words and the plumb line down the
    // left; the record large on the right, the orbits going round it while it plays (TX: how far in the left column starts; RS: how much
    // larger the record is; LO: where the lower half of her page has been moved to)
    wide = w >= 1000 && w / h > 1.25;
    if (wide) { s = h / 1160; k = s * dpr; ox = 0; oy = 0; var Wd = w / s; TX = Wd * .09; RS = 1.3; D.x = Wd * .665; D.y = 580; LO.x = TX; LO.y = -540; }
    else { TX = 0; RS = 1; D.x = 721; D.y = 551; LO.x = 0; LO.y = 0; }
  }
  function ground() {
    var dark = night();
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = dark ? C.night : C.paper; x.fillRect(0, 0, cv.width, cv.height);
    if (!dust || dust.dark !== dark) {   // the dust of the page, sifted once
      var c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height; var g = c.getContext("2d"), r = G.rng(8), i;
      g.fillStyle = dark ? "rgba(240,237,230,.1)" : "rgba(27,27,32,.07)";
      for (i = 0; i < 5200; i++) { var px = r() * c.width, py = r() * c.height, d = Math.hypot(px / k - ox - D.x, py / k - oy - D.y) / 900; if (r() < .25 + .75 * Math.max(0, 1 - Math.abs(d - .9) * 1.6)) g.fillRect(px, py, (1 + r() * 2.2) * k * .8, (1 + r() * 2.2) * k * .8); }
      dust = { img: c, dark: dark };
    }
    x.drawImage(dust.img, 0, 0);
    x.setTransform(k, 0, 0, k, ox * k, oy * k);
    if (wide && G.orrery) G.orrery(x, { cx: D.x, cy: D.y, K: 1.55, tilt: 0, q: 1, night: dark, orb: 0, time: flow, a: dark ? .5 : .36, rv: 1 });   // the orbits of the home, round the record: they flow while it plays
  }

  /* the record: a stair seen straight down. Two rings of treads; those on the lit side are paper, the rest only their edges */
  var recSheet = null;
  function herRecord(dark) {   // her record (record.js: a stair seen straight down, traced from her film), drawn once
    if (recSheet && recSheet.dark === dark && recSheet.k === k) return recSheet;
    var Rr = G.RECORD, half = 372, c = document.createElement("canvas"); c.width = c.height = Math.ceil(half * 2 * k); var g = c.getContext("2d"); g.scale(k, k); g.translate(half, half); g.lineCap = "round";
    var tone = function (v, a) { return dark ? "rgba(" + v + "," + v + "," + Math.max(0, v - 3) + "," + a + ")" : "rgba(27,27,32," + (G.clamp((v - 40) / 215, 0, 1) * .62 * a).toFixed(3) + ")"; };
    Rr.rings.forEach(function (r) { g.strokeStyle = tone(210, (.25 + .5 * r[1]).toFixed(2)); g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, r[0], 0, TAU); g.stroke(); });
    Rr.strokes.forEach(function (l) {
      var mx = (l[0] + l[2]) / 2, my = (l[1] + l[3]) / 2, d = Math.hypot(mx, my) || 1, sx = l[2] - l[0], sy = l[3] - l[1], L = Math.hypot(sx, sy) || 1;
      if (d > 70 && Math.abs((mx * sy - my * sx) / (d * L)) > .4) return;   // of the line work only the spokes are kept (the circles are drawn as circles)
      g.strokeStyle = tone(225, G.clamp((l[5] - 24) / 110, .35, .9).toFixed(2)); g.lineWidth = Math.max(.9, Math.min(1.8, l[4])); g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); });
    // the treads in shadow, down the far side of it: only their edges, and the rails they hang from
    g.lineWidth = 1; for (var sa = -32; sa <= 152; sa += 15.3) { var ca = Math.cos(sa * RAD), sn = Math.sin(sa * RAD); g.strokeStyle = tone(215, .3); g.beginPath(); g.moveTo(ca * 122, sn * 122); g.lineTo(ca * 296, sn * 296); g.stroke(); }
    [150, 205, 296].forEach(function (rr) { g.strokeStyle = tone(215, rr > 250 ? .4 : .26); g.beginPath(); g.arc(0, 0, rr, -34 * RAD, 154 * RAD); g.stroke(); });
    Rr.areas.forEach(function (a) { g.beginPath(); a.p.forEach(function (ring) { g.moveTo(ring[0][0], ring[0][1]); for (var i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); }); g.fillStyle = dark ? "rgb(" + a.c + "," + a.c + "," + Math.max(0, a.c - 4) + ")" : tone(a.c, 1); g.fill("evenodd"); });
    g.fillStyle = C.blue; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill(); g.fillStyle = "#F1EEE7"; g.beginPath(); g.arc(0, 0, 3.6, 0, TAU); g.fill();
    return (recSheet = { img: c, half: half, dark: dark, k: k });
  }
  function record(turn, p) {
    var dark = night(), i, a0, a1, lit;
    x.save(); x.translate(D.x, D.y); x.scale(RS, RS);
    if (G.RECORD) {   // her own record: it stands still; only the time goes round it
      var sh = herRecord(dark); x.drawImage(sh.img, -sh.half, -sh.half, sh.half * 2, sh.half * 2);
      x.strokeStyle = ink(.55); x.lineWidth = 1.4; x.beginPath(); x.moveTo(0, -D.R - 14); x.lineTo(0, -D.R + 4); x.stroke();
      if (p > 0) { x.strokeStyle = C.blue; x.lineWidth = 8; x.lineCap = "butt"; x.beginPath(); x.arc(0, 0, D.R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p)); x.stroke();
        var rr = G.rng(3); x.fillStyle = "rgba(240,237,230,.85)"; for (i = 0; i < 40; i++) { var ab = -Math.PI / 2 + rr() * TAU * p; x.fillRect(Math.cos(ab) * (D.R - 3 + rr() * 6), Math.sin(ab) * (D.R - 3 + rr() * 6), 1.6, 1.6); } }
      x.restore(); return;
    }
    x.strokeStyle = ink(.3); x.lineWidth = 1.2; x.beginPath(); x.arc(0, 0, D.R, 0, TAU); x.stroke();
    x.strokeStyle = ink(.16); x.beginPath(); x.arc(0, 0, D.R * .955, 0, TAU); x.stroke();
    x.save(); x.rotate(turn);
    var rings = [[.36, .74, 16], [.18, .34, 12], [.09, .16, 10]];
    rings.forEach(function (rg, q) {
      var n = rg[2], step = TAU / n;
      for (i = 0; i < n; i++) {
        a0 = i * step + q * .13; a1 = a0 + step - .035; var mid = ((a0 + a1) / 2 + turn) % TAU; if (mid < 0) mid += TAU;
        lit = G.clamp(1.25 - Math.abs(mid - 232 * RAD) / (78 * RAD), 0, 1);   // lit from the upper left, wherever the record has turned to
        x.beginPath(); x.arc(0, 0, D.R * rg[1], a0, a1); x.arc(0, 0, D.R * rg[0], a1, a0, true); x.closePath();
        if (lit > 0) { var v = Math.round(96 + 142 * Math.pow(lit, .5)); x.fillStyle = dark ? "rgb(" + v + "," + v + "," + (v - 4) + ")" : "rgba(27,27,32," + (.08 + .5 * lit) + ")"; x.fill(); }
        x.strokeStyle = ink(lit > 0 ? .5 : .22); x.lineWidth = 1; x.stroke();
      }
      x.strokeStyle = ink(.22); x.beginPath(); x.arc(0, 0, D.R * (rg[1] + .03), 0, TAU); x.stroke();
    });
    for (i = 0; i < 24; i++) { var a = i * TAU / 24; x.strokeStyle = ink(.14); x.beginPath(); x.moveTo(Math.cos(a) * D.R * .77, Math.sin(a) * D.R * .77); x.lineTo(Math.cos(a) * D.R * .9, Math.sin(a) * D.R * .9); x.stroke(); }
    x.restore();
    x.strokeStyle = ink(.25); x.lineWidth = 1; x.beginPath(); x.arc(0, 0, D.R * .9, 0, TAU); x.stroke();
    x.fillStyle = C.blue; x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.fill(); x.fillStyle = "#F1EEE7"; x.beginPath(); x.arc(0, 0, 3.6, 0, TAU); x.fill();
    // the time gone, as a blue arc from the top
    x.strokeStyle = ink(.55); x.lineWidth = 1.4; x.beginPath(); x.moveTo(0, -D.R - 14); x.lineTo(0, -D.R + 4); x.stroke();
    G.text(x, "0", 0, -D.R - 24, "400 15px " + G.SERIF, ink(.45), "center");
    if (p > 0) { x.strokeStyle = C.blue; x.lineWidth = 7; x.lineCap = "butt"; x.beginPath(); x.arc(0, 0, D.R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p)); x.stroke();
      var r = G.rng(3); x.fillStyle = "rgba(240,237,230,.85)"; for (i = 0; i < 40; i++) { var aa = -Math.PI / 2 + r() * TAU * p; x.fillRect(Math.cos(aa) * (D.R - 3 + r() * 6), Math.sin(aa) * (D.R - 3 + r() * 6), 1.6, 1.6); } }
    x.restore();
  }

  function frame(now) {
    raf = 0; layout();
    var playing = audio && !audio.paused, d = (audio && audio.duration) || 0, t = (audio && audio.currentTime) || 0, p = d ? t / d : 0;
    if (playing) { var dt = Math.min(.1, (now - last) / 1000); spin += dt * .22; flow += dt; } last = now;
    ground(); hits = [];
    var name = txt("cardName") || "Nothing yet", artist = txt("cardArtist"), has = !!(audio && (audio.currentSrc || audio.src));
    // the way back: one blue drop
    x.fillStyle = C.blue; x.beginPath(); x.ellipse(72, 78, 12, 15, 0, 0, TAU); x.fill(); hits.push({ x: 72, y: 78, r: 60, fn: function () { try { sessionStorage.setItem("gou_back", "1"); } catch (e) {} var b = $("back"); if (b) b.click(); else location.href = "index.html"; } });
    // the song
    G.text(x, name, 58 + TX, 232, "400 46px " + G.HAN, ink(.92), "left", /[\u3000-\u9fff]/.test(name) ? 10 : 3);
    if (artist) G.text(x, artist, 58 + TX, 290, "400 23px " + G.HAN, ink(.55), "left", 6);
    var rows = document.querySelectorAll("#list .row"), at = -1; if (has) for (var i = 0; i < rows.length; i++) if ((rows[i].textContent || "").indexOf(name) >= 0) { at = i; break; }
    G.text(x, "side a" + (at >= 0 ? "  ·  no. " + (at + 1) : ""), 58 + TX, 338, "italic 400 18px " + G.SERIF, ink(.38), "left", 3);
    record(spin, p);
    // the swallow at the foot of the record, and the line it has let down
    var sw = [D.x - 261 * RS, D.y + 287 * RS];
    x.strokeStyle = ink(.3); x.lineWidth = 1.2; x.setLineDash([.5, 7]); x.beginPath(); x.moveTo(sw[0] - 30, sw[1] + 26); x.lineTo(333 + LO.x, 935 + LO.y); x.stroke(); x.setLineDash([]);
    x.fillStyle = ink(.5); x.fillRect(329 + LO.x, 931 + LO.y, 8, 8);
    G.swallow(x, sw[0] + 6, sw[1] - 4, 42, -112 * RAD, night() ? C.white : C.blue, { f: playing ? G.instant(now / 1000 / (G.BEAT * 1.4)) : 0, spread: true, rim: false });
    x.save(); x.translate(LO.x, LO.y);   // (from here down: the lower half of her page)
    // three lines of the words: the one before, the one being sung, the one to come — each a step further in
    var on = document.querySelector("#lrcIn p.on"), ps = on ? [on.previousElementSibling, on, on.nextElementSibling, on.nextElementSibling && on.nextElementSibling.nextElementSibling] : [];
    var line = function (el, px, py, size, a) { var tx = el ? (el.textContent || "").trim() : ""; if (tx && tx !== "…") G.text(x, tx.length > 22 ? tx.slice(0, 21) + "…" : tx, px, py, "400 " + size + "px " + G.HAN, ink(a), "left", 5); };
    if (!has) line({ textContent: rows.length ? "pick one from the tracks" : "no tracks yet" }, 162, 1067, 30, .5);
    else { line(ps[0], 124, 1007, 26, .2); line(ps[1], 162, 1067, 33, .95); line(ps[2], 200, 1127, 27, .42); line(ps[3], 238, 1187, 26, .16); }
    // who is listening, the plumb line, and the marks at its end
    var together = $("mTo") && $("mTo").classList.contains("on");
    x.fillStyle = C.blue; x.beginPath(); x.arc(182, 1267, 12, 0, TAU); x.fill();
    x.strokeStyle = ink(.85); x.lineWidth = 2; x.beginPath(); x.arc(222, 1267, 11, 0, TAU); x.stroke(); if (!together) { x.fillStyle = night() ? C.night : C.paper; x.beginPath(); x.arc(182, 1267, 7, 0, TAU); x.fill(); }
    G.text(x, together ? "在听" : "独听", 258, 1275, "400 22px " + G.HAN, ink(.55), "left", 6);
    G.text(x, together ? "2" : "1", 346, 1275, "italic 400 17px " + G.SERIF, ink(.4), "left");
    hits.push({ x: 250 + LO.x, y: 1267 + LO.y, r: 90, fn: function () { var b = $(together ? "mSo" : "mTo"); if (b) b.click(); } });
    x.strokeStyle = C.blue; x.lineWidth = 2.2; x.beginPath(); x.moveTo(202, 1290); x.lineTo(202, 1528); x.stroke();
    x.fillStyle = C.blue; x.beginPath(); x.arc(202, 1452, 3.4, 0, TAU); x.fill();
    x.strokeStyle = ink(.3); x.lineWidth = 1.1; x.beginPath(); x.moveTo(20, 1551); x.lineTo(60, 1551); x.moveTo(112, 1551); x.lineTo(172, 1551); x.moveTo(232, 1551); x.lineTo(296, 1551); x.moveTo(350, 1551); x.lineTo(386, 1551); x.stroke();
    var dia = function (px, py, r, fill) { x.beginPath(); x.moveTo(px, py - r * 1.5); x.lineTo(px + r, py); x.lineTo(px, py + r * 1.5); x.lineTo(px - r, py); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } else { x.strokeStyle = ink(.85); x.lineWidth = 1.8; x.stroke(); } };
    dia(202, 1551, 13, C.blue); if (playing) { x.fillStyle = night() ? C.night : C.paper; x.fillRect(197.5, 1543, 3, 16); x.fillRect(203.5, 1543, 3, 16); }
    x.strokeStyle = ink(.85); x.lineWidth = 1.8; x.beginPath(); x.moveTo(72, 1540); x.lineTo(72, 1562); x.moveTo(336, 1540); x.lineTo(336, 1562); x.stroke(); dia(88, 1551, 7); dia(320, 1551, 7);
    hits.push({ x: 202 + LO.x, y: 1551 + LO.y, r: 62, fn: function () { $("play").click(); } }, { x: 82 + LO.x, y: 1551 + LO.y, r: 58, fn: function () { $("prev").click(); } }, { x: 326 + LO.x, y: 1551 + LO.y, r: 58, fn: function () { $("next").click(); } });
    G.text(x, mmss(t), 44, 1640, "italic 400 17px " + G.SERIF, ink(.4), "left", 2); G.text(x, mmss(d), 335, 1640, "italic 400 17px " + G.SERIF, ink(.4), "left", 2);
    x.restore();
    if (playing || drag) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function where(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / s - ox, y: (e.clientY - r.top) / s - oy }; }
  function seek(p) { if (!audio || !audio.duration) return; var a = Math.atan2(p.y - D.y, p.x - D.x) + Math.PI / 2; if (a < 0) a += TAU; audio.currentTime = a / TAU * audio.duration; kick(); }
  cv.addEventListener("pointerdown", function (e) { var p = where(e), d = Math.hypot(p.x - D.x, p.y - D.y); if (Math.abs(d - D.R * RS) < 46 * RS && audio && audio.duration) { drag = true; seek(p); try { cv.setPointerCapture(e.pointerId); } catch (er) {} } });
  cv.addEventListener("pointermove", function (e) { if (drag) seek(where(e)); });
  cv.addEventListener("pointerup", function (e) {
    if (drag) { drag = false; return; }
    var p = where(e), best = null, bd = 1e9; hits.forEach(function (hh) { var dd = Math.hypot(p.x - hh.x, p.y - hh.y); if (dd < hh.r && dd < bd) { bd = dd; best = hh; } });
    if (best) { best.fn(); setTimeout(kick, 60); setTimeout(kick, 400); }
  });
  ["play", "pause", "timeupdate", "loadedmetadata", "ended", "emptied"].forEach(function (ev) { if (audio) audio.addEventListener(ev, kick); });
  new MutationObserver(kick).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-side"], characterData: true });
  new MutationObserver(kick).observe(root, { attributes: true, attributeFilter: ["data-side"] });
  window.addEventListener("resize", kick);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(kick);
  kick();
})();
