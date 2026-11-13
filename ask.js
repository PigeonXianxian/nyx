/* Nyx — the house's own small questions, instead of the browser's grey boxes: a slip of the page's paper with a blue mark,
   the question in italic, a ruled line to write on, and two words to answer with.
   NyxAsk.confirm(question, {body, ok, cancel, danger}) → Promise<boolean>
   NyxAsk.prompt(question, {body, value, placeholder, ok, cancel})  → Promise<string | null>   (null: cancelled; trimmed)
   NyxAsk.alert(question, {body, ok})                               → Promise<void>
   Enter answers, Esc (or a tap beside the slip) cancels. Colours come from the page (--paper, --ink, --blue …). */
(function () {
  "use strict";
  if (window.NyxAsk) return;
  var CSS = [
    ".nyxask{ position:fixed; inset:0; z-index:500; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;",
    "  background:color-mix(in srgb, var(--paper, #ECE9E2) 58%, transparent); animation:nyxaskIn .16s ease-out; }",
    ":root[data-side='moon'] .nyxask{ background:rgba(10,10,14,.5); }",
    ".nyxask .card{ position:relative; width:min(100%, 400px); margin-bottom:8vh; padding:22px 24px 14px; box-sizing:border-box; border-radius:2px; color:var(--ink, #1B1B20);",
    "  background:var(--paper, #ECE9E2) var(--grain, none); background-size:180px; box-shadow:0 0 0 1px var(--river, rgba(27,27,32,.34)), 0 18px 48px rgba(16,16,22,.2);",
    "  animation:nyxaskUp .22s cubic-bezier(.2,.8,.2,1); }",
    ":root[data-side='moon'] .nyxask .card{ box-shadow:0 0 0 1px var(--river), 0 18px 48px rgba(0,0,0,.55); }",
    ".nyxask .q{ display:flex; align-items:baseline; gap:11px; margin:0; font:italic 500 20px/1.3 var(--latin, 'Cormorant Garamond', Georgia, serif); letter-spacing:.02em; }",
    ".nyxask .q::before{ content:''; flex:none; width:5px; height:5px; border-radius:50%; background:var(--blue, #2933C4); transform:translateY(-.25em); }",
    ".nyxask .b{ margin:10px 0 0 16px; font:400 13.5px/1.6 var(--serif, Georgia, serif); color:var(--soft, #6C6B68); }",
    ".nyxask input{ display:block; width:calc(100% - 16px); margin:16px 0 0 16px; padding:6px 0 7px; border:0; border-bottom:1px solid var(--river, rgba(27,27,32,.34)); border-radius:0;",
    "  background:none; outline:none; color:var(--ink, #1B1B20); font:italic 400 18px/1.3 var(--latin, 'Cormorant Garamond', Georgia, serif); letter-spacing:.03em; caret-color:var(--blue, #2933C4); -webkit-appearance:none; }",
    ".nyxask input:focus{ border-bottom-color:var(--blue, #2933C4); }",
    ".nyxask input::placeholder{ color:var(--faint, #A6A49E); letter-spacing:.12em; }",
    ".nyxask .a{ display:flex; justify-content:flex-end; align-items:baseline; gap:22px; margin-top:20px; }",
    ".nyxask .a button{ border:0; background:none; padding:6px 0; cursor:pointer; font:italic 400 16px/1 var(--latin, 'Cormorant Garamond', Georgia, serif); letter-spacing:.05em; -webkit-tap-highlight-color:transparent; }",
    ".nyxask .a .no{ color:var(--faint, #A6A49E); } .nyxask .a .no:hover{ color:var(--soft, #6C6B68); }",
    ".nyxask .a .ok{ color:var(--blue, #2933C4); font-weight:500; text-decoration:underline 1px; text-underline-offset:5px; }",
    ".nyxask .a .ok.danger{ color:var(--accent, #2933C4); }",
    ".nyxask .a button:focus-visible{ outline:none; } .nyxask .a .ok:focus-visible{ text-decoration-thickness:2px; } .nyxask .a .no:focus-visible{ color:var(--soft, #6C6B68); text-decoration:underline 1px; text-underline-offset:5px; }",
    "@keyframes nyxaskIn{ from{ opacity:0; } to{ opacity:1; } }",
    "@keyframes nyxaskUp{ from{ transform:translateY(10px); opacity:0; } to{ transform:none; opacity:1; } }"
  ].join("\n");
  function style() { if (document.getElementById("nyxask-css")) return; var s = document.createElement("style"); s.id = "nyxask-css"; s.textContent = CSS; document.head.appendChild(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ask(kind, q, o) {
    o = o || {}; style();
    return new Promise(function (done) {
      var back = document.activeElement, el = document.createElement("div");
      el.className = "nyxask"; el.setAttribute("role", kind === "alert" ? "alertdialog" : "dialog"); el.setAttribute("aria-modal", "true");
      el.innerHTML = '<div class="card"><p class="q">' + esc(q) + "</p>" + (o.body ? '<p class="b">' + esc(o.body) + "</p>" : "") +
        (kind === "prompt" ? '<input type="text" autocomplete="off" spellcheck="false" placeholder="' + esc(o.placeholder || "") + '">' : "") +
        '<div class="a">' + (kind === "alert" ? "" : '<button type="button" class="no">' + esc(o.cancel || "cancel") + "</button>") +
        '<button type="button" class="ok' + (o.danger ? " danger" : "") + '">' + esc(o.ok || "OK") + "</button></div></div>";
      var input = el.querySelector("input");
      if (input) input.value = o.value || "";
      function finish(yes) {
        document.removeEventListener("keydown", keys, true);
        el.remove(); try { if (back && back.focus) back.focus({ preventScroll: true }); } catch (e) {}
        done(kind === "prompt" ? (yes ? input.value.trim() : null) : kind === "confirm" ? !!yes : undefined);
      }
      function keys(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(kind === "alert"); }
        else if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.stopPropagation(); finish(true); }
      }
      el.addEventListener("click", function (e) { if (e.target === el) finish(false); else if (e.target.closest(".ok")) finish(true); else if (e.target.closest(".no")) finish(false); });
      document.addEventListener("keydown", keys, true);
      document.body.appendChild(el);
      setTimeout(function () { if (input) { input.focus(); input.select(); } else el.querySelector(".ok").focus(); }, 30);
    });
  }
  window.NyxAsk = {
    confirm: function (q, o) { return ask("confirm", q, o); },
    prompt: function (q, o) { return ask("prompt", q, o); },
    alert: function (q, o) { return ask("alert", q, o); }
  };
})();
