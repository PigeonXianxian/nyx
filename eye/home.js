/* 构成 — the eye home. One canvas, two sides:
     day    an eye made of a moon and swallows; the rooms hang under it as moons on an orbit
     night  the same eye as a well, a spiral stair going down; the rooms sit on its rail
   Swipe (or tap a small moon) to turn the orbit; tap the big one to go in — it opens into a ring you pass through.
   Let the plumb bob down to the blue dot under it and the page turns over: the pupil opens into the well and the
   stair is laid tread by tread; let it down again and the well closes back into the eye.
   A room with rooms inside opens the dial in the corner.
   NyxEye(host, apps, openApp, opt) → { refresh, stop }   — same shape as NyxHome / NyxTree. */
(function () {
  "use strict";
  var G = window.Gou, C = G.C, RAD = G.RAD, TAU = G.TAU, EYE = G.EYE, WELL = G.WELL;
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} return null; }
  var DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function two(n) { return n < 10 ? "0" + n : "" + n; }
  var OPEN_MS = 5000, BOB = { day: [1322, 1452, 1480], night: [1316, 1474, 1508] };   // bob at rest, bob let down, the dot it is let down to

  window.NyxEye = function (host, APPS, openApp, opt) {
    opt = opt || {};
    var root = document.documentElement, cv = document.createElement("canvas"), x = cv.getContext("2d");
    cv.className = "eye-cv"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "Home"); host.innerHTML = ""; host.appendChild(cv);
    root.classList.add("eye-in");
    var apps = APPS.slice(), N = apps.length;
    var sel = Math.min(N - 1, Math.max(0, parseInt(ls("gou_sel") || "0", 10) || 0)), selA = sel, selT = null;
    var side = root.dataset.side === "moon" ? 1 : 0, flip = null;              // flip = { to, t0, bob }
    var openT = ss("gou_back") === "1" ? 1 : 0, openAt = 0;          // the opening: 0 shut … 1 open
    var bob = 0, bobT = null, bobDrag = false;                                 // the plumb bob: 0 at rest … 1 let down to the dot
    var hint = null, hints = 0, lastHint = performance.now(), lastTouch = 0, wheelAt = 0, overBob = false;   // the bob dips by itself now and then, so you know it can be let down
    var par = { x: 0, y: 0 }, parT = { x: 0, y: 0 };   // how far the hand (the mouse) is from the middle of the page: the drafts give to it a little
    var orb = 0;   // how far the menu has been turned in all: the bodies on their orbits go round with it
    var portal = null;                                                         // the ring you pass through: { c, t0, dir, then, done }
    var dial = null;                                                           // { app, t0, closing, rot, drag, at }
    var w = 0, h = 0, s = 1, dpr = 1, k = 1, ox = 0, oy = 0, oyN = 0, env = null, envN = null, safeTop = 0, wide = false, lift = 0;
    var cache = {}, hits = [], alive = true, raf = 0, timer = 0;
    /* the swallows that make the lids fly round the eye, clockwise, along the ring they came in by: each goes on into the place of the one
       before it (so the eye keeps its shape — where the lid is thick the birds are large, where it is fine they are small), riding on held
       wings and giving one beat now and then; the beats pass along the lid from bird to bird. At the two corners of the eye they do not
       turn: one dwindles to a point just past the end of its lid while another grows from a point at the start of the next, both at once
       and quickly. lidFlow(which, how far on in places) */
    var RING = G.dayBirds.filter(function (b) { return b.u != null; }), NR = RING.length, PLACE_S = 2.1, flowAt = 0;
    RING.forEach(function (b) { var d = b.h - G.lidTrack(b.u).h; b.off = Math.atan2(Math.sin(d), Math.cos(d)); });
    function lidFlow(j, ph) {
      var c = j + ph, i0 = ((Math.floor(c) % NR) + NR) % NR, w = c - Math.floor(c), A = RING[i0], B = RING[(i0 + 1) % NR], al = 1, px, py, hh, sz;
      var dh = (((B.f - A.f) % 12) + 18) % 12 - 6, pos = A.f + dh * w + .22 * Math.sin(tt * 1.1 + j * 1.7);
      var bu = (((tt - j * .37) % 4.4) + 4.4) % 4.4; if (bu < .74) { var v = bu / .74; pos += 12 * (v < .4 ? .5 * G.ease(v / .4) : .5 + .5 * G.ease((v - .4) / .6)); }   // one beat: down quickly, up more slowly
      if (A.lid !== B.lid) {
        // a corner of the eye, where one lid ends and the other begins at a sharp angle: no bird could turn there. Two things happen at once, and
        // quickly, so that the corner is never left open and nothing lingers beside it: the bird that has reached the end of its lid goes on a
        // little way as it was going, dwindling to a point (`ghost`); and the bird that takes up the other lid comes in from just behind its
        // first place, growing from a point — it is whole long before the step is over, and eases the rest of the way into its place
        var QUICK = .34, u1 = Math.min(1, w / QUICK), t0 = G.lidTrack(A.u - .004), t1 = G.lidTrack(A.u), d0 = Math.atan2(t1.y - t0.y, t1.x - t0.x), k1 = 1 - G.ease(u1), ghost = null;
        if (k1 > .03) ghost = { x: t1.x + Math.cos(d0) * 30 * u1, y: t1.y + Math.sin(d0) * 30 * u1, h: d0 + A.off, s: A.s * k1, a: Math.min(1, k1 * 3), f: 100 + ((A.f % 12) + 12) % 12 };
        var tb = G.lidTrack(B.u), k2 = G.ease(u1), back = 34 * Math.pow(1 - w, 1.6);
        return { x: tb.x - Math.cos(tb.h) * back, y: tb.y - Math.sin(tb.h) * back, h: tb.h + B.off, s: B.s * k2, a: Math.min(1, k2 * 3), f: 100 + ((pos % 12) + 12) % 12, ghost: ghost };
      } else { var du = B.u - A.u; if (du <= 0) du += 1; var tr = G.lidTrack(A.u + du * w); px = tr.x; py = tr.y; hh = tr.h + A.off + (B.off - A.off) * w; sz = A.s + (B.s - A.s) * w; }
      return { x: px, y: py, h: hh, s: sz, a: al, f: 100 + ((pos % 12) + 12) % 12 };
    }
    // where each bird of the eye comes from when it opens (below and to the left), and when it sets off
    var rndB = G.rng(77), starts = G.dayBirds.map(function (b) {
      var ba = (125 + rndB() * 95) * RAD, d0 = 950 + rndB() * 450;
      return { x: EYE.x + Math.cos(ba) * d0, y: EYE.y + Math.sin(ba) * d0 * 1.1, t0: b.lid === 2 ? .62 + (1 - b.k) * .13 : b.lid === 1 ? .7 + (1 - b.k) * .09 : .8, ph: rndB() };
    });
    // The page opens with what looks like a tear and is a swallow. From under the closed lid one of the eye's own birds slips out, wings folded
    // (seen from above, nose down, it is the shape of a drop), and falls down the page as a tear runs: slowly letting go, quickly, hanging a moment
    // (where it hung it leaves a bead), then on to where it comes to rest. The track it leaves is the plumb line. There it leaves the bob, opens
    // its wings — it was a bird all along — and goes off to the place beside the dot where it will keep the bob company. Only then does the eye
    // open. It is one size all the way down (nothing swells or shrinks), and only grows small as it flies off. Its wings open in two stages:
    // a little way where it hangs half way down, and wide where it comes to rest.
    // tear(seconds) → { d: how far down the line has come (0…667), w: how far the bird has come out from under the lid (0…1) }
    var TEAR = [[0, 0], [.45, 0], [.8, 46, 1], [1.25, 400], [1.55, 424], [2.05, 676], [2.34, 667]], LANDS = 2.05, FLY0 = 2.36, FLY = 1.05, DIVER = 40;
    function tearAt(ts) {
      if (ts <= 0) return 0;
      for (var i = 1; i < TEAR.length; i++) if (ts < TEAR[i][0]) { var a = TEAR[i - 1], b = TEAR[i], u = (ts - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * (b[2] ? u * u : G.ease(u)); }   // (it lets go slowly)
      return 667;
    }
    function tear(ts) { return { d: tearAt(ts), w: G.clamp(ts / .75, 0, 1) }; }

    function layout() {
      var nw = host.clientWidth || innerWidth, nh = host.clientHeight || innerHeight;
      if (nw === w && nh === h && env) return;
      w = nw; h = nh; dpr = Math.min(window.devicePixelRatio || 1, 3);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + "px"; cv.style.height = h + "px";
      // a tall screen holds the plate as she drew it. A wide one gets the same plate larger, set at the right; its band runs off the right-hand edge;
      // the projection of the orbits is laid out as a diagram of its own at the lower left, and pale drafts lie across the rest
      wide = w >= 1000 && w / h > 1.25; lift = wide ? 150 : 0;
      s = wide ? h / 1400 : Math.min(w / 1000, h / 1500); k = s * dpr;
      var probe = document.createElement("div"); probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top);width:0;visibility:hidden"; document.body.appendChild(probe);
      safeTop = (probe.offsetHeight || 0) / s; probe.remove();
      var Wd = w / s, Hd = h / s; ox = wide ? Wd * .72 - 700 : (Wd - 1000) / 2; oy = wide ? Hd * .4 - 615 : (Hd - 1773) * .42; oyN = safeTop;   // her night page starts at the top of the screen (under the status bar)
      env = { left: -ox, right: Wd - ox, top: -oy, bottom: Hd - oy, wide: wide }; envN = { left: -ox, right: Wd - ox, top: -oyN, bottom: Hd - oyN, wide: wide };
      cache = {};
    }
    function layer(name, oyy, fn) {
      if (cache[name]) return cache[name];
      var c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
      var g = c.getContext("2d"); g.setTransform(k, 0, 0, k, ox * k, oyy * k); fn(g); return (cache[name] = c);
    }
    // paper grain, laid over the flat ground of either side so the home feels like the same sheet as the letter page
    function grain(dark) {
      var key = dark ? "gN" : "gD"; if (cache[key]) return cache[key];
      var S = 220, c = document.createElement("canvas"); c.width = c.height = S; var g = c.getContext("2d"), d = g.createImageData(S, S), r = G.rng(dark ? 5 : 6);
      for (var i = 0; i < d.data.length; i += 4) { var v = r(); if (v < .5) continue; d.data[i] = d.data[i + 1] = d.data[i + 2] = dark ? 236 : 36; d.data[i + 3] = (v - .5) * (dark ? 26 : 34); }
      g.putImageData(d, 0, 0); return (cache[key] = x.createPattern(c, "repeat"));
    }
    function ground(dark) { x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = dark ? C.night : C.paper; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = grain(dark); x.fillRect(0, 0, cv.width, cv.height); }
    var tt = 0;   // seconds on the clock every self-moving thing reads
    // a small sheet covering only rect = [x, y, w, h] of the page (the grain flickers between a few of these)
    function patchSheet(name, rect, fn) {
      if (cache[name]) return cache[name];
      var c = document.createElement("canvas"), kk = Math.min(k, 1.4); c.width = Math.ceil(rect[2] * kk); c.height = Math.ceil(rect[3] * kk);
      var g = c.getContext("2d"); g.setTransform(kk, 0, 0, kk, -rect[0] * kk, -rect[1] * kk); fn(g); return (cache[name] = c);
    }
    function sprite(name, fn) { return cache[name] || (cache[name] = fn(Math.min(k, 1.25))); }
    function comp(oyy) { x.setTransform(k, 0, 0, k, ox * k, oyy * k); }

    /* ── shared small things ── */
    function clock(E, col, dim, a) {
      var d = new Date(), y = E.top + 122 + safeTop;
      x.globalAlpha = a;
      G.text(x, two(d.getHours()) + ":" + two(d.getMinutes()), E.left + 64, y, "500 37px " + G.SERIF, col, "left", 2.5);
      var wd = x.measureText(two(d.getHours()) + ":" + two(d.getMinutes())).width + 12;
      G.text(x, two(d.getSeconds()), E.left + 64 + wd + 6, y, "400 17px " + G.SERIF, dim, "left", 1);
      G.text(x, DAYS[d.getDay()] + "  ·  " + d.getDate() + "  " + MON[d.getMonth()], E.left + 64, y + 29, "400 16px " + G.SERIF, dim, "left", 5);
      G.text(x, "age " + G.moonAge(d).toFixed(1) + " d     " + d.getFullYear() + " · " + two(d.getMonth() + 1) + " · " + two(d.getDate()), E.left + 62, E.bottom - 66, "400 17px " + G.SERIF, dim, "left", 3);
      x.globalAlpha = 1;
    }
    function label(a, px, py, f, col, dim, align) {
      var en = a.en || a.id, zh = a.zh || "";
      G.text(x, en, px, py, "italic 500 " + (29 + 8 * f) + "px " + G.SERIF, f > .5 ? col : dim, align);
      if (zh) G.text(x, zh, px + (align === "center" ? 3 : 0), py + 30 + 4 * f, "400 " + (19 + 3 * f) + "px " + G.HAN, f > .5 ? col : dim, align, 6);
    }
    function wrap(d) { d = ((d % N) + N) % N; return d > N / 2 ? d - N : d; }
    function diamond(px, py) { x.beginPath(); x.moveTo(px, py - 6); x.lineTo(px + 7, py + 12); x.lineTo(px, py + 30); x.lineTo(px - 7, py + 12); x.closePath(); x.fill(); }
    // where the chosen room sits, for the ring: { x, y, r, oy }
    function bobD() { return [BOB.day[0] - lift, BOB.day[1] - lift, BOB.day[2] - lift]; }
    function bobN() { var f = oy - oyN - lift; return [BOB.day[0] + f, BOB.day[1] + f, BOB.day[2] + f]; }   // at night the bob and the foot sit where they do by day on the screen
    function chosen() { return side ? { x: G.nightSlots[0].x, y: G.nightSlots[0].y, r: G.nightSlots[0].r, oy: oyN } : { x: EYE.x + Math.cos(120.5 * RAD) * 355, y: EYE.y + Math.sin(120.5 * RAD) * 355, r: 47, oy: oy }; }

    /* the sheets between the orbits and the plate: sketchbook leaves that are part of the page's motion. rv: how far each has been drawn in
       (a soft edge passes across it); turn: how far the sheet is turned about `mid` (the page turning over); bv: how far the bob is let
       down (they draw back). They give to the hand (the orbits behind them do not, so the two come apart as the hand moves); and under
       each lies its mask in the colour of the ground, so that the orbits do not show through what is drawn on it. */
    function drafts(night, E, a, rv, turn, mid, bv) {
      var list = G.drafts ? G.drafts(night, E) : [], i;
      for (i = 0; i < list.length; i++) {
        var d = list[i], al = a * d.a * (1 - .45 * bv); if (al <= .004 || rv <= .004) continue;
        var cx = d.x + d.w * d.pivot[0], cy = d.y + d.h * d.pivot[1];
        x.save(); x.globalAlpha = al;
        x.translate(-par.x * 22 * d.depth - 46 * bv * d.depth + 9 * Math.sin(orb * 1.2566) * d.depth, -par.y * 13 * d.depth + 36 * bv * d.depth);
        if (turn) { x.translate(mid[0], mid[1]); x.rotate(turn); x.translate(-mid[0], -mid[1]); }
        if (d.rot) { x.translate(d.x + d.w / 2, d.y + d.h / 2); x.rotate(d.rot); x.translate(-d.x - d.w / 2, -d.y - d.h / 2); }   // the leaf lies turned
        if (d.kn) { x.globalAlpha = Math.min(1, a * (1 - .45 * bv)) * .86 * Math.min(1, rv * 1.6); x.drawImage(d.kn, d.x, d.y, d.w, d.h); x.globalAlpha = al; }   // what is drawn on it is in front: the orbits behind do not show through its bodies
        if (rv < .999 || d.veil) {   // being drawn in (or taken out): a soft edge crossing the sheet aslant. Or half there: a band of clearness wandering over it
          var id = "wipe" + (night ? "N" : "D") + i, wc = cache[id] || (cache[id] = document.createElement("canvas")), kk = d.veil ? Math.min(k, 1.2) : k, pw = Math.max(2, Math.round(d.w * kk)), ph = Math.max(2, Math.round(d.h * kk));
          if (wc.width !== pw || wc.height !== ph) { wc.width = pw; wc.height = ph; wc.at = -1e9; }
          if (rv < .999 || Math.abs(tt - wc.at) > .07) {
            wc.at = rv < .999 ? -1e9 : tt;
            var g = wc.getContext("2d"), gr;
            g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, pw, ph); g.drawImage(d.im, 0, 0, pw, ph);
            if (d.veil) {   // the band goes up and down the sheet, slowly, and leans a little as it goes
              var c0 = .5 + .46 * Math.sin(tt * .21 + i), ln = .22 * Math.sin(tt * .13 + 1.3), lo = d.veil;
              gr = g.createLinearGradient(pw * (.5 - ln), ph * (c0 - .62), pw * (.5 + ln), ph * (c0 + .62));
              gr.addColorStop(0, "rgba(0,0,0," + lo + ")"); gr.addColorStop(.3, "rgba(0,0,0," + (lo + (1 - lo) * .45) + ")"); gr.addColorStop(.5, "#000"); gr.addColorStop(.7, "rgba(0,0,0," + (lo + (1 - lo) * .45) + ")"); gr.addColorStop(1, "rgba(0,0,0," + lo + ")");
              g.globalCompositeOperation = "destination-in"; g.fillStyle = gr; g.fillRect(0, 0, pw, ph);
            }
            if (rv < .999) { var e0 = rv * 1.45 - .4; gr = g.createLinearGradient(pw * e0, ph * .6, pw * (e0 + .34), ph * .25); gr.addColorStop(0, "#000"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.globalCompositeOperation = "destination-in"; g.fillStyle = gr; g.fillRect(0, 0, pw, ph); }
          }
          x.drawImage(wc, d.x, d.y, d.w, d.h);
        } else x.drawImage(d.im, d.x, d.y, d.w, d.h);
        x.restore();
      }
    }
    /* on a wide screen: the projection, large, across the left of the sheet behind everything — the orbits of the rooms thrown down
       onto a ruled plane and built up into an instrument (orrery.js), laid aslant the way the drafts' long line runs, with the lines
       that carry it down from the plate. rv: how far it is constructed; sw: how far its plane is swung up to face us (the page turning) */
    function diagram(night, a, bv, rv, sw) {
      if (a <= .004 || rv <= .002 || !G.orrery) return;
      // it is drawn on a sheet of its own and that sheet laid on the page: while only its own slow turning moves it, the sheet is redrawn
      // some twenty times a second, however often the page is (at night the stair wants every frame; the instrument does not)
      var oc = cache.orr; if (!oc) { oc = cache.orr = document.createElement("canvas"); oc.width = cv.width; oc.height = cv.height; cache.orrKey = ""; cache.orrAt = -1e9; }
      var key = [night ? 1 : 0, orb.toFixed(4), bv.toFixed(3), rv.toFixed(3), (sw || 0).toFixed(3)].join("|"), nowMs = tt * 1000;
      if (key !== cache.orrKey || Math.abs(nowMs - cache.orrAt) > (night ? 66 : 46)) {
        cache.orrKey = key; cache.orrAt = nowMs;
        var X0 = x, g = oc.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, oc.width, oc.height); g.setTransform(k, 0, 0, k, ox * k, (night ? oyN : oy) * k);
        x = g; try { paintDiagram(night, bv, rv, sw); } finally { x = X0; }
      }
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = a; x.drawImage(oc, 0, 0); x.restore();
    }
    function paintDiagram(night, bv, rv, sw) {
      var a = 1, E = night ? envN : env, F = G.FOOT, fy = night ? oy - oyN : 0, Wp = E.right - E.left, Hp = env.bottom - env.top;
      var K = Hp * .82 / 665, tilt = 58 * RAD, q = G.clamp(.62 + .1 * bv + .35 * (sw || 0), .14, .97);   // a great ellipse from the upper left down to the lower right, so large that its outer orbits run off the page
      var cx = E.left + Wp * .31 - 34 * bv, cy = env.top + Hp * .57 + fy + 24 * bv;   // (the mouse does not move it: it is the far background)
      var top = night ? [560, 480, 455] : [EYE.x, EYE.y, 664], ax = cx - top[0], ay = cy - top[1], al = Math.hypot(ax, ay) || 1, nx = -ay / al, ny = ax / al, A = 665 * K, ua = G.ease(G.seg(rv, .25, .6));
      if (ua > 0) {   // carried down from the plate: from the middle of what is above, and from its two edges
        x.save(); x.globalAlpha = a * ua;
        var H = G.hand(x, 31, { stroke: night ? "rgba(240,237,230,.24)" : "rgba(46,46,54,.3)", strokeWidth: 1.2, roughness: 1.8, bowing: 1.2, strokeLineDash: [11, 9], disableMultiStroke: true });
        H.line(top[0], top[1], cx, cy);
        H.line(top[0] + nx * top[2], top[1] + ny * top[2], cx - Math.cos(tilt) * A, cy - Math.sin(tilt) * A); H.line(top[0] - nx * top[2], top[1] - ny * top[2], cx + Math.cos(tilt) * A, cy + Math.sin(tilt) * A);
        x.restore();
      }
      G.orrery(x, { cx: cx, cy: cy, K: K, tilt: tilt, q: q, night: night, orb: orb, time: tt, a: a, rv: rv, foot: function (pencils) {
        pencils.q = q; x.save(); x.translate(-F.x, -F.y); G.foot(x, night, orb + tt / 13, true, pencils);   // her orbits go round too, clockwise, the inner ones faster
        x.fillStyle = pencils.blue; x.beginPath(); x.arc(F.x, F.y - 420 * q, 9 + 3 * bv, 0, TAU); x.fill(); x.strokeStyle = pencils.ln; x.lineWidth = 1; x.beginPath(); x.arc(F.x, F.y - 420 * q, 13 + 3 * bv, 0, TAU); x.stroke();   // the dot the bob is let down to, where it falls in the projection
        x.restore();
      } });
      x.save(); x.globalAlpha = a * G.ease(G.seg(rv, .85, 1)); x.translate(cx, cy); x.rotate(tilt); x.scale(K, K);
      G.text(x, "PROJECTION  ·  " + (night ? "the rail" : "the orbits"), -10, 356 * q / .62, "400 12px " + G.SERIF, night ? "rgba(240,237,230,.4)" : "rgba(40,40,48,.42)", "left", 6);
      x.restore();
    }

    /* ── day ── */
    function drawDay(bv, lv) {
      ground(false); bv = G.clamp(bv, 0, 1); lv = lv || 0;
      comp(oy);
      if (wide) diagram(false, .36 - .2 * bv, bv, Math.min(G.seg(openT, .7, 1), 1 - lv), G.ease(lv));   // the instrument is constructed while the eye opens, and taken down again as the page turns
      drafts(false, env, 1 - .25 * lv, Math.min(G.ease(G.seg(openT, .5, 1)), 1 - lv), lv * 10 * RAD, [EYE.x, EYE.y], bv);
      x.setTransform(1, 0, 0, 1, 0, 0);
      var T = openT, live = T >= 1 && !flip;
      // the band comes down from the top of the page; the pencil work fades in after it
      var bd = G.out(G.seg(T, .79, .865)), drop = -(1 - bd) * (1040 - env.top), bandBottom = 742 + drop, sk = G.ease(G.seg(T, .92, 1)) * (1 - .82 * bv) * (1 - lv);
      var band = function () { return layer("dayBand", oy, function (g) { G.dayBand(g, env); }); }, sketch = function () { return layer("daySketch", oy, function (g) { G.daySketch(g, env); }); };
      if (T >= 1 && bv === 0 && lv === 0) {   // nothing is moving them: one sheet instead of two
        if (!cache.dayAll) { var ca = document.createElement("canvas"); ca.width = cv.width; ca.height = cv.height; var ga = ca.getContext("2d"); ga.drawImage(band(), 0, 0); ga.drawImage(sketch(), 0, 0); cache.dayAll = ca; }
        x.drawImage(cache.dayAll, 0, 0);
      } else {
        if (bd > 0) x.drawImage(band(), 0, drop * k);
        if (sk > 0) { x.globalAlpha = sk; x.drawImage(sketch(), -40 * bv * k, 38 * bv * k); x.globalAlpha = 1; }
      }
      comp(oy); hits = [];
      // the grain the band comes apart into, flickering like film; the dotted great circle, its dots creeping round
      if (bd > 0) { var GR = G.grainRect(env); x.drawImage(patchSheet("grain", GR, function (g) { G.dayGrain(g, 11, env); }), GR[0], GR[1] + drop, GR[2], GR[3]); }
      // what goes round: the marks on the great circles are bodies on orbits, and so is the pale moon that shows against the band.
      // Turning the menu sends them on round the eye, each circle at its own rate.
      if (sk > 0) {
        if (!wide) { x.save(); x.translate(-40 * bv, 38 * bv - lift); x.globalAlpha = sk; G.foot(x, false, orb); x.restore(); }
        x.save(); x.translate(-40 * bv, 38 * bv);
        G.dayMarks.forEach(function (m) { var span = m[5] - m[4], a = m[4] + ((((m[1] - m[4] + m[3] * orb) % span) + span) % span); x.globalAlpha = sk * G.clamp(Math.min(a - m[4], m[5] - a) / 7, 0, 1); G.dayMark(x, m[0], a, m[2]); });
        x.restore(); x.globalAlpha = 1;
      }
      if (bd > 0) {
        x.save(); x.beginPath(); x.rect(678, env.top, G.bandRight(env) - 678, Math.max(0, bandBottom - env.top)); x.clip();
        var ma = (-64 - 25 * orb) * RAD; x.fillStyle = "#DDDAD3"; x.beginPath(); x.arc(EYE.x + Math.cos(ma) * 244, EYE.y + Math.sin(ma) * 244, 37, 0, TAU); x.fill();
        x.fillStyle = "rgba(240,237,230,.75)"; [[868, 440, 150, 30, -18], [868, 440, 186, 200, 11], [868, 440, 96, 120, 27], [748, 388, 26, 0, 40]].forEach(function (r) { var a = (r[3] + r[4] * orb) * RAD; x.beginPath(); x.arc(r[0] + Math.cos(a) * r[2], r[1] + Math.sin(a) * r[2], 3, 0, TAU); x.fill(); });
        x.restore();
      }
      var rnd = G.rng(9);
      // before the eye opens: a lash, two construction lines, a line of small print
      var lash = 1 - G.ease(G.seg(T, .84, .93)), cap = 1 - G.ease(G.seg(T, 0, .06));
      if (lash > 0) {
        x.strokeStyle = C.line; G.pencil(x, rnd, 500, 60, 500, 520, .5 * lash); x.globalAlpha = .4 * lash; x.lineWidth = 1; G.arc(x, G.LID.x, G.LID.y, G.LID.r, 192 * RAD, 232 * RAD); x.globalAlpha = lash;
        x.fillStyle = C.ink; x.beginPath(); x.moveTo(148, 598); x.quadraticCurveTo(520, 762, 1004, 546); x.quadraticCurveTo(520, 773, 148, 598); x.fill(); x.globalAlpha = 1;
      }
      if (cap > 0) {
        var by = env.bottom - 196, d = new Date(); x.globalAlpha = cap; x.fillStyle = C.ink;
        x.fillRect(env.left + 62, by - 44, 48, 1.6);
        G.text(x, "touch, and the eye opens", env.left + 62, by, "italic 400 30px " + G.SERIF, "rgba(40,40,48,.8)", "left", .5);
        G.text(x, "轻触  ·  睁眼", 62, by + 38, "400 19px " + G.HAN, "rgba(40,40,48,.7)", "left", 6);
        G.text(x, d.getFullYear() + " · " + two(d.getMonth() + 1) + " · " + two(d.getDate()) + "  ·  " + two(d.getHours()) + ":" + two(d.getMinutes()), env.left + 62, by + 74, "400 16px " + G.SERIF, "rgba(40,40,48,.45)", "left", 3);
        x.globalAlpha = 1;
      }
      if (T <= 0) return;
      // the first lines: the diagonal, then the arc the rooms will hang on
      var ln = G.out(G.seg(T, .44, .57));   // (they wait until the tear has come to rest)
      if (ln > 0) { x.strokeStyle = "rgba(40,40,48,.55)"; x.lineWidth = 1.1; x.beginPath(); x.moveTo(1000, 108); x.lineTo(1000 - 420 * ln, 108 + 760 * ln); x.stroke(); }
      var ar = G.ease(G.seg(T, .48, .7)), fin = G.ease(G.seg(T, .92, 1));
      if (ar > 0 && fin < 1) {   // the arc the rooms will hang on, drawn from the corner of the eye round under it; and the dotted one over the tower
        x.globalAlpha = 1 - fin; x.strokeStyle = "rgba(40,40,48,.55)"; x.lineWidth = 1.2; G.arc(x, EYE.x, EYE.y, 355, (168 - 152 * ar) * RAD, 168 * RAD);
        x.fillStyle = C.ink; x.beginPath(); x.arc(EYE.x + Math.cos((168 - 152 * ar) * RAD) * 355, EYE.y + Math.sin((168 - 152 * ar) * RAD) * 355, 3.2, 0, TAU); x.fill();
        var da = G.ease(G.seg(T, .46, .58)) * (1 - sk); if (da > 0) { x.globalAlpha = da; x.strokeStyle = "rgba(30,30,36,.8)"; x.lineWidth = 2.2; x.setLineDash([.5, 8]); x.beginPath(); x.moveTo(172, 352); x.quadraticCurveTo(196, 176, 376, 125); x.stroke(); x.setLineDash([]); }
        x.globalAlpha = 1;
      }
      // the disc; its grain flickers too
      var ds = G.out(G.seg(T, .85, .95)) * (1 - .55 * lv);
      if (ds > 0) { var sp = sprite("disc", G.discSprite), hf = sp.half * ds; x.drawImage(sp.img, EYE.x - hf, EYE.y - hf, hf * 2, hf * 2); }
      if (ds > .9 && lv === 0) {
        x.save(); x.beginPath(); x.arc(EYE.x, EYE.y, EYE.r, 0, TAU); x.clip(); x.strokeStyle = "rgba(240,237,230,.85)"; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(EYE.x - 2, EYE.y); x.lineTo(EYE.x - 2, EYE.y + EYE.r); x.moveTo(1000, 108); x.lineTo(580, 868); x.stroke(); x.restore();
      }
      // swallows. When the eye opens each flies in from below, joins the ring a
      // little way back and comes along it clockwise into its place — the lower lid from its inner tip, the upper lid
      // from its far end — beating through the twelve instants. When the page turns they leave the same way they face.
      var birds = [], flow = 0;
      if (T >= 1) { if (!flowAt) flowAt = tt; var ft = tt - flowAt; flow = (ft - 1.6 * (1 - Math.exp(-ft / 1.6))) / PLACE_S; } else flowAt = 0;   // they set off gently once the eye is open
      G.dayBirds.forEach(function (b, j) {
        var st = starts[j], t = G.seg(T, st.t0, st.t0 + .2); if (t <= 0) return;
        var px = b.x, py = b.y, hh = b.h, f = b.f, sz = b.s, ba = 1;
        if (t < 1) {
          var e = G.ease(t), SPL = .58, BACK = .11;
          if (b.u == null) { var q0 = G.out(t); px = G.lerp(st.x, b.x, q0); py = G.lerp(st.y, b.y, q0); hh = b.h; }
          else if (e < SPL) {   // in from below, on a curve that meets the ring along its own direction
            var q = e / SPL, A = G.lidTrack(b.u - BACK), cx = A.x - Math.cos(A.h) * 260, cy = A.y - Math.sin(A.h) * 260, m = 1 - q;
            px = m * m * st.x + 2 * m * q * cx + q * q * A.x; py = m * m * st.y + 2 * m * q * cy + q * q * A.y;
            hh = Math.atan2(2 * m * (cy - st.y) + 2 * q * (A.y - cy), 2 * m * (cx - st.x) + 2 * q * (A.x - cx));
          } else { var tr = G.lidTrack(b.u - BACK * (1 - (e - SPL) / (1 - SPL))); px = tr.x; py = tr.y; hh = tr.h + (b.h - tr.h) * G.seg(e, .9, 1); }
          f = t > .96 ? b.f : G.instant(tt / G.BEAT + st.ph); sz = b.s * (.72 + .28 * e);
        } else if (b.u != null && flow > 0) { var lf = lidFlow(j, flow); px = lf.x; py = lf.y; hh = lf.h; sz = lf.s; f = lf.f; ba = lf.a; if (lf.ghost && lv === 0) birds.push({ x: lf.ghost.x, y: lf.ghost.y, s: lf.ghost.s, h: lf.ghost.h, f: lf.ghost.f, a: lf.ghost.a }); }
        if (lv > 0) { var fl = lv * (360 + 90 * (j % 4)), fh = hh + lv * (j % 2 ? .45 : -.35); px += Math.cos(fh) * fl; py += Math.sin(fh) * fl; hh = fh; f = G.instant(tt / G.BEAT + st.ph); }
        birds.push({ x: px, y: py, s: sz, h: hh, c: b.c, f: f, rim: b.rim, flip: b.flip, a: ba });
      });
      var fly = function (white) { birds.forEach(function (b) { if (b.a <= .01 || (white && b.c)) return; x.globalAlpha = b.a; G.swallow(x, b.x, b.y, b.s, b.h, white ? C.white : b.c === "grey" ? "#A9A7A2" : C.blue, { f: b.f, rim: b.rim, flip: b.flip }); }); x.globalAlpha = 1; };
      fly(false);
      if (ds > .5 || bd > 0) {
        x.save(); x.beginPath();
        if (ds > .5) { x.arc(EYE.x, EYE.y, EYE.r * ds, 0, TAU); x.closePath(); }
        if (bd > 0) x.rect(678, env.top, G.bandRight(env) - 678, Math.max(0, bandBottom - env.top));
        x.clip(); fly(true); x.restore();
      }
      // the pupil, breathing
      var pu = G.out(G.seg(T, .9, .97));
      if (pu > 0) {
        x.fillStyle = C.white; x.beginPath(); x.arc(EYE.x, EYE.y, 48 * pu, 0, TAU); x.fill();
        x.fillStyle = C.ink; x.beginPath(); x.arc(EYE.x, EYE.y, 22 * pu * (1 + 1.1 * lv), 0, TAU); x.fill();
      }
      // the plumb line: the track of a swallow that falls like a tear from under the closed lid; then hung from under the eye. It follows the hand exactly.
      var B = bobD(), TS = T * OPEN_MS / 1000, tr = T < 1 ? tear(TS) : { d: 667, w: 1 }, landed = T >= 1 ? 1 : G.ease(G.seg(TS, LANDS, LANDS + .34));
      var top = G.lerp(655, 900, G.ease(G.seg(T, .86, .96))), tip = 655 + tr.d * (B[0] - 655) / 667 + (B[1] - B[0]) * bv;
      x.strokeStyle = C.blue; x.fillStyle = C.blue; x.lineWidth = G.lerp(1.5, 2.4, landed);   // a wet track at first, thin; a ruled line once the drop has come to rest
      if (tip > top + 1) { x.beginPath(); x.moveTo(697, top); x.lineTo(697, tip); x.stroke(); }
      if (T > .88) x.fillRect(692, top - 5, 10, 10);
      if (tip > 1090 - lift) { var bd0 = T < 1 ? G.out(G.seg(TS, 1.3, 1.6)) : 1; x.beginPath(); x.arc(697, 1076 - lift * .6, 3.5 * bd0, 0, TAU); x.fill(); }   // the bead it left where it hung
      if (landed > 0 && tip > 1180 - lift) { var nk = 20 * Math.sin(Math.PI * bv); x.globalAlpha = landed; x.lineWidth = 5; x.beginPath(); x.moveTo(697, tip - 36 - nk); x.lineTo(697, tip - 2); x.stroke(); x.beginPath(); x.arc(697, tip - 40 - nk, 5.5, 0, TAU); x.fill(); x.globalAlpha = 1; }
      if (landed > 0) { x.globalAlpha = landed; diamond(697, tip); x.globalAlpha = 1; }
      if (T < 1) {   // the swallow that is the tear
        var SD = DIVER;
        if (TS < FLY0) {   // falling: folded, seen from above, nose down. It comes out from under the lid (it is cut off by the lid's lower edge)
          var py9 = tip + .25 * SD - (.92 * SD + 5) * (1 - G.ease(tr.w)), unf = G.ease(G.seg(TS, LANDS - .04, FLY0 + .1));   // unf: it unfolds as it comes to rest
          x.save(); x.beginPath(); x.moveTo(148, 598); x.quadraticCurveTo(520, 773, 1004, 546); x.lineTo(1004, 4000); x.lineTo(148, 4000); x.closePath(); x.clip();
          var half = G.ease(G.seg(TS, 1.02, 1.42));   // braking into the place where it hangs, its wings come a little way out; they stay so for the rest of the fall
          G.swallow(x, 697, py9, SD, 90 * RAD, C.blue, { spread: true, f: 100 + 3 - .95 * half - 1.55 * unf, rim: false });
          x.restore();
        } else {           // and off, round to the left and in beside the dot, where it stays
          var uf = G.clamp((TS - FLY0) / FLY, 0, 1), ef = G.ease(uf), P0 = [697, B[0] + .25 * SD], P3 = [664, 1368], P1 = [P0[0] - 6, P0[1] + .45 * (P3[1] - P0[1]) + 30], P2 = [P3[0] - 63, P3[1] - 11.1], mf = 1 - ef;
          var bxp = mf * mf * mf * P0[0] + 3 * mf * mf * ef * P1[0] + 3 * mf * ef * ef * P2[0] + ef * ef * ef * P3[0], byp = mf * mf * mf * P0[1] + 3 * mf * mf * ef * P1[1] + 3 * mf * ef * ef * P2[1] + ef * ef * ef * P3[1];
          var tgx = 3 * mf * mf * (P1[0] - P0[0]) + 6 * mf * ef * (P2[0] - P1[0]) + 3 * ef * ef * (P3[0] - P2[0]), tgy = 3 * mf * mf * (P1[1] - P0[1]) + 6 * mf * ef * (P2[1] - P1[1]) + 3 * ef * ef * (P3[1] - P2[1]);
          var hd = uf >= 1 ? 10 * RAD : Math.atan2(tgy, tgx), szf = SD + (13 - SD) * ef, posf = .5 + (-3 - .5) * ef, ff = uf >= 1 ? 9 : 100 + ((posf % 12) + 12) % 12, side9 = G.ease(G.seg(uf, .08, .5));
          if (side9 < 1) { x.globalAlpha = 1 - side9; G.swallow(x, bxp, byp, szf, hd, C.blue, { spread: true, f: ff, rim: false }); }   // seen from above, it turns on its side as it goes
          if (side9 > 0) { x.globalAlpha = side9; G.swallow(x, bxp, byp, szf, hd, C.blue, { f: ff }); }
          x.globalAlpha = 1;
        }
        x.fillStyle = C.blue;
      }
      if (T < 1 && TS > LANDS) {   // where it comes to rest the page gives, once: two rings going out and away, as on water
        var up2 = (TS - LANDS) / 1.25, j2;
        for (j2 = 0; j2 < 2; j2++) { var uu = G.clamp(up2 - j2 * .2, 0, 1); if (uu <= 0 || uu >= 1) continue; var rad = 20 + 150 * G.out(uu); x.globalAlpha = .5 * (1 - uu) * (1 - uu); x.strokeStyle = C.blue; x.lineWidth = 1.3; x.beginPath(); x.ellipse(697, B[0] + 30, rad, rad * .36, 0, 0, TAU); x.stroke(); }
        x.globalAlpha = 1;
      }
      if (fin > 0) {
        x.globalAlpha = fin;
        if (B[2] - tip > 52) { x.strokeStyle = "rgba(40,40,48,.6)"; x.lineWidth = 1.6; x.setLineDash([.5, 7]); x.beginPath(); x.moveTo(699, tip + 44); x.lineTo(700, B[2] - 14); x.stroke(); x.setLineDash([]); }
        x.fillStyle = C.blue; x.beginPath(); x.arc(700, B[2], 10.5 + 2.5 * bv, 0, TAU); x.fill();
        if (overBob || bv > 0) { x.strokeStyle = C.blue; x.lineWidth = 1.4; x.globalAlpha = fin * (overBob ? .7 : .7 * bv); G.arc(x, 700, B[2], 21 + 5 * bv, 0, TAU); x.globalAlpha = fin; }
        G.text(x, "12", 718, B[2] + 6, "400 16px " + G.SERIF, "rgba(40,40,48,.5)", "left", 1);
        // the small swallow that keeps the bob company: it hovers by it, and goes down with it
        if (T >= 1) G.swallow(x, G.lerp(664, 684, bv), G.lerp(1368, B[2] - 16, bv), 13, G.lerp(10, 58, bv) * RAD, C.blue, { f: bv > 0 ? G.instant(tt / G.BEAT) : 9 });   // (while the page opens it is still on its way here: it is the one that fell)
        x.fillStyle = C.blue; x.fillRect(env.left + 25, 612, 48, 9);
        if (live) hits.push({ x: env.left + 49, y: 616, r: 60, fn: function () { if (opt.drawer) opt.drawer(); } });
        // the orbit and its moons
        x.strokeStyle = "rgba(40,40,48,.62)"; x.lineWidth = 1.2; G.arc(x, EYE.x, EYE.y, 355, 76 * RAD, 166 * RAD);
        x.fillStyle = C.ink; x.beginPath(); x.arc(EYE.x + Math.cos(166 * RAD) * 355, EYE.y + Math.sin(166 * RAD) * 355, 3.5, 0, TAU); x.fill();
        apps.forEach(function (a, i2) {
          var kf = wrap(i2 - selA), ak = Math.abs(kf), al = G.clamp(2.62 - ak, 0, 1); if (al <= 0) return;
          var ang = (120.5 - kf * 18) * RAD, r = ak < 1 ? G.lerp(47, 21, ak) : ak < 2 ? G.lerp(21, 14, ak - 1) : 14, f = G.clamp(1 - ak, 0, 1);
          var mx = EYE.x + Math.cos(ang) * 355, my = EYE.y + Math.sin(ang) * 355;
          x.globalAlpha = al * fin;
          G.moon(x, mx, my, r, 1 - .34 * Math.min(ak, 2), C.blue, G.rng(100 + i2), 38 * RAD + kf * .5);
          var lr = r + 44 + 10 * f; label(a, mx + Math.cos(ang) * lr * .92 - 4, my + Math.sin(ang) * lr + 10, f, C.blue, "rgba(60,60,70,.62)", "center");
          var k2 = Math.round(kf);
          if (live) hits.push({ x: mx, y: my + 20, r: Math.max(48, r + 30), fn: k2 === 0 ? function () { enter(a); } : function () { turn(k2); } });
        });
        x.globalAlpha = 1;
        clock(env, "rgba(40,40,48,.82)", "rgba(40,40,48,.45)", fin);
      }
    }

    /* ── night. build: how much of the stair has been laid (1 = all of it) ── */
    function drawNight(build, bv, tf) {
      ground(true); bv = G.clamp(bv, 0, 1);
      var done = build >= 1, late = done ? 1 : G.ease(G.seg(build, .5, .95)), live = done && !flip;
      comp(oyN); var nrv = done ? 1 : G.ease(G.seg(build, .3, .95)); if (wide) diagram(true, .56 - .26 * bv, bv, done ? 1 : G.seg(build, .2, 1), 1 - nrv);
      drafts(true, envN, 1, nrv, -(1 - nrv) * 10 * RAD, [WELL.x, WELL.y], bv);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = (done ? 1 : G.ease(G.seg(build, .15, .7))) * (1 - .5 * bv); x.drawImage(layer("nightBack", oyN, function (g) { G.nightBack(g, envN); }), -40 * bv * k, 38 * bv * k); x.globalAlpha = 1;
      comp(oyN); hits = [];
      var fy = oy - oyN, under = sprite("stairU", G.stairUnder), over = sprite("stairO", G.stairOver);
      if (!wide) { x.save(); x.translate(-40 * bv, 38 * bv + fy - lift); x.globalAlpha = (done ? 1 : G.ease(G.seg(build, .15, .7))) * (1 - .5 * bv); G.foot(x, true, orb); x.restore(); }
      if (done) { x.drawImage(under.img, 0, 0, under.w, under.h); G.stairTreads(x, tt); x.drawImage(over.img, 0, 0, over.w, over.h); }   // each tread by itself, played like a keyboard; the rails lie over them
      else {
        G.stairBuild(x, build); var mix = G.seg(build, .8, 1);
        if (mix > 0) { x.globalAlpha = mix; x.drawImage(under.img, 0, 0, under.w, under.h); G.stairTreads(x, null); x.drawImage(over.img, 0, 0, over.w, over.h); x.globalAlpha = 1; }
      }
      if (late > 0) nightBirds(late);
      if (!done) {   // the swallows that were the eye's lids are loose in the dark; they spread out from it, and settle as the stair reaches them
        var loose = 1 - G.ease(G.seg(build, .45, .92)), rb = G.rng(57), out = tf == null ? 1 : .22 + .78 * G.out(G.clamp(tf / 1.1, 0, 1));
        if (loose > 0) { x.globalAlpha = loose; for (var q = 0; q < 24; q++) { var an = rb() * TAU, rr = (130 + rb() * 640) * out, tw = an + build * (.9 + rb()), sz = 22 + rb() * 34, pq = tt / G.BEAT + rb();
          G.swallow(x, WELL.x + Math.cos(tw) * rr, WELL.y + Math.sin(tw) * rr * 1.2, sz, tw + Math.PI / 2 + (rb() - .5) * .8, q % 6 === 0 ? C.grey : C.white, { f: G.instant(pq), rim: false }); } x.globalAlpha = 1; }
      }
      // the bottom of the well, and the line let down into it
      var B = bobN(), tip = G.lerp(B[0], B[1], bv);
      x.strokeStyle = "rgba(240,237,230,.8)"; x.lineWidth = 1.3; x.beginPath(); x.moveTo(WELL.x, WELL.y + 16); x.lineTo(WELL.x, tip); x.stroke();
      x.fillStyle = C.blue; [872, 1056].forEach(function (y) { if (y < tip - 60) { x.beginPath(); x.arc(WELL.x, y, 4, 0, TAU); x.fill(); } });
      var nk = 20 * Math.sin(Math.PI * bv); x.strokeStyle = C.blue; x.lineWidth = 5; x.beginPath(); x.moveTo(WELL.x, tip - 36 - nk); x.lineTo(WELL.x, tip - 2); x.stroke();
      x.beginPath(); x.arc(WELL.x, tip - 40 - nk, 6, 0, TAU); x.fill(); diamond(WELL.x, tip);
      G.swallow(x, G.lerp(704, 712, bv), G.lerp(B[0] + 48, B[2] - 18, bv), 14, G.lerp(14, 60, bv) * RAD, C.white, { f: bv > 0 ? G.instant(tt / G.BEAT) : 9, rim: false });
      if (B[2] - tip > 52) { x.strokeStyle = "rgba(240,237,230,.55)"; x.lineWidth = 1.6; x.setLineDash([.5, 7]); x.beginPath(); x.moveTo(WELL.x - 2, tip + 44); x.lineTo(702, B[2] - 16); x.stroke(); x.setLineDash([]); }
      x.fillStyle = C.blue; x.strokeStyle = C.white; x.lineWidth = 2; x.beginPath(); x.arc(700, B[2], 11.5 + 2.5 * bv, 0, TAU); x.fill(); x.stroke();
      if (overBob || bv > 0) { x.lineWidth = 1.2; x.globalAlpha = overBob ? .7 : .7 * bv; G.arc(x, 700, B[2], 23 + 5 * bv, 0, TAU); x.globalAlpha = 1; }
      G.text(x, "12", 720, B[2] + 6, "400 16px " + G.SERIF, "rgba(240,237,230,.5)", "left", 1);
      if (live) hits.push({ x: envN.left + 49, y: 616, r: 60, fn: function () { if (opt.drawer) opt.drawer(); } });
      // the rooms are moons on the rail. The stair does not turn: turning the menu sends every moon a place on round the rail,
      // clockwise, and the last one comes round to the foot of the crescent and climbs it, growing, to be the chosen one.
      if (late > 0) {
        var S = G.nightSlots, fade = (1 - G.clamp(Math.abs(selA - Math.round(selA)) * 2.4, 0, 1)) * late, near = ((Math.round(selA) % N) + N) % N;
        var moonAt = function (sv) { var m = G.railAt(sv); if (m.r < .8) return; x.globalAlpha = late * G.clamp(m.r / 6, 0, 1); G.nightMoon(x, sv); x.globalAlpha = 1; };
        apps.forEach(function (a, i) { var pv = (((selA - i) % N) + N) % N; if (pv > N - 1) moonAt(pv - N); moonAt(pv); });
        S.forEach(function (sl, j) {
          if (j >= N) return;
          var i2 = ((near - j) % N + N) % N, a = apps[i2], kk = wrap(i2 - near);
          x.globalAlpha = fade; label(a, sl.lx, sl.ly, j === 0 ? 1 : 0, C.white, "rgba(240,237,230,.72)", sl.al); x.globalAlpha = 1;
          if (live) { hits.push({ x: sl.x, y: sl.y, r: Math.max(52, sl.r + 26), fn: j === 0 ? function () { enter(a); } : function () { turn(kk); } }); if (j === 0) hits.push({ x: sl.lx + 40, y: sl.ly, r: 70, fn: function () { enter(a); } }); }
        });
      }
      clock(envN, "rgba(240,237,230,.86)", "rgba(240,237,230,.42)", 1);
    }

    /* the swallows going down the well. Each keeps its own lane and pace; its body rides its wingbeat (lifts, dips, surges a
       little on the downstroke), the wings blended from instant to instant. A swallow is the colour of what it is not:
       white over the dark, blue over the paper of a tread, grey over a string — and two of them where it lies across an edge. */
    function nightBirds(alpha) {
      var LAP = G.STAIR_LAP, NB = 18, list = [], R = G.stairRegions, i;
      for (i = 0; i < NB; i++) {   // evenly apart in time, all at the path's own pace, so none ever catches another up
        var sb = G.stairFlight(tt + i * LAP / NB), f = G.flight(tt, i), pos = (f - 100) % 12, lift = pos < 6 ? Math.sin(pos / 6 * Math.PI) : 0;   // it rises a touch on the beat
        list.push({ x: sb.x + Math.sin(sb.h) * lift * sb.s * .05, y: sb.y - Math.cos(sb.h) * lift * sb.s * .05, s: sb.s, h: sb.h, f: f, a: G.clamp(sb.u / .015, 0, 1) * G.clamp((1 - sb.u) / .04, 0, 1) });
      }
      var pass = function (col) { list.forEach(function (b) { x.globalAlpha = alpha * b.a; G.swallow(x, b.x, b.y, b.s, b.h, col, { f: b.f, rim: false }); }); x.globalAlpha = 1; };
      pass(C.white);
      x.save(); x.clip(R.paper); pass(C.blue); x.restore();
    }

    // a moon on the dial: all grain, thicker to one side
    /* ── the dial: a paper disc in the corner for a room that has rooms inside ── */
    function drawDial(now) {
      var d = dial, A = G.out(G.clamp((now - d.t0) / 460, 0, 1)); if (d.closing) A = 1 - A;
      if (d.closing && A <= 0) { dial = null; return; }
      var E = side ? envN : env, list = d.app.apps, n = list.length, SK = G.sk; if (!SK) return;
      x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = side ? "rgba(27,26,32," + .55 * A + ")" : "rgba(236,233,226," + .6 * A + ")"; x.fillRect(0, 0, cv.width, cv.height);
      comp(side ? oyN : oy);
      var R0 = 656, cx = (wide ? -150 : E.left) - 49, cy = E.bottom - 10, R = R0 * (.7 + .3 * A), spin = (1 - A) * -.8 + d.rot;   // its middle is the corner of the page
      d.cx = cx; d.cy = cy; d.R = R;
      // It is drawn by hand, like the rest of the page: in pencil (a soft lead; a blue one), every stroke made once and kept, so that the
      // wheel can be turned without being redrawn — its rim gone over twice, its rings not quite round, its swallows and its moons shaded in.
      SK.wf(1.25);
      var lead = function (a) { return SK.pen(x, "leadDial", [50, 50, 58], a); }, blue = function (a) { return SK.pen(x, "blueDial", [36, 46, 184], a); }, out9 = function (a) { return side ? SK.pen(x, "chalkDial", [240, 237, 230], a) : lead(a); };
      var mk = SK.made, lay = function (dr) { SK.put(x, dr); }, O = SK.opts, j, t;
      x.save(); x.translate(cx, cy); x.scale(R / R0, R / R0);
      // beyond its edge: the round it was struck from, and a longer one, broken — in chalk on the dark side
      x.save(); x.rotate(spin * .35); x.globalAlpha = A;
      lay(mk("dl_out" + side, function (g) { return [g.arc(0, 0, R0 * 2.2, R0 * 2.2, -2.3, .4, false, O({ seed: 2501, roughness: 1.2, strokeWidth: 1.2, stroke: out9(.5), strokeLineDash: [20, 13], disableMultiStroke: true, curveFitting: .99 })),
        g.arc(0, 0, R0 * 2.56, R0 * 2.56, -1.9, -.2, false, O({ seed: 2503, roughness: 1.2, strokeWidth: 1.1, stroke: out9(.36), disableMultiStroke: true, curveFitting: .99 }))]; }));
      x.restore(); x.globalAlpha = 1;
      // the disc: paper, with its grain
      x.fillStyle = "#F3F1EC"; x.beginPath(); x.arc(0, 0, R0, 0, TAU); x.fill(); x.fillStyle = grain(false); x.fill();
      x.save(); x.rotate(spin);
      lay(mk("dl_rim", function (g) { return [g.circle(0, 0, R0 * 2, O({ seed: 2001, roughness: 1.1, strokeWidth: 2.3, stroke: lead(.95), curveFitting: .997 })), g.circle(0, 0, R0 * 1.956, O({ seed: 2003, roughness: 1.4, strokeWidth: 1.1, stroke: lead(.55), disableMultiStroke: true, curveFitting: .995 }))]; }));
      lay(mk("dl_rings", function (g) {
        var out = [.664, .435, .293].map(function (f, i) { return g.circle(0, 0, R0 * f * 2, O({ seed: 2010 + i, roughness: 1.3, strokeWidth: 1.2, stroke: lead(.5), curveFitting: .988 })); });
        out.push(g.circle(0, 0, R0 * .238 * 2, O({ seed: 2015, roughness: 1, strokeWidth: 1.9, stroke: lead(.72), strokeLineDash: [1.5, 9], disableMultiStroke: true, curveFitting: .992 })));
        for (var t2 = 0; t2 < 38; t2++) { var a = t2 * TAU / 38, big = t2 % 4 === 0, r0 = R0 * (big ? .97 : .984), r1 = R0 * (big ? 1.024 : 1.012); out.push(g.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a + .004) * r1, Math.sin(a + .004) * r1, O({ seed: 2100 + t2, roughness: .8, strokeWidth: big ? 1.5 : 1.2, stroke: lead(.8), disableMultiStroke: !big }))); }
        // the marks a hand leaves setting such a thing out: a chord ruled across it, small crosses where it was measured, a square shaded in
        out = out.concat(SK.longLine(g, -R0 * .93, -R0 * .3, R0 * .2, -R0 * .96, O({ seed: 2601, roughness: 1.2, strokeWidth: 1, stroke: lead(.26), disableMultiStroke: true })));
        [[-.52, -.6], [.1, -.78], [-.8, -.2], [-.3, -.36]].forEach(function (c, i) { var px = c[0] * R0, py = c[1] * R0; out.push(g.line(px - 9, py, px + 9, py + 1, O({ seed: 2610 + i, roughness: 1, strokeWidth: 1.1, stroke: lead(.5), disableMultiStroke: true }))); out.push(g.line(px, py - 9, px + 1, py + 9, O({ seed: 2620 + i, roughness: 1, strokeWidth: 1.1, stroke: lead(.5), disableMultiStroke: true }))); });
        out.push(g.rectangle(-R0 * .2, -R0 * .9, 15, 15, O({ seed: 2631, roughness: 1, strokeWidth: 1, stroke: lead(.7), fill: lead(.9), fillStyle: "cross-hatch", hachureGap: 2.6, fillWeight: 1.2 })));
        return out;
      }));
      x.restore();
      var P0 = -44.2 * RAD, SEL = -60 * RAD, GAP = 33 * RAD, best = 0, bd = 9;   // the pointer; where the chosen room sits (just before the pointer, the line after it under the pointer); how far apart the rooms are — her measures
      var BP = (G.BIRDPTS || {})[0] || [];
      for (j = -3; j < n + 3; j++) {   // swallows and moons all the way round, so it reads as a wheel even with two rooms on it
        var ang = SEL + (j - d.at) * GAP + spin, dd = Math.abs(ang - SEL);
        if (ang < -2.1 || ang > .5) continue;
        var real = j >= 0 && j < n, on = real && dd < GAP / 2, sp = ang + GAP / 2, sa = ang - 2 * RAD, ma = ang + 2.3 * RAD, la = ang + 1 * RAD, v4 = ((j % 4) + 4) % 4, v8 = (((j + 2) % 8) + 8) % 8;
        if (real && dd < bd) { bd = dd; best = j; }
        x.save(); x.rotate(sp);   // the line between one room and the next
        lay(mk("dl_div" + v4, (function (v) { return function (g) { return SK.longLine(g, R0 * .246, 0, R0 * .682, (v - 1.5) * 3, O({ seed: 2200 + v, roughness: 1.2, strokeWidth: 1.2, stroke: lead(.55), disableMultiStroke: true })); }; })(v4)));
        x.restore();
        x.save(); x.rotate(sa);   // its swallow: outlined and shaded with the blue pencil
        lay(mk("dl_sw" + v4, (function (v) { return function (g) {
          var pts = [], q; for (q = 0; q < BP.length; q += 2) pts.push([R0 * .57 - BP[q + 1] * 43, BP[q] * 43]);
          return [g.polygon(pts, O({ seed: 2300 + v, roughness: .7, strokeWidth: 1.3, stroke: blue(1), fill: blue(1), fillStyle: "hachure", hachureGap: 2.5, fillWeight: 1.7, hachureAngle: -52 + v * 31 })),
            g.polygon(pts, O({ seed: 2320 + v, roughness: .5, stroke: "none", fill: blue(.7), fillStyle: "hachure", hachureGap: 4.2, fillWeight: 1.4, hachureAngle: 24 + v * 17 }))]; }; })(v4)));
        x.restore();
        x.save(); x.rotate(ma); x.translate(R0 * .383, 0); x.rotate(-ma);   // its moon, each a phase on from the last (it stays upright as the wheel turns)
        lay(mk("dl_moon" + v8, (function (v) { return function (g) { return SK.moon(g, 21, v, blue(1), lead(.85), 2400 + v); }; })(v8)));
        x.restore();
        if (!real) continue;
        x.save(); x.translate(Math.cos(la) * R0 * .765, Math.sin(la) * R0 * .765); x.rotate(la);   // its name, written outward along the radius
        G.text(x, list[j].zh || list[j].en, 0, 10, "400 29px " + G.HAN, on ? "rgba(40,40,48,.82)" : "rgba(40,40,48,.5)", "center", 7);
        if (on) lay(mk("dl_under", function (g) { return g.line(-46, 30, 48, 28, O({ seed: 2701, roughness: 1.3, strokeWidth: 1.6, stroke: blue(.9) })); }));   // the chosen one is underlined, in blue
        x.restore();
        (function (child, a1) { hits.push({ x: cx + Math.cos(a1) * R * .6, y: cy + Math.sin(a1) * R * .6, r: 130, dial: true, fn: function () { pick(child); } }); })(list[j], ang);
      }
      x.restore();
      d.best = best;
      // the pointer (a small arrow-head, shaded in), and what the dial belongs to
      var px = cx + Math.cos(P0) * R * 1.037, py = cy + Math.sin(P0) * R * 1.037, col = side ? C.white : C.blue, dim = side ? "rgba(240,237,230,.6)" : "rgba(40,40,48,.5)";
      x.globalAlpha = A; x.save(); x.translate(px, py); x.rotate(P0 + Math.PI);
      lay(mk("dl_ptr" + side, function (g) { var pn = side ? SK.pen(x, "chalkDial", [240, 237, 230], 1) : blue(1); return g.polygon([[15, 0], [-11, -14], [-11, 14]], O({ seed: 2801, roughness: .9, strokeWidth: 1.4, stroke: pn, fill: pn, fillStyle: "cross-hatch", hachureGap: 2.6, fillWeight: 1.5 })); }));
      x.restore();
      G.text(x, d.app.en, px + 30, py - 14, "italic 500 40px " + G.SERIF, col, "left");
      G.text(x, d.app.zh || "", px + 32, py + 24, "400 22px " + G.HAN, side ? C.white : "rgba(40,40,48,.78)", "left", 7);
      G.text(x, (best + 1) + " / " + n, px + 32, py + 58, "italic 400 18px " + G.SERIF, dim, "left", 4);
      x.globalAlpha = 1;
    }

    /* ── the ring: the chosen moon opens into a hole in the page, and you go through ── */
    function drawPortal(now) {
      var p = portal, c = p.c || (p.c = chosen()), u = G.clamp((now - p.t0) / (p.dir > 0 ? 760 : 700), 0, 1), e = p.dir > 0 ? u * u * (3 - 2 * u) : 1 - G.out(u);
      if (p.done) e = 1;
      var cxp = (c.x + ox) * k, cyp = (c.y + c.oy) * k, far = Math.hypot(Math.max(cxp, cv.width - cxp), Math.max(cyp, cv.height - cyp)) + 30 * k, R = c.r * k + (far - c.r * k) * Math.pow(e, 1.6);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.save(); x.beginPath(); x.arc(cxp, cyp, R, 0, TAU); x.clip(); x.fillStyle = side ? C.night : C.paper; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = grain(!!side); x.fillRect(0, 0, cv.width, cv.height);
      // a few swallows go through ahead of you
      var rnd = G.rng(19), a2 = Math.min(1, e * 3) * (1 - e);
      if (a2 > 0) { x.globalAlpha = a2; for (var i = 0; i < 7; i++) { var an = rnd() * TAU, rr = R * (.25 + rnd() * .55) * (1 - e * .5); G.swallow(x, cxp + Math.cos(an) * rr, cyp + Math.sin(an) * rr, (12 + rnd() * 12) * k, an + Math.PI, C.blue, { f: G.instant(tt / G.BEAT + i * .3), rimW: 2.6 * k }); } x.globalAlpha = 1; }
      x.restore();
      x.strokeStyle = C.blue; x.lineWidth = (4 + 9 * (1 - e)) * k; x.beginPath(); x.arc(cxp, cyp, R, 0, TAU); x.stroke();
      if (u >= 1) {
        if (p.dir > 0 && !p.done) { p.done = true; var f = p.then; p.then = null; if (f) setTimeout(f, 0); }
        else if (p.dir < 0) portal = null;
      }
    }
    function through(then) { portal = { c: null, t0: performance.now(), dir: 1, then: then, done: false }; kick(); }

    /* ── one frame ── */
    function reveal(c0, e, inside) {   // draw `inside` through a round opening centred on c0 = [x, y, oy], e = how far open
      var cxp = (c0[0] + ox) * k, cyp = (c0[1] + c0[2]) * k, far = Math.hypot(Math.max(cxp, cv.width - cxp), Math.max(cyp, cv.height - cyp)) * 1.06, rr = 22 * k + (far - 22 * k) * e;
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.beginPath(); x.arc(cxp, cyp, rr, 0, TAU); x.clip(); inside(); x.restore();
      x.setTransform(1, 0, 0, 1, 0, 0); var rnd = G.rng(41); x.fillStyle = C.night;   // grain flying off the rim of the opening
      for (var i = 0; i < 620; i++) { var a = rnd() * TAU, o = rr * (1 + rnd() * rnd() * .17), g = (2 + rnd() * 5) * k; x.fillRect(cxp + Math.cos(a) * o, cyp + Math.sin(a) * o, g, g); }
    }
    function frame(now) {
      raf = 0; if (!alive) return;
      if (window.__gouT != null) now = window.__gouT;   // a clock that can be held still, to look at one instant
      if (host.offsetWidth === 0 || document.hidden) { clearTimeout(timer); timer = setTimeout(kick, 700); return; }   // the home isn't on screen
      layout();
      tt = now / 1000;
      if (openAt) { openT = G.clamp((now - openAt) / OPEN_MS, 0, 1); if (openT >= 1) openAt = 0; }
      if (selT) {
        var u = G.clamp((now - selT.t0) / 650, 0, 1), ob = G.out(u);   // off quickly and slowing into place, as hers do (timed off her film)
        var nx = selT.from + (selT.to - selT.from) * ob; orb += nx - selA; selA = nx; if (u >= 1) { selA = sel; selT = null; }
      }
      if (bobT) { var ub = G.clamp((now - bobT.t0) / bobT.ms, 0, 1); bob = bobT.from + (bobT.to - bobT.from) * G.ease(ub); if (ub >= 1) { var th = bobT.then; bobT = null; if (th) th(); } }
      var idle = openT >= 1 && !flip && !portal && !dial && !bobT && !bobDrag && !down;
      if (wheelAt && idle && bob > 0 && bob < 1 && now - wheelAt > 280) { wheelAt = 0; bobT = { from: bob, to: 0, t0: now, ms: 320, then: null }; }
      if (!hint && idle && bob === 0 && now - lastHint > (hints < 6 ? 7000 : 26000) && now - lastTouch > 3500) { hint = { t0: now }; hints++; lastHint = now; }
      var nudge = 0;
      if (hint) { var uh = (now - hint.t0) / 1100; if (uh >= 1 || !idle || bob > 0) hint = null; else nudge = Math.pow(Math.sin(Math.PI * uh), 2) * .2; }
      if (flip) {
        var t = now - flip.t0;
        if (flip.to) {   // day → night: the eye lets go of its birds and the pupil opens over the page while the stair is laid inside it
          var uN = G.seg(t, 180, 1860), bN = G.lerp(.07, 1, uN * .5 + G.ease(uN) * .5);
          if (t < 760) { var e = G.ease(t / 760); drawDay(flip.bob, G.out(G.seg(t, 0, 620))); reveal([EYE.x, EYE.y, oy], Math.pow(e, 1.6), function () { drawNight(bN, 0, t / 1000); }); }
          else drawNight(bN, 0, t / 1000);
          if (t >= 1900) flip = null;
        } else {         // night → day: the stair is taken up as the well closes to a pupil, and the birds come back to the lids
          var bD = G.lerp(.999, .07, G.ease(G.seg(t, 0, 640)));
          if (t < 260) drawNight(bD, flip.bob, null);
          else { var e3 = 1 - G.ease(G.seg(t, 260, 1150)); drawDay(0, 1 - G.out(G.seg(t, 420, 1350))); reveal([WELL.x, WELL.y, oyN], e3 * e3, function () { drawNight(bD, 0, null); }); }
          if (t >= 1350) flip = null;
        }
        hits = [];
      } else if (side) drawNight(1, bob + nudge); else drawDay(bob + nudge, portal ? (portal.done ? 1 : portal.dir > 0 ? G.out(G.clamp((now - portal.t0) / 760, 0, 1)) : 1 - G.ease(G.clamp((now - portal.t0) / 700, 0, 1))) * .85 : 0);
      if (dial) drawDial(now);
      if (portal) drawPortal(now);
      // before the eye is opened the page is only redrawn for the clock; after that something is always in flight, by day and by night
      par.x += (parT.x - par.x) * .08; par.y += (parT.y - par.y) * .08; var drifting = Math.abs(parT.x - par.x) + Math.abs(parT.y - par.y) > .004;
      var driven = drifting || openAt || selT || bobT || flip || hint || down || overBob || (portal && !portal.done) || (dial && (now - dial.t0 < 520 || dial.drag || dial.closing));
      if (driven || side || openT >= 1) raf = requestAnimationFrame(frame);   // once the eye is open its swallows are always in flight
      else { clearTimeout(timer); timer = setTimeout(kick, Math.min(1000 - (Date.now() % 1000) + 20, 400)); }
    }
    function kick() { clearTimeout(timer); if (alive && !raf) raf = requestAnimationFrame(frame); }

    /* ── doing things ── */
    function turn(by) {
      if (!by) return; var goal = (selT ? selT.to : selA) + by;
      sel = ((Math.round(goal) % N) + N) % N; selT = { from: selA, to: goal, t0: performance.now() }; put("gou_sel", String(sel)); kick();
    }
    function go(a) {
      var isChat = a.id === "chat";
      if (isChat || a.href) through(function () { if (a.href) ss("gou_back", "1"); openApp(a); });
      else openApp(a);
    }
    function enter(a) {
      if (a.apps && a.apps.length) { dial = { app: a, t0: performance.now(), closing: false, rot: 0, at: Math.min(a.apps.length - 1, Math.max(0, parseInt(ls("gou_dial_" + a.id) || "0", 10) || 0)) }; kick(); }
      else go(a);
    }
    function pick(child) { var d = dial; if (!d) return; put("gou_dial_" + d.app.id, String(d.app.apps.indexOf(child))); closeDial(); setTimeout(function () { go(child); }, 200); }
    function closeDial() { if (dial && !dial.closing) { dial.closing = true; dial.t0 = performance.now(); kick(); } }
    function startFlip() {   // ask the page to turn over; the animation starts when the side really changes (see the observer)
      if (flip || openT < 1) return;
      var b = document.getElementById("flip2") || document.getElementById("flip"); if (b) b.click(); else root.dataset.side = side ? "sun" : "moon";
    }
    function lower(ms) { bobT = { from: bob, to: 1, t0: performance.now(), ms: ms, then: startFlip }; kick(); }
    var seen = new MutationObserver(function () {
      var now = root.dataset.side === "moon" ? 1 : 0; if (now === side) return;
      if (host.offsetWidth === 0 || openT < 1) { side = now; flip = null; bob = 0; bobT = null; kick(); return; }
      flip = { to: now, t0: performance.now(), bob: bob }; side = now; bob = 0; bobT = null; wheelAt = 0; lastTouch = performance.now() + 3400; lastHint = lastTouch; if (dial) dial = null; kick();
    });
    seen.observe(root, { attributes: true, attributeFilter: ["data-side"] });

    /* ── pointer ── */
    var down = null;
    function where(e) { var r = cv.getBoundingClientRect(), o = side ? oyN : oy; return { x: (e.clientX - r.left) / s - ox, y: (e.clientY - r.top) / s - o, px: e.clientX, py: e.clientY }; }
    function onBob(p) { var B = side ? bobN() : bobD(), bx = side ? WELL.x : 697; return Math.abs(p.x - bx) < 80 && p.y > B[0] - 70 && p.y < B[2] + 70; }
    function onDown(e) {
      down = where(e); down.t = lastTouch = performance.now(); hint = null; down.lastX = down.px; down.lastT = down.t; down.vx = 0;
      if (dial && !dial.closing) { down.a = Math.atan2(down.y - dial.cy, down.x - dial.cx); down.rot = dial.rot; }
      else if (openT >= 1 && !flip && !portal && !bobT && onBob(down)) { down.bob = true; down.b0 = bob; try { cv.setPointerCapture(e.pointerId); } catch (er) {} }
      kick();
    }
    function onMove(e) {
      var p = where(e);
      if (!down) {
        if (e.pointerType === "mouse") {
          var ob = openT >= 1 && !flip && !dial && !portal && onBob(p), over = openT < 1;
          if (!over && !ob) hits.forEach(function (hh) { if (Math.hypot(Math.max(0, Math.abs(p.x - hh.x) - (hh.wide || 0)), p.y - hh.y) < hh.r) over = true; });
          cv.style.cursor = ob ? "grab" : over ? "pointer" : "default"; if (ob !== overBob) overBob = ob;
          if (wide) { var rc0 = cv.getBoundingClientRect(); parT.x = G.clamp((e.clientX - rc0.left) / rc0.width * 2 - 1, -1, 1); parT.y = G.clamp((e.clientY - rc0.top) / rc0.height * 2 - 1, -1, 1); }
          kick();
        }
        return;
      }
      if (down.bob) {   // the bob goes exactly where the hand does
        if (!bobDrag && Math.abs(p.py - down.py) < 4) return;
        var B = side ? bobN() : bobD(); bobDrag = true; cv.style.cursor = "grabbing"; bob = G.clamp(down.b0 + (p.y - down.y) / (B[1] - B[0]), 0, 1);
        if (bob >= 1) { down = null; bobDrag = false; startFlip(); }
        return;
      }
      if (dial) {
        if (dial.closing || down.a == null) return;
        if (Math.hypot(p.px - down.px, p.py - down.py) < 8) return;
        dial.drag = true; dial.rot = down.rot + Math.atan2(p.y - dial.cy, p.x - dial.cx) - down.a; return;
      }
      if (openT < 1 || flip || portal) return;
      // the orbit (the rail, at night) is turned by hand: take hold anywhere and turn it about its middle. A room moves with the finger.
      var mid = side ? [560, 480] : [EYE.x, EYE.y], rr = Math.hypot(p.x - mid[0], p.y - mid[1]), a1 = Math.atan2(p.y - mid[1], p.x - mid[0]), far = Math.hypot(p.px - down.px, p.py - down.py);
      if (!down.turn && far > 8 && rr > 60) { down.turn = true; selT = null; down.sel0 = selA; down.acc = 0; down.aPrev = a1; down.va = 0; down.lastT = performance.now(); try { cv.setPointerCapture(e.pointerId); } catch (er) {} }
      if (down.turn && rr > 40) {
        var da = ((a1 - down.aPrev + Math.PI) % TAU + TAU) % TAU - Math.PI, nowT = performance.now(), dt = Math.max(1, nowT - down.lastT), unit = (side ? 66 : 18) * RAD;
        down.acc += da; down.aPrev = a1; down.va = down.va * .55 + (da / dt) * .45; down.lastT = nowT; down.unit = unit;
        var nsel = down.sel0 + down.acc / unit; orb += nsel - selA; selA = nsel;
      }
    }
    function onUp(e) {
      if (!down) return; var p = where(e), dx = p.px - down.px, dy = p.py - down.py, moved = Math.hypot(dx, dy), d0 = down; down = null;
      if (openT < 1) { if (!openAt && openT === 0) openAt = performance.now(); else if (openT > .1) { openAt = 0; openT = 1; } kick(); return; }
      if (flip || portal) return;
      if (d0.bob) {
        if (!bobDrag) lower(520);                                              // a tap lets it all the way down
        else if (bob > .5) lower(140);
        else bobT = { from: bob, to: 0, t0: performance.now(), ms: 300, then: null };
        bobDrag = false; return;
      }
      if (dial) {
        if (dial.closing) return;
        if (dial.drag) {   // let go: settle on the nearest room
          var n = dial.app.apps.length, shift = Math.round(-dial.rot / (33 * RAD)); dial.at = G.clamp(dial.at + shift, 0, n - 1); dial.rot = 0; dial.drag = false; dial.t0 = performance.now() - 460; return;
        }
        if (moved < 12) {
          var hit = null; hits.forEach(function (hh) { if (hh.dial && Math.hypot(p.x - hh.x, p.y - hh.y) < hh.r && (!hit || Math.hypot(p.x - hh.x, p.y - hh.y) < Math.hypot(p.x - hit.x, p.y - hit.y))) hit = hh; });
          if (hit && Math.hypot(p.x - dial.cx, p.y - dial.cy) < dial.R + 30) hit.fn(); else if (Math.hypot(p.x - dial.cx, p.y - dial.cy) > dial.R + 10) closeDial();
        }
        return;
      }
      if (d0.turn) {   // let go: carry on a little with the speed it had, then come to rest on a room
        var stale = performance.now() - d0.lastT > 90, fling = stale ? 0 : G.clamp(d0.va / d0.unit * 170, -1.3, 1.3), goal = Math.round(selA + fling);
        if (goal === Math.round(d0.sel0) && Math.abs(selA - d0.sel0) > .16) goal += selA > d0.sel0 ? 1 : -1;
        sel = ((goal % N) + N) % N; selT = { from: selA, to: goal, t0: performance.now() }; put("gou_sel", String(sel)); return;
      }
      if (moved < 12 && performance.now() - d0.t < 600) {
        var best = null, bd = 1e9; hits.forEach(function (hh) { if (hh.dial) return; var dd = Math.hypot(Math.max(0, Math.abs(p.x - hh.x) - (hh.wide || 0)), p.y - hh.y); if (dd < hh.r && dd < bd) { bd = dd; best = hh; } });
        if (best) best.fn();
      }
    }
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", function () { down = null; bobDrag = false; if (dial) dial.drag = false; if (bob > 0 && !bobT && !flip) { bobT = { from: bob, to: 0, t0: performance.now(), ms: 300, then: null }; kick(); } });
    cv.addEventListener("pointerleave", function () { if (overBob) { overBob = false; kick(); } });
    // with a wheel or a trackpad: scroll down over the plate to let the bob down, up to draw it back
    cv.addEventListener("wheel", function (e) {
      if (openT < 1 || flip || portal || dial || bobDrag) return; e.preventDefault();
      var now = performance.now(); if (now - lastTouch < 0) return;
      bobT = null; hint = null; bob = G.clamp(bob + e.deltaY / 520, 0, 1); wheelAt = now; lastTouch = now;
      if (bob >= 1) { wheelAt = 0; startFlip(); }
      kick();
    }, { passive: false });
    cv.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });   // the page's own swipe would open the drawer
    function onKey(e) {
      if (host.offsetWidth === 0 || /INPUT|TEXTAREA/.test((e.target || {}).tagName || "") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (openT < 1) { if (!openAt && openT === 0 && (e.key === "Enter" || e.key === " ")) { openAt = performance.now(); kick(); } return; }
      if (flip || portal) return;
      if (dial) { if (e.key === "Escape") closeDial(); else if (e.key === "Enter") pick(dial.app.apps[dial.best || 0]); else if (e.key === "ArrowDown" || e.key === "ArrowRight") { dial.at = Math.min(dial.app.apps.length - 1, dial.at + 1); kick(); } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { dial.at = Math.max(0, dial.at - 1); kick(); } return; }
      if (e.key === "ArrowLeft") turn(-1); else if (e.key === "ArrowRight") turn(1); else if (e.key === "Enter") enter(apps[sel]); else if (e.key === "ArrowDown" && !bobT) lower(560);
    }
    document.addEventListener("keydown", onKey);
    var onSize = function () { kick(); }; window.addEventListener("resize", onSize);
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load("italic 500 30px 'Cormorant Garamond'"), document.fonts.load("500 30px 'Cormorant Garamond'"), document.fonts.load("400 30px 'Cormorant Garamond'"), document.fonts.load("italic 400 30px 'Cormorant Garamond'"),
        document.fonts.load("400 20px 'Noto Serif SC'", apps.map(function (a) { return (a.zh || "") + (a.apps || []).map(function (b) { return b.zh || ""; }).join(""); }).join("") + "轻触睁眼")]).then(kick, kick);
    }
    // coming back from another page of the house: step out of the ring you went in by
    if (openT >= 1 && ss("gou_back") === "1") { ss("gou_back", null); portal = { c: null, t0: performance.now() + 120, dir: -1, then: null, done: false }; }
    if (G.sketchReady) G.sketchReady(kick);
    kick();

    return {
      refresh: function () {
        var now = root.dataset.side === "moon" ? 1 : 0;
        if (!flip && now !== side) { side = now; bob = 0; }
        if (dial && dial.closing) dial = null;
        if (portal && portal.done) portal = { c: null, t0: performance.now(), dir: -1, then: null, done: false };
        kick();
      },
      stop: function () { alive = false; cancelAnimationFrame(raf); clearTimeout(timer); seen.disconnect(); root.classList.remove("eye-in"); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onSize); host.innerHTML = ""; }
    };
  };
})();
