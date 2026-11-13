/* 构成 — the night side: the eye seen as a well, a spiral stair going down it.
   The stair is 396's own, but nothing here is a picture of hers. It is ONE band of treads and ONE rail, going round and in:
   the big cards at the foot and under the crescent are traced whole from her night plate (stair.js); everything else is
   generated from measurements of the plate (the tables below, and stair2.js) — over the top and down the far side in shadow,
   out past the rail there, into the fan at the foot, and on round turn after turn to the bottom of the well.
   The stair goes on, as in her film: every tread moves round into the place of the next, clockwise and inward, the way
   the swallows go. A new tread slides out at the foot, by the plumb line: a sliver at first, widening. The light does
   not travel with them — a tread is paper while it is on the lit side, a dark card with a pale edge once it has gone over
   the top. And the stair is played like a keyboard: a touch runs down it, each tread dipping in turn (straight down is
   the bottom of the well, WELL, so a tread that sinks draws in toward that point). The rooms go round the rail as moons. */
(function () {
  "use strict";
  var G = window.Gou, C = G.C, RAD = G.RAD, TAU = G.TAU;
  var ST = G.STAIR || { cards: [], grey: [], white: [], blue: [] };
  var WELL = G.WELL = { x: 733, y: 611 };
  C.night = "#1B1A20";   // the ground of her plate
  var PAPER = "#EFECE5", STRING = "#47484D", PLATE_H = 1400 / 1.08;

  function ring(x, p) { x.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) x.lineTo(p[i][0], p[i][1]); x.closePath(); }
  function shape(x, rings) { x.beginPath(); for (var i = 0; i < rings.length; i++) ring(x, rings[i]); }
  function inside(p, px, py) { var c = false, n = p.length, i, j; for (i = 0, j = n - 1; i < n; j = i++) if ((p[i][1] > py) !== (p[j][1] > py) && px < (p[j][0] - p[i][0]) * (py - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; }

  /* ── every place of the stair, from the foot down ── { q: corners (inner-start, outer-start, outer-end, inner-end), zone, cov, big, g, w, tk, bar }
     The stair is ONE band of treads going round and in, and ONE rail. The foot and the fan under the crescent are her big cards
     (stair.js, traced whole); over the top and down the far side they are in shadow, measured off her plate unrolled about C0;
     from the fan at the foot inward everything is generated from the measure (stair2.js). */
  var C0 = [560, 480], W0 = [WELL.x, WELL.y];   // the middle of the first turn; the bottom of the well
  function tab(T, v, n) { n = n || 1; if (v <= T[0][0]) return T[0][n]; for (var i = 1; i < T.length; i++) if (v <= T[i][0]) return T[i - 1][n] + (T[i][n] - T[i - 1][n]) * (v - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); return T[T.length - 1][n]; }
  function pt(c, r, deg) { return [c[0] + r * Math.cos(deg * RAD), c[1] + r * Math.sin(deg * RAD)]; }
  function sector(c, a0, a1, r0, r1) { var p = new Path2D(); p.arc(c[0], c[1], r1, a0 * RAD, a1 * RAD); p.arc(c[0], c[1], r0, a1 * RAD, a0 * RAD, true); p.closePath(); return p; }
  function poly(p, pts) {   // an outline, always wound the same way (so that two of them laid together make one region)
    var n = pts.length, ar = 0, i; for (i = 0; i < n; i++) { var u = pts[i], v = pts[(i + 1) % n]; ar += u[0] * v[1] - v[0] * u[1]; }
    if (ar < 0) pts = pts.slice().reverse();
    p.moveTo(pts[0][0], pts[0][1]); for (i = 1; i < n; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath();
  }
  /* Measured off her plate, unrolled about C0 (degrees, clockwise from three o'clock, running on past 360):
     SB    where one tread of the first turn ends and the next begins, on the far side where it is in shadow (twelve, each narrower, the last wider again as they come round to the fan)
     RIN   the radius of their inner ends;  ROUT  of their outer ends — under the rail at the top, then out past it more and more
           (her plate is cut off there by its right-hand edge; they run on to meet the fan at the foot);
     SKEW  how far their outer ends lag behind;  GT  how thick the string under them is;  BAR  how wide the riser between two of them shows */
  var SB = [258.3, 274.2, 288.7, 301.3, 313, 323.7, 333.7, 343.7, 352.8, 360.3, 366.7, 373.5, 382.2];
  var RIN = [[258.3, 268], [274.2, 294], [288.7, 316], [301.3, 337], [313, 355], [323.7, 371], [333.7, 380], [343.7, 385], [352.8, 387], [360.3, 387], [366.7, 386], [373.5, 380], [382.2, 358]];
  var ROUT = [[258.3, 448], [274.2, 457], [288.7, 472], [301.3, 489], [313, 493], [323.7, 512], [333.7, 530], [343.7, 541], [352.8, 542], [360.3, 535], [366.7, 525], [373.5, 512], [382.2, 492]];
  var SKEW = [[258, 9.5], [300, 6], [330, 2.5], [352, 0], [373.5, -.6], [382.2, -4.6]], GT = [[258, 40], [290, 36], [305, 30], [320, 24], [330, 19], [340, 14], [350, 10], [372, 7.5], [382.2, 6]], BAR = [[258, 1], [288.7, 1], [301.3, 1.4], [313, 3.2], [323.7, 4], [343.7, 4], [373.5, 4.6], [382.2, 5.5]];
  var S2 = G.STAIR2 || { places: [], zones: [], rail: [], phi0: 0, step: 2 };
  var ZONES = [], CLIPS = [];   // where the light falls; for each tread on its way, where it may be lit
  var PLACES = (function () {
    var ch = {}; (ST.chains || []).forEach(function (c) { ch[c.name] = c; });
    var quads = function (c) { return c ? c.q.map(function (q) { return [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]]; }) : []; };
    var out = [], add = function (q, zone, o) { o = o || {}; out.push({ q: q, zone: zone, cov: o.cov == null ? 1.4 : o.cov, big: !!o.big, c: o.c || W0, gt: o.gt, g: o.g, w: o.w || 0, tk: o.tk || 0, bar: o.bar || 0 }); };
    // a tread is a card, and the nearer card lies over the next: so each is made a little wider on the side it comes from, to run in under the one before
    var widen = function (q, e) { return [[q[0][0] + (q[0][0] - q[3][0]) * e, q[0][1] + (q[0][1] - q[3][1]) * e], [q[1][0] + (q[1][0] - q[2][0]) * e, q[1][1] + (q[1][1] - q[2][1]) * e], q[2], q[3]]; };
    var F = quads(ch.first), i, j;
    if (!F.length) return out;
    ZONES.push(sector(C0, 40, 259.5, 120, 1700));                                 // the light on the first turn: from the foot round to just past the top, with a straight edge there
    S2.zones.forEach(function (z) { var p = new Path2D(); poly(p, z.band); poly(p, z.patch); ZONES.push(p); });   // and on each turn below it
    add([[664, 792], [650, 1010], [646, 1010], [660, 792]], 0, { cov: .5, big: true, c: C0, gt: 10 });   // the tread being born: a sliver at the edge it slides out from, by the plumb line
    var FG = [14, 18, 24, 26, 28, 30, 34, 40];
    var OUT = [0, 0, .02, .09, .14, .13, .08, .03], longer = function (q, e) { return [q[0], [q[1][0] + (q[1][0] - q[0][0]) * e, q[1][1] + (q[1][1] - q[0][1]) * e], [q[2][0] + (q[2][0] - q[3][0]) * e, q[2][1] + (q[2][1] - q[3][1]) * e], q[3]]; };
    for (i = 0; i < 8; i++) add(longer(i > 1 ? widen(F[i], .22) : F[i], OUT[i]), 0, { cov: ch.first.g[i] ? .5 : 1.4, big: true, c: C0, gt: FG[i] });   // the foot (its two long treads stand apart) and the fan (each runs in under the one before, and out under the crescent)
    for (j = 0; j < SB.length - 1; j++) {                                          // over the top and down the far side, to the fan at the foot
      var a0 = SB[j], a1 = SB[j + 1], o0 = a0 - tab(SKEW, a0), o1 = a1 - tab(SKEW, a1);
      var gtj = tab(GT, (a0 + a1) / 2), stp = gtj * .24;
      add([pt(C0, tab(RIN, a0) - stp, a0 - 1.2), pt(C0, tab(ROUT, o0), o0 - 1.2), pt(C0, tab(ROUT, o1), o1), pt(C0, tab(RIN, a1) + stp * .5, a1)], 0, { big: true, c: C0, gt: gtj, bar: tab(BAR, a1) });
    }
    S2.places.forEach(function (p) { var q = p.q; add([[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]], p.z, { g: p.g, w: p.w, tk: p.tk }); });   // the fan at the foot, and every turn inside it
    return out;
  })();
  var NP = PLACES.length, DMAX = 520;
  (function () {
    var probe = document.createElement("canvas").getContext("2d");
    PLACES.forEach(function (p) {
      var q = p.q, mx = (q[0][0] + q[3][0]) / 2, my = (q[0][1] + q[3][1]) / 2, ox = (q[1][0] + q[2][0]) / 2, oy = (q[1][1] + q[2][1]) / 2;
      p.len = Math.hypot(ox - mx, oy - my);
      if (!p.g) { var gt = p.gt == null ? Math.max(3, p.len * .1) : p.gt, dx = p.c[0] - mx, dy = p.c[1] - my, d = Math.hypot(dx, dy) || 1; p.g = [dx / d * gt, dy / d * gt]; }   // the string under its inner end: a piece toward the middle of its turn
      p.lit = p.zone >= 0 && probe.isPointInPath(ZONES[p.zone], (mx + ox) / 2, (my + oy) / 2) ? 1 : 0;
    });
    PLACES.forEach(function (p, i) { var n = PLACES[Math.min(NP - 1, i + 1)], c = new Path2D(); if (p.zone >= 0) c.addPath(ZONES[p.zone]); if (n.zone >= 0 && n.zone !== p.zone) c.addPath(ZONES[n.zone]); CLIPS.push(c); });
    // most treads on their way are wholly in the light or wholly out of it: only those crossing its edge need cutting to it (cl: 0 dark, 1 cut, 2 lit)
    PLACES.forEach(function (p, i) {
      var n = PLACES[Math.min(NP - 1, i + 1)], pts = p.q.concat(n.q), k = 0, j;
      for (j = 0; j < pts.length; j++) if (probe.isPointInPath(CLIPS[i], pts[j][0], pts[j][1])) k++;
      for (j = 0; j < 4; j++) { var a = p.q[j], b = n.q[(j + 2) % 4]; if (probe.isPointInPath(CLIPS[i], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) k += .01; }
      p.cl = k === 0 ? 0 : k >= 8.035 ? 2 : 1;
    });
  })();

  /* the ground a swallow can be over: the paper of a lit tread (it is blue there); anything else is the dark (white) */
  G.stairRegions = (function () {
    var paper = new Path2D(); PLACES.forEach(function (p, i) { if (i && p.lit) ring(paper, p.q); });
    return { paper: paper, grey: new Path2D() };
  })();
  G.stairReady = function () { return true; };

  /* the grain a tread at the foot ends in: sifted once, as a strip that is clear at its near end and all grain at its far end */
  var GRAIN = null;
  function grain() {
    if (GRAIN) return GRAIN;
    var c = document.createElement("canvas"); c.width = 720; c.height = 480; var g = c.getContext("2d"), rnd = G.rng(77), i; g.fillStyle = C.night;
    for (i = 0; i < 60000; i++) { var u = rnd(), v = rnd(), q = u + Math.sin(v * 9) * .03 + Math.sin(v * 23 + 1) * .012; if (q > .5 && rnd() < Math.min(1, Math.pow((q - .5) / .3, 1.35))) { var sz = 2.2 + rnd() * rnd() * 4; g.fillRect(u * 720, v * 480, sz, sz); } }
    return (GRAIN = c);
  }

  /* one touch of the keyboard: how far down a tread is, u seconds after the touch reaches it (0 up … 1 down) */
  function key(u) {
    if (u <= 0 || u >= .62) return 0;
    if (u < .09) return G.ease(u / .09);
    if (u < .2) return 1;
    var v = (u - .2) / .42, c1 = 1.9;   // let go: up, a little past, and settle
    return -((c1 + 1) * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2));
  }
  var RATE = 3.4, EVERY = 5.6, STEP = 5;   // the touch goes down the stair RATE treads a second, one every EVERY seconds; a tread takes STEP seconds to move on one place (timed off her film)
  function pressed(pos, time) { var u = ((time - pos / RATE) % EVERY + EVERY) % EVERY; return key(u); }
  function mix(A, B, u) { return [[A[0][0] + (B[0][0] - A[0][0]) * u, A[0][1] + (B[0][1] - A[0][1]) * u], [A[1][0] + (B[1][0] - A[1][0]) * u, A[1][1] + (B[1][1] - A[1][1]) * u], [A[2][0] + (B[2][0] - A[2][0]) * u, A[2][1] + (B[2][1] - A[2][1]) * u], [A[3][0] + (B[3][0] - A[3][0]) * u, A[3][1] + (B[3][1] - A[3][1]) * u]]; }

  function smooth(x, p) { var n = p.length, i, a = p[n - 1], b = p[0]; x.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); for (i = 0; i < n; i++) { a = p[i]; b = p[(i + 1) % n]; x.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } x.closePath(); }
  function shapeS(x, rings) { x.beginPath(); for (var i = 0; i < rings.length; i++) { if (rings[i].length > 7) smooth(x, rings[i]); else ring(x, rings[i]); } }
  /* one tread: a card, with the string under its inner end (joined to the next tread's, so that the string runs on as one stepped
     band). Out of the light it is only its outline, in thin grey, with a pencil tick, and the riser before it showing as a grey bar where
     the treads stand wide apart; where the light falls on it (o.clip — the light stays where it is, the tread passes through) it is paper.
     q: corners; o: { cov, big, g: the string, clip, w: the gap, tk: the tick, bar: the riser, lit }; dn: how far it is pressed down;
     al: how much of it is there; frame: only its outline (while the stair is being laid); paperA: how far its paper has come up; nq: the next tread */
  function drawTread(x, q, o, dn, al, frame, paperA, nq) {
    var ga = x.globalAlpha, mx = (q[1][0] + q[2][0] - q[0][0] - q[3][0]) / 2, my = (q[1][1] + q[2][1] - q[0][1] - q[3][1]) / 2, len = Math.hypot(mx, my) || 1, j;
    var ex = q[3][0] - q[0][0], ey = q[3][1] - q[0][1], tick = function (col) { var pin = function (s, t) { var ax = q[0][0] + ex * s, ay = q[0][1] + ey * s, bx = q[1][0] + (q[2][0] - q[1][0]) * s, by = q[1][1] + (q[2][1] - q[1][1]) * s; return [ax + (bx - ax) * t, ay + (by - ay) * t]; }, a = pin(.66, .04), b = pin(.5, o.tk); x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); };
    x.save(); x.globalAlpha = ga * al;
    if (dn) { var sc = 1 - .028 * dn; x.translate(WELL.x, WELL.y); x.scale(sc, sc); x.translate(-WELL.x, -WELL.y); }
    if (!frame) {
      var gx = o.g[0], gy = o.g[1], gl = Math.hypot(gx, gy);
      x.beginPath(); x.moveTo(q[0][0], q[0][1]); x.lineTo(q[3][0], q[3][1]); x.lineTo(q[3][0] + gx, q[3][1] + gy); x.lineTo(q[0][0] + gx, q[0][1] + gy); x.closePath();
      x.fillStyle = o.lit > .5 ? (o.big ? STRING : "#4B4C52") : (o.big ? "#55565C" : "#55555B"); x.fill();
      x.lineWidth = .9; x.strokeStyle = "rgba(27,26,32,.55)"; x.stroke();                                                                  // each piece apart from the next
      if (len > 90) { x.save(); x.clip(); x.strokeStyle = o.lit > .5 ? "rgba(27,26,32,.2)" : "rgba(214,214,224,.1)"; x.lineWidth = .8; x.beginPath(); for (j = 0; j < 9; j++) { var t = -.3 + j * .15; x.moveTo(q[0][0] + ex * t, q[0][1] + ey * t); x.lineTo(q[0][0] + ex * (t + .42) + gx, q[0][1] + ey * (t + .42) + gy); } x.stroke(); x.restore(); }   // hatched fine and slanting, as hers is
      if (nq) { var cx0 = nq[0][0] - q[3][0], cy0 = nq[0][1] - q[3][1], cl = Math.hypot(cx0, cy0); if (cl > 1.2 && cl < gl * 2.4 + 8) { x.beginPath(); x.moveTo(q[3][0], q[3][1]); x.lineTo(nq[0][0], nq[0][1]); x.lineTo(nq[0][0] + gx, nq[0][1] + gy); x.lineTo(q[3][0] + gx, q[3][1] + gy); x.closePath(); x.fill(); } }   // down the step to the next piece
      x.beginPath(); ring(x, q); x.fillStyle = C.night; x.fill();
      if (o.bar > 1.3) { x.strokeStyle = "rgba(112,113,120,.9)"; x.lineWidth = o.bar; x.lineCap = "butt"; x.beginPath(); x.moveTo(q[3][0], q[3][1]); x.lineTo(q[2][0], q[2][1]); x.stroke(); x.lineCap = "round"; }   // the riser of the next, seen where the treads stand wide apart
    }
    x.beginPath(); ring(x, q); x.lineWidth = 1; x.strokeStyle = frame ? "rgba(236,234,240,.6)" : len > 70 ? "rgba(196,196,206,.46)" : "rgba(168,168,178,.5)"; x.stroke();
    if (!frame && o.tk > .06) tick("rgba(214,214,224,.55)");
    else if (!frame && len > 26) {   // the pencil line along it
      var ix = q[0][0] + ex * .4, iy = q[0][1] + ey * .4, ox = q[1][0] + (q[2][0] - q[1][0]) * .4, oy = q[1][1] + (q[2][1] - q[1][1]) * .4;
      x.strokeStyle = "rgba(214,214,224,.42)"; x.beginPath(); x.moveTo(ix + (ox - ix) * .34, iy + (oy - iy) * .34); x.lineTo(ix + (ox - ix) * .97, iy + (oy - iy) * .97); x.stroke();
    }
    if (!frame && paperA > .01 && o.cov > -.3 && o.cl !== 0) {
      x.save(); if (o.cl !== 2) x.clip(o.clip); x.globalAlpha = ga * al * paperA;
      x.beginPath(); ring(x, q); x.fillStyle = dn > 0 ? "rgb(" + Math.round(239 - 19 * dn) + "," + Math.round(236 - 19 * dn) + "," + Math.round(229 - 17 * dn) + ")" : PAPER; x.fill();
      var gf = G.clamp((1.4 - o.cov) / .9, 0, 1);
      if (gf > 0) {   // its far end lost in grain, and its frame seen through it
        var nx2 = (q[0][0] + q[3][0]) / 2, ny2 = (q[0][1] + q[3][1]) / 2, wid = Math.max(Math.hypot(ex, ey), Math.hypot(q[1][0] - q[2][0], q[1][1] - q[2][1])) + 70;
        x.save(); x.clip(); x.translate(nx2, ny2); x.rotate(Math.atan2(my, mx)); x.drawImage(grain(), (o.cov - .5) * len, -wid / 2, len, wid); x.restore();
        x.beginPath(); ring(x, q); x.lineWidth = 1.1; x.strokeStyle = "rgba(240,237,230," + (.42 * gf).toFixed(2) + ")"; x.stroke();
      }
      x.beginPath();
      if (o.cov < .95) { x.moveTo(q[1][0], q[1][1]); x.lineTo(q[0][0], q[0][1]); x.lineTo(q[3][0], q[3][1]); x.lineTo(q[2][0], q[2][1]); } else ring(x, q);
      x.lineWidth = o.w || (o.big ? 2.2 : len > 60 ? 1.5 : .9); x.strokeStyle = "#1B1A20"; x.stroke();
      if (o.tk > .06) tick("rgba(60,60,68,.55)");
      if (o.big && o.cov > .3) {                       // the pencil ruled along a big tread goes with it
        x.lineWidth = 1; x.strokeStyle = "rgba(40,40,48,.3)";
        var far = Math.min(.8, o.cov - .08), rules = [[.16, .14, far], [.25, .2, far * .9], [.82, .34, far]];
        for (j = 0; j < 3; j++) { var s0 = rules[j][0], t0 = rules[j][1], t1 = rules[j][2]; if (t1 <= t0 + .05) continue; var ax = q[0][0] + ex * s0, ay = q[0][1] + ey * s0, bx = q[1][0] + (q[2][0] - q[1][0]) * s0, by = q[1][1] + (q[2][1] - q[1][1]) * s0;
          x.beginPath(); x.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0); x.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1); x.stroke(); }
      }
      x.restore();
    }
    x.restore(); x.globalAlpha = ga;
  }
  function opt(A, B, u, i) { return { cov: A.cov + (B.cov - A.cov) * u, big: A.big, g: [A.g[0] + (B.g[0] - A.g[0]) * u, A.g[1] + (B.g[1] - A.g[1]) * u], clip: CLIPS[i], cl: A.cl, w: A.w + (B.w - A.w) * u, tk: A.tk && B.tk ? A.tk + (B.tk - A.tk) * u : 0, bar: A.bar + (B.bar - A.bar) * u, lit: A.lit + (B.lit - A.lit) * u }; }

  /* the whole stair, each tread drawn by itself, the deepest first. time: seconds (null = at rest, as on her plate) */
  G.stairTreads = function (x, time) {
    var live = time != null, u = live ? ((time / STEP) % 1 + 1) % 1 : 0, i, nq = null;
    x.lineJoin = "round"; x.lineCap = "round";
    for (i = NP - 1; i >= (live ? 0 : 1); i--) {        // the tread on its way from place i to place i + 1
      var A = PLACES[i], B = PLACES[Math.min(NP - 1, i + 1)], al = !live ? 1 : i === NP - 1 ? 1 - u : i === 0 ? Math.min(1, u * 3) : 1, q = live ? mix(A.q, B.q, u) : A.q;
      if (al > .01) drawTread(x, q, opt(A, B, u, i), live ? pressed(i + u, time) : 0, al, false, 1, nq);
      nq = q;
    }
  };

  /* (nothing lies under the treads any more: what used to be drawn here is part of the stair itself) */
  G.stairUnder = function (scale) { var c = document.createElement("canvas"); c.width = c.height = 2; return { img: c, w: 2, h: 2 }; };

  /* what lies over the treads, drawn once: the rail, the crescent and its specks, the bottom of the well.
     The rail is ONE line, from the moon at the top round and in to the bottom of the well (stair2.js: its middle and its width).
     It changes as it goes, as hers does: a white band between two thin blue lines with dark studs, narrowing to a single blue line
     at the top of the second turn; then a thick blue line; then a narrow band; then a thin line, pale where the light is on it. */
  function side(x, i0, i1, sd, more, first, fixed) {
    var R = S2.rail, n = R.length, i, st = i1 >= i0 ? 1 : -1;
    for (i = i0; st > 0 ? i <= i1 : i >= i1; i += st) { var a = R[Math.max(0, i - 1)], b = R[Math.min(n - 1, i + 1)], p = R[i], tx = b[0] - a[0], ty = b[1] - a[1], d = Math.hypot(tx, ty) || 1, h = (fixed ? Math.min(fixed, p[2] / 2) : Math.max(.25, p[2] / 2 + more)) * sd; if (first && i === i0) x.moveTo(p[0] - ty / d * h, p[1] + tx / d * h); else x.lineTo(p[0] - ty / d * h, p[1] + tx / d * h); }
  }
  function ribbon(x, i0, i1, more, col, fixed) { x.beginPath(); side(x, i0, i1, 1, more, true, fixed); side(x, i1, i0, -1, more, false, fixed); x.closePath(); x.fillStyle = col; x.fill(); }
  var RSEG = [[-128, 252, 0], [250, 612, 1], [610, 650, 2], [648, 698, 1], [696, 868, 3], [866, 954, 4], [952, 1002, 1], [1000, 1148, 2], [1146, 1292, 1], [1290, 1376, 2], [1374, 1530, 1]];   // from, to (degrees along it), how it is drawn
  var BLUE_HALO = "rgba(170,176,242,.7)", PALE = "#C9CCF3", RAILW = "#EEECEA";
  function beyond(rings) { var p = rings[0], cx = 0, cy = 0, i; for (i = 0; i < p.length; i++) { cx += p[i][0] / p.length; cy += p[i][1] / p.length; } var a = Math.atan2(cy - C0[1], cx - C0[0]) / RAD; if (a < 0) a += 360; return a > 140 && a < 262 && Math.hypot(cx - C0[0], cy - C0[1]) > 438; }   // out past the crescent, on the lit side
  var TICKS = (ST.blue || []).filter(function (b) { return beyond(b.p); });
  var SPECKS = (function () {   // the white specks in the crescent: sifted along it, thicker toward the moon
    var out = [], c = ST.crescent && ST.crescent[0]; if (!c) return out;
    var probe = document.createElement("canvas").getContext("2d"), path = new Path2D(), rnd = G.rng(3), i, xs = c.map(function (v) { return v[0]; }), ys = c.map(function (v) { return v[1]; }), x0 = Math.min.apply(0, xs), y0 = Math.min.apply(0, ys), w = Math.max.apply(0, xs) - x0, h = Math.max.apply(0, ys) - y0;
    ring(path, c);
    for (i = 0; i < 900 && out.length < 60; i++) { var px = x0 + rnd() * w, py = y0 + rnd() * h; if (probe.isPointInPath(path, px, py)) out.push([px, py, .8 + rnd() * rnd() * 1.6]); }
    return out;
  })();
  var STUDS = (function () {   // the dark studs along the white band, evenly spaced
    var R = S2.rail, out = [], run = 0, i, i1 = Math.min(R.length - 1, Math.round((198 - S2.phi0) / S2.step)), i0 = Math.round((-104 - S2.phi0) / S2.step);
    for (i = Math.max(1, i0); i <= i1; i++) { run += Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]); if (run >= 37) { run = 0; out.push([R[i][0], R[i][1], Math.max(1, R[i][2] * .075), i]); } }
    return out;
  })();
  function rails(x, alphaOf) {
    var ga = x.globalAlpha, a, R = S2.rail, n = R.length, far = function (v) { return Math.hypot(v[0] - WELL.x, v[1] - WELL.y); }, idx = function (phi) { return G.clamp(Math.round((phi - S2.phi0) / S2.step), 0, n - 1); };
    x.lineJoin = "round"; x.lineCap = "butt";
    TICKS.forEach(function (b) { x.globalAlpha = ga * alphaOf(DMAX) * .7; shapeS(x, b.p); x.fillStyle = "#A9A9B2"; x.fill("evenodd"); });
    if (n > 2) RSEG.forEach(function (sg) {
      for (var p0 = sg[0]; p0 < sg[1]; p0 += 30) {   // in pieces, so that each can come up in its turn while the stair is laid
        var i0 = idx(p0), i1 = idx(Math.min(sg[1], p0 + 30) + (p0 + 30 < sg[1] ? S2.step : 0)), k = sg[2]; if (i1 <= i0) continue;
        a = alphaOf(Math.min(DMAX, far(R[(i0 + i1) >> 1]))); if (a <= 0) continue; x.globalAlpha = ga * a;
        if (k === 0) { ribbon(x, i0, i1, 0, RAILW); x.strokeStyle = C.blue; x.lineWidth = 1.5; x.beginPath(); side(x, i0, i1, 1, .5, true); x.stroke(); x.beginPath(); side(x, i0, i1, -1, .5, true); x.stroke(); }
        else if (k === 1) { ribbon(x, i0, i1, 1.1, BLUE_HALO); ribbon(x, i0, i1, 0, C.blue); }
        else if (k === 2) ribbon(x, i0, i1, .2, PALE);
        else if (k === 3) { ribbon(x, i0, i1, .9, BLUE_HALO); ribbon(x, i0, i1, .3, C.blue); ribbon(x, i0, i1, 0, PALE, 1.15); }   // in shadow: two blue lines close together, a pale one between
        else { ribbon(x, i0, i1, .4, C.blue); ribbon(x, i0, i1, -1.25, RAILW); }                                                         // in the light: a narrow white band between two thin blue lines
      }
    });
    STUDS.forEach(function (d) { a = alphaOf(Math.min(DMAX, far(d))); if (a <= 0) return; x.globalAlpha = ga * a; x.fillStyle = "rgba(34,38,110,.88)"; x.beginPath(); x.arc(d[0], d[1], d[2], 0, TAU); x.fill(); });
    a = alphaOf(-1);
    if (a > 0 && ST.crescent && ST.crescent.length) {
      x.globalAlpha = ga * a; x.beginPath(); smooth(x, ST.crescent[0]); x.fillStyle = C.blue; x.fill(); x.strokeStyle = "rgba(150,158,236,.85)"; x.lineWidth = 1.3; x.stroke();
      x.fillStyle = "#ECEAF0"; SPECKS.forEach(function (d) { x.beginPath(); x.arc(d[0], d[1], d[2], 0, TAU); x.fill(); });
    }
    x.globalAlpha = ga * alphaOf(0); x.fillStyle = C.blue; x.beginPath(); x.arc(WELL.x, WELL.y, 11, 0, TAU); x.fill(); x.fillStyle = "#F1EEE7"; x.beginPath(); x.arc(WELL.x, WELL.y, 4.2, 0, TAU); x.fill();
    x.globalAlpha = ga;
  }
  G.stairOver = function (scale) {
    var c = document.createElement("canvas"), wd = 1140; c.width = Math.ceil(wd * scale); c.height = Math.ceil(PLATE_H * scale); var x = c.getContext("2d"); x.scale(scale, scale);
    rails(x, function () { return 1; });
    return { img: c, w: wd, h: PLATE_H };   // wider than her plate: the rail and the treads beyond it run on past its right-hand edge
  };

  /* the stair being laid (the page turning over): b = 0 nothing … 1 all of it. Treads are dealt outward from the bottom of the
     well, each first a drawn outline swinging into place, then filled. The rails come up with the treads round them; the crescent last. */
  G.stairBuild = function (x, b) {
    var at = function (d) { var u = Math.min(1, d / DMAX); return d < 0 ? G.ease(G.seg(b, .62, .96)) : G.ease(G.seg(b, .08 + .6 * u, .3 + .6 * u)); }, i;
    x.save(); x.lineJoin = "round";
    for (i = NP - 1; i >= 1; i--) {
      var P = PLACES[i], q = G.clamp((b - ((NP - 1 - i) / NP) * .78) / .22, 0, 1); if (q <= 0) break;
      if (q >= 1) { drawTread(x, P.q, opt(P, P, 0, i), 0, 1, false, 1); continue; }
      var e = G.out(G.clamp(q / .6, 0, 1)), sc = 1 + (1 - e) * .14;
      x.save(); x.translate(WELL.x, WELL.y); x.rotate(-(1 - e) * .42); x.scale(sc, sc); x.translate(-WELL.x, -WELL.y);
      if (q < .4) drawTread(x, P.q, opt(P, P, 0, i), 0, Math.min(1, q * 3), true, 0); else drawTread(x, P.q, opt(P, P, 0, i), 0, 1, false, G.clamp((q - .4) / .6, 0, 1));
      x.restore();
    }
    rails(x, at);
    x.restore();
  };

  /* ── the rail the rooms go round ──
     One spiral about (560, 480): up the crescent, over the top, down the far side and in under the stair. The chosen room
     sits on the crescent (s = 0), the others at s = 1 2 3 4 along the rail; turning the menu sends each a place on,
     clockwise, and the last comes round to the foot of the crescent (s = -1) and climbs it, growing. Measured off her plate.
     railAt(s) → { x, y, r } */
  var RC = [560, 480], RK = [[-1, 133.6, 424, 0], [0, 169.12, 447.2, 50.4], [1, 250.13, 444.9, 22.8], [2, 313.94, 466.6, 22.8], [3, 368, 419.6, 19.7], [3.25, 375, 405.5, 19.3],
    [3.5, 389, 362.4, 18.9], [3.75, 404, 308.8, 18.5], [3.9, 413.5, 270.7, 18.2], [4, 419.94, 239.7, 18.1], [5, 455, 186, 0]];
  G.railAt = function (s) {
    s = G.clamp(s, -1, 5);
    for (var i = 1; i < RK.length - 1; i++) if (s <= RK[i][0]) break;
    var a = RK[i - 1], b = RK[i], u = (s - a[0]) / (b[0] - a[0]), ang = (a[1] + (b[1] - a[1]) * u) * RAD, rad = a[2] + (b[2] - a[2]) * u;
    return { x: RC[0] + Math.cos(ang) * rad, y: RC[1] + Math.sin(ang) * rad, r: a[3] + (b[3] - a[3]) * u };
  };
  // where each place's name is written
  G.nightSlots = [{ lx: 56, ly: 876, al: "left" }, { lx: 358, ly: 72, al: "right" }, { lx: 922, ly: 120, al: "left" }, { lx: 906, ly: 574, al: "right" }, { lx: 806, ly: 838, al: "left" }];
  G.nightSlots.forEach(function (sl, j) { var m = G.railAt(j); sl.x = m.x; sl.y = m.y; sl.r = m.r; });

  /* a room's moon, at s along the rail. They are her five, traced (moons.js): the chosen one on the crescent is the full blue
     disc in a white line; those on the rail are white, with her blue on them and a thin blue rim. A moon between two places
     is the one it is leaving fading into the one it is going to. */
  function drawMoon(x, k, cx, cy, r, a) {
    var M = (G.MOONS || [])[k]; if (a <= 0) return;
    x.save(); x.globalAlpha *= a; x.translate(cx, cy); x.scale(r, r);
    if (!M || M.kind === "full") { x.fillStyle = C.blue; x.beginPath(); x.arc(0, 0, 1, 0, TAU); x.fill(); x.strokeStyle = "#ECEAF0"; x.lineWidth = .05; x.beginPath(); x.arc(0, 0, .975, 0, TAU); x.stroke(); }
    else {
      x.fillStyle = "#ECEAF0"; x.beginPath(); x.arc(0, 0, 1, 0, TAU); x.fill();
      x.fillStyle = C.blue; M.blue.forEach(function (sh) { shape(x, sh); x.fill("evenodd"); });
      x.strokeStyle = C.blue; x.lineWidth = .085; x.beginPath(); x.arc(0, 0, .955, 0, TAU); x.stroke();
    }
    x.restore();
  }
  G.nightMoon = function (x, sv) {
    var m = G.railAt(sv); if (m.r < .8) return;
    var j = G.clamp(Math.floor(sv), 0, 4), u = G.clamp(sv - j, 0, 1);
    if (sv < 0 || sv >= 4) drawMoon(x, sv < 0 ? 0 : 4, m.x, m.y, m.r, 1); else { drawMoon(x, j, m.x, m.y, m.r, 1 - u); drawMoon(x, j + 1, m.x, m.y, m.r, u); }
  };

  /* ── the swallows' way down the well ──
     In from below on the near side, up over the lit treads, over the top through the shadow, and round into the bottom:
     the line her own birds are strung along on the plate, clockwise. Smaller and slower the deeper they are (they are
     further away). stairFlight(seconds) → { x, y, h, s, u } */
  var PTS = [[-70, 1520, 80], [36, 1200, 72], [118, 1010, 63], [176, 884, 57], [215, 813, 55], [326, 567, 50], [344, 350, 45], [421, 194, 40], [565, 137, 31], [696, 130, 28], [807, 183, 26], [885, 270, 22],
    [932, 363, 20], [935, 459, 17], [893, 544, 15], [835, 594, 12], [770, 633, 8], [713, 617, 5], [733, 611, 2]];
  var SAMP = (function () {
    var out = [], n = PTS.length, T = 0, prev = null;
    var cr = function (a, b, c, d, t) { return .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t); };
    for (var i = 0; i < n - 1; i++) {
      var p0 = PTS[Math.max(0, i - 1)], p1 = PTS[i], p2 = PTS[i + 1], p3 = PTS[Math.min(n - 1, i + 2)];
      for (var j = 0; j < 20; j++) {
        var t = j / 20, px = cr(p0[0], p1[0], p2[0], p3[0], t), py = cr(p0[1], p1[1], p2[1], p3[1], t), sz = p1[2] + (p2[2] - p1[2]) * t;
        if (prev) T += Math.hypot(px - prev[0], py - prev[1]) / (74 * Math.max(sz, 4) / 50);   // 74 units a second where she is 50 units long (measured), in proportion elsewhere
        prev = [px, py]; out.push({ x: px, y: py, s: sz, t: T });
      }
    }
    return out;
  })();
  G.STAIR_LAP = SAMP[SAMP.length - 1].t;
  G.stairFlight = function (time) {
    time = ((time % G.STAIR_LAP) + G.STAIR_LAP) % G.STAIR_LAP;
    var lo = 0, hi = SAMP.length - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (SAMP[mid].t <= time) lo = mid; else hi = mid; }
    var a = SAMP[lo], b = SAMP[hi], u = (time - a.t) / Math.max(1e-6, b.t - a.t), c = SAMP[Math.min(SAMP.length - 1, hi + 3)], d = SAMP[Math.max(0, lo - 3)];
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, h: Math.atan2(c.y - d.y, c.x - d.x), s: a.s + (b.s - a.s) * u, u: time / G.STAIR_LAP };
  };

  /* what never moves at night and is not on the plate: dust beyond it, the orbits at the foot of the page */
  G.nightBack = function (x, env) {
    var rnd = G.rng(31);
    G.stipple(x, rnd, [env.left, env.top, env.right - env.left, env.bottom - env.top], env.wide ? 8000 : 3600, function () { return .5; }, "rgba(240,237,230,.12)", 1.5, 3.5);
  };
})();
