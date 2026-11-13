/* 构成 — a plate for the other pages. The home has its world: the orbits going slowly round at the back, a sketchbook leaf in
   front of them. This lays the same things, in the same hand, behind another page — so that the letter page on a wide
   screen is a spread: the plate on the left-hand page, the letter on the right.
   G.plate(host, opt) puts a canvas (class "plate") first in `host`; CSS says where it lies and when it shows. While it is
   on screen it is redrawn some fourteen times a second (the orbits only flow: that is enough); when it comes on screen it
   is constructed, as the home's is when the eye opens.
   opt.lay(night, W, H) → what lies on it, in page units (H is always 1400, W whatever the canvas is wide):
     { orb: { x, y, K, tilt (degrees), q, a }, sheets: [{ name, x, y, sx, sy, w, rot, a }] }
   (a sheet's point (sx, sy) — fractions of it — lies at (x, y); see sketch.js for the sheets). Returns { stop }. */
(function () {
  "use strict";
  var G = window.Gou; if (!G) return;
  var RAD = Math.PI / 180;
  G.plate = function (host, opt) {
    opt = opt || {};
    var cv = document.createElement("canvas"), x = cv.getContext("2d"), root = document.documentElement, w = 0, h = 0, dpr = 1, timer = 0, alive = true, seenAt = 0, was = false;
    cv.className = "plate"; cv.setAttribute("aria-hidden", "true"); host.insertBefore(cv, host.firstChild);
    function frame() {
      timer = 0; if (!alive) return;
      var r = cv.getBoundingClientRect(), on = r.width > 2 && r.height > 2 && !document.hidden;
      if (!on) { was = false; timer = setTimeout(frame, 500); return; }
      var now = performance.now(); if (!was) { was = true; seenAt = now; }
      var nw = Math.round(r.width), nh = Math.round(r.height), nd = Math.min(window.devicePixelRatio || 1, 2);
      if (nw !== w || nh !== h || nd !== dpr) { w = nw; h = nh; dpr = nd; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      var night = root.dataset.side === "moon", s = h / 1400, k = s * dpr, W = w / s, tt = now / 1000, rv = G.clamp((now - seenAt) / 2200, 0, 1), L = opt.lay ? opt.lay(night, W, 1400) : {};
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); x.setTransform(k, 0, 0, k, 0, 0);
      if (L.orb && G.orrery) {
        var o = L.orb, F = G.FOOT;
        G.orrery(x, { cx: o.x, cy: o.y, K: o.K, tilt: o.tilt * RAD, q: o.q, night: night, orb: 0, time: tt, a: o.a, rv: rv, foot: G.foot && F ? function (pencils) { pencils.q = o.q; x.save(); x.translate(-F.x, -F.y); G.foot(x, night, tt / 13, true, pencils); x.restore(); } : null });
      }
      (L.sheets || []).forEach(function (sh, i) {
        var S = G.sheet ? G.sheet(sh.name) : null; if (!S || !S.im) return;
        var hh = sh.w * S.im.naturalHeight / S.im.naturalWidth, a = sh.a * G.ease(G.seg(rv, .3 + i * .15, .85 + i * .15)); if (a <= .004) return;
        x.save(); x.translate(sh.x, sh.y); x.rotate((sh.rot || 0) * RAD); x.translate(-sh.sx * sh.w, -sh.sy * hh);
        if (S.kn) { x.globalAlpha = Math.min(1, a * 1.2) * .86; x.drawImage(S.kn, 0, 0, sh.w, hh); }
        x.globalAlpha = a; x.drawImage(S.im, 0, 0, sh.w, hh);
        x.restore();
      });
      x.globalAlpha = 1;
      timer = setTimeout(frame, 70);
    }
    if (G.sketchReady) G.sketchReady(function () { if (!timer && alive) frame(); });
    frame();
    return { stop: function () { alive = false; clearTimeout(timer); cv.remove(); } };
  };

  /* the letter page's plate: the orbits low on the left-hand page, and the bird that carries the post — by day the swallow of the
     study, climbing toward the letter; by night the same swallow among the stars, and the moons under it */
  G.plateOfLetters = function (night, W, H) {
    var orb = { x: W * .44, y: H * .7, K: 1.5, tilt: 58, q: .62, a: night ? .5 : .32 };
    return night
      ? { orb: orb, sheets: [{ name: "draft-night-a", x: W * .5, y: H * .6, sx: .5, sy: .5, w: W * 1.2, rot: 10, a: .9 }, { name: "draft-night-b", x: W * .46, y: H * .93, sx: .5, sy: .5, w: W * .66, rot: -3, a: .6 }] }
      : { orb: orb, sheets: [{ name: "draft-day-a", x: W * .5, y: H * .7, sx: .55, sy: .42, w: W * 1.2, rot: -18, a: .9 }] };
  };
  var room = document.getElementById("room");   // the letter page, if this is the page it is on
  if (room) G.plate(room, { lay: G.plateOfLetters });
})();
