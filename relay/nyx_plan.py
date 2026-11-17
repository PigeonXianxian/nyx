"""Plan (日程): what is to be done, day by day — by your human, and by the three they work with.

  GET  /app/plan[?rev=N]   {rev, items, members, today, tz}   — {rev, same: true, today} when nothing changed since rev N
  POST /app/plan           {title, note?, date?, time?, end?, due?, owner?, by?}         → the new entry
  POST /app/plan/<id>      {title?, note?, date?, time?, end?, due?, owner?, done?} | {delete: true}   → the entry | {ok}
  POST /app/plan/members   {names: {m2: "…", …}}   what each of the four is called          → {members, rev}

It is a team's plan: four members (m1 is your human; names are theirs to change), and every entry is either one
member's (`owner`: they took it on) or nobody's yet ("": it waits to be taken on).
An entry: {id "P012", title, note, date "YYYY-MM-DD" ("" = no day yet), time "HH:MM" ("" = no hour), end "HH:MM" (""
= no saying how long; only with a time, later than it, "24:00" at most), due (the date is the last day for it, not the
day itself), owner ("m1"…"m4" or ""), done, done_at, by (who wrote it down), ts, updated}.
The page lays the days out as a timetable — hours down the side, a block from `time` to `end` — so say the hours when
they are known. Moving the time of an entry that has an end keeps it as long as it was, unless an end is given too.
Kept in plan.json next to the relay's database (RELAY_PLAN_FILE to put it elsewhere).

The page is plan.html; who is looking is chosen there, on each device. The companion writes here from the terminal
with relay/plan.py: what its human says they have to do goes into the plan, not into memory notes. The "right now"
card (nyx_now.py) carries what is coming up for its human, one line, so the companion knows the next days without asking.
Mounted from app.py with `nyx_plan.register(app, globals())`.

This file is part of the Nyx relay, a modified version of Tidal Echo, and is
licensed under the GNU AGPL v3 (see LICENSE and NOTICE in this folder).
"""
import asyncio
import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Request

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
FILE = None          # set in register()
IDS = ("m1", "m2", "m3", "m4")
HUMAN = ""           # how the relay calls its human: the first member's name until they change it
DATE_RE, TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$"), re.compile(r"^\d{1,2}:\d{2}$")


def clip(x, n):
    return str(x or "").strip()[:n]


def zone():
    """(tz name, ZoneInfo | None): the human's clock, as the "right now" card has it."""
    try:
        import nyx_now
        got = nyx_now.read_card()
        if got and got[1]:
            return got[1], ZoneInfo(got[1])
    except Exception:
        pass
    return "", None


def today(z=None) -> date:
    return datetime.now(z).date() if z else datetime.utcnow().date()


def a_date(s) -> str:
    """"" for none; a real YYYY-MM-DD, or a 400."""
    s = clip(s, 10)
    if not s:
        return ""
    try:
        if not DATE_RE.match(s):
            raise ValueError
        return date.fromisoformat(s).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")


def a_time(s) -> str:
    s = clip(s, 5)
    if not s:
        return ""
    if TIME_RE.match(s):
        h, m = (int(v) for v in s.split(":"))
        if h < 24 and m < 60:
            return f"{h:02d}:{m:02d}"
    raise HTTPException(status_code=400, detail="time must be HH:MM")


def mins(s) -> int:
    h, m = (int(v) for v in s.split(":"))
    return h * 60 + m


def an_end(s, start) -> str:
    """When it is over: "" for no saying, HH:MM later than `start` ("24:00" is the day's end), or a 400."""
    s = clip(s, 5)
    if not s:
        return ""
    if not start:
        raise HTTPException(status_code=400, detail="an end needs a time to begin at")
    if TIME_RE.match(s):
        h, m = (int(v) for v in s.split(":"))
        if (h < 24 and m < 60 or (h, m) == (24, 0)) and h * 60 + m > mins(start):
            return f"{h:02d}:{m:02d}"
    raise HTTPException(status_code=400, detail="end must be HH:MM, later than the time")


def an_owner(v) -> str:
    v = clip(v, 4)
    if v and v not in IDS:
        raise HTTPException(status_code=400, detail="owner must be m1…m4, or empty for nobody yet")
    return v


def load() -> dict:
    d = None
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    if not (isinstance(d, dict) and isinstance(d.get("items"), list)):
        d = {"rev": 0, "items": []}
    names = {m.get("id"): clip(m.get("name"), 12) for m in d.get("members") or [] if isinstance(m, dict)}
    d["members"] = [{"id": i, "name": names.get(i) or dflt} for i, dflt in zip(IDS, (HUMAN or "甲", "乙", "丙", "丁"))]
    for it in d["items"]:
        if it.get("owner") not in IDS:
            it["owner"] = "" if "owner" in it else "m1"   # written down before there was a team: it was the human's
        it.setdefault("end", "")
    return d


def save(d: dict) -> None:
    d["rev"] = int(d.get("rev") or 0) + 1
    tmp = FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(FILE)


def order(it):
    """Within a day: what has an hour first, by the hour; then the rest as they were written down."""
    return (it.get("time") or "99:99", it.get("no", 0))


def mtime() -> float:
    try:
        return FILE.stat().st_mtime
    except (OSError, AttributeError):
        return 0.0


