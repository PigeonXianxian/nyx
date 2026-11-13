/* 构成 — the projection: on a wide page the orbits of the rooms are thrown down, large, across the left of the sheet, at
   the very back of it — a star-track going slowly round behind everything. In front of it lies the sketch of the cathedral
   (sketch.js); in front of that, the eye.
   It is drawn as a sketch, 拙: in soft pencil, freehand. Nothing is a flat colour or a clean line — every stroke is the grain a
   lead leaves on the tooth of the paper (`pen`), lines waver and are gone over twice, long ones are made in several goes that
   do not quite line up, circles do not quite close. Each stroke is made once and kept, so the thing can be turned without
   being redrawn.
   What is in it: her own three orbits and the rooms on them; three rings more inside them (one whole and blue, one broken, one dotted
   and gone over heavy for part of its way — Kandinsky's black ring, in pencil); a limb far out, ticked like a scale; three
   hands through the middle with little ticks at their ends; a blue body with the way it has come gone over behind it in blue
   pencil; the eight phases of the moon set round the dotted ring, shaded in blue (today's has a ring round it); four small
   blue swallows gliding along an orbit of their own; a centre mark; and a few lines of the plane it all lies on (Lissitzky drew such a plane ruled all over — here only
   its axes are left). It had more once — beams of hatching, a strip of squares, a bar standing on it, a blue disc at its
   middle — and they were too much: this is a background.
   It only flows: nothing turns it as a whole. The broken and the dotted ring creep along their own tracks, the bodies and the
   moons and the swallows go slowly round on theirs, all clockwise (it is the projection of what is on the right, and that
   goes clockwise); the hands stand still. Turning the menu turns each ring and hand at its own rate; letting the bob down
   or turning the page over tips the plane (that is its one large movement, and belongs to the page turning); opening the
   page constructs it line by line. The mouse does not move it at all: it is the far background. It is large — some of its
   orbits run off the page — and pale, paler by day than by night.
   G.orrery(x, o)   o: { cx, cy, K scale, tilt (radians), q flattening, night, orb (rooms turned), time (seconds),
                         a alpha, rv how far it is constructed 0…1, foot: function (pencils) drawing her own orbits about (0, 0) } */
