"""Nyx · the question at the terminal: what a Claude Code window is waiting on, read off its screen.

When Claude Code waits on a person, the input box at the foot of the window gives way to a box:
  - a permission prompt   "Do you want to create note.txt?"  ❯ 1. Yes  2. Yes, and …  3. No
  - Claude's own question (AskUserQuestion): a row of tabs, the question, numbered choices with a line under each,
    "Type something." for an answer of your own, and at the end a review with "1. Submit answers"
  - a box of Claude Code's own, e.g. "Teach auto mode about your environment?": rows the cursor moves over, no numbers;
    its last step ("Looks good — save it / Discard and exit") is as tall as the window, with nothing over or under it
read_dialog(pane) reads that box: its lines of text, its numbered choices (and which one the cursor is on, and which
take typed words) or its rows, and the key hints at its foot. The page shows it and answers it (nyx_cc.py,
/app/cc/question): a number picks that choice (Claude Code takes the digit as the pick), a "Type something." choice is
picked and then written into, a row is gone to and then worked as its foot says (Space to toggle, ← → to adjust, Enter),
and any box can be worked with the keys its foot names.

What it was learnt from (Claude Code 2.1.325–2.1.329): the box begins at the first full-width rule (─ or ▔) after the
last line of the conversation (● Claude's words, ⎿ a tool's result, ✻ a turn's end) and ends at the line that names its
keys — a status line may follow that ("✻ Waiting for API response…"); ╌ rules inside it frame a file's contents.
Not every box names its keys: "Session paused" (a model's safeguards stopped the session: 1. Switch to Opus 4.8 /
2. Edit prompt and retry) is a rule, its words and its numbered choices, with only that status line under them.

Each new kind of box has been one the reader did not know, and a box nobody can see is a window nobody can use. So
read_dialog(pane, raw=True) never comes back empty-handed from a screen with no input box: what it cannot make out it
gives as it stands on the screen ({raw: True}), to be worked with the keys.
"""
import hashlib
import json
import re
import unicodedata

RULE = re.compile(r"^\s*[─━▔═]{12,}\s*$")
DASH = re.compile(r"^\s*╌{12,}\s*$")
OPT = re.compile(r"^(\s*)(❯\s*)?(\d{1,2})\.\s+(.+?)\s*$")
CUR = re.compile(r"^\s*❯\s*(.*?)\s*$")
HINT = re.compile(r"Esc to |Enter to |to navigate|to select|to change|to confirm|to cancel|to continue|to amend")
TALK = re.compile(r"^(● |✻ |⏺ |\s{1,3}⎿)")
OWN = re.compile(r"^(Type something\.?|Other|Something else)$", re.I)
MORE = re.compile(r"^\s*[↑↓]\s*(\d+) more lines?\s*$")
BULLET = re.compile(r"^([·•▪*+-]|\d{1,2}[.)])\s")
SIDE = re.compile(r"^\s*[│┃▏▎]\s?")   # the bar down the side of a box's words
# Claude Code's own status line, at the foot of the screen: "✻ Waiting for API response · will retry in 3s" (not a turn's end: "✻ Baked for 4s")
SPIN = re.compile(r"^[·✢✳✶✻✽*]\s+(?!\S+ for \d)\S")
ALL_KEYS = ["Up", "Down", "Left", "Right", "Enter", "Escape", "Space", "Tab"]


def cells(s):
    """How many columns of the window a line takes (a Chinese character takes two)."""
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in s)


def input_box(lines):
    """The input box is at the foot: a ─── rule, the ❯ line, the lines its words run on to (a long message wraps; a
    picture adds an "[image] …" line), and the closing rule near the foot, with no key hints of a question under it or in it.
    Then nobody is being asked anything."""
    L = [l for l in lines if l.strip()]
    n = len(L)
    for j in range(n - 1, max(-1, n - 8), -1):   # the lower rule: only the status lines come after it
        if not L[j].startswith("───"):
            continue
        if any(HINT.search(x) for x in L[j + 1:]):
            return False
        for i in range(j - 1, max(-1, j - 60), -1):   # the upper rule
            if L[i].startswith("───"):
                return L[i + 1].startswith("❯") and not any(HINT.search(x) for x in L[i + 1:j])
        return False
    return False


