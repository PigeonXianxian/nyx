/* Nyx — tabs at the head of the letter: one for each Claude Code window open at once (the relay keeps side windows next to
   the main one; relay/nyx_extras.py open_side). Index tabs, as in a notebook: the open one is of a piece with the page, the
   others stand behind it on the page's edge. The main window wears the eye; a tab that is working turns the star; one waiting
   for a yes at the terminal shows a question mark; one that has said something you haven't read has a blue dot; × closes a
   side window (its session stays in Sessions); + opens another, while there is room on the machine.
   NyxTabs(o) → { paint(model) }        o: { host (the element the row goes before), pick(sid), close(sid), add() }
   model: { on, wins: [{sid, main, title}], view, reading: {sid, title} | null, state: {sid: "busy"|"idle"|"waiting"},
            unread: {sid: true}, opening: n, adding: bool, max: n, tight: bool (the machine is short of memory), why, ai: name } */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var EYE = '<svg class="te" viewBox="0 0 44 24" aria-hidden="true"><path d="M2 12C10 3.5 34 3.5 42 12C34 20.5 10 20.5 2 12Z"/><circle cx="22" cy="12" r="6.6"/></svg>';
  var X = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6"/></svg>';
  var PLUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9"/></svg>';

  window.NyxTabs = function (o) {
    var el = document.createElement("nav"); el.className = "tabs"; el.id = "tabs"; el.hidden = true; el.setAttribute("aria-label", "Windows");
    o.host.parentNode.insertBefore(el, o.host);
    var M = null, lastOn = "", lastHtml = "";
    function paint(m) {
      M = m || M; m = M;
      el.hidden = !(m && m.on);
      document.documentElement.classList.toggle("tabbed", !el.hidden);
      if (el.hidden) return;
      var busyN = (m.opening || 0) + (m.adding ? 1 : 0), capped = m.wins.length + busyN >= m.max, full = capped || !!m.tight, h = "";
      m.wins.forEach(function (w) {
        var st = m.state[w.sid] || "", on = w.sid === m.view, name = w.title || (w.main ? m.ai : "new window");
        h += '<div class="tab' + (on ? " on" : "") + (w.main ? " main" : "") + (st === "busy" ? " busy" : st === "waiting" ? " ask" : "") +
          (m.unread[w.sid] && !on ? " new" : "") + (w.title ? "" : " untitled") + '" data-sid="' + esc(w.sid) + '">' +
          '<button type="button" class="tb" data-a="pick" title="' + esc(name + (w.main ? " · the main window" : "")) + '"' + (on ? ' aria-current="page"' : "") + ">" +
          (w.main ? EYE : "") + '<i class="mk" aria-hidden="true"></i><span>' + esc(name) + "</span></button>" +
          (w.main ? "" : '<button type="button" class="tx" data-a="close" aria-label="Close this tab">' + X + "</button>") + "</div>";
      });
      if (m.reading) h += '<div class="tab on read" data-sid="' + esc(m.reading.sid) + '"><span class="tb"><em>reading</em><span>' + esc(m.reading.title || "an earlier window") + "</span></span></div>";
      for (var i = 0; i < busyN; i++) h += '<div class="tab wait"><span class="tb"><span>opening…</span></span></div>';
      h += '<button type="button" class="tadd' + (full ? " full" : "") + '" data-a="add" aria-label="' + (full ? "No room for another window" : "Open another window") + '" title="' +
        esc(capped ? m.max + " windows at once is the most" : m.tight ? (m.why || "the server is short of memory right now") : "Another window, alongside") + '">' + PLUS + "</button>";
      if (h === lastHtml) return;   // drawn again only when something changed, so a tap never lands on a row being replaced
      el.innerHTML = lastHtml = h;
      var on = el.querySelector(".tab.on");
      if (on && m.view !== lastOn && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "nearest" });
      lastOn = m.view;
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]"); if (!b) return;
      var t = b.closest(".tab"), sid = t && t.dataset.sid;
      if (b.dataset.a === "pick" && sid) o.pick(sid);
      else if (b.dataset.a === "close" && sid) o.close(sid);
      else if (b.dataset.a === "add") o.add();
    });
    return { paint: paint, el: el };
  };
})();
