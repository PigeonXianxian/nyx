/* 构成 — the day side: a cathedral in pencil, a black band crumbling into grain, an eye made of a moon and swallows.
   Everything is drawn in a 1000-unit-wide design space; home.js places it on the screen. */
(function () {
  "use strict";
  var G = window.Gou, C = G.C, RAD = G.RAD, TAU = G.TAU;
  var EYE = G.EYE = { x: 700, y: 615, r: 205 };
  var LID = G.LID = { x: 690, y: 905, r: 446 };   // measured off her film: the lid hugs the top of the disc   // the circle the upper lid rides on

  function circle3(a, b, c) {
    var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    var ux = ((a[0] * a[0] + a[1] * a[1]) * (b[1] - c[1]) + (b[0] * b[0] + b[1] * b[1]) * (c[1] - a[1]) + (c[0] * c[0] + c[1] * c[1]) * (a[1] - b[1])) / d;
    var uy = ((a[0] * a[0] + a[1] * a[1]) * (c[0] - b[0]) + (b[0] * b[0] + b[1] * b[1]) * (a[0] - c[0]) + (c[0] * c[0] + c[1] * c[1]) * (b[0] - a[0])) / d;
    return { x: ux, y: uy, r: Math.hypot(a[0] - ux, a[1] - uy) };
  }

  /* the birds of the eye. In her film they keep their places while the page is at rest (nothing on the lids changes
     between frames seconds apart); they fly when the eye opens, when the page turns, and on the stair at night.
     The upper lid goes left to right over the eye, the lower lid comes back right to left under it: clockwise.
     Each bird: { x, y, h(eading), s(ize = body length), f (the instant of the wingbeat it is held at), u (where it is
     on the ring, 0..1 clockwise from the upper lid's left end), c(olour key) } */
  var LO = circle3([276, 667], [620, 736], [996, 596]), LO0 = Math.atan2(667 - LO.y, 276 - LO.x), LO1 = Math.atan2(596 - LO.y, 996 - LO.x);
  var UP0 = -136 * RAD, UP1 = -45 * RAD, UA = .42, UB0 = .46, UB1 = .94;
  // the ring itself: lidTrack(u) → { x, y, h } for any u (it wraps), so a bird can come in along it
  G.lidTrack = function (u) {
    u = ((u % 1) + 1) % 1;
    var pt = function (v) {
      var a;
      if (v < UA) { a = UP0 + (UP1 - UP0) * (v / UA); return [LID.x + Math.cos(a) * LID.r, LID.y + Math.sin(a) * LID.r]; }
      if (v < UB0) { var q = (v - UA) / (UB0 - UA), A = pt(UA - 1e-6), B = [LO.x + Math.cos(LO1) * LO.r, LO.y + Math.sin(LO1) * LO.r]; return [A[0] + (B[0] - A[0]) * q + 26 * Math.sin(Math.PI * q), A[1] + (B[1] - A[1]) * q]; }
      if (v < UB1) { a = LO1 + (LO0 - LO1) * ((v - UB0) / (UB1 - UB0)); return [LO.x + Math.cos(a) * LO.r, LO.y + Math.sin(a) * LO.r]; }
      var q2 = (v - UB1) / (1 - UB1), A2 = [LO.x + Math.cos(LO0) * LO.r, LO.y + Math.sin(LO0) * LO.r], B2 = [LID.x + Math.cos(UP0) * LID.r, LID.y + Math.sin(UP0) * LID.r];
      return [A2[0] + (B2[0] - A2[0]) * q2 - 30 * Math.sin(Math.PI * q2), A2[1] + (B2[1] - A2[1]) * q2];
    };
    var p0 = pt(u), p1 = pt((u + .004) % 1);
    return { x: p0[0], y: p0[1], h: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) };
  };
  G.dayBirds = (function () {
    var out = [], i, n;
    var up = [[-136, 46, 11], [-124, 56, 11], [-110, 70, 11], [-95, 68, 0], [-80, 58, 0], [-66, 46, 1], [-54, 36, 1], [-45, 28, 1]];
    for (i = 0; i < up.length; i++) { var a = up[i][0] * RAD, v = (up[i][0] * RAD - UP0) / (UP1 - UP0); out.push({ x: LID.x + Math.cos(a) * LID.r, y: LID.y + Math.sin(a) * LID.r, h: a + Math.PI / 2 + .1, s: up[i][1], f: up[i][2], u: v * UA, lid: 1, k: i / (up.length - 1) }); }
    n = 12;   // under the eye they come back the other way: the long wing trails below, the short one above
    for (i = 0; i < n; i++) { var w = i / (n - 1), b = LO1 + (LO0 - LO1) * w; out.push({ x: LO.x + Math.cos(b) * LO.r, y: LO.y + Math.sin(b) * LO.r, h: b + Math.PI / 2 + .02, s: 21 + 17 * Math.pow(Math.sin(Math.PI * Math.pow(w, .9)), .9), f: 9, u: UB0 + w * (UB1 - UB0), lid: 2, k: w }); }
    out.push({ x: 356, y: 590, s: 40, h: 108 * RAD, f: 0, c: "grey", rim: false });
    out.push({ x: 402, y: 1126, s: 13, h: -62 * RAD, f: 9 }, { x: 350, y: 1222, s: 11, h: -60 * RAD, f: 9 });
    return out;
  })();

  /* the black band: it never moves, but it is let down from the top when the eye opens */
  G.bandRight = function (env) { return env && env.wide ? env.right + 6 : 1000; };   // on her page the band runs off the right-hand edge; on a wide screen it does the same
  function lancet(cx, y0, hw, sh, ph) { return "M" + (cx - hw) + " " + y0 + "L" + (cx - hw) + " " + (y0 - sh) + "Q" + (cx - hw) + " " + (y0 - sh - ph * .62) + " " + cx + " " + (y0 - sh - ph) + "Q" + (cx + hw) + " " + (y0 - sh - ph * .62) + " " + (cx + hw) + " " + (y0 - sh) + "L" + (cx + hw) + " " + y0; }
  G.dayBand = function (x, env) {
    var R = G.bandRight(env), top = env.top, wide = env && env.wide, i;
    x.fillStyle = C.ink; x.fillRect(678, top, R - 678, 742 - top);
    // ── what is drawn in the band, in white, by hand: the lancets and the lines they stand on, the circles they were struck from, and the draughtsman's signs ──
    x.save(); x.beginPath(); x.rect(678, top, R - 678, 742 - top); x.clip();
    var H = G.hand(x, 11, { stroke: "rgba(240,237,230,.55)", strokeWidth: 1.15, roughness: 1.25, bowing: 1.1 }), dim = { stroke: "rgba(240,237,230,.3)" }, faint = { stroke: "rgba(240,237,230,.2)" };
    for (i = 0; 772 + i * 98 - 40 < R; i++) { var cx = 772 + i * 98, hw = i % 3 === 2 ? 34 : 40; H.path(lancet(cx, 212, hw, 104, 78)); H.path(lancet(cx, 212, hw * .52, 90, 60), dim); H.line(cx, 30, cx, 14, dim); }
    H.line(678, 196, R, 196); H.line(678, 232, R, 232, dim);
    for (i = 0; 724 + i * 98 < R; i++) H.line(724 + i * 98, top, 724 + i * 98, 300, dim);
    H.circle(868, 440, 150); H.circle(868, 440, 186, dim); H.circle(868, 440, 96); H.circle(748, 388, 26); H.circle(748, 388, 13, dim);
    H.line(1000, 60, 806, 470); H.line(1000, 250, 700, 520, dim); H.line(690, 300, 1000, 560, faint);
    H.cross(868, 440, 10); H.cross(748, 388, 5, dim); H.cross(940, 268, 6, dim);
    x.fillStyle = "rgba(240,237,230,.5)"; for (i = 0; i < 8; i++) { x.beginPath(); x.arc(700 + i * 13 + (i % 2) * .8, 268 + (i % 3) * .5, 1.5, 0, TAU); x.fill(); }   // a row of pricks
    for (i = 0; i < 7; i++) H.line(884 + i * 12, 300, 884 + i * 12, 300 + (i % 3 === 0 ? 13 : 7), dim);                                     // a scale
    H.poly([[706, 128], [719, 128], [719, 141], [706, 141], [706, 128]], dim);
    if (wide) {   // where there is room: the great circles round the eye carried on through the band, and a second centre further along
      H.circle(EYE.x, EYE.y, 500, dim); H.circle(EYE.x, EYE.y, 664, { stroke: "rgba(240,237,230,.24)", strokeLineDash: [16, 12], disableMultiStroke: true });
      x.strokeStyle = "rgba(240,237,230,.4)"; x.lineWidth = 1.6; G.arc(x, EYE.x, EYE.y, 572, 0, TAU, [1.5, 9]);
      var c2 = R - 150; H.circle(c2, 470, 118, dim); H.circle(c2, 470, 62); H.cross(c2, 470, 8); H.line(R, 280, c2 - 190, 640, dim); H.line(c2 - 118, 470, c2 + 118, 470, faint);
      x.fillStyle = "rgba(240,237,230,.5)"; x.fillRect(c2 - 5 + 62, 465, 9, 9);
    }
    x.restore();
  };

  /* the grain the band comes apart into. Drawn into a small sheet of its own (GRAIN = the part of the page it covers),
     a few times over with different seeds, so the home can flicker between them like film grain. */
  G.grainRect = function (env) { return [640, 606, G.bandRight(env) - 638, 416]; };
  G.dayGrain = function (x, seed, env) {
    var rnd = G.rng(seed), R = G.bandRight(env), k = (R - 640) / 362;
    G.stipple(x, rnd, [640, 705, R - 640, 315], Math.round(17000 * k), function (px, py) {
      var t = (py - 705) / 315, row = Math.abs(py - 912) < 16 ? 1.9 : Math.abs(py - 826) < 9 ? 1.5 : 1;
      var side = px < 678 ? Math.max(0, 1 - (678 - px) / 40) * .35 : 1;
      var out = px > 1000 ? 1 - .62 * G.ease((px - 1000) / Math.max(1, R - 1000)) : 1;   // on a wide screen it thins toward the edge, so the weight stays by the eye
      return Math.pow(1 - t, 1.25) * .9 * row * side * out;
    }, C.ink, 2, 5.5);
    G.stipple(x, rnd, [678, 610, R - 678, 150], Math.round(4600 * k), function (px, py) { return Math.pow((py - 610) / 150, 2) * .7 * (px > 1000 ? 1 - .5 * G.ease((px - 1000) / Math.max(1, R - 1000)) : 1); }, C.paper, 2, 5);
  };

  /* the pencil work: the cathedral, the great circles, the orbits at the foot of the page. It pales while the bob is let down. */
  G.daySketch = function (x, env) {
    var i, wide = env && env.wide, H = G.hand(x, 12, { stroke: C.line, strokeWidth: 1.05, roughness: 1.7, bowing: 1.3 }), dim = { stroke: "rgba(46,46,54,.24)" };
    // one long ruled diagonal under everything, ticked off like a scale
    H.line(66, 986, 742, 1340); H.line(92, 964, 770, 1304, dim);
    for (i = 0; i < 26; i++) { var u = i / 25, bx = 92 + (770 - 92) * u, by = 964 + (1304 - 964) * u; H.line(bx, by, bx - 5, by + 10, { roughness: .7, stroke: "rgba(46,46,54,.36)" }); }
    // great circles round the eye — whole where there is room for them (a wide screen), arcs where her page cuts them off
    if (wide) { H.circle(EYE.x, EYE.y, 500); H.circle(EYE.x, EYE.y, 664, { strokeLineDash: [16, 12], disableMultiStroke: true, stroke: "rgba(46,46,54,.34)" }); }
    else { H.arc(EYE.x, EYE.y, 500, 12 * RAD, 206 * RAD); H.arc(EYE.x, EYE.y, 664, 22 * RAD, 196 * RAD, { strokeLineDash: [16, 12], disableMultiStroke: true, stroke: "rgba(46,46,54,.34)" }); }
    x.strokeStyle = C.line; x.globalAlpha = .8; x.lineWidth = 1.6; G.arc(x, EYE.x, EYE.y, 572, wide ? 0 : 34 * RAD, wide ? TAU : 262 * RAD, [1.5, 9]); x.globalAlpha = 1;   // pricked, not stroked: its dots stay regular
    H.arc(EYE.x, EYE.y, 300, 150 * RAD, 300 * RAD, dim); H.arc(LID.x, LID.y, LID.r, 180 * RAD, 300 * RAD, dim);
    // a blue stroke and its echo, upper left of the eye
    x.strokeStyle = C.blue; x.lineWidth = 3; x.beginPath(); x.moveTo(366, 418); x.quadraticCurveTo(398, 362, 436, 326); x.stroke();
    x.beginPath(); x.arc(440, 323, 3.5, 0, TAU); x.fillStyle = C.blue; x.fill();
    H.line(384, 368, 412, 336);
    // the dashed path the small birds fly
    x.strokeStyle = "rgba(30,30,36,.7)"; x.lineWidth = 1.3; x.setLineDash([9, 8]); x.beginPath(); x.moveTo(440, 1062); x.lineTo(338, 1242); x.stroke(); x.setLineDash([]);
    x.fillStyle = "rgba(30,30,36,.8)"; x.fillRect(428, 1102, 8, 8);
  };

  /* the bodies on the great circles round the eye: [radius, where at rest (degrees), kind, degrees it goes on for one turn of
     the menu, the ends of the arc it rides]. The home draws them, because they go round when the menu is turned. */
  G.dayMarks = [[500, 66, "o", 13, 12, 206], [500, 115.5, "d", 13, 12, 206], [572, 151, "d", -9, 34, 262], [572, 171, "b", -9, 34, 262], [572, 190, "s", -9, 34, 262],
    [664, 67, "s", 6, 22, 196], [664, 127, "d", 6, 22, 196], [664, 43, "d", 6, 22, 196]];
  G.dayMark = function (x, r, deg, kind) {
    var mx = EYE.x + Math.cos(deg * RAD) * r, my = EYE.y + Math.sin(deg * RAD) * r;
    if (kind === "o") { x.fillStyle = C.paper; x.strokeStyle = "rgba(40,40,48,.7)"; x.lineWidth = 1.4; x.beginPath(); x.arc(mx, my, 6.5, 0, TAU); x.fill(); x.stroke(); }
    else if (kind === "s") { x.fillStyle = "rgba(40,40,48,.75)"; x.fillRect(mx - 4, my - 4, 8, 8); }
    else { x.fillStyle = "rgba(30,30,36,.85)"; x.beginPath(); x.arc(mx, my, kind === "b" ? 7 : 4.5, 0, TAU); x.fill(); }
  };

  /* the foot of the page: the orbits round the eye, seen again as they fall on the ground under it — so they are ellipses,
     flattened to about two fifths, centred under the plumb line — and the bodies on them. It is a projection of what is
     above, so it turns when that turns: `orb` is how far the menu has been turned; each body goes round on its own ellipse,
     the nearer ones faster, the same way as the moons above. The blue dot the bob is let down to sits at the top of the
     inmost ellipse and stays (it is under the chosen place, which does not move). Measured off her plate. Both sides. */
  G.FOOT = { x: 700, y: 1650, q: .405, a: [420, 535, 665] };
  var BODIES = [[472, 1440, 2, "21", 13], [616, 1414, 0, "4.5", 6], [771, 1409, 1, "7", 5], [235, 1477, 0, "9", 6], [556, 1527, 1, "37", 18], [360, 1558, 1, "58", 25], [148, 1570, 2, "64", 12]].map(function (m) {
    var dx = m[0] - G.FOOT.x, dy = (m[1] - G.FOOT.y) / G.FOOT.q, a = Math.hypot(dx, dy);
    return { a: a, th: (Math.atan2(dy, dx) / RAD + 360) % 360, kind: m[2], label: m[3], r: m[4], rate: 18 * Math.pow(355 / a, 1.5) };
  });
  G.foot = function (x, night, orb, full, st) {   // full: the whole of each orbit (where there is room), not only what her page shows of it; st: { ln, ink, q } pencils to draw it with instead, and how flat it lies
    var F = G.FOOT, ln = night ? "rgba(240,237,230,.34)" : "rgba(60,60,68,.44)", ink = night ? "rgba(240,237,230,.6)" : "rgba(40,40,48,.6)", dim = night ? "rgba(240,237,230,.45)" : "rgba(40,40,48,.5)", ga = x.globalAlpha;
    orb = orb || 0;
    if (st) { ln = st.ln; ink = st.ink; }
    var Q = st && st.q || F.q;   // how flat the orbits lie
    var H = G.hand(x, 5, { stroke: ln, strokeWidth: st ? 1.5 : 1.1, roughness: st ? 1.6 : 1.2, bowing: st ? 1.2 : .9, disableMultiStroke: true });
    x.save();
    [[665, 199, 280, [300, 20, 120, 20, 70, 20]], [535, 197, 287, [180, 20, 120, 20, 60, 20]], [420, 197, 289, [90, 18, 60, 18, 150, 18]]].forEach(function (e) {
      H.ellipse(F.x, F.y, e[0], e[0] * Q, full ? 0 : e[1] * RAD, full ? TAU : e[2] * RAD, { strokeLineDash: e[3], strokeLineDashOffset: -orb * 18 * Math.pow(355 / e[0], 1.5) * RAD * e[0] * .7 });
    });
    BODIES.forEach(function (m) {
      var lo = full ? 0 : 186, span = full ? 360 : 166, th = lo + ((((m.th - lo + m.rate * orb) % span) + span) % span), px = F.x + Math.cos(th * RAD) * m.a, py = F.y + Math.sin(th * RAD) * m.a * Q;
      x.globalAlpha = full ? ga : ga * G.clamp(Math.min(th - lo, lo + span - th) / 9, 0, 1) * G.clamp((1010 - px) / 40, 0, 1);
      x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 1.5;
      if (m.kind === 0) { x.beginPath(); x.arc(px, py, m.r, 0, TAU); x.fill(); }
      else { if (m.kind === 1) { x.fillStyle = night ? C.night : C.paper; x.beginPath(); x.arc(px, py, m.r, 0, TAU); x.fill(); } G.arc(x, px, py, m.r, 0, TAU); if (m.kind === 2) G.arc(x, px, py, m.r * .45, 0, TAU); }
      G.text(x, m.label, px + m.r + 9, py + 6, "400 16px " + G.SERIF, dim, "left", 1);
    });
    x.restore(); x.globalAlpha = ga;
  };
  G.orbits = function () {};   // (it was part of the still sheets; the home draws G.foot itself now)

  /* the eye's disc as a sprite: a moon with its light side eaten into grain */
  G.discSprite = function (scale, seed) {
    var r = EYE.r, pad = 26, n = Math.ceil((r + pad) * 2 * scale), c = document.createElement("canvas"); c.width = c.height = n;
    var x = c.getContext("2d"), rnd = G.rng(seed || 5); x.scale(scale, scale); x.translate(r + pad, r + pad);
    x.fillStyle = C.soft; x.beginPath(); x.arc(-9, 8, r + 3, 0, TAU); x.fill();
    x.fillStyle = C.blue; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(0, 0, r, 0, TAU); x.clip();
    G.stipple(x, rnd, [-r, -r, r * 2, r * 2], 30000, function (px, py) {
      var d = (px * -.55 + py * -.835) / r, e = Math.hypot(px, py) / r;     // towards the upper left, and towards the rim
      var cap = py < -r * .56 - px * .16 ? .55 : 0;                           // above the lid it is nearly all paper
      return G.clamp(Math.pow(Math.max(0, d - .3), 1.6) * 1.5 * (.3 + e * .9) + cap * Math.max(0, d), 0, .97);
    }, C.paper, 2.4, 5.5);
    x.restore();
    return { img: c, half: r + pad };
  };
})();
