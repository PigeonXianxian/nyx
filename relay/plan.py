#!/usr/bin/env python3
"""The plan (日程), from the server's terminal — for the AI: what your human has to do, written down as they say it.

  python3 ~/nyx/relay/plan.py                         today's date on their clock, then what is overdue, today's,
                                                      the next two weeks, and what has no day yet
  python3 ~/nyx/relay/plan.py ls [--days N] [--done]  the same, further ahead / with what is done
  python3 ~/nyx/relay/plan.py add "what" [-d DAY] [-t HH:MM] [--due] [-n "a note"]
  python3 ~/nyx/relay/plan.py set P012 [-d DAY|none] [-t HH:MM|none] [--title "…"] [-n "…"] [--due 1|0]
  python3 ~/nyx/relay/plan.py done P012 [P013 …]      (undo P012 takes it back)
  python3 ~/nyx/relay/plan.py rm P012                 only what was written down by mistake, or what they call off

DAY is worked out on their clock, not this machine's:  today · tomorrow · +3 · fri (the coming Friday, today counts)
· next-fri (Friday of next week) · 2026-11-20 · 11-20 · 11/20 — 今天 明天 后天 周五 下周五 11月20日 work as well.
Leave -d out when no day was named. --due: the day is the last day for it ("by Friday"), not the day it happens.

Talks to the relay on 127.0.0.1 with the key from relay.env next to this file. The page is plan.html.
This file is part of the Nyx relay (GNU AGPL v3, see LICENSE and NOTICE in this folder).
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
HAN = "一二三四五六日"


def env():
    e = {}
    try:
        for line in (HERE / "relay.env").read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1); e[k.strip()] = v.strip()
    except OSError:
        pass
    return e


E = env()
URL = os.environ.get("RELAY_URL", "http://127.0.0.1:3011")
KEY = os.environ.get("RELAY_SECRET") or E.get("RELAY_SECRET", "")
WHO = E.get("RELAY_AI_NAME", "AI")


def call(path, body=None):
    req = urllib.request.Request(URL + path, method="POST" if body is not None else "GET",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            why = json.loads(e.read() or b"{}").get("detail") or e.reason
        except Exception:
            why = e.reason
        sys.exit(f"the relay said no ({e.code}): {why}")
    except OSError as e:
        sys.exit(f"couldn't reach the relay at {URL}: {e}")


def weekday(s):
    """0…6 for mon…sun / 周一…周日 / 星期天, else None."""
    s = s.lower()
    if s[:3] in DAYS and s in (s[:3], s[:3] + "day", {"tue": "tuesday", "wed": "wednesday", "thu": "thursday", "sat": "saturday"}.get(s[:3], "")):
        return DAYS.index(s[:3])
    m = re.fullmatch(r"(?:周|星期|礼拜)([一二三四五六日天])", s)
    return HAN.index(m.group(1).replace("天", "日")) if m else None


def a_day(s, today):
    """A DAY as typed → 'YYYY-MM-DD' ('' for none)."""
    s = (s or "").strip()
    if s.lower() in ("", "none", "no", "-", "没定", "不定", "无"):
        return ""
    low = s.lower()
    named = {"today": 0, "今天": 0, "tomorrow": 1, "明天": 1, "后天": 2, "大后天": 3, "yesterday": -1, "昨天": -1}
    if low in named:
        return (today + timedelta(days=named[low])).isoformat()
    if re.fullmatch(r"[+-]\d{1,3}", s):
        return (today + timedelta(days=int(s))).isoformat()
    nxt = re.fullmatch(r"(?:next[- ]?|下周?|下个?(?=星期|礼拜))(.+)", low)
    wd = weekday(("周" + nxt.group(1)) if nxt and nxt.group(1) in HAN + "天" else nxt.group(1)) if nxt else weekday(low)
    if wd is not None:
        if nxt:   # that day of next week (weeks begin on Monday)
            return (today - timedelta(days=today.weekday()) + timedelta(days=7 + wd)).isoformat()
        return (today + timedelta(days=(wd - today.weekday()) % 7)).isoformat()
    m = re.fullmatch(r"(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})[日号]?", s)
    if m:
        try:
            d = date(int(m.group(1) or today.year), int(m.group(2)), int(m.group(3)))
        except ValueError:
            sys.exit(f"no such day: {s}")
        if not m.group(1) and (today - d).days > 180:   # "1/5" said in December is next January's
            d = d.replace(year=d.year + 1)
        return d.isoformat()
    sys.exit(f"can't read the day {s!r} — try today, tomorrow, +3, fri, next-fri, 2026-11-20, 11/20 or none")


def a_time(s):
    s = (s or "").strip()
    if s.lower() in ("", "none", "no", "-", "无"):
        return ""
    m = re.fullmatch(r"(\d{1,2})[:：.](\d{2})", s) or re.fullmatch(r"(\d{1,2})()", s)
    if m and int(m.group(1)) < 24 and int(m.group(2) or 0) < 60:
        return f"{int(m.group(1)):02d}:{int(m.group(2) or 0):02d}"
    sys.exit(f"can't read the time {s!r} — write it as 15:30")


def label(d, today):
    k = (d - today).days
    name = {0: "today", 1: "tomorrow", -1: "yesterday"}.get(k, "")
    return (name + " · " if name else "") + f"{DAYS[d.weekday()].capitalize()} {d.isoformat()}"


def line(it, today=None, show_day=False):
    day = ""
    if show_day and it.get("date"):
        d = date.fromisoformat(it["date"]); day = f"{DAYS[d.weekday()].capitalize()} {d.month:>2}/{d.day:<2} "
    out = f"  {it['id']}  {day}{it.get('time') or '  ·  '}  {it['title']}"
    if it.get("due"):
        out += "  (last day)"
    if it.get("done"):
        out += "  ✓"
    if it.get("note"):
        out += "\n" + " " * 15 + "— " + it["note"].replace("\n", " ")[:160]
    return out


def order(it):
    return (it.get("date") or "9999", it.get("time") or "99:99", it.get("no", 0))


def show(days=14, done=False):
    d = call("/app/plan")
    today = date.fromisoformat(d["today"])
    print(f"their today: {label(today, today).split(' · ')[-1]}" + (f"  ({d['tz']})" if d.get("tz") else "  (UTC — no time zone in now.md)"))
    items = sorted(d.get("items", []), key=order)
    open_ = [it for it in items if not it.get("done")]
    late = [it for it in open_ if it.get("date") and it["date"] < d["today"]]
    if late:
        print("\noverdue")
        for it in late:
            print(line(it, today, True))
    last = (today + timedelta(days=days)).isoformat()
    seen = None
    for it in open_:
        if not it.get("date") or it["date"] < d["today"] or it["date"] > last:
            continue
        if it["date"] != seen:
            seen = it["date"]; print("\n" + label(date.fromisoformat(seen), today))
        print(line(it))
    far = [it for it in open_ if it.get("date") and it["date"] > last]
    if far:
        print(f"\nlater (past {days} days)")
        for it in far:
            print(line(it, today, True))
    loose = [it for it in open_ if not it.get("date")]
    if loose:
        print("\nno day yet")
        for it in loose:
            print(line(it))
    if done:
        gone = sorted((it for it in items if it.get("done")), key=lambda it: it.get("done_at") or "", reverse=True)[:30]
        if gone:
            print("\ndone (latest first)")
            for it in gone:
                print(line(it, today, True))
    if not open_:
        print("\nnothing written down.")


def main():
    ap = argparse.ArgumentParser(description="Nyx plan (日程)")
    sub = ap.add_subparsers(dest="cmd")
    p = sub.add_parser("ls"); p.add_argument("--days", type=int, default=14); p.add_argument("--done", action="store_true")
    p = sub.add_parser("add"); p.add_argument("title"); p.add_argument("-d", "--day", default=""); p.add_argument("-t", "--time", default="")
    p.add_argument("-n", "--note", default=""); p.add_argument("--due", action="store_true"); p.add_argument("--who", default=WHO)
    p = sub.add_parser("set"); p.add_argument("id"); p.add_argument("-d", "--day"); p.add_argument("-t", "--time"); p.add_argument("--title")
    p.add_argument("-n", "--note"); p.add_argument("--due", choices=("0", "1"))
    p = sub.add_parser("done"); p.add_argument("id", nargs="+")
    p = sub.add_parser("undo"); p.add_argument("id", nargs="+")
    p = sub.add_parser("rm"); p.add_argument("id")
    a = ap.parse_args()
    if a.cmd in (None, "ls"):
        return show(getattr(a, "days", 14), getattr(a, "done", False))
    if a.cmd in ("add", "set"):
        today = date.fromisoformat(call("/app/plan?rev=-2")["today"])
    if a.cmd == "add":
        it = call("/app/plan", {"title": a.title, "note": a.note, "date": a_day(a.day, today), "time": a_time(a.time), "due": a.due, "by": a.who})
        print("written down" + (": " + label(date.fromisoformat(it["date"]), today) if it["date"] else " (no day yet)")); print(line(it))
    elif a.cmd == "set":
        b = {}
        if a.day is not None: b["date"] = a_day(a.day, today)
        if a.time is not None: b["time"] = a_time(a.time)
        if a.title is not None: b["title"] = a.title
        if a.note is not None: b["note"] = a.note
        if a.due is not None: b["due"] = a.due == "1"
        if not b:
            sys.exit("nothing to change: give -d, -t, --title, -n or --due")
        it = call(f"/app/plan/{a.id.upper()}", b)
        print("changed" + (": " + label(date.fromisoformat(it["date"]), today) if it["date"] else " (no day yet)")); print(line(it))
    elif a.cmd in ("done", "undo"):
        for pid in a.id:
            print(line(call(f"/app/plan/{pid.upper()}", {"done": a.cmd == "done"}), None, True))
    elif a.cmd == "rm":
        call(f"/app/plan/{a.id.upper()}", {"delete": True}); print(f"{a.id.upper()} taken off")


if __name__ == "__main__":
    main()
