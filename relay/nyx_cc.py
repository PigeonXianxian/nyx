"""Nyx · the chat page's Claude Code controls: what you would reach for in Claude Code itself, from the letter page.

  GET  /app/cc                     model · effort · permission mode · limits (5h, week, per model) · what can be picked
  GET  /app/cc/commands            the slash commands this Claude Code knows, sorted: here (the page does it) · terminal · skill
  POST /app/cc/model   {model}     /model in the window; mid-turn it waits for a quiet moment (pending)
  POST /app/cc/effort  {level}     /effort in the window; the same
  POST /app/cc/mode    {mode}      shift+tab until the window's footer shows that mode
  POST /app/cc/run     {text}      a terminal command (/context, /mcp, /fast on …) typed into the window; what it prints comes
                                   back and both are kept in the chat (kinds "cmd" and "term"), so they survive a reload
  GET  /app/cc/sessions            every window (Claude Code session) with its title, group and archived flag; the groups
  POST /app/cc/sessions/meta       {sid, title?, group?, archived?}
  POST /app/cc/sessions/group      {op: new|rename|delete|fold, id?, name?, fold?}
  POST /app/cc/sessions/new        {group?}   a new window (as /app/window/new), filed under that group

Where the numbers come from. Limits, the model list and the command list are Claude Code's own answers: a short-lived
`claude -p` in SDK mode is asked `initialize` and `get_usage`, the requests the VS Code extension makes (no prompt is sent,
nothing is spent). The status-line file only refreshes when the window draws, so it goes stale when nobody talks; it is the
fallback. Which model / effort / mode the window is in is read off the window: its footer, its effort badge, its transcript,
and the status-line file when that file is this window's.

A pick made here belongs to the window, not to your defaults: Claude Code saves /model and /effort as the default for every
new session, so settings.json's model and modelSettings are put back afterwards. The window's next start keeps the pick
through the relay's data dir instead (model, effort_now, mode_pick; channel/start-channel.sh reads them).

Mounted from nyx_extras.register (it needs the window helpers there). Part of the Nyx relay, a modified Tidal Echo, GNU AGPL v3.
"""
import asyncio
import json
import os
import re
import secrets
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, Request

from nyx_device import split_mark   # the 【设备 · …】 line the chat page's device chip puts on what you send

SETTINGS = Path.home() / ".claude" / "settings.json"
LEVELS = ("low", "medium", "high", "xhigh", "max")
# the permission modes shift+tab goes through, in its order, and what the footer says for each
MODES = [("default", "ask first", "manual mode"), ("acceptEdits", "accept edits", "accept edits"),
         ("plan", "plan", "plan mode"), ("auto", "auto", "auto mode")]
FOOT = {f: k for k, _, f in MODES}
FOOT["bypass permissions"] = "bypassPermissions"
MODE_RE = re.compile(r"(manual mode|accept edits|plan mode|auto mode|bypass permissions) on\b")
BADGE_RE = re.compile(r"[●◉○◎•]\s*(low|medium|high|xhigh|max)\s*·\s*/effort")
BANNER_RE = re.compile(r"with (low|medium|high|xhigh|max) effort")
SID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CMD_RE = re.compile(r"^/([A-Za-z0-9][A-Za-z0-9:_-]{0,60})(?:[ \t]+(.*))?$", re.S)

# The page does these itself, with its own pickers (some are not Claude Code commands at all: /mode, /sessions, /new).
HERE = {
    "model": ("[model]", "Pick the model"),
    "effort": ("[low|medium|high|xhigh|max]", "How hard it thinks"),
    "mode": ("[ask|edits|plan|auto]", "Permission mode: ask first, accept edits, plan, auto"),
    "compact": ("[what to keep]", "Summarise the window so far to free up context"),
    "clear": ("", "Another window, in a tab of its own"),
    "new": ("", "Another window, in a tab of its own"),
    "sessions": ("", "All windows, in groups: open, rename, file, archive"),
    "resume": ("", "Go back to an earlier window"),
    "rename": ("<title>", "Name this window"),
    "files": ("", "Files handed over to you, to download"),
    "usage": ("", "Limits: 5 hours, the week, per model"),
    "help": ("", "What the slash commands do"),
}
# Typed into the window; what it prints (or the dialog it opens) comes back to the chat.
TERMINAL = {"context", "advisor", "autocompact", "color", "config", "output-style", "fast", "focus", "mcp", "reload-plugins",
            "reload-skills", "usage-credits", "skill-doctor", "list-agents", "recap", "goal", "design-consent", "design-revoke",
            "status", "cost", "memory", "permissions", "hooks", "doctor-terminal"}
HIDDEN = {"__remote-workflow", "workflow-launch-exec", "heapdump", "auto-mode-setup", "import", "extra-usage"}


def _epoch(iso):
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def claude_exe():
    """The Claude Code binary. An npm install whose postinstall did not run leaves a stub that only prints an error; the
    platform package with the real binary sits next to it, so use that."""
    if os.environ.get("RELAY_CLAUDE_BIN"):
        return os.environ["RELAY_CLAUDE_BIN"]
    w = shutil.which("claude") or "/usr/bin/claude"
    real = os.path.realpath(w)
    try:
        if os.path.getsize(real) > 8192:
            return real
        with open(real, "rb") as f:
            if b"native binary not installed" not in f.read():
                return real
    except OSError:
        pass
    for c in sorted(Path(real).parent.parent.glob("node_modules/@anthropic-ai/claude-code-*/claude")):
        if os.access(c, os.X_OK):
            return str(c)
    return w


PIECE = 4 << 20


def new_lines(f, off, size, piece=PIECE):
    """What has been added to a transcript since byte `off`, a piece at a time: yields (whole lines, bytes they took).
    Read whole, a long session was held several times over (its bytes, its text, its lines) — 170 MB of transcript took
    2 GB and the relay with it (2026-11-19). A line longer than a piece (a picture) is read on until its end."""
    if size <= off:
        return
    with f.open("rb") as fh:
        fh.seek(off)
        left, rest = size - off, b""
        while left > 0:
            got = fh.read(min(piece, left))
            if not got:
                break
            left -= len(got)
            buf = rest + got
            cut = buf.rfind(b"\n") + 1   # only whole lines
            if not cut:
                rest = buf
                continue
            rest = buf[cut:]
            lines = buf[:cut].decode("utf-8", "ignore").split("\n")[:-1]
            del buf, got
            yield lines, cut