def card_line(z=None, days=7, cap=8) -> str:
    """One line for the "right now" card: what is overdue, today, and in the days after. "" when there is nothing."""
    if FILE is None:
        return ""
    t = today(z)
    every = [it for it in load()["items"] if not it.get("done")]
    items = [it for it in every if it.get("date") and it.get("owner") == "m1"]   # the human's own
    late = [it for it in items if it["date"] < t.isoformat()]
    parts, n = ([f"overdue {len(late)}"] if late else []), 0
    for k in range(days + 1):
        d = t + timedelta(days=k)
        on = sorted((it for it in items if it["date"] == d.isoformat()), key=order)
        if not on or n >= cap:
            continue
        on, n = on[:cap - n], n + len(on[:cap - n])
        name = "today" if k == 0 else "tomorrow" if k == 1 else f"{DAYS[d.weekday()]} {d.month}/{d.day}"
        parts.append(name + " — " + ", ".join(((it["time"] + ("–" + it["end"] if it.get("end") else "") + " ") if it.get("time") else "") + clip(it["title"], 40)
                                               + (" (last day)" if it.get("due") else "") for it in on))
    open_ = sum(1 for it in every if not it.get("owner"))
    if open_:
        parts.append(f"{open_} waiting for someone on the team to take")
    return ("plan · " + " · ".join(parts)) if parts else ""


def register(app, g):
    global FILE, HUMAN
    check_auth, now_iso, human = g["check_auth"], g["now_iso"], g.get("HUMAN_NAME", "")
    HUMAN = clip(human, 12)
    FILE = Path(os.environ.get("RELAY_PLAN_FILE") or Path(g["DB_PATH"]).parent / "plan.json")
    lock, log = asyncio.Lock(), g.get("log")

    def head():
        name, z = zone()
        return {"today": today(z).isoformat(), "tz": name}

    @app.get("/app/plan")
    async def plan_list(request: Request, rev: int = -1):
        check_auth(request)
        d = load()
        if rev == d.get("rev", 0):
            return {"rev": rev, "same": True, **head()}
        return {"rev": d.get("rev", 0), "items": d["items"], "members": d["members"], **head()}

    @app.post("/app/plan")
    async def plan_add(request: Request):
        check_auth(request)
        b = await request.json()
        title = clip(b.get("title"), 200)
        if not title:
            raise HTTPException(status_code=400, detail="title required")
        when, hour, owner = a_date(b.get("date")), a_time(b.get("time")), an_owner(b.get("owner"))
        until = an_end(b.get("end"), hour)
        async with lock:
            d = load()
            no = max([it.get("no", 0) for it in d["items"]] + [0]) + 1
            it = {"id": f"P{no:03d}", "no": no, "title": title, "note": clip(b.get("note"), 2000), "date": when, "time": hour, "end": until,
                  "due": bool(b.get("due")) and bool(when), "owner": owner, "done": False, "done_at": "",
                  "by": clip(b.get("by") or human, 20), "ts": now_iso(), "updated": now_iso()}
            d["items"].append(it)
            save(d)
        return {**it, "rev": d["rev"]}

    @app.post("/app/plan/members")
    async def plan_members(request: Request):
        check_auth(request)
        b = await request.json()
        names = b.get("names") if isinstance(b.get("names"), dict) else {}
        async with lock:
            d = load()
            for m in d["members"]:
                if clip(names.get(m["id"]), 12):
                    m["name"] = clip(names[m["id"]], 12)
            save(d)
        return {"members": d["members"], "rev": d["rev"]}

    @app.post("/app/plan/{pid}")
    async def plan_edit(request: Request, pid: str):
        check_auth(request)
        b = await request.json()
        async with lock:
            d = load()
            it = next((x for x in d["items"] if x.get("id") == pid), None)
            if not it:
                raise HTTPException(status_code=404, detail="no such entry")
            if b.get("delete"):
                d["items"].remove(it)
                save(d)
                return {"ok": True, "rev": d["rev"]}
            if "title" in b:
                title = clip(b["title"], 200)
                if not title:
                    raise HTTPException(status_code=400, detail="title required")
                it["title"] = title
            if "note" in b:
                it["note"] = clip(b["note"], 2000)
            if "date" in b:
                it["date"] = a_date(b["date"])
            if "time" in b or "end" in b:
                was, hour = it.get("time") or "", a_time(b["time"]) if "time" in b else it.get("time") or ""
                if "end" in b:
                    until = an_end(b["end"], hour)
                elif it.get("end") and was and hour:   # moved: as long as it was, the day's end at most
                    until = mins(hour) + mins(it["end"]) - mins(was)
                    until = "" if until <= mins(hour) else f"{min(until, 1440) // 60:02d}:{min(until, 1440) % 60:02d}"
                else:
                    until = ""
                it["time"], it["end"] = hour, until
            if "due" in b:
                it["due"] = bool(b["due"])
            if "owner" in b:
                it["owner"] = an_owner(b["owner"])
            if not it["date"]:
                it["due"] = False
            if "done" in b and bool(b["done"]) != bool(it.get("done")):
                it["done"] = bool(b["done"])
                it["done_at"] = now_iso() if it["done"] else ""
            it["updated"] = now_iso()
            save(d)
        return {**it, "rev": d["rev"]}

    g["PLAN"] = {"line": card_line, "mtime": mtime}   # for the "right now" card
    if log:
        log.info("plan: %s", FILE)
