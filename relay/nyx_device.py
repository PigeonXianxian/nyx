"""Which computer you mean: a switch on the chat page, and a mark on what you send so your companion knows.

Your companion may reach several of your machines (an old Mac, a new one, a Windows PC). Which one "open it" or "install
this" is about is rarely in the words, so the chat page has a small chip next to the input box; what it shows goes along
with every message, as one first line:

    【设备 · 新 Mac · PigeonXian_1】

The chip's pick lives here on the relay (one file), so the phone and the computer agree. The chat page hides the mark
again in your own bubble and shows a small label instead (only when it isn't the default machine).

The machines are listed in `devices.json` next to the relay's database:

    {"default": "mac0",
     "devices": [{"id": "mac0", "name": "旧 Mac", "host": "PigeonXian_0"},
                 {"id": "mac1", "name": "新 Mac", "host": "PigeonXian_1"},
                 {"id": "win",  "name": "Windows", "host": "PigeonXian_win"}]}

`host` is what your companion uses to reach it (an ssh alias). No file, no chip and no mark.

  GET  /app/device         {devices, current, default}
  POST /app/device {id}    pick one; every open page hears it ({type: "device"})

Mounted from app.py with `nyx_device.register(app, globals())`. Part of the Nyx relay, a modified Tidal Echo, GNU AGPL v3.
"""
import json
import re
from pathlib import Path

from fastapi import HTTPException, Request

MARK_RE = re.compile(r"^【设备 · ([^】·]+?)(?: · [^】]*)?】[ \t]*\n?")


def split_mark(text):
    """(text without a leading device mark, the device's name or "")."""
    m = MARK_RE.match(text or "")
    return ((text or "")[m.end():], m.group(1).strip()) if m else (text or "", "")


def register(app, g):
    data_dir = Path(g["DB_PATH"]).parent
    conf_file, now_file = data_dir / "devices.json", data_dir / "device_now"
    log = g.get("log")

    def conf():
        try:
            d = json.loads(conf_file.read_text("utf-8"))
        except (OSError, ValueError):
            return [], ""
        devs = [x for x in d.get("devices") or [] if isinstance(x, dict) and x.get("id") and x.get("name")]
        ids = [x["id"] for x in devs]
        return devs, (d.get("default") if d.get("default") in ids else (ids[0] if ids else ""))

    def current():
        devs, default = conf()
        try:
            pick = now_file.read_text("utf-8").strip()
        except OSError:
            pick = ""
        return devs, default, (pick if pick in [x["id"] for x in devs] else default)

    def mark():
        devs, _, cur = current()
        d = next((x for x in devs if x["id"] == cur), None)
        if not d:
            return ""
        return "【设备 · " + d["name"] + (" · " + d["host"] if d.get("host") else "") + "】"

    def with_mark(text):
        """The text as it should reach the AI: the mark on its own first line. Slash commands stay as they are."""
        m = mark()
        if not m or not text or text.lstrip().startswith("/") or MARK_RE.match(text):
            return text
        return m + "\n" + text

    g["DEVICE"] = {"mark": mark, "with_mark": with_mark, "split": split_mark}

    @app.get("/app/device")
    async def device_get(request: Request):
        g["check_auth"](request)
        devs, default, cur = current()
        return {"devices": [{"id": x["id"], "name": x["name"], "host": x.get("host") or ""} for x in devs],
                "default": default, "current": cur}

    @app.post("/app/device")
    async def device_set(request: Request):
        g["check_auth"](request)
        b = await request.json()
        devs, default, _ = current()
        pick = str(b.get("id") or "")
        if pick not in [x["id"] for x in devs]:
            raise HTTPException(status_code=400, detail="no such device")
        now_file.write_text(pick + "\n", "utf-8")
        await g["broadcast"](g["app_subs"], {"type": "device", "current": pick})
        return {"ok": True, "current": pick, "default": default}

    # the chat page in companion mode (/app/send): the mark goes on what the AI gets; the saved message keeps your words
    # and only learns the device's name, for the label on your bubble
    def meta_hook(body, meta):
        devs, _, cur = current()
        d = next((x for x in devs if x["id"] == cur), None)
        if d:
            meta["device"] = d["name"]

    async def payload_hook(pl, body):
        return {**pl, "content": with_mark(pl.get("content") or "")} if mark() else pl

    g["HOOKS"]["inbound_meta"].append(meta_hook)
    g["HOOKS"]["inbound_payload"].append(payload_hook)
    if log:
        log.info("device switch: %s", conf_file if conf_file.exists() else "off (no devices.json)")
