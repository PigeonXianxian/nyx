/* 构成 — the question at the terminal. When the window stops to ask — a permission prompt, Claude's own question
   (AskUserQuestion), a box of Claude Code's — it can't go on until someone answers, and before this the page only said
   "waiting on a question at the terminal". Now the question comes onto the page, above the writing line, as a slip with a
   blue rule down its side: what is asked, the choices (their own numbers: the number is what is pressed), a line to write
   your own answer where the question takes one, and the keys its foot names for what is left to keys.
   A box with no numbers (Claude Code's own: "Teach auto mode about your environment?") is a list of rows the terminal
   walks with the arrow keys. Here each row is tapped: the relay walks the cursor to it and works it as the box's foot
   says — a switch is flipped, "Continue" is gone on with, a value that ← → adjust gets ‹ › beside it. Enter and Esc
   carry the foot's own words ("continue", "confirm", "cancel"), so there is always a plain way on and a plain way out.
   A box the relay's reader has not met (each new kind has been one) still comes: its lines as they stand on the window's
   screen, and every key — so a window is never left waiting on something the page cannot show.
   Answering here answers the window. What you write meanwhile waits, and goes in once it is answered.
   The relay reads the box off the window's screen (relay/nyx_question.py) and says when one comes, changes or goes.
   NyxQuestion(o) → { set(q, held), load(), clear(), shown() }
   o: api(path, opt) · sid() the tab on the page · toast(t) · host the element it goes in · before the element it goes before */