(function () {
  "use strict";
  var G = window.Gou, C = G.C, RAD = G.RAD, TAU = G.TAU, kept = {}, pens = {}, gen = null;
  function made(key, fn) { if (!gen) gen = window.rough && window.rough.generator ? window.rough.generator() : null; if (!gen) return null; return kept[key] || (kept[key] = fn(gen)); }
  function put(x, d) { if (!d || !window.rough) return; var rc = window.rough.canvas(x.canvas); if (d.length != null) for (var i = 0; i < d.length; i++) rc.draw(d[i]); else rc.draw(d); }
  function pie(x, R, a0, u) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, a0, a0 + TAU * G.clamp(u, 0, 1)); x.closePath(); x.clip(); }
  /* a pencil: not a flat colour but the broken mark of a soft lead — fine grain, and the paper showing through in patches */
  function pen(x, name, rgb, a) {
    var id = name + "|" + a; if (pens[id]) return pens[id];
    var S = 128, c = document.createElement("canvas"); c.width = c.height = S;
    var g = c.getContext("2d"), d = g.createImageData(S, S), r = G.rng(name.length * 131 + Math.round(a * 977) + 5), cell = 8, n = S / cell, lat = [], i, j;
    for (i = 0; i < n * n; i++) lat.push(r());
    for (j = 0; j < S; j++) for (i = 0; i < S; i++) {
      var fx = i / cell, fy = j / cell, x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, ux = fx - Math.floor(fx), uy = fy - Math.floor(fy);
      var b = (lat[y0 * n + x0] * (1 - ux) + lat[y0 * n + x1] * ux) * (1 - uy) + (lat[y1 * n + x0] * (1 - ux) + lat[y1 * n + x1] * ux) * uy;
      var v = G.clamp((.5 * r() + .5 * b - .2) / .5, 0, 1), k = (j * S + i) * 4;
      d.data[k] = rgb[0]; d.data[k + 1] = rgb[1]; d.data[k + 2] = rgb[2]; d.data[k + 3] = Math.round(255 * a * (.22 + .78 * v * v * (3 - 2 * v)));
    }
    g.putImageData(d, 0, 0); return (pens[id] = x.createPattern(c, "repeat"));
  }
  // a long line is not drawn in one go: a few strokes, each starting a little before the last one ended and a little off it
  function longLine(g, x1, y1, x2, y2, o) {
    var L = Math.hypot(x2 - x1, y2 - y1) || 1, n = Math.max(1, Math.round(L / 300)), ux = (x2 - x1) / L, uy = (y2 - y1) / L, out = [], rnd = G.rng(o.seed * 13 + 3), i, k;
    for (i = 0; i < n; i++) {
      var a = i / n * L - (i ? 12 + rnd() * 16 : 0), b = (i + 1) / n * L + (i < n - 1 ? 6 + rnd() * 12 : 0), j0 = (rnd() - .5) * 5, j1 = (rnd() - .5) * 5, oo = {}; for (k in o) oo[k] = o[k]; oo.seed = o.seed * 7 + i + 1;
      out.push(g.line(x1 + ux * a - uy * j0, y1 + uy * a + ux * j0, x1 + ux * b - uy * j1, y1 + uy * b + ux * j1, oo));
    }
    return out;
  }
  var WF = 1;   // lines are as wide on the page however large the instrument is laid
  function opts(base, more) { var q = { roughness: 1.4, bowing: 1.1, strokeWidth: 1.5, curveStepCount: 11, curveFitting: .93 }, k; for (k in base) q[k] = base[k]; if (more) for (k in more) q[k] = more[k]; q.strokeWidth *= WF; if (q.fillWeight > 0) q.fillWeight *= WF; return q; }

  /* one of the eight phases of the moon, about (0, 0): its lit part shaded with the blue pencil, a pencil circle round it */
  function moonOf(g, R, i, bluePen, leadPen, seed) {
    var f = i <= 4 ? i / 4 : (8 - i) / 4, wax = i <= 4, pts = [], j, out = [];   // f: how much of it is lit
    if (f > .02) { for (j = 0; j <= 12; j++) { var a1 = (-90 + j * 15) * RAD; pts.push([(wax ? 1 : -1) * R * Math.cos(a1), R * Math.sin(a1)]); } for (j = 12; j >= 0; j--) { var a2 = (-90 + j * 15) * RAD; pts.push([(wax ? 1 : -1) * R * Math.cos(a2) * (1 - 2 * f), R * Math.sin(a2)]); }
      out.push(g.polygon(pts, opts({ seed: seed, roughness: .8, stroke: "none", fill: bluePen, fillStyle: "hachure", hachureGap: 2.6 * R / 13, fillWeight: 1.5, hachureAngle: -40 + i * 9 }))); }
    out.push(g.circle(0, 0, R * 2, opts({ seed: seed + 20, roughness: 1.2, strokeWidth: 1.2, stroke: leadPen })));
    return out;
  }
  /* the pencil case, for whatever else on the page is to be drawn in the same hand (the dial; the plates of the other pages):
     pen(ctx, name, rgb, alpha) a pencil; made(key, fn(generator)) a stroke made once and kept; put(ctx, strokes) lays it;
     opts(…) the hand's habits; longLine(…) a long line in several goes; moon(…) a phase of the moon; wf(v) how wide the lines are */
  G.sk = { pen: pen, made: made, put: put, opts: opts, longLine: longLine, pie: pie, moon: moonOf, wf: function (v) { WF = v; } };

  G.orrery = function (x, o) {
    var night = !!o.night, rv = G.clamp(o.rv == null ? 1 : o.rv, 0, 1), ga = x.globalAlpha;
    if (o.a <= .004 || rv <= .002) return;
    WF = 1.26 / Math.max(1, o.K);
    var N = night ? "n" : "d", orb = o.orb || 0, t = o.time || 0, q = G.clamp(o.q, .12, 1), turn = orb * 72 * RAD;
    var lead = function (a) { return pen(x, "lead" + N, night ? [238, 235, 228] : [66, 66, 76], a); }, blue = function (a) { return pen(x, "blue" + N, night ? [96, 108, 246] : [41, 51, 196], a); }, chalk = function (a) { return pen(x, "chalk" + N, night ? [238, 235, 228] : [255, 255, 255], a); };
    var paper = night ? C.night : C.paper;
    var sg = function (a, b) { return G.ease(G.seg(rv, a, b)); }, pop = function (a, b) { var u = G.seg(rv, a, b); return u <= 0 ? 0 : u >= 1 ? 1 : 1 + 1.6 * Math.pow(u - 1, 3) + .6 * Math.pow(u - 1, 2); };
    x.save(); x.globalAlpha = ga * o.a; x.translate(o.cx, o.cy); x.rotate(o.tilt); x.scale(o.K, o.K); x.lineCap = "round";
    var ks = 1 / Math.max(1, o.K * .86);   // the bodies and the signs do not grow as fast as the orbits do

    /* the plane the orbits lie on, ruled by hand; everything on it is drawn round (and shows as an ellipse) */
    x.save(); x.scale(1, q);
    var i, n = 5, shown = sg(.08, .52) * n, rr = G.rng(9);
    for (i = 0; i < n && i < shown; i++) {
      var px = -612 + i * 306, long = i === 2, e0 = (long ? -560 : -470) - rr() * 46, e1 = (long ? 560 : 470) + rr() * 46;
      x.globalAlpha = ga * o.a * Math.min(1, shown - i);
      put(x, made(N + "pl" + i, (function (px, long, i, e0, e1) { return function (g) { return longLine(g, px, e0, px + (i % 3 - 1) * 5, e1, opts({ seed: 200 + i, roughness: 1.3, strokeWidth: long ? 1.2 : 1, stroke: lead(long ? .4 : .24), disableMultiStroke: true })); }; })(px, long, i, e0, e1)));
    }
    x.globalAlpha = ga * o.a;
    if (rv > .2) { x.save(); x.beginPath(); x.rect(-800, -700, 1600 * sg(.2, .5), 1400); x.clip(); [0].forEach(function (py, j) { put(x, made(N + "ph" + j, function (g) { return longLine(g, -760, py + 4, 770, py - 5, opts({ seed: 240 + j, roughness: 1.3, strokeWidth: 1.2, stroke: lead(py ? .34 : .5), disableMultiStroke: !!py })); })); }); x.restore(); }

    /* the rings: one close in; a broken one that goes round; a dotted one, gone over heavy and black for part of its way; a limb far out, ticked like a scale */
    var ring = function (key, r, o2, rot, a0, u) {
      if (u <= 0) return; x.save(); if (u < 1) pie(x, r + 40, a0, u); x.rotate(rot);
      put(x, made(N + key, function (g) { return g.circle(0, 0, r * 2, opts({ seed: 300 + r, roughness: 1.5 }, o2)); })); x.restore();
    };
    ring("r1", 118, { strokeWidth: 1.5, stroke: blue(.8) }, 0, -2, sg(.3, .52));
    ring("r2", 252, { strokeWidth: 1.5, stroke: lead(.72), strokeLineDash: [26, 14], disableMultiStroke: true }, turn + t * 1.7 * RAD, 1, sg(.34, .64));
    ring("r3", 338, { strokeWidth: 1.4, stroke: lead(.55), strokeLineDash: [2, 9], disableMultiStroke: true }, turn * .5 + t * .6 * RAD, 2.4, sg(.4, .7));
    if (sg(.5, .78) > 0) {   // the heavy part of the third ring: the pencil gone over it four times
      x.save(); x.rotate(200 * RAD + turn * .5 + t * .9 * RAD); pie(x, 420, 0, sg(.5, .78) * .3);
      put(x, made(N + "seg", function (g) { return [-2.4, 0, 2.2].map(function (dr, j) { return g.arc(0, 0, 676 + dr * 2, 676 + dr * 2, (2 - j) * RAD, (96 + j * 1.5) * RAD, false, opts({ seed: 411 + j, roughness: 1.3, strokeWidth: 2.3, stroke: lead(.82), disableMultiStroke: true })); }); }));
      x.restore();
    }
    var uL = sg(.5, .9);
    if (uL > 0) {   // the limb
      x.save(); pie(x, 860, 148 * RAD, uL * .52); x.rotate(turn * (1 / 6) + t * .22 * RAD);
      put(x, made(N + "limb", function (g) {
        var out = [g.arc(0, 0, 1520, 1520, 120 * RAD, 360 * RAD, false, opts({ seed: 431, roughness: 1.2, strokeWidth: 1.4, stroke: lead(.6) }))], j;
        for (j = 24; j < 72; j++) { var ta = j * 5 * RAD, tl = j % 6 === 0 ? 32 : j % 2 === 0 ? 17 : 10; out.push(g.line(Math.cos(ta) * 763, Math.sin(ta) * 763, Math.cos(ta + .004) * (760 - tl), Math.sin(ta + .004) * (760 - tl), opts({ seed: 440 + j, roughness: .9, strokeWidth: 1.2, stroke: lead(.62), disableMultiStroke: true }))); }
        return out;
      }));
      x.restore();
    }
    x.restore();

    /* her own orbits and the rooms on them (drawn by the page itself, in the same pencils), coming round into view */
    var uF = sg(.4, .86);
    if (uF > 0 && o.foot) { x.save(); if (uF < 1) { x.save(); x.scale(1, q); pie(x, 760, 1.2, uF); x.restore(); } o.foot({ ln: lead(.66), ink: lead(.95), blue: blue(1) }); x.restore(); }

    /* the hands: lines through the middle with little ticks at their ends (they stand still; turning the menu turns them, each at its own rate) */
    x.save(); x.scale(1, q);
    var hand = function (key, len, both, ang, o2, u, end) {
      if (u <= 0) return; x.save(); x.rotate(ang); x.beginPath(); x.rect(both ? -(len + 30) * u : 0, -70, both ? (len + 30) * 2 * u : (len + 30) * u, 140); x.clip();
      put(x, made(N + key, function (g) { return longLine(g, both ? -len : 0, both ? 3 : 0, len, both ? -4 : 2, opts({ seed: 500 + len, roughness: 1.4, strokeWidth: 1.4, stroke: lead(.62), disableMultiStroke: true }, o2)); }));
      if (end) end(u); x.restore();
    };
    hand("h1", 720, true, 18 * RAD + turn, {}, sg(.55, .84), function () {
      put(x, made(N + "h1t", function (g) { var out = []; [-1, 1].forEach(function (sd) { for (var j = 0; j < 3; j++) { var px = sd * (640 + j * 14); out.push(g.line(px - 5, -12, px + 6, 12, opts({ seed: 520 + j + sd, roughness: 1, strokeWidth: 1.4, stroke: lead(.8) }))); } }); return out; }));
    });
    hand("h2", 610, false, 250 * RAD + turn * .5, {}, sg(.6, .88), function (u) {
      if (u > .97) put(x, made(N + "h2e", function (g) { return g.rectangle(600, -8, 16, 16, opts({ seed: 531, roughness: 1.1, strokeWidth: 1.3, stroke: lead(.9), fill: lead(1), fillStyle: "cross-hatch", hachureGap: 3, fillWeight: 1.3 })); }));
    });
    hand("h3", 452, false, 140 * RAD + turn / 3, { strokeLineDash: [9, 8] }, sg(.62, .9), null);
    x.restore();

    /* what goes round on the broken ring: the chosen room as a blue body, the way it has come gone over behind it in blue pencil */
    var uB = pop(.66, .84), thB = 118 * RAD + turn + t * 1.7 * RAD, bx = Math.cos(thB) * 252, by = Math.sin(thB) * 252 * q;
    if (uB > 0) {
      x.save(); x.scale(1, q); x.rotate(thB - 54 * RAD);
      put(x, made(N + "tail", function (g) { return [-1, 1.2].map(function (dr, j) { return g.arc(0, 0, 504 + dr * 2, 504 + dr * 2, j * 3 * RAD, (50 - j * 2) * RAD, false, opts({ seed: 611 + j, roughness: 1.2, strokeWidth: 1.7, stroke: blue(.85), disableMultiStroke: true })); }); })); x.restore();
      x.save(); x.translate(bx, by); x.scale(uB * ks, uB * ks); x.fillStyle = paper; x.beginPath(); x.arc(0, 0, 17, 0, TAU); x.fill();
      put(x, made(N + "body", function (g) { return [g.circle(0, 0, 27, opts({ seed: 621, roughness: 1.1, strokeWidth: 1.5, stroke: blue(.95), fill: blue(.9), fillStyle: "hachure", hachureGap: 3.4, fillWeight: 1.5, hachureAngle: -38 })), g.circle(0, 0, 42, opts({ seed: 623, roughness: 1.3, strokeWidth: 1.2, stroke: lead(.6) }))]; }));
      x.restore();
      var e3 = 140 * RAD + turn / 3;   // the pale one at the end of the broken hand
      x.save(); x.translate(Math.cos(e3) * 452, Math.sin(e3) * 452 * q); x.scale(uB * ks, uB * ks); x.fillStyle = paper; x.beginPath(); x.arc(0, 0, 16, 0, TAU); x.fill();
      put(x, made(N + "pale", function (g) { return [g.circle(0, 0, 30, opts({ seed: 631, roughness: 1.3, strokeWidth: 1.5, stroke: lead(.9), fill: chalk(night ? .14 : .9), fillStyle: "hachure", hachureGap: 3.4, fillWeight: 1.6 })), g.circle(4, -3, 8, opts({ seed: 633, roughness: 1, strokeWidth: 1.2, stroke: lead(1), fill: lead(1), fillStyle: "cross-hatch", hachureGap: 2, fillWeight: 1.2 }))]; }));
      x.restore();
    }

    /* the phases of the moon, set round the dotted ring and going slowly round with it: each a small circle, its lit part shaded in blue
       pencil — the page is a blue moon's, and counts its age; the phase the moon is in today has a ring round it */
    var uM = G.ease(G.seg(rv, .62, .9));
    if (uM > 0) {
      var age = G.moonAge ? G.moonAge(new Date()) : 0, today = Math.round(age / 29.53 * 8) % 8, rotM = turn * .5 + t * .6 * RAD;
      for (i = 0; i < 8; i++) {
        var am = i * 45 * RAD + rotM;
        x.save(); x.globalAlpha = ga * o.a * uM; x.translate(Math.cos(am) * 338, Math.sin(am) * 338 * q); x.scale(ks, ks); x.fillStyle = paper; x.beginPath(); x.arc(0, 0, 14, 0, TAU); x.fill();
        put(x, made(N + "moon" + i, (function (i) { return function (g) { return moonOf(g, 13, i, blue(.95), lead(.8), 1100 + i); }; })(i)));
        if (i === today) put(x, made(N + "moonT", function (g) { return [g.circle(0, 0, 44, opts({ seed: 1141, roughness: 1.5, strokeWidth: 1.2, stroke: blue(.8) })), g.line(0, -24, 1, -38, opts({ seed: 1143, roughness: 1, strokeWidth: 1.2, stroke: blue(.8), disableMultiStroke: true }))]; }));
        x.restore();
      }
      x.globalAlpha = ga * o.a;
    }

    /* swallows, small, in blue pencil, gliding along an orbit of their own between her outer two — the same birds that make the eye, far off */
    var uW = G.ease(G.seg(rv, .7, 1));
    if (uW > 0 && G.swallow) {
      for (i = 0; i < 4; i++) {
        var aw = (38 + i * 97 + (i % 2) * 11) * RAD + turn * .25 + t * 1.25 * RAD, rw = 598 + (i % 2) * 8, wx = Math.cos(aw) * rw, wy = Math.sin(aw) * rw * q;
        var hw = Math.atan2(Math.cos(aw) * q, -Math.sin(aw));   // along the orbit, clockwise
        x.save(); x.globalAlpha = ga * o.a * uW; x.translate(wx, wy); x.scale(ks, ks);
        G.swallow(x, 0, 0, 30 + (i % 3) * 5, hw, blue(1), { f: G.flight ? G.flight(t * .8, i + 40) : 11, rim: false });
        x.restore();
      }
      x.globalAlpha = ga * o.a;
    }

    /* the middle: only a centre mark — a small circle and a cross, in pencil */
    var uC = pop(.58, .78);
    if (uC > 0) {
      x.save(); x.scale(uC * ks, uC * ks);
      put(x, made(N + "mid", function (g) { return [
        g.circle(0, 0, 30, opts({ seed: 701, roughness: 1.5, strokeWidth: 1.4, stroke: lead(.8) })),
        g.line(-34, 1, 36, -1, opts({ seed: 703, roughness: 1.2, strokeWidth: 1.2, stroke: lead(.7), disableMultiStroke: true })),
        g.line(1, -36, -1, 34, opts({ seed: 705, roughness: 1.2, strokeWidth: 1.2, stroke: lead(.7), disableMultiStroke: true }))]; }));
      x.restore();
    }

    x.restore(); x.globalAlpha = ga;
  };
})();
