/* 构成 — the drawing kit behind the eye home: colours, seeded noise, swallows, moons, stipple, pencil.
   Visual design after 396 / StarFold146 ("Fable 5.2 构成变换UI"); drawn here from scratch on a canvas. */
(function () {
  "use strict";
  var G = window.Gou = {};
  G.C = { paper: "#ECE9E2", ink: "#17171B", blue: "#2933C4", soft: "#959CDC", night: "#17171B", white: "#F1EEE7", grey: "#8D8B86", dim: "#3B3B40", line: "rgba(46,46,54,.44)" };
  G.rng = function (s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  G.ease = function (t) { t = G.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  G.out = function (t) { t = G.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.seg = function (t, a, b) { return G.clamp((t - a) / (b - a), 0, 1); };   // progress of the window [a,b] inside a 0..1 timeline
  var TAU = G.TAU = Math.PI * 2, RAD = G.RAD = Math.PI / 180;

  /* ── the swallow ── drawn from the outlines in birds.js, which are traced from 396's own plate ("twelve instants of
     one wingbeat"), so the silhouette is hers. Every instant has the same number of points round its outline, so a bird
     in flight is blended from one instant into the next and its wings move without stepping. A thin pale rim goes round
     each bird (blue round a white one) so birds that overlap in a chain stay apart, as on her plates.
       o.f     an instant held still (an hour of her ring: 0 1 5 6 7 8 9 10 11), or a moment of the beat from G.instant()
       o.flip  mirror top to bottom;   o.spread  the same wing on both sides (seen from above);   o.rim  colour, or false */
  var HELD = {}, made = false;
  /* The plate has lost three instants of the beat off its edge (hours 2, 3, 4: the wing coming down past the body). They are
     made here from the two either side, the way a swallow seen from the side shows it: the wing does not swing round like a
     door, it comes toward you — so it shortens to almost nothing and opens again below (cf. photographs of barn swallows
     skimming water, wing straight down and long; and head-on, wings a flat thin line). */
  function makeLost() {
    if (made || !G.BIRDPTS) return; made = true;
    var P = G.BIRDPTS, wingOf = function (src, up, scale, lean) {
      var a = P[src], out = new Array(a.length), px = .06, py = up ? -.09 : .09;
      for (var i = 0; i < a.length; i += 2) {
        var dx = a[i] - px, dy = a[i + 1] - py, w = G.ease(G.clamp(((up ? -a[i + 1] : a[i + 1]) - .1) / .22, 0, 1)), k = 1 - w + w * scale;   // how much of this point is wing
        out[i] = px + dx * k + w * lean * Math.abs(dy); out[i + 1] = py + dy * k;
      }
      return out;
    };
    if (P[1] && P[5]) { P[2] = wingOf(1, true, .62, .1); P[3] = wingOf(1, true, .2, .12); P[4] = wingOf(5, false, .5, .04); G.BIRD_CYCLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; }
  }
  function outline(f) {
    makeLost();
    var P = G.BIRDPTS || {}, cyc = G.BIRD_CYCLE || [11], p = new Path2D(), a, b, t = 0, i;
    if (f >= 100) { var pos = (f - 100) % cyc.length, k = Math.floor(pos); t = pos - k; a = P[cyc[k]]; b = P[cyc[(k + 1) % cyc.length]];
      var ha = cyc[k], hb = cyc[(k + 1) % cyc.length]; if (ha === 8 && hb === 9) t = G.ease(G.clamp((t - .3) / .4, 0, 1)); }   // the wing coming up past the body is folded close: it goes over quickly
    else { a = b = P[f] || P[11]; }
    if (!a) return p;
    p.moveTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    for (i = 2; i < a.length; i += 2) p.lineTo(a[i] + (b[i] - a[i]) * t, a[i + 1] + (b[i + 1] - a[i + 1]) * t);
    p.closePath(); return p;
  }
  G.swallow = function (x, px, py, size, heading, col, o) {
    o = o || {};
    var f = o.f == null ? 11 : o.f, p = f >= 100 ? outline(f) : (HELD[f] || (HELD[f] = outline(f)));
    var rim = o.rim === undefined ? (col === G.C.white ? G.C.blue : "rgba(241,240,247,.97)") : o.rim;
    x.save(); x.translate(px, py); x.rotate(heading); x.scale(size, o.flip ? -size : size);
    if (rim && size > 12) { x.strokeStyle = rim; x.lineJoin = "round"; x.lineWidth = Math.min(.1, (o.rimW || 2.6) / size); x.stroke(p); if (o.spread) { x.scale(1, -1); x.stroke(p); x.scale(1, -1); } }
    x.fillStyle = col; x.fill(p); if (o.spread) { x.scale(1, -1); x.fill(p); }
    x.restore();
  };
  // a moment of the wingbeat at phase ph (0..1 round the cycle): pass it as o.f and the bird is blended between the two instants either side
  G.instant = function (ph) { makeLost(); var n = (G.BIRD_CYCLE || [11]).length; ph = ((ph % 1) + 1) % 1; return 100 + ph * n; };
  /* how a swallow flies: it does not row. It rides on wings held up and back (the instant her plates are full of), and now and
     then gives one beat — down quickly, up more slowly — and rides again. flight(seconds, which bird) → a moment for o.f */
  G.flight = function (t, n) {
    makeLost();
    var q = Math.sin((n + 1) * 12.9898) * 43758.5453, r = q - Math.floor(q), beats = 1.5 + .9 * r, u = (((t / G.BEAT + r * 9) % beats) + beats) % beats, N = (G.BIRD_CYCLE || [11]).length;
    if (N < 12) return 100 + (u % 1) * N;
    var pos = 11 + .3 * Math.sin(t * 1.1 + n);                                  // riding: a little give in the wing
    if (u < 1) pos = 11 + 12 * (u < .4 ? .5 * G.ease(u / .4) : .5 + .5 * G.ease((u - .4) / .6));   // one beat: hours 0..5 going down, 6..11 coming up
    return 100 + ((pos % 12) + 12) % 12;
  };
  G.BEAT = .62;   // seconds for one wingbeat, measured off her film (the birds on the stair: nine or ten frames at fifteen a second)

  /* ── the hand ── a line put down as a hand puts it down: twice, not quite in the same place, bowing a little (rough.js, MIT).
     G.hand(ctx, seed, defaults) → { line, arc, ellipse, circle, path, poly }; the last argument of each is options that override.
     Seeded, so a line is the same line every time it is drawn. Without rough.js the lines are simply ruled. */
  G.hand = function (x, seed, base) {
    var R = window.rough, rc = R && x.canvas ? R.canvas(x.canvas) : null, n = 0;
    var opt = function (o) { var q = { roughness: 1.4, bowing: 1, strokeWidth: 1.1, stroke: G.C.line, seed: (seed || 1) * 1000 + (++n) }, k; for (k in base) q[k] = base[k]; if (o) for (k in o) q[k] = o[k]; return q; };
    var plain = function (o, draw) { x.save(); x.strokeStyle = o.stroke; x.lineWidth = o.strokeWidth; if (o.strokeLineDash) { x.setLineDash(o.strokeLineDash); x.lineDashOffset = o.strokeLineDashOffset || 0; } x.beginPath(); draw(); x.stroke(); x.restore(); };
    return {
      line: function (x1, y1, x2, y2, o) { o = opt(o); if (rc) rc.line(x1, y1, x2, y2, o); else plain(o, function () { x.moveTo(x1, y1); x.lineTo(x2, y2); }); },
      ellipse: function (cx, cy, rx, ry, a0, a1, o) { o = opt(o); if (rc) rc.arc(cx, cy, rx * 2, ry * 2, a0, a1, false, o); else plain(o, function () { x.ellipse(cx, cy, rx, ry, 0, a0, a1); }); },
      arc: function (cx, cy, r, a0, a1, o) { this.ellipse(cx, cy, r, r, a0, a1, o); },
      circle: function (cx, cy, r, o) { o = opt(o); if (rc) rc.circle(cx, cy, r * 2, o); else plain(o, function () { x.arc(cx, cy, r, 0, G.TAU); }); },
      path: function (d, o) { o = opt(o); if (rc) rc.path(d, o); else { x.save(); x.strokeStyle = o.stroke; x.lineWidth = o.strokeWidth; x.stroke(new Path2D(d)); x.restore(); } },
      poly: function (pts, o) { o = opt(o); if (rc) rc.linearPath(pts, o); else plain(o, function () { pts.forEach(function (q, i) { if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); }); },
      cross: function (cx, cy, r, o) { this.line(cx - r, cy, cx + r, cy, o); this.line(cx, cy - r, cx, cy + r, o); }
    };
  };

  /* ── stipple: square grains scattered where prob(x,y) says so ── */
  G.stipple = function (x, rnd, box, n, prob, col, lo, hi) {
    x.fillStyle = col; lo = lo || 2; hi = hi || lo * 2;
    for (var i = 0; i < n; i++) {
      var px = box[0] + rnd() * box[2], py = box[1] + rnd() * box[3];
      if (rnd() < prob(px, py)) { var s = lo + rnd() * rnd() * (hi - lo); x.fillRect(Math.round(px), Math.round(py), s, s); }
    }
  };

  /* ── a moon: lit part solid, the rest crumbling into grains. f = lit fraction (0..1), tilt in radians ── */
  G.moon = function (x, cx, cy, r, f, col, rnd, tilt, ring) {
    x.save(); x.translate(cx, cy); x.rotate(tilt || 0);
    f = G.clamp(f, 0, 1);
    if (f >= .995) { x.fillStyle = col; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill(); }
    else {
      var a = r * (1 - 2 * f);   // >0 crescent, <0 gibbous; lit limb is on the left (-x)
      x.fillStyle = col; x.beginPath(); x.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, false);   // down → left → up
      x.ellipse(0, 0, Math.abs(a), r, 0, -Math.PI / 2, Math.PI / 2, a > 0);                  // back along the terminator
      x.fill();
      var n = Math.round(r * r * 1.6 + 60), g = Math.max(.9, Math.min(2.6, r * .06));
      for (var i = 0; i < n; i++) {
        var px = (rnd() * 2 - 1) * r, py = (rnd() * 2 - 1) * r;
        if (px * px + py * py > r * r) continue;
        var tx = -a * Math.sqrt(Math.max(0, 1 - py * py / (r * r)));   // terminator x at this height
        var d = px - tx; if (d < 0) continue;
        if (rnd() < Math.exp(-d / (r * .42)) * .85) x.fillRect(px, py, g * (.6 + rnd()), g * (.6 + rnd()));
      }
    }
    x.restore();
    if (ring) { x.strokeStyle = ring; x.lineWidth = Math.max(1.5, r * .06); x.beginPath(); x.arc(cx, cy, r + x.lineWidth * .5, 0, TAU); x.stroke(); }
  };

  /* ── pencil: thin, slightly unsure lines ── */
  G.pencil = function (x, rnd, x1, y1, x2, y2, a, w) {
    var j = 1.6;
    for (var k = 0; k < 2; k++) {
      x.globalAlpha = (a == null ? 1 : a) * (k ? .55 : 1); x.lineWidth = (w || 1.1) * (k ? .8 : 1);
      x.beginPath(); x.moveTo(x1 + (rnd() - .5) * j, y1 + (rnd() - .5) * j);
      var mx = (x1 + x2) / 2 + (rnd() - .5) * j * 2, my = (y1 + y2) / 2 + (rnd() - .5) * j * 2;
      x.quadraticCurveTo(mx, my, x2 + (rnd() - .5) * j, y2 + (rnd() - .5) * j); x.stroke();
    }
    x.globalAlpha = 1;
  };
  G.arc = function (x, cx, cy, r, a0, a1, dash) {
    x.beginPath(); x.setLineDash(dash || []); x.arc(cx, cy, r, a0, a1); x.stroke(); x.setLineDash([]);
  };
  // hatching inside whatever is clipped
  G.hatch = function (x, rnd, box, gap, ang, a) {
    var c = Math.cos(ang), s = Math.sin(ang), L = Math.hypot(box[2], box[3]), cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
    for (var d = -L / 2; d < L / 2; d += gap * (.7 + rnd() * .6)) {
      var ox = cx - s * d, oy = cy + c * d, l = L * (.25 + rnd() * .3), o = (rnd() - .5) * L * .4;
      G.pencil(x, rnd, ox + c * (o - l), oy + s * (o - l), ox + c * (o + l), oy + s * (o + l), a * (.5 + rnd() * .5), .9);
    }
  };
  // pointed (gothic) arch outline from the floor up: x centre, floor y, half width, shoulder height, peak height
  G.lancet = function (x, cx, y0, hw, sh, ph) {
    x.beginPath(); x.moveTo(cx - hw, y0); x.lineTo(cx - hw, y0 - sh);
    x.quadraticCurveTo(cx - hw, y0 - sh - ph * .62, cx, y0 - sh - ph);
    x.quadraticCurveTo(cx + hw, y0 - sh - ph * .62, cx + hw, y0 - sh); x.lineTo(cx + hw, y0);
  };

  /* ── the real moon, for the small print ── */
  G.moonAge = function (d) { var syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14); var a = ((d - ref) / 864e5) % syn; return a < 0 ? a + syn : a; };
  G.moonLit = function (d) { return (1 - Math.cos(G.moonAge(d) / 29.530588853 * TAU)) / 2; };

  G.text = function (x, s, px, py, font, col, align, spacing) {
    x.font = font; x.fillStyle = col; x.textAlign = align || "left"; x.textBaseline = "alphabetic";
    if (spacing && "letterSpacing" in x) { x.letterSpacing = spacing + "px"; x.fillText(s, px, py); x.letterSpacing = "0px"; }
    else if (spacing) {   // older Safari: space the letters by hand
      var w = 0, i, ch = Array.from(s); for (i = 0; i < ch.length; i++) w += x.measureText(ch[i]).width + spacing;
      var cx = align === "center" ? px - (w - spacing) / 2 : align === "right" ? px - w + spacing : px; x.textAlign = "left";
      for (i = 0; i < ch.length; i++) { x.fillText(ch[i], cx, py); cx += x.measureText(ch[i]).width + spacing; }
    } else x.fillText(s, px, py);
  };
  G.SERIF = '"Cormorant Garamond", "Source Serif 4", Georgia, serif';
  G.HAN = '"Noto Serif SC", "Songti SC", "STSong", "Source Han Serif SC", serif';
})();
