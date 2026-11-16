/* 构成 — the question at the terminal. When the window stops to ask — a permission prompt, Claude's own question
   (AskUserQuestion), a box of Claude Code's — it can't go on until someone answers, and before this the page only said
   "waiting on a question at the terminal". Now the question comes onto the page, above the writing line, as a slip with a
   blue rule down its side: what is asked, the choices (their own numbers: the number is what is pressed), a line to write
   your own answer where the question takes one, and the keys its foot names (↑ ↓ ← → enter esc tab) for boxes that are
   worked with keys. Answering here answers the window. What you write meanwhile waits, and goes in once it is answered.
   The relay reads the box off the window's screen (relay/nyx_question.py) and says when one comes, changes or goes.
   NyxQuestion(o) → { set(q, held), load(), clear(), shown() }
   o: api(path, opt) · sid() the tab on the page · toast(t) · host the element it goes in · before the element it goes before */
(function () {
  "use strict";
  var KEYS = [["Up", "↑"], ["Down", "↓"], ["Left", "←"], ["Right", "→"], ["Enter", "enter"], ["Escape", "esc"], ["Tab", "tab"]];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  window.NyxQuestion = function (o) {
    var el = document.createElement("div"), q = null, busy = false, seq = 0, open = false, held = [];
    el.className = "qslip"; el.hidden = true; el.setAttribute("role", "group"); el.setAttribute("aria-label", "A question at the terminal");
    o.host.insertBefore(el, o.before || null);

    function body() { return { sid: o.sid() || "", sig: q && q.sig }; }
    function paint() {
      if (!q) { el.hidden = true; el.innerHTML = ""; return; }
      var h = '<div class="qh"><i></i><small>at the terminal</small><span>终端在问</span></div>';
      var lines = q.text || [], long = lines.length > 7 && (q.options || []).length > 0;   // a long file under a yes/no folds; a box worked with keys shows every row
      h += '<div class="qt' + (long && !open ? " fold" : "") + '">' + lines.map(function (t) {
        return t.t ? '<div class="' + (t.on ? "on" : /[?？]\s*$/.test(t.t) ? "ask" : "") + '">' + esc(t.t) + "</div>" : '<div class="gap"></div>';
      }).join("") + "</div>";
      if (long) h += '<button type="button" class="qw qmore" data-a="more">' + (open ? "less" : "all of it") + "</button>";
      if ((q.options || []).length) h += '<div class="qo">' + q.options.map(function (x) {
        return x.own ? '<form class="qown" data-n="' + x.n + '"><b>' + x.n + '.</b><input type="text" placeholder="' + esc(x.label.replace(/\.$/, "")) + '…" spellcheck="false" autocomplete="off"><button type="submit" class="qw">send</button></form>'
          : '<button type="button" class="qc' + (x.on ? " on" : "") + '" data-n="' + x.n + '"><b>' + x.n + '.</b><span>' + esc(x.label) + (x.desc ? "<small>" + esc(x.desc) + "</small>" : "") + "</span></button>";
      }).join("") + "</div>";
      h += '<div class="qk">' + KEYS.filter(function (k) { return (q.keys || []).indexOf(k[0]) >= 0; }).map(function (k) {
        return '<button type="button" class="key" data-k="' + k[0] + '" aria-label="' + k[0] + '">' + k[1] + "</button>";
      }).join("") + (held && held.length ? '<em>' + (held.length === 1 ? "your message waits for this" : held.length + " messages wait for this") + "</em>" : "") + "</div>";
      el.innerHTML = h; el.hidden = false; el.classList.toggle("busy", busy);
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
