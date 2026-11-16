"""Nyx · Read (一起读): the reading library, brought into the house.

The library itself is 墨阅 (the Moben reading service) running beside the relay on this machine: it collects the
articles and programmes, translates them, writes the day's brief, and keeps what has been read. This module only
carries the page's requests to it, so that the house's own key is the one key:

  GET   /app/read/briefs?date=YYYY-MM-DD      the day's brief (today when no date) and the days that have one
  POST  /app/read/briefs/regenerate           write today's again (the library's own daily budget applies)
  GET   /app/read/recommendations             {daily: [...], weekly: [...]}
  GET   /app/read/articles?filter=&category=&source=&q=&limit=&offset=      cards, newest first
  GET   /app/read/articles/<id>               one article whole: blocks, translation, chapters
  POST  /app/read/articles/<id>/open          it has been opened (read)
  PATCH /app/read/articles/<id>/state         {read, completed, favorite, blockId, progress, rating}
  POST  /app/read/articles/<id>/original/resolve     a Xiaohongshu note's present address
  GET   /app/read/sources · /categories · /status
  POST  /app/read/collect                     look for new things now

Anything else is refused here. The library is reached on loopback with its proxy secret (read from its own
config, never copied elsewhere); its answers are passed back as they are.

Part of the Nyx relay, a modified Tidal Echo, GNU AGPL v3.
"""
import json
import os
import re

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import Response

CONFIG = os.environ.get("RELAY_READING_CONFIG", "/root/repo/moben/.config/reading.json")
ID = r"[A-Za-z0-9_-]{1,128}"
ALLOWED = [
    ("GET", re.compile(r"^briefs$")),
    ("POST", re.compile(r"^briefs/regenerate$")),
    ("GET", re.compile(r"^recommendations$")),
    ("GET", re.compile(r"^articles$")),
    ("GET", re.compile(rf"^articles/{ID}$")),
    ("POST", re.compile(rf"^articles/{ID}/open$")),
    ("PATCH", re.compile(rf"^articles/{ID}/state$")),
    ("POST", re.compile(rf"^articles/{ID}/original/resolve$")),
    ("GET", re.compile(r"^(?:sources|categories|status)$")),
    ("POST", re.compile(r"^collect$")),
]
SLOW = re.compile(r"^(?:briefs/regenerate|articles/[^/]+/original/resolve)$")   # a model call, or a browser waking up


def register(app, check_auth):
    state = {"mtime": None, "base": None, "token": None, "client": None}

    def library():
        """Where the library listens and the secret it expects; read again when its config changes."""
        try:
            mtime = os.stat(CONFIG).st_mtime_ns
        except OSError:
            raise HTTPException(status_code=503, detail="the reading library is not set up on this machine")
        if state["mtime"] != mtime:
            with open(CONFIG, encoding="utf-8") as f:
                cfg = json.load(f)
            token = cfg.get("proxyToken")
            if not isinstance(token, str) or len(token) < 32:
                raise HTTPException(status_code=503, detail="the reading library has no proxy secret")
            state.update(mtime=mtime, token=token, base=f"https://127.0.0.1:{int(cfg.get('port') or 8787)}")
        if state["client"] is None:
            # loopback only; the library's certificate is for its public name, not for 127.0.0.1
            state["client"] = httpx.AsyncClient(verify=False, timeout=httpx.Timeout(25.0, connect=5.0))
        return state["base"], state["token"], state["client"]

    @app.api_route("/app/read/{path:path}", methods=["GET", "POST", "PATCH"])
    async def read_any(path: str, request: Request):
        check_auth(request)
        if not any(method == request.method and rule.match(path) for method, rule in ALLOWED):
            raise HTTPException(status_code=404, detail="no such page in the library")
        base, token, client = library()
        headers = {"X-Reading-Proxy-Token": token}
        body = None
        if request.method != "GET":
            body = await request.body()
            if len(body) > 4096:
                raise HTTPException(status_code=413, detail="too much")
            headers["Content-Type"] = "application/json"
            body = body or b"{}"
        params = [(k, v) for k, v in request.query_params.multi_items() if k != "token"]
        try:
            r = await client.request(request.method, f"{base}/api/{path}", params=params, content=body, headers=headers,
                                     timeout=120.0 if SLOW.match(path) else 25.0)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="the reading library did not answer")
        return Response(content=r.content, status_code=r.status_code,
                        media_type=r.headers.get("content-type", "application/json; charset=utf-8"),
                        headers={"Cache-Control": "no-store"})

    return {}
