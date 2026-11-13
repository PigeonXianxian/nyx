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
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, Request

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
    "clear": ("", "A new window; the last hours of talk are handed over"),
    "new": ("", "A new window; the last hours of talk are handed over"),
    "sessions": ("", "All windows, in groups: open, rename, file, archive"),
    "resume": ("", "Go back to an earlier window"),
    "rename": ("<title>", "Name this window"),
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

    def capture(scroll=0):
        a = ["capture-pane", "-p", "-t", TMUX] + (["-J", "-S", str(-scroll)] if scroll else [])
        p = tmux(*a)
        return p.stdout if p.returncode == 0 else None

    def window_state():
        sid = str(session_meta().get("sessionId") or "")
        text = capture()
        sl, sl_at = statusline(sid)
        names, by_model = {m["id"]: m for m in models()}, {}
        for m in models():   # a full model id → its short name (opus, fable …), which come first in the list
            if m["id"] != "default":
                by_model.setdefault(m["model"], m)
        # the model: whichever source spoke last — the status line, the last reply in the transcript, or a pick made here
        cands = []
        if (sl.get("model") or {}).get("id"):
            cands.append((sl_at, sl["model"]["id"]))
        mid, at = window_model()
        if mid:
            cands.append((at, mid))
        pick = read(model_file)
        if pick:
            cands.append((mtime(model_file), pick))
        cur = max(cands)[1] if cands else None
        entry = names.get(cur) or by_model.get(cur) or {}
        model = {"id": entry.get("id") or cur, "model": entry.get("model") or cur,
                 "name": entry.get("name") or ((sl.get("model") or {}).get("display_name")) or cur}
        if entry.get("id") == "default":
            model["name"] = (by_model.get(entry.get("model")) or {}).get("name") or model["name"]
        # effort: the status line if it's this window's and newer than a pick made here; then the badge on the pane
        effort = None
        if sl.get("effort") and sl_at >= mtime(effort_file):
            effort = (sl.get("effort") or {}).get("level")
        if not effort and text:
            m = BADGE_RE.search(text) or BANNER_RE.search(text)
            effort = m and m.group(1)
        if not effort:
            effort = read(effort_file) or None
        if not effort:
            try:
                ms = json.loads(SETTINGS.read_text()).get("modelSettings") or {}
                effort = (ms.get(model["model"] or "") or {}).get("effortLevel")
            except (OSError, ValueError):
                pass
        mode = footer_mode(text) if text else None
        if not mode and sid:
            mode = transcript_mode(sid)
        pend = load_pending()
        if read(effort_pending):
            pend.setdefault("effort", read(effort_pending))
        return {"sid": sid, "online": text is not None, "model": model, "effort": effort if effort in LEVELS else None,
                "mode": mode, "fast": bool(sl.get("fast_mode")) if sl else None, "pending": pend,
                "efforts": entry.get("efforts") or list(LEVELS)}

    async def state():
        await refresh()
        st = await asyncio.to_thread(window_state)
        st.update(models=models(), limits=limits(), plan=plan_name(), modes=[{"id": k, "name": n} for k, n, _ in MODES],
                  limits_at=probe["usage_at"] or None, probe_error=probe["err"] or None)
        return st

    async def enrich(m):
        """GET /app/meter for Claude Code: the live limits and the full model list over what the status line said."""
        try:
            st = await state()
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

    async def ready(busy_ok=False):
        """True: the window is idle at its input box. False: it is mid-turn. Raises when it's closed or a question is up."""
        st = await asyncio.to_thread(claude_busy)
        if st.get("state") == "offline":
            raise HTTPException(status_code=503, detail="the window isn't open")
        text = await asyncio.to_thread(capture)
        if text is None:
            raise HTTPException(status_code=503, detail="the window isn't open")
        if not input_box_showing(text):
            raise HTTPException(status_code=409, detail="the window is waiting on a question; answer it in the terminal first")
        return busy_ok or st.get("state") == "idle"

    type_lock = asyncio.Lock()

    async def type_line(line):
        for a in (("C-u",), ("-l", "--", line), ("Enter",)):
            p = await asyncio.to_thread(tmux, "send-keys", "-t", TMUX, *a)
            if p.returncode != 0:
                raise HTTPException(status_code=502, detail="couldn't reach the window")
            await asyncio.sleep(0.05)

    async def type_and_wait(line, mark, tries=12):
        before = (await asyncio.to_thread(capture, 300) or "").count(mark)
        await type_line(line)
        for _ in range(tries):
            await asyncio.sleep(0.5)
            if (await asyncio.to_thread(capture, 300) or "").count(mark) > before:
                return True
        return False

    async def apply_model(mid):
        async with type_lock:
            snap = await asyncio.to_thread(snapshot)
            ok = await type_and_wait("/model " + mid, "Set model to")
            asyncio.get_running_loop().create_task(keep_defaults(snap))
        if ok:
            model_file.write_text(mid, encoding="utf-8")
        return ok

    async def apply_effort(level):
        async with type_lock:
            snap = await asyncio.to_thread(snapshot)
            ok = await type_and_wait("/effort " + level, "Set effort level to")
            asyncio.get_running_loop().create_task(keep_defaults(snap))
        if ok:
            effort_file.write_text(level, encoding="utf-8")
            try:
                effort_pending.unlink()
            except OSError:
                pass
        return ok

    async def apply_mode(target):
        async with type_lock:
            for _ in range(len(MODES) + 2):
                cur = footer_mode(await asyncio.to_thread(capture))
                if cur == target:
                    mode_file.write_text(target, encoding="utf-8")
                    return True
                if cur is None:
                    return False
                await asyncio.to_thread(tmux, "send-keys", "-t", TMUX, "BTab")
                await asyncio.sleep(0.6)
        return False

    def load_pending():
        try:
            d = json.loads(pending_file.read_text())
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def save_pending(**kw):
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
        """A model or effort picked mid-turn goes in once the window is quiet again."""
        while True:
            await asyncio.sleep(4)
            p = load_pending()
            if not p or backend() == "codex":
                continue
            try:
                if not await ready():
                    continue
                if p.get("model"):
                    ok = await apply_model(p["model"])
                    save_pending(model=None)
                    await say(f"model → {p['model']}" + ("" if ok else " (sent; the window didn't confirm)"))
                if p.get("effort"):
                    ok = await apply_effort(p["effort"])
                    save_pending(effort=None)
                    await say(f"effort → {p['effort']}" + ("" if ok else " (sent; the window didn't confirm)"))
            except HTTPException:
                continue
            except Exception:
                continue

    g.setdefault("NYX_STARTUP", []).append(pending_watch)

    async def say(text, **meta):
        """A small note from the window into the chat (kind "term"): kept, shown to you, never sent to the companion."""
        msg = save_message("out", "term", text, {"ts": now_iso(), "note": True, **meta})
        await broadcast(g["app_subs"], app_payload(msg))
        return msg

    def parse_cmd(text):
        m = CMD_RE.match((text or "").strip())
        return (m.group(1).lower(), (m.group(2) or "").strip()) if m else (None, "")

    # ---------------- routes ----------------
    @app.get("/app/cc")
    async def cc_get(request: Request):
        check_auth(request)
        if backend() == "codex":
            raise HTTPException(status_code=404, detail="Claude Code only")
        return await state()

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
        await refresh(wait=12)
        if mid not in {m["id"] for m in models()}:
            raise HTTPException(status_code=400, detail="unknown model")
        if not await ready():
            save_pending(model=mid)
            return {"ok": True, "pending": True, "model": mid}
        save_pending(model=None)
        ok = await apply_model(mid)
        if b.get("note"):
            await say(f"/model {mid}  \u2192  " + ("set" if ok else "sent; the window didn't confirm"))
        return {"ok": True, "model": mid, "confirmed": ok}

    @app.post("/app/cc/effort")
    async def cc_effort(request: Request):
        check_auth(request)
        b = await request.json()
        lv = str(b.get("level") or "").strip().lower()
        if lv not in LEVELS:
            raise HTTPException(status_code=400, detail="effort is one of " + ", ".join(LEVELS))
        if not await ready():
            save_pending(effort=lv)
            return {"ok": True, "pending": True, "level": lv}
        save_pending(effort=None)
        ok = await apply_effort(lv)
        if b.get("note"):
            await say(f"/effort {lv}  \u2192  " + ("set" if ok else "sent; the window didn't confirm"))
        return {"ok": True, "level": lv, "confirmed": ok}

    @app.post("/app/cc/mode")
    async def cc_mode(request: Request):
        check_auth(request)
        b = await request.json()
        md = str(b.get("mode") or "").strip()
        if md not in FOOT.values() or md == "bypassPermissions":
            raise HTTPException(status_code=400, detail="mode is one of " + ", ".join(k for k, _, _ in MODES))
        await ready(busy_ok=True)   # shift+tab works mid-turn too
        ok = await apply_mode(md)
        if not ok:
            raise HTTPException(status_code=502, detail="the window didn't show that mode")
        if b.get("note"):
            await say(f"/mode {md}  \u2192  set")
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
        if not await ready():
            raise HTTPException(status_code=409, detail="busy")
        meta = {"user": "human", "ts": now_iso()}
        if b.get("side") in ("sun", "moon"):
            meta["side"] = b["side"]
        cmd = save_message("in", "cmd", text, meta)
        await broadcast(g["app_subs"], app_payload(cmd))
        async with type_lock:
            await type_line(text)
            last, same, out, dialog = None, 0, "", False
            for _ in range(24):   # wait until the screen stops changing (or a dialog is up)
                await asyncio.sleep(0.45)
                now = await asyncio.to_thread(capture, 400)
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
                    await asyncio.to_thread(tmux, "send-keys", "-t", TMUX, "Escape")
                    await asyncio.sleep(0.6)
                    if input_box_showing(await asyncio.to_thread(capture) or ""):
                        break
        res = await say(out or "(it printed nothing)", cmd=name, ref=cmd["id"], dialog=dialog, note=False)
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
            if not sid or str(d.get("tmux") or "").split(":")[0] == TMUX:
                continue
            ep = str(d.get("entrypoint") or d.get("kind") or "")
            out[sid] = "vscode" if "vscode" in ep else "terminal" if ep in ("cli", "interactive") else ep or "elsewhere"
        return out

    def scan_sessions():
        cur = str(session_meta().get("sessionId") or "")
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
                if not info or (not info["messages"] and f.stem != cur):
                    continue
                out.append({"sid": f.stem, **info, "last": datetime.fromtimestamp(mt, timezone.utc).isoformat(), "current": f.stem == cur,
                            "elsewhere": away.get(f.stem), "readonly": pd != CLAUDE_PROJECT, "folder": "companion" if pd != CLAUDE_PROJECT else ""})
        if cur and not any(w["current"] for w in out):
            out.append({"sid": cur, "started": None, "messages": 0, "first_text": "", "last_text": "", "usage_tokens": 0,
                        "cc_title": "", "model": "", "last": None, "current": True, "elsewhere": None, "readonly": False, "folder": ""})
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
        return {"sessions": ws, "groups": d["groups"], "chat": CHAT_MODE}

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
        check_auth(request)
        try:
            b = await request.json()
        except ValueError:
            b = {}
        gid = b.get("group")
        if gid and gid not in {x["id"] for x in meta_load()["groups"]}:
            raise HTTPException(status_code=404, detail="no such group")
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

    def parse_lines(lines, base):
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
                            add("user", "human", NIGHT.sub("", m.group(2)).strip(), j + k, via="channel")
                        else:
                            add("note", "ai", f"{who} · " + m.group(2).strip()[:400], j + k)
                elif s.startswith("<task-notification>"):
                    sm = re.search(r"<summary>(.*?)</summary>", s, re.S)
                    add("note", "ai", "background task · " + (sm.group(1).strip() if sm else "finished"), j)
                elif s.startswith("[Request interrupted"):
                    add("note", "ai", "interrupted", j)
                elif s.strip() and not re.match(r"^<[a-z][a-z-]*[ >]", s.strip()):
                    add("user", "human", s.strip(), j)

            if t == "system":
                st = d.get("subtype")
                if st == "local_command":
                    words(str(d.get("content") or ""))
                elif st == "compact_boundary":
                    cm = d.get("compactMetadata") or {}
                    add("note", "ai", "compacted" + (f" · {cm.get('preTokens', 0) // 1000}k → {cm.get('postTokens', 0) // 1000}k" if cm.get("preTokens") else ""))
                elif st == "away_summary":
                    add("note", "ai", "recap · " + re.sub(r"\s*\(disable recaps in /config\)\s*$", "", str(d.get("content") or "")))
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
                        if b.get("type") == "tool_result":
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
                    else:
                        add("tool", "ai", tool_line(name, inp), j, tool=name.replace("mcp__", "").replace("__", " · "), tid=b.get("id"))
        return out

    logs = {}   # sid -> {"f", "off", "lines", "msgs"}, read on as the file grows

    def read_log(sid):
        f = session_file(sid)
        if not f:
            return None
        L = logs.get(sid)
        if not L or L["f"] != f:
            if len(logs) > 6:
                logs.pop(next(iter(logs)))
            L = logs[sid] = {"f": f, "off": 0, "lines": 0, "msgs": []}
        try:
            size = f.stat().st_size
            if size < L["off"]:   # rewritten: start again
                L.update(off=0, lines=0, msgs=[])
            if size > L["off"]:
                with f.open("rb") as fh:
                    fh.seek(L["off"])
                    chunk = fh.read(size - L["off"])
                cut = chunk.rfind(b"\n") + 1   # only whole lines
                if cut:
                    lines = chunk[:cut].decode("utf-8", "ignore").split("\n")[:-1]
                    L["msgs"].extend(parse_lines(lines, L["lines"]))
                    L["lines"] += len(lines)
                    L["off"] += cut
        except OSError:
            pass
        return L

    @app.get("/app/cc/where")
    async def cc_where(request: Request):
        check_auth(request)
        return {"chat": CHAT_MODE, "sid": str(session_meta().get("sessionId") or "") or None, "workdir": str(WORK_DIR)}

    @app.get("/app/cc/log")
    async def cc_log(request: Request, sid: str = "", after: int = -1, before: int = 0, tail: int = 200):
        """A session's transcript as chat messages: the last `tail`; or those after an id; or the `tail` before one."""
        check_auth(request)
        cur = str(session_meta().get("sessionId") or "")
        sid = sid or cur
        if not SID_RE.match(sid):
            raise HTTPException(status_code=404, detail="no window yet")
        L = await asyncio.to_thread(read_log, sid)
        if L is None:
            return {"sid": sid, "messages": [], "live": sid == cur, "elsewhere": None, "more": False}
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
        return {"sid": sid, "messages": out, "live": sid == cur, "elsewhere": away, "more": more,
                "readonly": L["f"].parent != CLAUDE_PROJECT}

    @app.post("/app/cc/say")
    async def cc_say(request: Request):
        """What you write goes into the window as an ordinary prompt (pasted, so line breaks stay); mid-turn, Claude Code
        queues it, as it does when you type ahead."""
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
        if len(text) > 60000:
            raise HTTPException(status_code=413, detail="too long")
        st = await asyncio.to_thread(claude_busy)
        if st.get("state") == "offline":
            raise HTTPException(status_code=503, detail="the window isn't open")
        pane = await asyncio.to_thread(capture)
        if pane is None:
            raise HTTPException(status_code=503, detail="the window isn't open")
        if not input_box_showing(pane):
            raise HTTPException(status_code=409, detail="the window is waiting on a question")
        async with type_lock:
            r = await asyncio.to_thread(subprocess_run, ["tmux", "load-buffer", "-b", "nyxsay", "-"], text)
            if r.returncode != 0:
                raise HTTPException(status_code=502, detail="couldn't reach the window")
            await asyncio.to_thread(tmux, "send-keys", "-t", TMUX, "C-u")
            await asyncio.to_thread(tmux, "paste-buffer", "-p", "-d", "-b", "nyxsay", "-t", TMUX)
            await asyncio.sleep(0.35 + min(1.5, len(text) / 20000))
            await asyncio.to_thread(tmux, "send-keys", "-t", TMUX, "Enter")
        await broadcast(g["app_subs"], {"type": "typing", "active": True})
        return {"ok": True, "queued": st.get("state") == "busy"}

    def subprocess_run(cmd, data):
        import subprocess
        return subprocess.run(cmd, input=data, capture_output=True, text=True, timeout=10)

    async def log_watch():
        """Follows the window's session file and hands the page each new message as it is written; tells it when the
        window moves to another session; and, when no page is open, pushes Claude's last words to the phone."""
        last_sid, sent = "", {}
        while True:
            await asyncio.sleep(0.8)
            if CHAT_MODE != "cc":
                await asyncio.sleep(10)
                continue
            try:
                sid = str(session_meta().get("sessionId") or "")
                if not sid:
                    continue
                if sid != last_sid:
                    if last_sid:
                        await broadcast(g["app_subs"], {"type": "cc_sid", "sid": sid})
                    last_sid = sid
                L = await asyncio.to_thread(read_log, sid)
                if not L:
                    continue
                n = sent.get(sid)
                if n is None:   # first look at this session: everything so far is history
                    sent[sid] = len(L["msgs"])
                    continue
                new = L["msgs"][n:]
                if not new:
                    continue
                sent[sid] = len(L["msgs"])
                await broadcast(g["app_subs"], {"type": "cc", "sid": sid, "messages": new})
                said = [m for m in new if m["kind"] == "reply"]
                if said and not g["app_subs"]:
                    try:
                        await g["push_to_all"](g["notification_from_message"]({"id": said[-1]["id"], "ts": said[-1]["ts"], "text": said[-1]["text"]}))
                    except Exception:
                        pass
            except Exception:
                continue

    g.setdefault("NYX_STARTUP", []).append(log_watch)

    return {"enrich": enrich, "state": state}
