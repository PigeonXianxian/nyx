/* 构成 — the sheets between the orbits and the plate: sketchbook pages, 拙, drawn freehand in soft pencil (by night in chalk).
   They are drawings, not rules, so they are not drawn by program (that came out stiff): made for this page with an image
   model, then stripped of their paper so that only what was drawn is left — graphite as one ink with its pressure, the
   blue pencil with its own blue.
   What they are comes from the page itself. The eye is made of swallows and a blue moon; so
     draft-day-a    by day, a naturalist's study of the swallow in flight (after the manner of Leonardo's leaves on the flight of
                    birds): one bird worked up, its back in blue pencil, others only begun, the line of flight dotted across
     draft-day-b    and behind it a cathedral seen from far off, tall and faint, rising out of mist, a few swallows about its spire
     draft-night-a  by night the same bird has gone up among the stars: a leaf from a celestial atlas (after Hevelius and Bayer),
                    the swallow as a constellation, its stars in blue, the arcs of the grid across it — in chalk
     draft-night-b  and, small, studies of the moon through its phases (after Galileo's) — the rooms go round the rail as moons
   Each has a mask beside it (…-m.webp): the bodies drawn on it, soft-edged. Laid under the sheet in the colour of the ground,
   it keeps the orbits behind from showing through a bird or a moon — so the sheet reads as lying IN FRONT of them, not among them.
   G.drafts(night, env) → where each lies: { im, kn (the mask, in the ground's colour), x, y, w, h, a(lpha), depth (how much it
   gives to the hand — the orbits behind give nothing), rot (the leaf lies turned), veil (it is only half there: a band of clearness wanders
   over it, and veil is how faint the rest is) }.  G.sketchReady(fn) calls fn when a sheet has arrived (to draw again). */
(function () {
  "use strict";
  var G = window.Gou, waiting = [], got = {}, masks = {};
  var SHEETS = { "draft-day-a": "#ECE9E2", "draft-day-b": "#ECE9E2", "draft-night-a": "#1B1A20", "draft-night-b": "#1B1A20" };   // each with the ground it lies on
  var tell = function () { waiting.forEach(function (f) { f(); }); };
  Object.keys(SHEETS).forEach(function (name) {
    var im = new Image(); im.onload = function () { got[name] = im; tell(); }; im.src = (G.BASE || "eye/") + name + ".webp";
    var mk = new Image(); mk.onload = function () {
      var c = document.createElement("canvas"); c.width = mk.naturalWidth; c.height = mk.naturalHeight; var g = c.getContext("2d");
      g.drawImage(mk, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = SHEETS[name]; g.fillRect(0, 0, c.width, c.height); masks[name] = c; tell();
    }; mk.src = (G.BASE || "eye/") + name + "-m.webp";
  });
  G.sketchReady = function (fn) { if (fn) waiting.push(fn); };
  G.sheet = function (name) { return { im: got[name] || null, kn: masks[name] || null }; };   // one leaf and its mask, for whoever else lays it (plate.js)
  /* Where they lie is a matter of composition, and of depth. By day there are four distances: the orbits furthest; then a cathedral, far
     off — tall on the left of the page, pale, never all there at once (a band of clearness wanders over it), its foot lost in mist; then
     the swallow, near and clear, low on the left, its leaf turned so that it climbs straight at the eye and passes IN FRONT of the cathedral
     (a wedge driven at a circle, as in Lissitzky's poster; a bird on the diagonal with the paper left empty round it, as in Koson's and
     Hiroshige's prints); then the eye. The cathedral stands upright, the swallow crosses it aslant, the eye is round: a vertical, a diagonal,
     a circle, at the corners of a triangle. The hand moves the nearer things more than the further (depth). By night it is turned over: the constellation large and HIGH on the left, stooping toward the well (Hiroshige's eagle over
     Susaki), the moons small and low, the stair on the right. Day climbs; night goes down. */
  G.drafts = function (night, env) {
    var wide = env && env.wide, L = env ? env.left : 0, T = env ? env.top : 0, Wp = env ? env.right - env.left : 1000, Hp = env ? env.bottom - env.top : 1500, out = [], RAD = Math.PI / 180;
    // at: the point of the page (fx, fy of it) where the point (sx, sy) of the sheet is to lie, the sheet w wide and turned rot degrees
    var put = function (name, fx, fy, sx, sy, w, rot, a, depth, veil) {
      var im = got[name]; if (!im) return;
      var h = w * im.naturalHeight / im.naturalWidth, r = (rot || 0) * RAD, dx = (sx - .5) * w, dy = (sy - .5) * h, cx = L + fx * Wp - (dx * Math.cos(r) - dy * Math.sin(r)), cy = T + fy * Hp - (dx * Math.sin(r) + dy * Math.cos(r));
      out.push({ im: im, kn: masks[name] || null, x: cx - w / 2, y: cy - h / 2, w: w, h: h, a: a, depth: depth, pivot: [.5, .5], spin: 0, veil: veil || 0, rot: r });
    };
    if (!night) {
      // the cathedral first: far off, tall, faint, only half there. Then the swallow, nearer and clear, flying across in front of it at the eye
      // (the tip of its spire is the point laid: high on the left; the swallow a little to the right of it and below, turned to climb at the eye)
      if (wide) { put("draft-day-b", .19, .035, .476, .03, 880, 0, .55, .8, .4); put("draft-day-a", .32, .7, .55, .42, 1080, -22, .9, 2, .66); }
      else { put("draft-day-b", .14, .035, .476, .03, 470, 0, .36, .6, .42); put("draft-day-a", .31, .17, .55, .42, 640, -14, .5, 1, .5); }
    } else {
      if (wide) { put("draft-night-a", .25, .27, .5, .5, 1100, 12, .88, 1.5, .62); put("draft-night-b", .2, .8, .5, .5, 600, -4, .62, 2.2, 0); }
      else put("draft-night-a", .28, .86, .5, .5, 900, 8, .46, 1, .5);
    }
    return out;
  };
})();