def register(app, g, x):
    """x: the locals of nyx_extras.register (tmux, session_meta, claude_busy, claude_restart, window_model …)."""
    check_auth, broadcast, now_iso = g["check_auth"], g["broadcast"], g["now_iso"]
    save_message, app_payload = g["save_message"], g["app_payload"]
    tmux, TMUX, session_meta, claude_busy = x["tmux"], x["TMUX"], x["session_meta"], x["claude_busy"]
    input_box_showing, backend = x["input_box_showing"], x["backend"]
    data_dir, model_file, CLAUDE_PROJECT, COMPANION_DIR = x["data_dir"], x["model_file"], x["CLAUDE_PROJECT"], x["COMPANION_DIR"]
    WORK_DIR, CHAT_MODE = x["WORK_DIR"], x["CHAT_MODE"]
    USAGE_FILE, window_model = x["USAGE_FILE"], x["window_model"]
    effort_file, effort_pending = x["EFFORT_FILE"], x["EFFORT_PENDING"]
    mode_file, pending_file, meta_file = data_dir / "mode_pick", data_dir / "cc_pending.json", data_dir / "windows_meta.json"
    # tabs: side windows next to the main one (nyx_extras: live_windows, open_side …). Everything below that acts on a window
    # takes its tmux name; the main window's picks are kept in the data dir for its next start, a side window's only here.
    tgt, live_windows, window_of, is_window = x["tgt"], x["live_windows"], x["window_of"], x["is_window"]
    open_side, close_side, side_picks, MAX_WINDOWS = x["open_side"], x["close_side"], x["side_picks"], x["MAX_WINDOWS"]
    window_room = x["window_room"]
    side_pending = {}   # sid -> {"model": …, "effort": …} waiting for a side window to be quiet

    async def win(sid):
        """A tab's window by its session id ("" = the main one); 404 if that session isn't open in any window."""
        name = await asyncio.to_thread(window_of, str(sid or ""))
        if not name:
            raise HTTPException(status_code=404, detail="that session isn't open in a window")
        return name

    # ---------------- what Claude Code itself says: initialize + get_usage ----------------
    probe = {"init": None, "init_at": 0.0, "usage": None, "usage_at": 0.0, "err": "", "tried": 0.0}
    probe_lock = asyncio.Lock()

    async def run_probe(usage=True):
        env = {k: v for k, v in os.environ.items()
               if k in ("PATH", "HOME", "USER", "LOGNAME", "LANG", "SHELL", "TERM", "TMPDIR") or k.startswith("LC_")}   # no API key: the account's own limits
        cwd = str(COMPANION_DIR) if Path(COMPANION_DIR).is_dir() else str(Path.home())
        proc = await asyncio.create_subprocess_exec(
            claude_exe(), "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
            "--no-session-persistence", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, cwd=cwd, env=env, limit=16 * 1024 * 1024)

        async def ask(rid, req):
            proc.stdin.write((json.dumps({"type": "control_request", "request_id": rid, "request": req}) + "\n").encode())
            await proc.stdin.drain()
            while True:
                line = await proc.stdout.readline()
                if not line:
                    raise RuntimeError("claude closed")
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                r = d.get("response") or {}
                if d.get("type") == "control_response" and r.get("request_id") == rid:
                    if r.get("subtype") == "error":
                        raise RuntimeError(str(r.get("error"))[:200])
                    return r.get("response") or {}
        try:
            ini = await asyncio.wait_for(ask("i", {"subtype": "initialize"}), 30)
            use = await asyncio.wait_for(ask("u", {"subtype": "get_usage"}), 30) if usage else None
        finally:
            try:
                proc.stdin.close()
            except Exception:
                pass
            try:
                await asyncio.wait_for(proc.wait(), 5)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
        return ini, use

    async def refresh(usage_age=110.0, init_age=1800.0, wait=9.0):
        now = time.time()
        need_u, need_i = now - probe["usage_at"] > usage_age, now - probe["init_at"] > init_age
        if not (need_u or need_i) or now - probe["tried"] < 20:
            return

        async def go():
            async with probe_lock:
                if time.time() - probe["tried"] < 20:
                    return
                probe["tried"] = time.time()
                try:
                    ini, use = await run_probe(usage=True)
                    probe.update(init=ini, init_at=time.time(), err="")
                    if use and use.get("rate_limits_available") is not False:
                        probe.update(usage=use, usage_at=time.time())
                except Exception as e:   # keep the last good answer
                    probe["err"] = type(e).__name__ + ": " + str(e)[:160]
        task = asyncio.get_running_loop().create_task(go())
        if probe["usage"] is None or probe["init"] is None:   # nothing to show yet: wait for it a little
            try:
                await asyncio.wait_for(asyncio.shield(task), wait)
            except asyncio.TimeoutError:
                pass

    def models():
        ini = probe["init"] or {}
        out = []
        for m in ini.get("models") or []:
            v = str(m.get("value") or "")
            if not v:
                continue
            out.append({"id": v, "model": m.get("resolvedModel") or v, "name": m.get("displayName") or v,
                        "desc": m.get("description") or "", "efforts": [e for e in m.get("supportedEffortLevels") or [] if e in LEVELS],
                        "fast": bool(m.get("supportsFastMode")), "more": v.startswith("claude-")})
        return out

    def limits():
        rl = (probe["usage"] or {}).get("rate_limits") or {}
        out = []
        for l in rl.get("limits") or []:
            kind = str(l.get("kind") or "")
            who = (((l.get("scope") or {}).get("model") or {}).get("display_name")) or ""
            label = {"session": "5h", "weekly_all": "week"}.get(kind) or who or kind.replace("_", " ")
            out.append({"key": kind + (":" + who if who else ""), "label": label, "used": l.get("percent"),
                        "resets_at": _epoch(l.get("resets_at")), "severity": l.get("severity"), "active": bool(l.get("is_active"))})
        if not out:
            for k, lab in (("five_hour", "5h"), ("seven_day", "week")):
                v = rl.get(k)
                if isinstance(v, dict):
                    out.append({"key": k, "label": lab, "used": v.get("utilization"), "resets_at": _epoch(v.get("resets_at"))})
        return out

    def plan_name():
        ini = probe["init"] or {}
        s = str(((ini.get("account") or {}).get("subscriptionType")) or (probe["usage"] or {}).get("subscription_type") or "")
        return re.sub(r"^Claude\s+", "", s)

    # ---------------- what the window is in right now ----------------
    def statusline(sid):
        """The status-line file, if the last window to draw was this one: (data, mtime)."""
        try:
            d = json.loads(USAGE_FILE.read_text(encoding="utf-8"))
            return (d, USAGE_FILE.stat().st_mtime) if sid and d.get("session_id") == sid else ({}, 0)
        except (OSError, ValueError):
            return {}, 0

    def mtime(p):
        try:
            return p.stat().st_mtime
        except OSError:
            return 0

    def read(p):
        try:
            return p.read_text(encoding="utf-8").strip()
        except OSError:
            return ""

    def transcript_mode(sid):
        f = CLAUDE_PROJECT / f"{sid}.jsonl"
        try:
            with f.open("rb") as fh:
                fh.seek(max(0, f.stat().st_size - 800_000))
                lines = fh.read().decode("utf-8", "ignore").splitlines()
        except OSError:
            return None
        for line in reversed(lines):
            if '"permission-mode"' in line:
                try:
                    return json.loads(line).get("permissionMode")
                except ValueError:
                    continue
        return None

    def footer_mode(text):
        for l in reversed([l for l in (text or "").splitlines() if l.strip()][-6:]):
            m = MODE_RE.search(l)
            if m:
                return FOOT[m.group(1)]
        return None

    def capture(scroll=0, name=TMUX):
        a = ["capture-pane", "-p", "-t", tgt(name)] + (["-J", "-S", str(-scroll)] if scroll else [])
        p = tmux(*a)
        return p.stdout if p.returncode == 0 else None

    def window_state(name=TMUX):
        main = name == TMUX
        sid = str(session_meta(name).get("sessionId") or "")
        text = capture(name=name)
        mine = side_picks.get(sid) or {}
        sl, sl_at = statusline(sid)
        names, by_model = {m["id"]: m for m in models()}, {}
        for m in models():   # a full model id → its short name (opus, fable …), which come first in the list
            if m["id"] != "default":
                by_model.setdefault(m["model"], m)
        # the model: whichever source spoke last — the status line, the last reply in the transcript, or a pick made here
        cands = []
        if (sl.get("model") or {}).get("id"):
            cands.append((sl_at, sl["model"]["id"]))
        mid, at = window_model(name)
        if mid:
            cands.append((at, mid))
        pick = read(model_file) if main else (mine.get("model") or ("",))[0]
        if pick:
            cands.append((mtime(model_file) if main else mine["model"][1], pick))
        cur = max(cands)[1] if cands else None
        entry = names.get(cur) or by_model.get(cur) or {}
        model = {"id": entry.get("id") or cur, "model": entry.get("model") or cur,
                 "name": entry.get("name") or ((sl.get("model") or {}).get("display_name")) or cur}
        if entry.get("id") == "default":
            model["name"] = (by_model.get(entry.get("model")) or {}).get("name") or model["name"]
        # effort: the status line if it's this window's and newer than a pick made here; then the badge on the pane
        effort = None
        if sl.get("effort") and sl_at >= (mtime(effort_file) if main else (mine.get("effort") or ("", 0))[1]):
            effort = (sl.get("effort") or {}).get("level")
        if not effort and text:
            m = BADGE_RE.search(text) or BANNER_RE.search(text)
            effort = m and m.group(1)
        if not effort:
            effort = (read(effort_file) if main else (mine.get("effort") or ("",))[0]) or None
        if not effort:
            try:
                ms = json.loads(SETTINGS.read_text()).get("modelSettings") or {}
                effort = (ms.get(model["model"] or "") or {}).get("effortLevel")
            except (OSError, ValueError):
                pass
        mode = footer_mode(text) if text else None
        if not mode and sid:
            mode = transcript_mode(sid)
        pend = load_pending(name, sid)
        if main and read(effort_pending):
            pend.setdefault("effort", read(effort_pending))
        return {"sid": sid, "main": main, "online": text is not None, "model": model, "effort": effort if effort in LEVELS else None,
                "mode": mode, "fast": bool(sl.get("fast_mode")) if sl else None, "pending": pend,
                "efforts": entry.get("efforts") or list(LEVELS)}

    async def state(name=TMUX):
        await refresh()
        st = await asyncio.to_thread(window_state, name)
        st.update(models=models(), limits=limits(), plan=plan_name(), modes=[{"id": k, "name": n} for k, n, _ in MODES],
                  limits_at=probe["usage_at"] or None, probe_error=probe["err"] or None)
        return st

    async def enrich(m, name=TMUX):
        """GET /app/meter for Claude Code: the live limits and the full model list over what the status line said."""
        try:
            st = await state(name)
        except Exception as e:
            m["probe_error"] = str(e)[:200]
            return m
        if st["limits"]:
            m["limits"], m["limits_at"] = st["limits"], st["limits_at"]
        else:
            m["limits_stale"] = True
        if st["models"]:
            m["models"] = st["models"]
        if st["plan"]:
            m["plan"] = st["plan"]
        if st["model"].get("id"):
            m["model"] = {"id": st["model"]["id"], "name": st["model"]["name"], "model": st["model"]["model"]}
        m.update(cc=True, effort=st["effort"], efforts=st["efforts"], mode=st["mode"], modes=st["modes"],
                 fast=st["fast"], pending=st["pending"], online=st["online"])
        return m

    # ---------------- doing things in the window ----------------
    def snapshot():
        try:
            d = json.loads(SETTINGS.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return {k: (json.dumps(d[k], sort_keys=True), d[k]) if k in d else None for k in ("model", "modelSettings")}

    def restore(snap):
        """Put settings.json's model / modelSettings back the way they were; nothing else in the file is touched."""
        if snap is None:
            return
        try:
            raw = SETTINGS.read_text(encoding="utf-8")
            d = json.loads(raw)
        except (OSError, ValueError):
            return
        changed = False
        for k, v in snap.items():
            now = json.dumps(d.get(k), sort_keys=True) if k in d else None
            if now != (v and v[0]):
                changed = True
                if v is None:
                    d.pop(k, None)
                else:
                    d[k] = v[1]
        if changed:
            tmp = SETTINGS.with_suffix(".nyx.tmp")
            tmp.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            os.replace(tmp, SETTINGS)

    async def keep_defaults(snap):
        await asyncio.to_thread(restore, snap)
        await asyncio.sleep(1.5)   # in case Claude Code writes the file a moment after it says so
        await asyncio.to_thread(restore, snap)

    async def ready(busy_ok=False, name=TMUX):
        """True: the window is idle at its input box. False: it is mid-turn. Raises when it's closed or a question is up."""
        st = await asyncio.to_thread(claude_busy, name)
        if st.get("state") == "offline":
            raise HTTPException(status_code=503, detail="the window isn't open")
        text = await asyncio.to_thread(capture, 0, name)
        if text is None:
            raise HTTPException(status_code=503, detail="the window isn't open")
        if not input_box_showing(text):
            raise HTTPException(status_code=409, detail="the window is waiting on a question; answer it in the terminal first")
        return busy_ok or st.get("state") == "idle"

    type_locks = {}   # one per window: what is typed into one window waits only for that window

    def type_lock(name=TMUX):
        return type_locks.setdefault(name, asyncio.Lock())

    async def type_line(line, name=TMUX):
        for a in (("C-u",), ("-l", "--", line), ("Enter",)):
            p = await asyncio.to_thread(tmux, "send-keys", "-t", tgt(name), *a)
            if p.returncode != 0:
                raise HTTPException(status_code=502, detail="couldn't reach the window")
            await asyncio.sleep(0.05)

    async def type_and_wait(line, mark, tries=12, name=TMUX):
        before = (await asyncio.to_thread(capture, 300, name) or "").count(mark)
        await type_line(line, name)
        for _ in range(tries):
            await asyncio.sleep(0.5)
            if (await asyncio.to_thread(capture, 300, name) or "").count(mark) > before:
                return True
        return False

    def keep_pick(name, kind, value, f):
        """The main window's pick goes in the data dir (its next start reads it); a side window's is only remembered here."""
        if name == TMUX:
            f.write_text(value, encoding="utf-8")
        else:
            sid = str(session_meta(name).get("sessionId") or "")
            if sid:
                side_picks.setdefault(sid, {})[kind] = (value, time.time())

    async def apply_model(mid, name=TMUX):
        async with type_lock(name):
            snap = await asyncio.to_thread(snapshot)
            ok = await type_and_wait("/model " + mid, "Set model to", name=name)
            asyncio.get_running_loop().create_task(keep_defaults(snap))
        if ok:
            keep_pick(name, "model", mid, model_file)
        return ok

    async def apply_effort(level, name=TMUX):
        async with type_lock(name):
            snap = await asyncio.to_thread(snapshot)
            ok = await type_and_wait("/effort " + level, "Set effort level to", name=name)
            asyncio.get_running_loop().create_task(keep_defaults(snap))
        if ok:
            keep_pick(name, "effort", level, effort_file)
            if name == TMUX:
                try:
                    effort_pending.unlink()
                except OSError:
                    pass
        return ok

    async def apply_mode(target, name=TMUX):
        async with type_lock(name):
            for _ in range(len(MODES) + 2):
                cur = footer_mode(await asyncio.to_thread(capture, 0, name))
                if cur == target:
                    keep_pick(name, "mode", target, mode_file)
                    return True
                if cur is None:
                    return False
                await asyncio.to_thread(tmux, "send-keys", "-t", tgt(name), "BTab")
                await asyncio.sleep(0.6)
        return False

    def load_pending(name=TMUX, sid=None):
        if name != TMUX:
            sid = sid if sid is not None else str(session_meta(name).get("sessionId") or "")
            return dict(side_pending.get(sid) or {})
        try:
            d = json.loads(pending_file.read_text())
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def save_pending(name=TMUX, **kw):
        if name != TMUX:
            sid = str(session_meta(name).get("sessionId") or "")
            d = side_pending.setdefault(sid, {})
            for k, v in kw.items():
                if v is None:
                    d.pop(k, None)
                else:
                    d[k] = v
            if not d:
                side_pending.pop(sid, None)
            return
        d = load_pending()
        for k, v in kw.items():
            if v is None:
                d.pop(k, None)
            else:
                d[k] = v
        if d:
            pending_file.write_text(json.dumps(d))
        else:
            try:
                pending_file.unlink()
            except OSError:
                pass

    async def pending_watch():
        """A model or effort picked mid-turn goes in once that window is quiet again."""
        while True:
            await asyncio.sleep(4)
            if backend() == "codex":
                continue
            ws = [(TMUX, "")]
            if side_pending:
                live = {w["sid"]: w["name"] for w in await asyncio.to_thread(live_windows) if w["sid"]}
                for sid in list(side_pending):
                    if sid in live:
                        ws.append((live[sid], sid))
                    else:
                        side_pending.pop(sid, None)   # its window closed
            for name, sid in ws:
                p = load_pending(name, sid or None)
                if not p:
                    continue
                try:
                    if not await ready(name=name):
                        continue
                    sid = sid or str(session_meta(name).get("sessionId") or "")
                    if p.get("model"):
                        ok = await apply_model(p["model"], name)
                        save_pending(name, model=None)
                        await say(f"model → {p['model']}" + ("" if ok else " (sent; the window didn't confirm)"), sid=sid)
                    if p.get("effort"):
                        ok = await apply_effort(p["effort"], name)
                        save_pending(name, effort=None)
                        await say(f"effort → {p['effort']}" + ("" if ok else " (sent; the window didn't confirm)"), sid=sid)
                except HTTPException:
                    continue
                except Exception:
                    continue

    g.setdefault("NYX_STARTUP", []).append(pending_watch)

    async def say(text, sid="", **meta):
        """A small note from the window into the chat (kind "term"): kept, shown to you, never sent to the companion.
        sid: the tab it belongs to, so the page shows it there."""
        msg = save_message("out", "term", text, {"ts": now_iso(), "note": True, **({"sid": sid} if sid else {}), **meta})
        await broadcast(g["app_subs"], app_payload(msg))
        return msg

    def parse_cmd(text):
        m = CMD_RE.match((text or "").strip())
        return (m.group(1).lower(), (m.group(2) or "").strip()) if m else (None, "")

    # ---------------- routes ----------------
    @app.get("/app/cc")
    async def cc_get(request: Request, sid: str = ""):
        check_auth(request)
        if backend() == "codex":
            raise HTTPException(status_code=404, detail="Claude Code only")
        return await state(await win(sid))

    @app.get("/app/cc/commands")
    async def cc_commands(request: Request):
        check_auth(request)
        await refresh(wait=12)
        seen, out = set(), []
        for name, (hint, desc) in HERE.items():
            out.append({"name": name, "hint": hint, "desc": desc, "kind": "here"})
            seen.add(name)
        for c in (probe["init"] or {}).get("commands") or []:
            n = str(c.get("name") or "")
            if not n or n in seen or n in HIDDEN or n.startswith("_"):
                continue
            seen.add(n)
            out.append({"name": n, "hint": c.get("argumentHint") or "", "desc": (c.get("description") or "")[:240],
                        "kind": "terminal" if n in TERMINAL else "skill", "aliases": c.get("aliases") or []})
        return {"commands": out, "error": probe["err"] or None}

    @app.post("/app/cc/model")
    async def cc_model(request: Request):
        check_auth(request)
        b = await request.json()
        mid = str(b.get("model") or "").strip()
        name = await win(b.get("sid"))
        await refresh(wait=12)
        if mid not in {m["id"] for m in models()}:
            raise HTTPException(status_code=400, detail="unknown model")
        if not await ready(name=name):
            save_pending(name, model=mid)
            return {"ok": True, "pending": True, "model": mid}
        save_pending(name, model=None)
        ok = await apply_model(mid, name)
        if b.get("note"):
            await say(f"/model {mid}  \u2192  " + ("set" if ok else "sent; the window didn't confirm"), sid=b.get("sid") or "")
        return {"ok": True, "model": mid, "confirmed": ok}

    @app.post("/app/cc/effort")
    async def cc_effort(request: Request):
        check_auth(request)
        b = await request.json()
        lv = str(b.get("level") or "").strip().lower()
        if lv not in LEVELS:
            raise HTTPException(status_code=400, detail="effort is one of " + ", ".join(LEVELS))
        name = await win(b.get("sid"))
        if not await ready(name=name):
            save_pending(name, effort=lv)
            return {"ok": True, "pending": True, "level": lv}
        save_pending(name, effort=None)
        ok = await apply_effort(lv, name)
        if b.get("note"):
            await say(f"/effort {lv}  \u2192  " + ("set" if ok else "sent; the window didn't confirm"), sid=b.get("sid") or "")
        return {"ok": True, "level": lv, "confirmed": ok}

    @app.post("/app/cc/mode")
    async def cc_mode(request: Request):
        check_auth(request)
        b = await request.json()
        md = str(b.get("mode") or "").strip()
        if md not in FOOT.values() or md == "bypassPermissions":
            raise HTTPException(status_code=400, detail="mode is one of " + ", ".join(k for k, _, _ in MODES))
        name = await win(b.get("sid"))
        await ready(busy_ok=True, name=name)   # shift+tab works mid-turn too
        ok = await apply_mode(md, name)
        if not ok:
            raise HTTPException(status_code=502, detail="the window didn't show that mode")
        if b.get("note"):
            await say(f"/mode {md}  \u2192  set", sid=b.get("sid") or "")
        return {"ok": True, "mode": md}

    # a terminal command: the echo of the command, then everything under it down to the input box
    def cut(text, name):
        lines = (text or "").rstrip("\n").splitlines()
        if not input_box_showing(text):   # a dialog (/usage, /mcp, /config …): its body under the ▔ rule
            top = max((i for i, l in enumerate(lines) if l.strip().startswith("▔")), default=None)
            body = lines[top + 1:] if top is not None else lines[-30:]
            return "\n".join(_tidy(body)), True
        box = max((i for i in range(len(lines) - 2) if lines[i].startswith("───") and lines[i + 1].startswith("❯")), default=len(lines))
        start = None
        for j in range(box - 1, -1, -1):
            s = lines[j].lstrip()
            if s.startswith("❯ /" + name) or s.startswith("> /" + name):
                start = j
                break
        if start is None:
            return "", False
        return "\n".join(_tidy(lines[start + 1:box])), False

    def _tidy(body):
        out = [l.rstrip() for l in body if not re.search(r"· /effort\s*$|scroll with PgUp/PgDn|Esc to cancel|Enter to confirm|^\s*❯\s*$", l)]
        while out and not out[-1].strip():
            out.pop()
        while out and not out[0].strip():
            out.pop(0)
        if out and re.match(r"^\s*⎿", out[0]):   # "  ⎿  Context Usage": the first line hangs off the command's echo
            out[0] = re.sub(r"^\s*⎿", lambda m: " " * len(m.group(0)), out[0])
        pad = min((len(l) - len(l.lstrip()) for l in out if l.strip()), default=0)
        return [l[pad:] for l in out]

    @app.post("/app/cc/run")
    async def cc_run(request: Request):
        check_auth(request)
        b = await request.json()
        text = str(b.get("text") or "").strip()
        name, args = parse_cmd(text)
        if not name or name not in TERMINAL or "\n" in text or len(text) > 400 or any(ord(c) < 32 for c in text):
            raise HTTPException(status_code=400, detail="not a terminal command")
        wsid = str(b.get("sid") or "")
        wn = await win(wsid)
        if not await ready(name=wn):
            raise HTTPException(status_code=409, detail="busy")
        meta = {"user": "human", "ts": now_iso(), **({"sid": wsid} if wsid else {})}
        if b.get("side") in ("sun", "moon"):
            meta["side"] = b["side"]
        cmd = save_message("in", "cmd", text, meta)
        await broadcast(g["app_subs"], app_payload(cmd))
        async with type_lock(wn):
            await type_line(text, wn)
            last, same, out, dialog = None, 0, "", False
            for _ in range(24):   # wait until the screen stops changing (or a dialog is up)
                await asyncio.sleep(0.45)
                now = await asyncio.to_thread(capture, 400, wn)
                if now is None:
                    break
                if now == last:
                    same += 1
                    if same >= 2:
                        break
                else:
                    same, last = 0, now
            if last is not None:
                out, dialog = cut(last, name)
            if dialog:   # read it, then close it so the window is free again
                for _ in range(3):
                    await asyncio.to_thread(tmux, "send-keys", "-t", tgt(wn), "Escape")
                    await asyncio.sleep(0.6)
                    if input_box_showing(await asyncio.to_thread(capture, 0, wn) or ""):
                        break
        res = await say(out or "(it printed nothing)", sid=wsid, cmd=name, ref=cmd["id"], dialog=dialog, note=False)
        return {"ok": True, "cmd": app_payload(cmd), "out": app_payload(res)}

    # a "/skill …" sent as a message: tell the companion it came from the / menu, so it runs it and answers here
    def skill_hint(pl, msg):
        name, _ = parse_cmd(msg.get("text") or "")
        if not name or name in HERE or name in TERMINAL:
            return
        known = {str(c.get("name") or "") for c in ((probe["init"] or {}).get("commands") or [])}
        if name in known or ":" in name:
            pl["content"] = (pl.get("content") or "") + (
                f"\n\n(Sent from the app's / menu: run the /{name} slash command with the Skill tool, then send what comes "
                f"of it here with reply.)")
    g["HOOKS"]["plugin_payload"].append(skill_hint)

    # ---------------- sessions and groups ----------------
    def meta_load():
        try:
            d = json.loads(meta_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            d = {}
        d.setdefault("groups", [])
        d.setdefault("items", {})
        return d

    def meta_save(d):
        tmp = meta_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(meta_file)

    tag = '<channel source=\\"companion\\"'
    msg_re = re.compile(re.escape(tag) + r'[^>]*user=\\"human\\"[^>]*>\\n(.*?)\\n</channel>')
    scan_cache = {}

    def prompt_text(line):
        """The words of a prompt someone typed (VS Code, the terminal, this page), or "" for anything else."""
        if '"tool_result"' in line or '"isMeta":true' in line or '"isSidechain":true' in line:
            return ""
        try:
            c = json.loads(line)["message"]["content"]
        except (ValueError, KeyError, TypeError):
            return ""
        if isinstance(c, list):
            c = "\n".join(b.get("text") or "" for b in c if isinstance(b, dict) and b.get("type") == "text")
        c = str(c or "").strip()
        return "" if not c or c.startswith("<") or c.startswith("[Request interrupted") or c.startswith("This session is being continued") else c

    def read_session(f):
        first_ts, n, first, last, used, ai_title, title, model = None, 0, "", "", 0, "", "", ""
        try:
            with f.open("r", encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if first_ts is None and '"timestamp"' in line:
                        m = re.search(r'"timestamp":"([^"]+)"', line)
                        first_ts = m and m.group(1)
                    if '"type":"user"' in line and tag in line:   # a message that came through the channel
                        for m in msg_re.finditer(line):
                            n += 1
                            last = unq(m.group(1))
                            first = first or last
                    elif '"type":"user"' in line:   # a prompt typed straight in
                        t = prompt_text(line)
                        if t:
                            n += 1
                            last = t
                            first = first or t
                    elif '"ai-title"' in line or '"custom-title"' in line:
                        try:
                            d = json.loads(line)
                            ai_title = d.get("aiTitle") or ai_title
                            title = d.get("customTitle") or title
                        except ValueError:
                            pass
                    elif '"usage"' in line and '"assistant"' in line and '"isSidechain":false' in line:
                        try:
                            d = json.loads(line)
                            u = d["message"]["usage"]
                            used = int(u.get("input_tokens", 0)) + int(u.get("cache_read_input_tokens", 0)) + int(u.get("cache_creation_input_tokens", 0))
                            model = d["message"].get("model") or model
                        except (ValueError, KeyError, TypeError):
                            pass
        except OSError:
            return None
        strip = lambda s: re.sub(r"^【[^】]{1,6}】", "", s).replace("\n", " ").strip()   # the 【夜面】 mark
        return {"started": first_ts, "messages": n, "first_text": strip(first)[:80], "last_text": strip(last)[:80],
                "usage_tokens": used, "cc_title": (title or ai_title)[:80], "model": model if not model.startswith("<") else ""}

    def unq(s):
        try:
            return json.loads('"' + s + '"')
        except ValueError:
            return s

    LEGACY = Path.home() / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(COMPANION_DIR))   # the companion's own folder, before it moved

    def project_dirs():
        return [CLAUDE_PROJECT] + ([LEGACY] if LEGACY != CLAUDE_PROJECT and LEGACY.is_dir() else [])

    def session_file(sid):
        for d in project_dirs():
            f = d / f"{sid}.jsonl"
            if f.exists():
                return f
        return None

    def open_elsewhere():
        """Sessions a live Claude Code process other than this window has open: {sid: "vscode" | "terminal" | …}."""
        out = {}
        for meta in (Path.home() / ".claude" / "sessions").glob("*.json"):
            try:
                d = json.loads(meta.read_text())
                os.kill(int(d.get("pid") or meta.stem), 0)
            except PermissionError:
                pass
            except (OSError, ValueError):
                continue
            sid = str(d.get("sessionId") or "")
            if not sid or is_window(str(d.get("tmux") or "").split(":")[0]):   # the page's own windows, main and side
                continue
            ep = str(d.get("entrypoint") or d.get("kind") or "")
            out[sid] = "vscode" if "vscode" in ep else "terminal" if ep in ("cli", "interactive") else ep or "elsewhere"
        return out

    def scan_sessions():
        wins = {w["sid"]: w for w in live_windows() if w["sid"]}
        cur = next((s_ for s_, w in wins.items() if w["main"]), "")
        out, away = [], open_elsewhere()
        for pd in project_dirs():
            for f in pd.glob("*.jsonl"):
                if not SID_RE.match(f.stem):
                    continue
                try:
                    st = f.stat()
                    mt, key = st.st_mtime, (st.st_mtime, st.st_size)
                except OSError:
                    continue
                hit = scan_cache.get(f.stem)
                if not hit or hit[0] != key:
                    hit = scan_cache[f.stem] = (key, read_session(f))
                info = hit[1]
                if not info or (not info["messages"] and f.stem not in wins):
                    continue
                out.append({"sid": f.stem, **info, "last": datetime.fromtimestamp(mt, timezone.utc).isoformat(), "current": f.stem == cur, "open": f.stem in wins,
                            "elsewhere": away.get(f.stem), "readonly": pd != CLAUDE_PROJECT, "folder": "companion" if pd != CLAUDE_PROJECT else ""})
        for sid in wins:   # a window that hasn't written its file yet
            if not any(w["sid"] == sid for w in out):
                out.append({"sid": sid, "started": None, "messages": 0, "first_text": "", "last_text": "", "usage_tokens": 0, "cc_title": "", "model": "",
                            "last": None, "current": sid == cur, "open": True, "elsewhere": None, "readonly": False, "folder": ""})
        out.sort(key=lambda w: w["last"] or "9", reverse=True)
        return out[:300]

    @app.get("/app/cc/sessions")
    async def cc_sessions(request: Request):
        check_auth(request)
        ws = await asyncio.to_thread(scan_sessions)
        d = meta_load()
        gids = {x["id"] for x in d["groups"]}
        for w in ws:
            it = d["items"].get(w["sid"]) or {}
            w["title"] = it.get("title") or w["cc_title"] or w["first_text"] or ""
            w["named"] = bool(it.get("title"))
            w["group"] = it.get("group") if it.get("group") in gids else None
            w["archived"] = bool(it.get("archived"))
        return {"sessions": ws, "groups": d["groups"], "chat": CHAT_MODE, "max": MAX_WINDOWS}

    @app.post("/app/cc/sessions/meta")
    async def cc_session_meta(request: Request):
        check_auth(request)
        b = await request.json()
        sid = str(b.get("sid") or "")
        if not SID_RE.match(sid):
            raise HTTPException(status_code=400, detail="bad sid")
        d = meta_load()
        it = d["items"].setdefault(sid, {})
        if "title" in b:
            t = str(b.get("title") or "").strip().replace("\n", " ")[:80]
            if t:
                it["title"] = t
                f = CLAUDE_PROJECT / f"{sid}.jsonl"
                if f.exists():   # the record Claude Code's own /rename writes, so VS Code shows the same name
                    with f.open("a", encoding="utf-8") as fh:
                        fh.write(json.dumps({"type": "custom-title", "customTitle": t, "sessionId": sid}, ensure_ascii=False, separators=(",", ":")) + "\n")
            else:
                it.pop("title", None)
        if "group" in b:
            gid = b.get("group")
            if gid and gid not in {x["id"] for x in d["groups"]}:
                raise HTTPException(status_code=404, detail="no such group")
            if gid:
                it["group"] = gid
            else:
                it.pop("group", None)
        if "archived" in b:
            if b.get("archived"):
                it["archived"] = True
            else:
                it.pop("archived", None)
        if not it:
            d["items"].pop(sid, None)
        meta_save(d)
        return {"ok": True, "item": it}

    @app.post("/app/cc/sessions/group")
    async def cc_session_group(request: Request):
        check_auth(request)
        b = await request.json()
        op, d = b.get("op"), meta_load()
        name = str(b.get("name") or "").strip().replace("\n", " ")[:40]
        grp = next((x for x in d["groups"] if x["id"] == b.get("id")), None)
        if op == "new":
            if not name:
                raise HTTPException(status_code=400, detail="a group needs a name")
            grp = {"id": "g" + secrets.token_hex(4), "name": name}
            d["groups"].append(grp)
            for sid in b.get("sids") or []:   # "new group from these sessions"
                if SID_RE.match(str(sid)):
                    d["items"].setdefault(str(sid), {})["group"] = grp["id"]
        elif not grp:
            raise HTTPException(status_code=404, detail="no such group")
        elif op == "rename":
            if not name:
                raise HTTPException(status_code=400, detail="a group needs a name")
            grp["name"] = name
        elif op == "fold":
            grp["fold"] = bool(b.get("fold"))
        elif op == "delete":   # the sessions stay, ungrouped
            d["groups"] = [x for x in d["groups"] if x is not grp]
            for it in d["items"].values():
                if it.get("group") == grp["id"]:
                    it.pop("group", None)
        else:
            raise HTTPException(status_code=400, detail="op is new, rename, fold or delete")
        meta_save(d)
        return {"ok": True, "group": grp, "groups": d["groups"]}

    @app.post("/app/cc/sessions/new")
    async def cc_session_new(request: Request):
        """{group?}: the main window starts afresh (handed the last hours of talk). {alongside: true}: a new tab instead —
        a side window with a fresh session; the main one stays as it is, and nothing is handed over."""
        check_auth(request)
        try:
            b = await request.json()
        except ValueError:
            b = {}
        gid = b.get("group")
        if gid and gid not in {x["id"] for x in meta_load()["groups"]}:
            raise HTTPException(status_code=404, detail="no such group")
        if b.get("alongside"):
            _, sid = await open_side()
            if gid and SID_RE.match(sid):
                d = meta_load()
                d["items"].setdefault(sid, {})["group"] = gid
                meta_save(d)
            return {"ok": True, "sid": sid, "alongside": True}
        c = x["carry_cfg"]()
        text = await asyncio.to_thread(x["carry_text"], c["hours"], c["chars"])
        await x["claude_restart"]()
        asyncio.get_running_loop().create_task(x["hand_over"](text))
        sid = str(session_meta().get("sessionId") or "")
        if gid and SID_RE.match(sid):
            d = meta_load()
            d["items"].setdefault(sid, {})["group"] = gid
            meta_save(d)
        return {"ok": True, "sid": sid}

    # ---------------- the chat IS the window: its transcript, read as a letter; what you write, typed into it ----------------
    # Every line of the session's .jsonl that a person would see in Claude Code becomes a message: what you typed (here, in
    # VS Code or at the terminal), Claude's words, its thinking (folded), each tool call (one line, its result folded under
    # it), slash commands and what they printed, compactions. id = line number * 8 + block, so ids grow with the file.
    ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
    NAME_RE, ARGS_RE = re.compile(r"<command-name>(.*?)</command-name>", re.S), re.compile(r"<command-args>(.*?)</command-args>", re.S)
    OUT_RE = re.compile(r"<local-command-(stdout|stderr)>(.*?)</local-command-\1>", re.S)
    CHAN_RE = re.compile(r'<channel source="[^"]*"([^>]*)>\n?(.*?)\n?</channel>', re.S)
    NIGHT = re.compile(r"^【[^】]{1,6}】")

    def tool_line(name, inp):
        inp = inp if isinstance(inp, dict) else {}
        if name == "AskUserQuestion" and isinstance(inp.get("questions"), list):   # what it asked (the answers fold in under it)
            return " · ".join(str((q or {}).get("question") or "") for q in inp["questions"] if isinstance(q, dict))[:300]
        for k in ("description", "command", "file_path", "pattern", "url", "query", "skill", "prompt", "path", "subject"):
            v = inp.get(k)
            if isinstance(v, str) and v.strip():
                v = v.strip().replace("\n", " ")
                if k == "file_path" and "/" in v and len(v) > 48:
                    v = "…/" + v.rsplit("/", 1)[-1]
                return v[:140]
        return ""

    def result_text(c):
        if isinstance(c, list):
            c = "\n".join((b.get("text") or "") if b.get("type") == "text" else "[image]" for b in c if isinstance(b, dict))
        return ANSI.sub("", str(c or ""))[:4000]

    def parse_lines(lines, base, memo=None):
        memo = memo if memo is not None else {}
        out, last_cmd = [], [""]
        for i, line in enumerate(lines):
            if not line.strip():
                continue
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("isSidechain"):
                continue
            n, t, ts = base + i, d.get("type"), d.get("timestamp") or ""

            def add(kind, frm, text, j=0, **meta):
                out.append({"id": n * 8 + j, "ts": ts, "from": frm, "kind": kind, "text": text, "meta": meta})

            def words(s, j=0):
                s = s or ""
                s = re.sub(r"<(ide_selection|ide_opened_file|system-reminder)\b[^>]*>.*?</\1>", "", s, flags=re.S)   # what the editor or harness tucked in
                s = re.sub(r"</?pasted_content\b[^>]*>\n?", "", s).strip()   # something pasted: keep the words, drop the wrapper
                if "<command-name>" in s:
                    nm, ar = NAME_RE.search(s), ARGS_RE.search(s)
                    last_cmd[0] = (nm.group(1) if nm else "").lstrip("/")
                    add("cmd", "human", ((nm.group(1) if nm else "") + " " + (ar.group(1) if ar else "")).strip(), j)
                elif "<local-command-std" in s:
                    for m in OUT_RE.finditer(s):
                        o = ANSI.sub("", m.group(2)).strip("\n")
                        if o.strip() and o.strip() != "(no content)":
                            add("term", "ai", o, j, err=m.group(1) == "stderr", cmd=last_cmd[0])
                elif "<channel " in s:
                    for k, m in enumerate(CHAN_RE.finditer(s)):
                        who = re.search(r'user="([^"]*)"', m.group(1))
                        who = who.group(1) if who else "human"
                        if who in ("human", ""):
                            body, dev = split_mark(m.group(2))
                            add("user", "human", NIGHT.sub("", body).strip(), j + k, via="channel", **dev)
                        else:
                            add("note", "ai", f"{who} · " + m.group(2).strip()[:400], j + k)
                elif s.startswith("<task-notification>"):
                    sm = re.search(r"<summary>(.*?)</summary>", s, re.S)
                    add("note", "ai", "background task · " + (sm.group(1).strip() if sm else "finished"), j)
                elif s.startswith("[Request interrupted"):
                    add("note", "ai", "interrupted", j)
                elif s.strip() and not re.match(r"^<[a-z][a-z-]*[ >]", s.strip()):
                    body, dev = split_mark(s.strip())   # the device chip's mark: off the words, onto the bubble's label
                    add("user", "human", body.strip(), j, **dev)

            if t == "system":
                st = d.get("subtype")
                if st == "local_command":
                    words(str(d.get("content") or ""))
                elif st == "compact_boundary":
                    cm = d.get("compactMetadata") or {}
                    add("note", "ai", "compacted" + (f" · {cm.get('preTokens', 0) // 1000}k → {cm.get('postTokens', 0) // 1000}k" if cm.get("preTokens") else ""))
                elif st == "away_summary":
                    add("note", "ai", "recap · " + re.sub(r"\s*\(disable recaps in /config\)\s*$", "", str(d.get("content") or "")))
                elif st == "api_error":   # the API said no and Claude Code is trying again: without this the window just looks stuck
                    e = d.get("error") if isinstance(d.get("error"), dict) else {}
                    k, top = int(d.get("retryAttempt") or 0), int(d.get("maxRetries") or 0)
                    what = str(e.get("formatted") or e.get("message") or "an error")[:160]
                    if k <= 1:
                        add("note", "ai", f"the API answered {what} · trying again" + (f" (up to {top} times)" if top else ""))
                    elif top and k >= top:
                        add("note", "ai", f"the API answered {what} · gave up after {k} tries")
                elif st == "informational" and str(d.get("content") or "").strip():   # Claude Code's own word: "Unknown command: /x", …
                    add("note", "ai", re.sub(r"\s*·\s*turn off with .*$", "", str(d["content"]).strip())[:400])
                continue
            if t == "attachment":
                # Something you wrote while it was working: Claude Code hands it to Claude at the next step of the same
                # turn ("absorbed mid-turn") and keeps it only as this attachment, never as a user message of its own.
                a = d.get("attachment") or {}
                if a.get("type") == "queued_command" and (a.get("origin") or {}).get("kind") == "human" and a.get("commandMode", "prompt") == "prompt":
                    p = a.get("prompt")
                    if isinstance(p, list):
                        p = "\n".join([str(x.get("text") or "") for x in p if isinstance(x, dict) and x.get("type") == "text"] +
                                      ["[image]" for x in p if isinstance(x, dict) and x.get("type") == "image"])
                    k0 = len(out)
                    words(str(p or ""))
                    for m in out[k0:]:
                        if m["kind"] == "user":
                            m["meta"]["mid"] = True
                continue
            if t not in ("user", "assistant") or d.get("isMeta"):
                continue
            c = (d.get("message") or {}).get("content")
            if t == "user":
                if d.get("isCompactSummary") or (isinstance(c, str) and c.startswith("This session is being continued")):
                    add("note", "ai", "continued from an earlier part of this conversation (summarised)")
                elif isinstance(c, str):
                    words(c)
                elif isinstance(c, list):
                    texts = []
                    for j, b in enumerate(c):
                        if not isinstance(b, dict):
                            continue
                        if b.get("type") == "tool_result" and b.get("tool_use_id") in memo:   # a file handed over: a card to download it
                            h, rt = memo.pop(b.get("tool_use_id")), result_text(b.get("content"))
                            m = re.search(r"handed over: (.+?) \((\d+) bytes\)", rt)
                            if m and not b.get("is_error"):
                                add("file", "ai", h.get("note") or "", j, attachments=[outbox_att(m.group(1), int(m.group(2)))])
                            else:
                                add("note", "ai", "couldn’t hand over " + Path(h.get("path") or "a file").name + ": " + rt[:200], j)
                        elif b.get("type") == "tool_result":
                            add("result", "ai", result_text(b.get("content")), j, tid=b.get("tool_use_id"), error=bool(b.get("is_error")))
                        elif b.get("type") == "text" and not str(b.get("text") or "").startswith("<system-reminder>"):
                            texts.append(b.get("text") or "")
                        elif b.get("type") == "image":
                            texts.append("[image]")
                    if texts:
                        words("\n".join(texts).strip())
                continue
            for j, b in enumerate(c if isinstance(c, list) else []):
                bt = b.get("type") if isinstance(b, dict) else None
                if bt == "text" and str(b.get("text") or "").strip():
                    add("reply", "ai", b["text"].strip(), j)
                elif bt == "thinking" and str(b.get("thinking") or "").strip():
                    add("thinking", "ai", b["thinking"].strip(), j)
                elif bt == "tool_use":
                    name, inp = str(b.get("name") or ""), b.get("input") or {}
                    if name.endswith("companion__reply"):
                        add("reply", "ai", str(inp.get("text") or ""), j, via="reply")
                    elif name.endswith("companion__react"):
                        add("note", "ai", "reacted " + str(inp.get("emoji") or ""), j)
                    elif name.endswith("companion__hand_over"):   # shown when its result comes, as the file itself
                        memo[b.get("id")] = {"path": str(inp.get("path") or ""), "note": str(inp.get("note") or "")}
                    elif name == "ExitPlanMode" and str(inp.get("plan") or "").strip():   # the plan it asks you to approve, set out to read
                        add("reply", "ai", "**The plan**\n\n" + str(inp["plan"]).strip(), j)
                        add("tool", "ai", "asks to go ahead with this plan", j + 1, tool=name, tid=b.get("id"))
                    else:
                        add("tool", "ai", tool_line(name, inp), j, tool=name.replace("mcp__", "").replace("__", " · "), tid=b.get("id"))
        return out

    logs = {}   # sid -> {"f", "off", "lines", "msgs"}, read on as the file grows
    open_sids = set()   # the windows' sessions: kept in logs while open, so a tab is never read again from the top
    log_lock = threading.Lock()   # one reader at a time: two requests reading the same long session each took it whole into memory

    def read_log(sid):
        f = session_file(sid)
        if not f:
            return None
        with log_lock:
            L = logs.get(sid)
            if not L or L["f"] != f:
                if len(logs) > 6 + len(open_sids):
                    old = next((k for k in logs if k not in open_sids), None)
                    if old:
                        logs.pop(old)
                L = logs[sid] = {"f": f, "off": 0, "lines": 0, "msgs": [], "memo": {}}
            try:
                size = f.stat().st_size
                if size < L["off"]:   # rewritten: start again
                    L.update(off=0, lines=0, msgs=[], memo={})
                for lines, took in new_lines(f, L["off"], size):   # a piece at a time: a session of 170 MB is never held whole
                    for ln in lines:   # the session's name as Claude Code keeps it: /rename's, else the one it made up
                        if '"custom-title"' in ln or '"ai-title"' in ln:
                            try:
                                d = json.loads(ln)
                                L["custom"] = d.get("customTitle") or L.get("custom")
                                L["ai"] = d.get("aiTitle") or L.get("ai")
                            except ValueError:
                                pass
                    L["msgs"].extend(parse_lines(lines, L["lines"], L["memo"]))
                    L["lines"] += len(lines)
                    L["off"] += took
            except OSError:
                pass
            return L

    def title_of(sid, items=None):
        """A tab's name: the one given here, then Claude Code's (/rename, then its own), then the first thing said."""
        it = (items if items is not None else meta_load()["items"]).get(sid) or {}
        L = logs.get(sid) or {}
        first = next((m["text"] for m in L.get("msgs") or [] if m["kind"] == "user"), "")
        t = it.get("title") or L.get("custom") or L.get("ai") or NIGHT.sub("", first)
        return re.sub(r"\s+", " ", t or "").strip()[:60]

    def windows_now():
        """The open windows for the page's tabs: [{sid, main, title}], the main one first. One still starting has no sid yet."""
        ws, items = live_windows(), meta_load()["items"]
        now = {w["sid"] for w in ws if w["sid"]}
        with log_lock:   # (never empty for a moment: a reader would take an open window's session for one to forget)
            open_sids.difference_update(open_sids - now)
            open_sids.update(now)
        for w in ws:
            if w["sid"]:
                read_log(w["sid"])   # (cheap once read: only what's new)
        return [{"sid": w["sid"], "main": w["main"], "title": title_of(w["sid"], items) if w["sid"] else ""} for w in ws]

    @app.get("/app/cc/where")
    async def cc_where(request: Request):
        check_auth(request)
        ws = await asyncio.to_thread(windows_now)
        main = next((w["sid"] for w in ws if w["main"]), "")
        room, why_not, free = window_room(len(ws))
        return {"chat": CHAT_MODE, "sid": main or None, "workdir": str(WORK_DIR), "windows": [w for w in ws if w["sid"]],
                "opening": sum(1 for w in ws if not w["sid"]), "max": MAX_WINDOWS, "room": room, "room_why": why_not, "free_mb": free}

    @app.get("/app/cc/log")
    async def cc_log(request: Request, sid: str = "", after: int = -1, before: int = 0, tail: int = 200):
        """A session's transcript as chat messages: the last `tail`; or those after an id; or the `tail` before one."""
        check_auth(request)
        live = {w["sid"] for w in await asyncio.to_thread(live_windows) if w["sid"]}
        cur = str(session_meta().get("sessionId") or "")
        sid = sid or cur
        if not SID_RE.match(sid):
            raise HTTPException(status_code=404, detail="no window yet")
        L = await asyncio.to_thread(read_log, sid)
        if L is None:
            return {"sid": sid, "messages": [], "live": sid in live, "main": sid == cur, "elsewhere": None, "more": False}
        ms, tail = L["msgs"], max(1, min(tail, 1000))
        if after >= 0:
            out = [m for m in ms if m["id"] > after]
        elif before:
            older = [m for m in ms if m["id"] < before]
            out = older[-tail:]
        else:
            out = ms[-tail:]
        more = bool(out) and bool(ms) and ms[0]["id"] < out[0]["id"]
        away = (await asyncio.to_thread(open_elsewhere)).get(sid)
        return {"sid": sid, "messages": out, "live": sid in live, "main": sid == cur, "elsewhere": away, "more": more,
                "readonly": L["f"].parent != CLAUDE_PROJECT, "title": title_of(sid)}

    @app.post("/app/cc/say")
    async def cc_say(request: Request):
        """What you write goes into the window as an ordinary prompt (pasted, so line breaks stay); mid-turn, Claude Code
        queues it, as it does when you type ahead. While the window waits on a question it is held ({held: true}) and goes
        in once the question is answered; it is never typed into the question's box."""
        check_auth(request)
        b = await request.json()
        text = str(b.get("text") or "").strip()
        q = b.get("quote")
        if isinstance(q, dict) and str(q.get("text") or "").strip():
            text = "> " + (str(q.get("who") or "") + ": " if q.get("who") else "") + str(q["text"]).strip().replace("\n", "\n> ") + "\n\n" + text
        for a in b.get("attachments") or []:
            name = str((a or {}).get("url") or "").split("/")[-1].split("?")[0]
            if re.fullmatch(r"[A-Za-z0-9_.-]+", name) and (g["UPLOAD_DIR"] / name).exists():
                text += ("\n" if text else "") + ("[image] " if a.get("kind") == "image" else f"[file: {a.get('name') or name}] ") + str(g["UPLOAD_DIR"] / name)
        if not text.strip():
            raise HTTPException(status_code=400, detail="empty")
        if g.get("DEVICE"):   # which computer this is about: the chip by the input box (nyx_device.py)
            text = g["DEVICE"]["with_mark"](text)
        if len(text) > 60000:
            raise HTTPException(status_code=413, detail="too long")
        sid = str(b.get("sid") or "")
        name = await win(sid)   # the tab's window; the main one when the page doesn't say
        st = await asyncio.to_thread(claude_busy, name)
        if st.get("state") == "offline":
            raise HTTPException(status_code=503, detail="the window isn't open")
        pane = await asyncio.to_thread(capture, 0, name)
        if pane is None:
            raise HTTPException(status_code=503, detail="the window isn't open")
        tab = sid or str(session_meta(name).get("sessionId") or "")
        if not input_box_showing(pane) or held.get(tab):   # a question is up (or others wait before it): it goes in once that is answered (held_watch)
            hold(tab, text)
            await tell_question(name, tab)
            return {"ok": True, "held": True}
        went = await submit(name, text)
        if went == "dialog":   # a question came up just as it went in: make sure of it once that is answered
            hold(tab, text, check=True)
            await tell_question(name, tab)
            return {"ok": True, "held": True, "check": True}
        if went == "stuck":
            raise HTTPException(status_code=504, detail="it is still in the window's input box; Enter didn't take")
        if went == "gone":
            raise HTTPException(status_code=503, detail="the window isn't open")
        await broadcast(g["app_subs"], {"type": "typing", "active": True, "sid": tab})
        return {"ok": True, "queued": st.get("state") == "busy"}

    def squash(t):
        return re.sub(r"\s+", "", t or "")

    async def submit(name, text):
        """Paste into the window's input box and press Enter, then make sure it went: "sent" once the box is empty (or the
        text moved up into the queue); Enter again while it is still sitting there; "dialog" if a question took the window
        as it went in (then nobody can tell from the screen whether it got in: the caller checks the transcript later)."""
        buf = "nyxsay-" + secrets.token_hex(4)   # a buffer of its own: two tabs may be sending at once
        long = "\n" in text or len(text) > 800   # Claude Code shows a long paste as "[Pasted text #1 +12 lines]"
        head = squash(text)[:24]
        async with type_lock(name):
            r = await asyncio.to_thread(subprocess_run, ["tmux", "load-buffer", "-b", buf, "-"], text)
            if r.returncode != 0:
                raise HTTPException(status_code=502, detail="couldn't reach the window")
            await asyncio.to_thread(tmux, "send-keys", "-t", tgt(name), "C-u")
            await asyncio.to_thread(tmux, "paste-buffer", "-p", "-d", "-b", buf, "-t", tgt(name))
            # Enter only once the words are in the input box, and never into a question: a permission prompt that comes up
            # between the paste and the Enter would take the Enter as its "Yes". So: look, then press at once.
            t0 = time.monotonic()
            while True:
                await asyncio.sleep(0.06)
                pane = await asyncio.to_thread(capture, 0, name)
                if pane is None:
                    return "gone"
                if not input_box_showing(pane):
                    return "dialog"   # the words wait behind it, in the box; held_watch types them again afterwards
                box = squash(nyx_question.box_text(pane) or "")
                if (long and "[Pastedtext" in box) or (head and head in box) or time.monotonic() - t0 > 1.5 + len(text) / 20000:
                    break
            await asyncio.to_thread(tmux, "send-keys", "-t", tgt(name), "Enter")
            for i in range(12):
                await asyncio.sleep(0.4)
                pane = await asyncio.to_thread(capture, 0, name)
                if pane is None:
                    return "gone"
                if not input_box_showing(pane):
                    return "dialog"
                box = squash(nyx_question.box_text(pane) or "")
                if (long and "[Pastedtext" in box) or (head and head in box):
                    if i in (2, 5, 8):   # still sitting there: Enter didn't take
                        await asyncio.to_thread(tmux, "send-keys", "-t", tgt(name), "Enter")
                    continue
                return "sent"
            return "stuck"

    # ---------------- the question at the terminal (nyx_question.py reads it off the screen) ----------------
    # While a window waits on a question — a permission prompt, Claude's own AskUserQuestion, a box of Claude Code's —
    # the page shows it (GET /app/cc/question, and a cc_question event when it comes, changes or goes) and answers it
    # (POST /app/cc/question/answer). What is written meanwhile is held, by session, and typed in once the input box is
    # back (held_watch); a message that a question cut into is typed again only if the transcript never got it.
    import nyx_question
    held_file = data_dir / "cc_held.json"
    try:
        held = {k: v for k, v in json.loads(held_file.read_text()).items() if isinstance(v, list)}
    except Exception:
        held = {}
    asked = {}   # sid -> {"sig", "q", "seen"}: the box last told to the page
    KEYS = {"Up", "Down", "Left", "Right", "Enter", "Escape", "Tab", "BTab", "Space"}

    def held_save():
        try:
            tmp = held_file.with_suffix(".tmp")
            tmp.write_text(json.dumps({k: v for k, v in held.items() if v}, ensure_ascii=False))
            os.replace(tmp, held_file)
        except OSError:
            pass

    def hold(sid, text, check=False):
        q = held.setdefault(sid, [])
        if not any(h["text"] == text for h in q):
            q.append({"text": text, "at": time.time(), "check": check})
            del q[:-10]
        held_save()

    def held_texts(sid):
        return [h["text"] for h in held.get(sid, [])]

    def question_of(name):
        pane = capture(0, name)
        return None if pane is None else nyx_question.read_dialog(pane)

    async def tell_question(name, sid, q=False):
        if q is False:
            q = await asyncio.to_thread(question_of, name)
        asked[sid] = {"sig": q and q["sig"], "q": q, "seen": time.time()}
        await broadcast(g["app_subs"], {"type": "cc_question", "sid": sid, "q": q, "held": held_texts(sid)})

    def in_transcript(sid, text, since):
        L = read_log(sid)
        head = squash(split_mark(text)[0])[:40]   # the transcript's copy is read without the device mark
        for m in reversed((L or {}).get("msgs", [])[-60:]):
            if m.get("kind") == "user" and head and squash(m.get("text"))[:40] == head:
                try:
                    if datetime.fromisoformat(str(m.get("ts")).replace("Z", "+00:00")).timestamp() >= since - 30:
                        return True
                except ValueError:
                    return True
        return False

    @app.get("/app/cc/question")
    async def cc_question(request: Request, sid: str = ""):
        check_auth(request)
        name = await win(sid)
        tab = sid or str(session_meta(name).get("sessionId") or "")
        return {"sid": tab, "q": await asyncio.to_thread(question_of, name), "held": held_texts(tab)}

    @app.post("/app/cc/question/answer")
    async def cc_question_answer(request: Request):
        """{sid, sig, pick?: n, text?: words for a "Type something." choice, row?: k, key?: Up|Down|Left|Right|Enter|Escape|Tab|Space}.
        sig is the box the page was showing: if the window has moved on to another question meanwhile, nothing is pressed.
        row: a box of rows (no numbers) — the cursor is walked to row k and, once it is seen there, the row is worked as
        the box's foot then says: Space where it toggles, Enter where Enter goes on, nothing where ← → adjust it."""
        check_auth(request)
        b = await request.json()
        sid = str(b.get("sid") or "")
        name = await win(sid)
        tab = sid or str(session_meta(name).get("sessionId") or "")
        key, pick, row, words = str(b.get("key") or ""), b.get("pick"), b.get("row"), str(b.get("text") or "")
        async with type_lock(name):   # held until the box has shown what was pressed: a second tap never lands on a box that is on its way out
            q = await asyncio.to_thread(question_of, name)
            if not q:
                raise HTTPException(status_code=409, detail="there's no question up any more")
            if b.get("sig") and b["sig"] != q["sig"]:
                await tell_question(name, tab, q)
                raise HTTPException(status_code=409, detail="the question has changed; look again")
            send = lambda *a: asyncio.to_thread(tmux, "send-keys", "-t", tgt(name), *a)

            async def settle(before, secs):
                """The box once it shows what was pressed (None: it has gone), or as it is after secs."""
                now = before
                for _ in range(max(1, int(secs / 0.1))):
                    await asyncio.sleep(0.1)
                    now = await asyncio.to_thread(question_of, name)
                    if now != before:
                        break
                return now

            async def walk(x, kind, to):
                """The cursor to choice `to`, a step at a time, each step seen before the next is pressed (an arrow sent
                after the box has gone would land in the input box and call up the last thing typed). → the box, on it or not."""
                label = x[kind][to]["label"]
                for _ in range(len(x[kind]) + 1):
                    at = next((i for i, r in enumerate(x[kind]) if r["on"]), None)
                    if at is None or at == to:
                        break
                    was = x
                    await send("Down" if to > at else "Up")
                    x = await settle(was, 0.8)
                    if not x or x == was or x["sig"] != was["sig"] or len(x.get(kind) or []) != len(was[kind]):
                        return x, False
                return x, any(r["on"] and r["label"] == label for r in x[kind])

            wait = 0.8
            if key:
                if key not in KEYS:
                    raise HTTPException(status_code=400, detail="not a key the page can press")
                await send(key)
                wait = 3.0 if key in ("Enter", "Escape") else 0.8
            elif row is not None:
                rows = q.get("rows") or []
                if not isinstance(row, int) or not 0 <= row < len(rows) or not any(r["on"] for r in rows):
                    raise HTTPException(status_code=400, detail="no such row")
                q, there = await walk(q, "rows", row)
                wait = 0
                if there and q["does"] == "toggle":
                    await send("Space")
                    wait = 0.8
                elif there and q["does"] == "enter":
                    await send("Enter")
                    wait = 3.0
            elif pick is not None:
                o = next((o for o in q["options"] if o["n"] == int(pick)), None)
                if not o:
                    raise HTTPException(status_code=400, detail="no such choice")
                wait = 3.0
                if o["n"] <= 9:
                    await send("-l", str(o["n"]))   # Claude Code takes the digit as the pick
                else:
                    q, there = await walk(q, "options", q["options"].index(o))
                    if there:
                        await send("Enter")
                    else:
                        wait = 0
                if o["own"] and words.strip() and wait:   # an answer of your own: the choice becomes a line to write in
                    await asyncio.sleep(0.3)
                    await send("-l", words.strip().replace("\n", " ")[:2000])
                    await asyncio.sleep(0.2)
                    await send("Enter")
            else:
                raise HTTPException(status_code=400, detail="pick a choice or press a key")
            # as soon as the box shows it (a fixed wait made every tap slow); a press that goes on or out is given longer
            q2 = await settle(q, wait) if wait and q else await asyncio.to_thread(question_of, name)
        await tell_question(name, tab, q2)
        return {"ok": True, "q": q2}

    @app.post("/app/cc/stop")
    async def cc_stop(request: Request):
        """{sid}: stop the turn that is running in this window — Esc, once, as at the terminal. What it was doing is left
        as far as it got; a message queued behind the turn goes in next. Nothing is pressed unless a turn is running
        (Esc at an idle window clears what is written there, and twice opens the rewind list) or while a question is up
        (there Esc is an answer: the question's own card has it)."""
        check_auth(request)
        b = await request.json()
        sid = str(b.get("sid") or "")
        name = await win(sid)
        tab = sid or str(session_meta(name).get("sessionId") or "")
        async with type_lock(name):
            pane = await asyncio.to_thread(capture, 0, name)
            if pane is None:
                raise HTTPException(status_code=503, detail="the window isn't open")
            if not input_box_showing(pane):
                raise HTTPException(status_code=409, detail="it is waiting on a question; answer that first")
            if (await asyncio.to_thread(claude_busy, name)).get("state") != "busy":
                return {"ok": True, "stopped": False, "state": "idle"}
            said = lambda: (capture(300, name) or "").count("Interrupted \u00b7")   # "⎿ Interrupted · What should Claude do instead?"
            before = await asyncio.to_thread(said)
            await asyncio.to_thread(tmux, "send-keys", "-t", tgt(name), "Escape")
        state, stopped = "busy", False
        for _ in range(16):   # it takes a moment to let go of what it was doing
            await asyncio.sleep(0.5)
            state = (await asyncio.to_thread(claude_busy, name)).get("state")
            # (with a message queued behind the turn the window is at once busy again, with that)
            stopped = state != "busy" or await asyncio.to_thread(said) > before
            if stopped:
                break
        await broadcast(g["app_subs"], {"type": "typing", "active": state == "busy", "sid": tab})
        return {"ok": True, "stopped": stopped, "state": state}

    async def held_watch():
        """Types in what was held once its window's input box is back; tells the page when a question comes, changes or goes."""
        while True:
            await asyncio.sleep(1.0)
            if CHAT_MODE != "cc":
                await asyncio.sleep(10)
                continue
            try:
                ws = [w for w in await asyncio.to_thread(live_windows) if w["sid"]]
                by_sid = {w["sid"]: w["name"] for w in ws}
                for w in ws:   # the questions
                    q = await asyncio.to_thread(question_of, w["name"])
                    a = asked.get(w["sid"]) or {"sig": None, "pend": None}
                    sig = q and q["sig"]
                    if sig != a.get("sig"):
                        if a.get("pend") == sig:   # the same twice running: auto mode's boxes that flash by are let be
                            await tell_question(w["name"], w["sid"], q)
                        else:
                            a["pend"] = sig
                            asked[w["sid"]] = a
                    else:
                        a["pend"] = sig
                for sid in [k for k, v in held.items() if v]:   # what was held
                    name = by_sid.get(sid)
                    h = held[sid][0]
                    if not name:
                        if time.time() - h["at"] > 900:   # its window has gone: let it go
                            held[sid] = []
                            held_save()
                        continue
                    pane = await asyncio.to_thread(capture, 0, name)
                    if pane is None or not input_box_showing(pane):
                        h.pop("box_at", None)
                        continue
                    if h.get("check"):
                        if not h.get("box_at"):
                            h["box_at"] = time.time()   # the box is back: give the window a moment to write down what it had
                            continue
                        if time.time() - h["box_at"] < 3:
                            continue
                        if await asyncio.to_thread(in_transcript, sid, h["text"], h["at"]):
                            held[sid].pop(0)
                            held_save()
                            await tell_question(name, sid, None)
                            continue
                    went = await submit(name, h["text"])
                    if went == "sent":
                        held[sid].pop(0)
                        held_save()
                        await broadcast(g["app_subs"], {"type": "typing", "active": True, "sid": sid})
                        await tell_question(name, sid, None)
                    elif went == "dialog":
                        h["check"], h["at"] = True, time.time()
                        h.pop("box_at", None)
                        held_save()
                    else:
                        h["tries"] = h.get("tries", 0) + 1
                        if h["tries"] >= 3:
                            held[sid].pop(0)
                            held_save()
                            await broadcast(g["app_subs"], {"type": "cc_held_failed", "sid": sid, "text": h["text"]})
            except Exception:
                continue

    g.setdefault("NYX_STARTUP", []).append(held_watch)


    def subprocess_run(cmd, data):
        import subprocess
        return subprocess.run(cmd, input=data, capture_output=True, text=True, timeout=10)

    async def log_watch():
        """Follows every open window's session file and hands the page each new message as it is written (with its sid,
        so the page knows the tab); tells it when the main window moves to another session (cc_sid) and when the set of
        windows changes or a tab's name does (cc_windows); and, when no page is open, pushes Claude's last words to the phone."""
        last_sid, last_ws, sent = "", None, {}
        while True:
            await asyncio.sleep(0.8)
            if CHAT_MODE != "cc":
                await asyncio.sleep(10)
                continue
            try:
                ws = await asyncio.to_thread(windows_now)
                sid = next((w["sid"] for w in ws if w["main"]), "")
                if sid != last_sid:   # the main window opened another session — or closed, or came back (even to the same one): say so
                    await broadcast(g["app_subs"], {"type": "cc_sid", "sid": sid})
                    last_sid = sid
                if ws != last_ws:
                    await broadcast(g["app_subs"], {"type": "cc_windows", "windows": [w for w in ws if w["sid"]],
                                                    "opening": sum(1 for w in ws if not w["sid"]), "max": MAX_WINDOWS})
                    last_ws = ws
                for w in ws:
                    if not w["sid"]:
                        continue
                    L = await asyncio.to_thread(read_log, w["sid"])
                    if not L:
                        continue
                    n = sent.get(w["sid"])
                    if n is None or n > len(L["msgs"]):   # first look at this session (or its file was rewritten): everything so far is history
                        sent[w["sid"]] = len(L["msgs"])
                        continue
                    new = L["msgs"][n:]
                    if not new:
                        continue
                    sent[w["sid"]] = len(L["msgs"])
                    await broadcast(g["app_subs"], {"type": "cc", "sid": w["sid"], "main": w["main"], "messages": new})
                    said = [m for m in new if m["kind"] == "reply"]
                    if said and not g["app_subs"]:
                        try:
                            await g["push_to_all"](g["notification_from_message"]({"id": said[-1]["id"], "ts": said[-1]["ts"], "text": said[-1]["text"]}))
                        except Exception:
                            pass
            except Exception:
                continue

    g.setdefault("NYX_STARTUP", []).append(log_watch)

    # ---------------- the outbox: files the companion hands over, for the page to download ----------------
    # The window gives a file with its hand_over tool (channel/server.ts): the bytes come here, so it works wherever the
    # window runs. They are kept under ~/outbox/<day>/ (RELAY_OUTBOX); anything put there by hand shows up too. Only what is
    # inside the outbox can be downloaded, and only with the key.
    OUTBOX = Path(os.environ.get("RELAY_OUTBOX", str(Path.home() / "outbox")))
    OUT_MAX = int(os.environ.get("RELAY_OUTBOX_MAX_BYTES", str(1024 ** 3)))
    PICTURE = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}

    def outbox_att(rel, size=None):
        from urllib.parse import quote
        name = rel.rsplit("/", 1)[-1]
        return {"kind": "image" if Path(name).suffix.lower() in PICTURE else "file", "name": name, "size": size,
                "url": g.get("PUBLIC_PREFIX", "") + "/app/outbox/" + quote(rel), "outbox": rel}

    def outbox_file(rel):
        root = OUTBOX.resolve()
        p = (root / rel).resolve()
        if p == root or root not in p.parents or not p.is_file() or p.name.startswith("."):
            raise HTTPException(status_code=404, detail="no such file in the outbox")
        return p

    # a look at a file without downloading it: slides, documents, sheets and PDFs set as pages (nyx_proof.py)
    import nyx_proof
    proof = nyx_proof.register(app, check_auth, OUTBOX, outbox_file, g.get("PUBLIC_PREFIX", ""))

    @app.post("/channel/outbox")
    async def channel_outbox(request: Request, name: str = "", note: str = ""):
        """The window hands a file over: the body is the file. In the letter (companion mode) it also goes out as a message."""
        check_auth(request)
        nm = re.sub(r"[\x00-\x1f/\\]", "", Path(str(name)).name).strip().lstrip(".")[:180] or "file"
        day = OUTBOX / datetime.now().strftime("%Y-%m-%d")
        day.mkdir(parents=True, exist_ok=True)
        stem, ext = os.path.splitext(nm)
        dest, k = day / nm, 2
        while dest.exists():
            dest, k = day / f"{stem} ({k}){ext}", k + 1
        tmp, size = day / ("." + dest.name + ".part"), 0
        try:
            with tmp.open("wb") as fh:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > OUT_MAX:
                        raise HTTPException(status_code=413, detail="too big for the outbox")
                    fh.write(chunk)
            if not size:
                raise HTTPException(status_code=400, detail="empty file")
            tmp.replace(dest)
        finally:
            if tmp.exists():
                tmp.unlink()
        rel = dest.relative_to(OUTBOX).as_posix()
        att = outbox_att(rel, size)
        proof["warm"](dest)
        if CHAT_MODE != "cc":   # the letter shows the relay's own messages; in cc mode the transcript shows the hand-over
            msg = save_message("out", "reply", note.strip()[:2000], {"attachments": [att], "ts": now_iso()})
            await broadcast(g["app_subs"], app_payload(msg))
        return {"ok": True, "path": rel, "size": size, "name": dest.name, "url": att["url"]}

    @app.get("/app/outbox")
    async def outbox_list(request: Request):
        check_auth(request)

        def scan():
            out = []
            if OUTBOX.is_dir():
                for p in OUTBOX.rglob("*"):
                    if p.is_file() and not any(x.startswith(".") for x in p.relative_to(OUTBOX).parts):
                        st = p.stat()
                        out.append({**outbox_att(p.relative_to(OUTBOX).as_posix(), st.st_size),
                                    "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()})
            out.sort(key=lambda f: f["mtime"], reverse=True)
            return out[:500]
        return {"files": await asyncio.to_thread(scan), "dir": str(OUTBOX)}

    @app.get("/app/outbox/{rel:path}")
    async def outbox_get(request: Request, rel: str):
        from fastapi.responses import FileResponse
        check_auth(request)
        p = outbox_file(rel)
        return FileResponse(str(p), filename=p.name)

    @app.post("/app/outbox/remove")
    async def outbox_remove(request: Request):
        check_auth(request)
        p = outbox_file(str((await request.json()).get("path") or ""))
        p.unlink()
        try:
            p.parent.rmdir()   # a day with nothing left in it
        except OSError:
            pass
        return {"ok": True}

    return {"enrich": enrich, "state": state}