def read_dialog(pane, raw=False):
    """The box the window is waiting on, or None when its input box is there.
    {text: [{t, on}], options: [{n, label, desc, on, own}], rows: [{label, value, on}], hint, keys: [...],
     enter: what Enter does, in the foot's own word ("select", "continue", "confirm"), does: what a tap on the ❯ row does
     ("toggle" with Space, "adjust" with ← →, "enter"), above: lines of a tall box scrolled off its top, sig}
    raw: a screen with no input box and no box the reader knows is given too, as it stands ({…, raw: True}: every key)."""
    lines = [l.rstrip() for l in (pane or "").splitlines()]
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines or input_box(lines):
        return None
    # its foot is the line that names its keys; a line under that ("✻ Waiting for API response…") is Claude Code's own
    foot = next((i for i in range(len(lines) - 1, max(-1, len(lines) - 7), -1) if HINT.search(lines[i])), None)
    end = len(lines) if foot is None else foot
    if foot is None:   # a box that names no keys: the status line may still be under it, and it too begins "✻ "
        while end and (not lines[end - 1].strip() or SPIN.match(lines[end - 1])):
            end -= 1
    last = max((i for i in range(end) if TALK.match(lines[i])), default=-1)
    top = next((i for i in range(last + 1, end) if RULE.match(lines[i])), None)
    sure = True
    if top is None:
        if foot is None:   # neither a rule over it nor keys named under it: no box the reader knows
            if not raw:
                return None
            sure = False
        top = last   # a box as tall as the window has no rule over it: what is on the screen is the box
    body = lines[top + 1:end]
    if not sure and not any(l.strip() for l in body):
        body = lines[max(0, end - 12):end]   # nothing under the talk: the foot of the screen
    hint = lines[foot].strip() if foot is not None else ""
    above = 0
    for i in range(len(body) - 1, -1, -1):   # "↑ 13 more lines": the top of a tall box is off the screen
        m = MORE.match(body[i])
        if m:
            above = int(m[1])
            del body[i]
    numbered = any(OPT.match(l) for l in body)
    width = max(cells(l) for l in lines)
    rowed = {} if numbered else find_rows(body, width)
    text, options, rows, col, ran_on = [], [], [], None, False
    for k, l in enumerate(body):
        if RULE.match(l):
            ran_on = False
            continue
        if DASH.match(l):
            text.append({"t": "", "on": False})
            ran_on = False
            continue
        if k in rowed:
            label, _, value = rowed[k].partition("\0")
            rows.append({"label": label, "value": value, "on": bool(CUR.match(l))})
            ran_on = False
            continue
        m = OPT.match(l)
        if m:
            col = m.start(4)   # where a choice's words begin; the line under it is set in as far
            label = m[4]
            options.append({"n": int(m[3]), "label": label, "desc": "", "on": bool(m[2]), "own": bool(OWN.match(label))})
            ran_on = False
            continue
        indent = len(l) - len(l.lstrip())
        if options and l.strip() and col is not None and indent >= col and not CUR.match(l) and not text_after(options, text):
            options[-1]["desc"] = (options[-1]["desc"] + " " + l.strip()).strip()   # the line under a choice
            continue
        c = CUR.match(l)
        t = c[1] if c else SIDE.sub("", l).strip()
        if ran_on and t and not c and not BULLET.match(t) and text and text[-1]["t"] and not text[-1]["on"]:
            glue = "" if ord(text[-1]["t"][-1]) > 0x2e7f and ord(t[0]) > 0x2e7f else " "   # (no space inside Chinese)
            text[-1]["t"] += glue + t   # the window broke a long line here: on the page it is one paragraph again
        else:
            text.append({"t": t, "on": bool(c)})
        ran_on = bool(t) and not c and cells(l) >= width - 18
        if options:
            options[-1]["after"] = True
    for o in options:
        o.pop("after", None)
    while text and not text[0]["t"]:
        text.pop(0)
    while text and not text[-1]["t"]:
        text.pop()
    if not options and not rows and not hint:
        if not raw or not text:
            return None   # no choices and no keys named: not a box the reader knows
        sure = False
    if not sure:
        for t in text:   # words set at the far side of the window ("… ? for shortcuts            verbose") come next to the rest
            t["t"] = re.sub(r"\s{4,}", "   ", t["t"])
    keys = ["Enter", "Escape"]
    if re.search(r"Arrow|↑|↓|navigate", hint) or not options or not hint:
        keys = ["Up", "Down"] + keys
    if re.search(r"Arrow|←|→|to change", hint) or any(re.search(r"^←.*→$", x["t"]) for x in text):
        keys = ["Left", "Right"] + keys
    if "Space" in hint:
        keys.append("Space")
    if "Tab" in hint:
        keys.append("Tab")
    m = re.search(r"Enter to (\w+)", hint)
    enter = m[1] if m else ""
    does = "toggle" if re.search(r"Space to", hint) else "adjust" if re.search(r"←|→", hint) else "enter" if enter else ""
    # a box of rows is one box wherever its cursor is (its foot changes with the row, its values as they are set)
    sig = hashlib.sha1(json.dumps([[x["t"] for x in text], [(o["n"], o["label"]) for o in options if not o["own"]],
                                   [r["label"] for r in rows] if rows else hint], ensure_ascii=False).encode()).hexdigest()[:12]
    out = {"text": text[-40:], "options": options, "rows": rows, "hint": hint, "keys": keys, "enter": enter,
           "does": does if rows else "", "above": above, "sig": sig}
    if not sure:
        out.update(raw=True, keys=list(ALL_KEYS))
    return out


def find_rows(body, width=200):
    """A box worked with the arrow keys has rows in place of numbered choices: the ❯ row, and those over and under it set
    in as far as its words (an empty line may part them). A row is a short line of its own: not an item of a list
    ("· …" — the notes over "Looks good — save it" are set in as far as the rows are), not a line long enough to have
    been broken by the window, nor what such a line ran on to. {index in body: "label\0value"}"""
    at = next((i for i, l in enumerate(body) if CUR.match(l) and CUR.match(l)[1] and not OPT.match(l)), None)
    if at is None:
        return {}
    col = len(re.match(r"^\s*❯\s*", body[at])[0])
    found = {at: CUR.match(body[at])[1]}
    for step in (-1, 1):
        i, gap = at + step, 0
        while 0 <= i < len(body):
            l = body[i]
            if not l.strip():
                gap += 1
                if gap > 1:
                    break
            elif (len(l) - len(l.lstrip()) == col and not RULE.match(l) and not DASH.match(l) and not BULLET.match(l.strip())
                  and cells(l) < width - 18 and not (i and cells(body[i - 1]) >= width - 18)):
                found[i], gap = l.strip(), 0
            else:
                break
            i += step
    out = {}
    for i, words in found.items():
        label, value = (re.split(r"\s{2,}", words, 1) + [""])[:2]
        out[i] = label + "\0" + re.sub(r"^‹\s*|\s*›$", "", value)
    return out


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