(function () {
  "use strict";
  var KEYS = [["Up", "↑"], ["Down", "↓"], ["Left", "←"], ["Right", "→"], ["Space", "space"], ["Tab", "tab"], ["Enter", "enter"], ["Escape", "esc"]];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // the window's words keep their **strong** and `code` marks
  function words(s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
  // a key's cap: Enter and Esc say what they do here, in the foot's own word
  function cap(k, q) {
    if (k[0] === "Enter" && q.enter) return q.enter + " ↵";
    if (k[0] === "Escape") { var m = /Esc to (\w+)/.exec(q.hint || ""); return m ? m[1] : "esc"; }
    return k[1];
  }

  window.NyxQuestion = function (o) {
    var el = document.createElement("div"), q = null, busy = false, seq = 0, open = false, held = [], drawn = "";
    el.className = "qslip"; el.hidden = true; el.setAttribute("role", "group"); el.setAttribute("aria-label", "A question at the terminal");
    o.host.insertBefore(el, o.before || null);

    function body() { return { sid: o.sid() || "", sig: q && q.sig }; }
    // The slip is drawn again only when what it shows has changed. The page asks after the question every few seconds
    // (and the relay says when it changes); drawn afresh each time, the slip threw away an answer half written, let go
    // of the keyboard, jumped back to its top and now and then lost a tap that fell across the redrawing.
    function paint() {
      var state = JSON.stringify([q, held.length, open]);
      if (state === drawn) { el.classList.toggle("busy", busy); return; }
      if (!q) { drawn = state; el.hidden = true; el.innerHTML = ""; el.classList.remove("busy"); return; }
      var same = el.dataset.sig === q.sig, top = el.scrollTop, own = {}, act = document.activeElement, focus = null;
      if (same) [].forEach.call(el.querySelectorAll(".qown"), function (f) {   // the same question still: what was being written stays
        var i = f.querySelector("input"); own[f.dataset.n] = i.value;
        if (i === act) focus = { n: f.dataset.n, a: i.selectionStart, b: i.selectionEnd };
      });
      var h = '<div class="qh"><i></i><small>at the terminal</small><span>终端在问</span></div>';
      var lines = q.text || [], rows = q.rows || [], opts = q.options || [];
      var long = lines.length > 7 && (opts.length > 0 || rows.length > 0);   // a long file over the choices folds; a box worked with keys alone shows every line
      // a box the reader does not know: the window's screen as it stands, and every key
      if (q.raw) h += '<div class="qa">the page can’t make this box out — this is the window’s screen as it stands, to work with the keys</div>';
      if (q.above) h += '<div class="qa">' + q.above + (q.above === 1 ? " line" : " lines") + " above this are off the window’s screen</div>";
      h += '<div class="qt' + (long && !open ? " fold" : "") + '">' + lines.map(function (t) {
        return t.t ? '<div class="' + (t.on ? "on" : /[?？]\s*$/.test(t.t) ? "ask" : "") + '">' + words(t.t) + "</div>" : '<div class="gap"></div>';
      }).join("") + "</div>";
      if (long) h += '<button type="button" class="qw qmore" data-a="more">' + (open ? "less" : "all of it") + "</button>";
      if (opts.length) h += '<div class="qo">' + opts.map(function (x) {
        return x.own ? '<form class="qown" data-n="' + x.n + '"><b>' + x.n + '.</b><input type="text" placeholder="' + esc(x.label.replace(/\.$/, "")) + '…" spellcheck="false" autocomplete="off"><button type="submit" class="qw">send</button></form>'
          : '<button type="button" class="qc' + (x.on ? " on" : "") + '" data-n="' + x.n + '"><b>' + x.n + '.</b><span>' + esc(x.label) + (x.desc ? "<small>" + esc(x.desc) + "</small>" : "") + "</span></button>";
      }).join("") + "</div>";
      // rows: a tap goes to the row and works it; the row ← → adjust carries ‹ › once the cursor is on it
      if (rows.length) h += '<div class="qo qrs">' + rows.map(function (r, i) {
        var turn = r.on && q.does === "adjust" && r.value;
        return '<div class="qr' + (r.on ? " on" : "") + '"><button type="button" class="qrl" data-r="' + i + '"><b></b><span>' + esc(r.label) + "</span>" + (turn ? "" : r.value ? "<em>" + esc(r.value) + "</em>" : '<em class="go">→</em>') + "</button>" +
          (turn ? '<span class="qv"><button type="button" class="key" data-k="Left" aria-label="the one before">‹</button><em>' + esc(r.value) + '</em><button type="button" class="key" data-k="Right" aria-label="the next one">›</button></span>' : "") + "</div>";
      }).join("") + "</div>";
      // the keys: a box of rows keeps only its way on and its way out (the rows are tapped); any other box, all its foot names
      var keys = KEYS.filter(function (k) { return (q.keys || []).indexOf(k[0]) >= 0; });
      // (Enter stays even where the foot does not say what it does: without it a tapped row could not be gone on with)
      if (rows.length && !q.raw) keys = keys.filter(function (k) { return k[0] === "Escape" || k[0] === "Enter"; });
      h += '<div class="qk">' + keys.map(function (k) {
        var c = cap(k, q);
        return '<button type="button" class="key' + (c.length > 3 ? " word" : "") + (k[0] === "Enter" && q.enter ? " go" : "") + '" data-k="' + k[0] + '" aria-label="' + k[0] + '">' + esc(c) + "</button>";
      }).join("") + (held && held.length ? '<em>' + (held.length === 1 ? "your message waits for this" : held.length + " messages wait for this") + "</em>" : "") + "</div>";
      el.innerHTML = h; el.hidden = false; el.classList.toggle("busy", busy); el.dataset.sig = q.sig; drawn = state;
      if (same) {
        [].forEach.call(el.querySelectorAll(".qown"), function (f) {
          var i = f.querySelector("input"); if (own[f.dataset.n]) i.value = own[f.dataset.n];
          if (focus && focus.n === f.dataset.n) { i.focus({ preventScroll: true }); try { i.setSelectionRange(focus.a, focus.b); } catch (e) {} }
        });
        el.scrollTop = top;
      }
    }
    function set(next, h) {
      var was = q && q.sig;
      q = next || null; if (h) held = h; if (!q) held = [];
      if (!q || q.sig !== was) open = false;
      paint();
    }
    function load() {
      var sid = o.sid(), my = ++seq;
      if (!sid) { set(null); return Promise.resolve(); }
      return o.api("/app/cc/question?sid=" + encodeURIComponent(sid)).then(function (d) { if (my === seq && sid === o.sid()) set(d.q, d.held); }, function () {});
    }
    function answer(extra) {
      if (busy || !q) return;
      busy = true; el.classList.add("busy");
      var b = body(); for (var k in extra) b[k] = extra[k];
      o.api("/app/cc/question/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
        .then(function (r) { busy = false; set(r.q); }, function (e) {
          busy = false; el.classList.remove("busy");
          if (/409/.test(e.message)) { o.toast("The question changed — look again"); load(); }
          else o.toast("Didn’t reach the window: " + e.message);
        });
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !el.contains(b)) return;
      if (b.dataset.a === "more") { open = !open; paint(); return; }
      if (b.dataset.k) answer({ key: b.dataset.k });
      else if (b.dataset.r) answer({ row: +b.dataset.r });
      else if (b.dataset.n) answer({ pick: +b.dataset.n });
    });
    el.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target.closest(".qown"), v = f && f.querySelector("input").value.trim(); if (!v) return;
      answer({ pick: +f.dataset.n, text: v });
    });
    return { set: set, load: load, clear: function () { seq++; set(null); }, shown: function () { return !!q; } };
  };
})();
