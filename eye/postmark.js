/* 构成 — the postmark between the days of the letter, struck by hand like everything on the plates: in blue pencil with the
   shared pencil case (G.sk, orrery.js), 拙 — the ring not quite round and gone over twice, an inner ring that breaks off, a
   cross set a little askew, and the cancel: four wavy lines that waver, run to different lengths, and skip where the ink
   ran thin. A few of them are made, each a little different (a stamp never lands the same way twice); a day keeps its own,
   chosen by its date. Day: the deep blue pencil; night: a paler blue that reads on the dark.
   NyxPostmark(el, ts) puts one on a .day label (as --pm); turning the page over redraws them in the other side's pencil. */
(function () {
  "use strict";
  var W = 132, H = 60, N = 5, made = {};
  function night() { return document.documentElement.dataset.side === "moon"; }
  function draw(dark, k) {
    var key = (dark ? "n" : "d") + k; if (made[key]) return made[key];
    var G = window.Gou, SK = G && G.sk; if (!SK || !window.rough) return null;
    var S = 3, c = document.createElement("canvas"); c.width = W * S; c.height = H * S;
    var x = c.getContext("2d"); x.scale(S, S);
    SK.wf(1);
    var blue = function (a) { return SK.pen(x, dark ? "pmBlueN" : "pmBlue", dark ? [128, 138, 252] : [36, 46, 184], a); };
    var O = SK.opts, r = G.rng(k * 97 + 11), seed = 7000 + k * 40, g = window.rough.generator(), i, j;
    // the ring, struck a little crooked
    var R = 23.5, cx = 29 + (r() - .5) * 2.4, cy = 30 + (r() - .5) * 2.4;
    x.save(); x.translate(cx, cy); x.rotate((r() - .5) * .3);
    var a0 = r() * 6.28, d = [
      g.circle(0, 0, R * 2, O({ seed: seed, roughness: 1.5, bowing: 1.4, strokeWidth: 1.55, stroke: blue(.92), curveFitting: .955 })),
      g.arc(0, 0, R * 1.52, R * 1.48, a0, a0 + 4.9 + r() * .7, false, O({ seed: seed + 1, roughness: 1.6, strokeWidth: 1.05, stroke: blue(.7), curveFitting: .96 })),
      g.line(-9 + r(), .8, 9 + r(), -.6, O({ seed: seed + 2, roughness: 1.3, strokeWidth: 1.05, stroke: blue(.82) })),
      g.line(.9, -9 + r(), -.4, 9 + r(), O({ seed: seed + 3, roughness: 1.3, strokeWidth: 1.05, stroke: blue(.82) }))];
    SK.put(x, d); x.restore();
    // the cancel: four wavy lines, a roller dragged by hand — fine waves, pressed unevenly, one skipping where the ink ran thin
    var skip = Math.floor(r() * 4), press = [.86, .66, .8, .58];
    for (i = 0; i < 4; i++) {
      var y = 13.5 + i * 10.6 + (r() - .5) * 1.2, x0 = 57 + r() * 3, x1 = 127 - r() * 7 - (i === 3 ? 7 : 0), amp = 1.55 + r() * .5, ph = r() * 6.28, n = 54, pts = [];
      for (j = 0; j <= n; j++) { var t = j / n; pts.push([x0 + (x1 - x0) * t, y + Math.sin(ph + t * 10.4 * Math.PI) * amp + t * (r() - .5) * .5]); }
      var runs = i === skip ? [pts.slice(0, 22), pts.slice(29)] : [pts];   // where the ink skipped
      for (j = 0; j < runs.length; j++) SK.put(x, g.curve(runs[j], O({ seed: seed + 10 + i * 3 + j, roughness: .55, bowing: .4, strokeWidth: 1.15, stroke: blue(press[i]), disableMultiStroke: i % 2 === 1, curveFitting: .99 })));
    }
    return (made[key] = 'url("' + c.toDataURL("image/png") + '")');
  }
  function which(ts) { var d = new Date(ts); return isNaN(d) ? 0 : (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % N; }
  function stamp(el) {
    var u = draw(night(), +el.dataset.pm || 0);
    if (u) el.style.setProperty("--pm", u);
  }
  window.NyxPostmark = function (el, ts) { el.dataset.pm = which(ts); stamp(el); };
  new MutationObserver(function () { document.querySelectorAll(".day[data-pm]").forEach(stamp); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-side"] });
})();
