"""Plan (日程): what your human has to do, day by day.

  GET  /app/plan[?rev=N]   {rev, items, today, tz}   — {rev, same: true, today} when nothing changed since rev N
  POST /app/plan           {title, note?, date?, time?, due?, by?}               → the new entry
  POST /app/plan/<id>      {title?, note?, date?, time?, due?, done?} | {delete: true}   → the entry | {ok}

An entry: {id "P012", title, note, date "YYYY-MM-DD" ("" = no day yet), time "HH:MM" ("" = no hour), due (the date
is the last day for it, not the day itself), done, done_at, by (who wrote it down), ts, updated}.
Kept in plan.json next to the relay's database (RELAY_PLAN_FILE to put it elsewhere).

The page is plan.html. The companion writes here from the terminal with relay/plan.py: what its human says they have
to do goes into the plan, not into memory notes. The "right now" card (nyx_now.py) carries what is coming up, one
line, so the companion knows the next days without asking.
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


def load() -> dict:
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        if isinstance(d, dict) and isinstance(d.get("items"), list):
            return d
    except Exception:
        pass
    return {"rev": 0, "items": []}


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
    items = [it for it in load()["items"] if not it.get("done") and it.get("date")]
    late = [it for it in items if it["date"] < t.isoformat()]
    parts, n = ([f"overdue {len(late)}"] if late else []), 0
    for k in range(days + 1):
        d = t + timedelta(days=k)
        on = sorted((it for it in items if it["date"] == d.isoformat()), key=order)
        if not on or n >= cap:
            continue
        on, n = on[:cap - n], n + len(on[:cap - n])
        name = "today" if k == 0 else "tomorrow" if k == 1 else f"{DAYS[d.weekday()]} {d.month}/{d.day}"
        parts.append(name + " — " + ", ".join(((it["time"] + " ") if it.get("time") else "") + clip(it["title"], 40)
                                               + (" (last day)" if it.get("due") else "") for it in on))
    return ("plan · " + " · ".join(parts)) if parts else ""


def register(app, g):
    global FILE
    check_auth, now_iso, human = g["check_auth"], g["now_iso"], g.get("HUMAN_NAME", "")
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
        return {"rev": d.get("rev", 0), "items": d["items"], **head()}

    @app.post("/app/plan")
    async def plan_add(request: Request):
        check_auth(request)
        b = await request.json()
        title = clip(b.get("title"), 200)
        if not title:
            raise HTTPException(status_code=400, detail="title required")
        when, hour = a_date(b.get("date")), a_time(b.get("time"))
        async with lock:
            d = load()
            no = max([it.get("no", 0) for it in d["items"]] + [0]) + 1
            it = {"id": f"P{no:03d}", "no": no, "title": title, "note": clip(b.get("note"), 2000), "date": when, "time": hour,
                  "due": bool(b.get("due")) and bool(when), "done": False, "done_at": "",
                  "by": clip(b.get("by") or human, 20), "ts": now_iso(), "updated": now_iso()}
            d["items"].append(it)
            save(d)
        return {**it, "rev": d["rev"]}

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
            if "time" in b:
                it["time"] = a_time(b["time"])
            if "due" in b:
                it["due"] = bool(b["due"])
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
