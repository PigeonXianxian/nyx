"""Nyx · the question at the terminal: what a Claude Code window is waiting on, read off its screen.

When Claude Code waits on a person, the input box at the foot of the window gives way to a box:
  - a permission prompt   "Do you want to create note.txt?"  ❯ 1. Yes  2. Yes, and …  3. No
  - Claude's own question (AskUserQuestion): a row of tabs, the question, numbered choices with a line under each,
    "Type something." for an answer of your own, and at the end a review with "1. Submit answers"
  - a box of Claude Code's own, e.g. "Teach auto mode about your environment?": rows the cursor moves over, no numbers
read_dialog(pane) reads that box: its lines of text, its numbered choices (and which one the cursor is on, and which
take typed words), and the key hints at its foot. The page shows it and answers it (nyx_cc.py, /app/cc/question): a
number picks that choice (Claude Code takes the digit as the pick), a "Type something." choice is picked and then
written into, and any box can be worked with the keys its foot names.

What it was learnt from (Claude Code 2.1.325): the box begins at the first full-width rule (─ or ▔) after the last line
of the conversation (● Claude's words, ⎿ a tool's result, ✻ a turn's end); ╌ rules inside it frame a file's contents.
"""
import hashlib
import json
import re

RULE = re.compile(r"^\s*[─━▔═]{12,}\s*$")
DASH = re.compile(r"^\s*╌{12,}\s*$")
OPT = re.compile(r"^(\s*)(❯\s*)?(\d{1,2})\.\s+(.+?)\s*$")
CUR = re.compile(r"^\s*❯\s*(.*?)\s*$")
HINT = re.compile(r"Esc to |Enter to |to navigate|to select|to change|to confirm|to cancel|to continue|to amend")
TALK = re.compile(r"^(● |✻ |⏺ |\s{1,3}⎿)")
OWN = re.compile(r"^(Type something\.?|Other|Something else)$", re.I)


def input_box(lines):
    """The ── ❯ ── input box is at the foot: nobody is being asked anything."""
    return any(lines[i].startswith("───") and lines[i + 1].startswith("❯") and lines[i + 2].startswith("───")
               for i in range(max(0, len(lines) - 20), len(lines) - 2))


def read_dialog(pane):
    """The box the window is waiting on, or None when its input box is there.
    {text: [{t, on}], options: [{n, label, desc, on, own}], hint, keys: [...], sig}"""
    lines = [l.rstrip() for l in (pane or "").splitlines()]
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines or input_box([l for l in lines if l.strip()]):
        return None
    last = max((i for i, l in enumerate(lines) if TALK.match(l)), default=-1)
    top = next((i for i in range(last + 1, len(lines)) if RULE.match(lines[i])), None)
    if top is None:
        return None
    body = lines[top + 1:]
    hint = ""
    while body and not body[-1].strip():
        body.pop()
    if body and HINT.search(body[-1]):
        hint = body.pop().strip()
    text, options, col = [], [], None
    for l in body:
        if RULE.match(l):
            continue
        if DASH.match(l):
            text.append({"t": "", "on": False})
            continue
        m = OPT.match(l)
        if m:
            col = m.start(4)   # where a choice's words begin; the line under it is set in as far
            label = m[4]
            options.append({"n": int(m[3]), "label": label, "desc": "", "on": bool(m[2]), "own": bool(OWN.match(label))})
            continue
        indent = len(l) - len(l.lstrip())
        if options and l.strip() and col is not None and indent >= col and not CUR.match(l) and not text_after(options, text):
            options[-1]["desc"] = (options[-1]["desc"] + " " + l.strip()).strip()   # the line under a choice
            continue
        c = CUR.match(l)
        text.append({"t": (c[1] if c else l.strip()), "on": bool(c)})
        if options:
            options[-1]["after"] = True
    for o in options:
        o.pop("after", None)
    while text and not text[0]["t"]:
        text.pop(0)
    while text and not text[-1]["t"]:
        text.pop()
    if not options and not hint:
        return None   # no choices and no keys named: not a box anyone has to answer
    keys = ["Enter", "Escape"]
    if re.search(r"Arrow|↑|↓|navigate", hint) or not options:
        keys = ["Up", "Down"] + keys
    if re.search(r"Arrow|←|→|to change", hint) or any(re.search(r"^←.*→$", x["t"]) for x in text):
        keys = ["Left", "Right"] + keys
    if "Tab" in hint:
        keys.append("Tab")
    sig = hashlib.sha1(json.dumps([[x["t"] for x in text], [(o["n"], o["label"]) for o in options if not o["own"]], hint],
                                  ensure_ascii=False).encode()).hexdigest()[:12]
    return {"text": text[-40:], "options": options, "hint": hint, "keys": keys, "sig": sig}


def text_after(options, text):
    """Plain text has come since the last choice (so an indented line is not a choice's description)."""
    return bool(options and options[-1].get("after"))


def box_text(pane):
    """What is written in the window's input box (the ❯ line and those under it, up to the rule), or None if no box."""
    lines = [l.rstrip() for l in (pane or "").splitlines()]
    for i in range(len(lines) - 2, 0, -1):
        if lines[i].startswith("❯") and lines[i - 1].startswith("───"):
            out = [lines[i][1:].strip()]
            for l in lines[i + 1:]:
                if l.startswith("───"):
                    return " ".join(x for x in out if x)
                out.append(l.strip())
            return None
    return None
