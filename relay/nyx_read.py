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
  GET   /app/read/cover/<id>                  the article's first figure, made small (WebP, at most 720 px wide)
  GET   /app/read/figure/<id>/<n>             the picture at block n of the article, as it stands (WebP, at most 1600 px wide)

Anything else is refused here. The library is reached on loopback with its proxy secret (read from its own
config, never copied elsewhere); its answers are passed back as they are.

A cover is fetched from the address the library recorded for that article (https only, a public address, at most
12 MB), made small once by relay/cover_shrink.py (the system's Python and Pillow) and kept on disk
(~/.cache/nyx-read-covers, RELAY_READ_COVERS). An article without a usable figure answers 404 and is not tried
again for six hours.

Part of the Nyx relay, a modified Tidal Echo, GNU AGPL v3.
"""
import asyncio
import ipaddress
import json
import os
import re
import socket
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response

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

    # ---- covers: the first figure of an article, small, for the cards (registered before the catch-all below) ----
    covers = Path(os.environ.get("RELAY_READ_COVERS", str(Path.home() / ".cache" / "nyx-read-covers")))
    shrinker = Path(__file__).with_name("cover_shrink.py")
    making, gate = {}, asyncio.Semaphore(2)

    def public_https(url):
        """https, and every address the host resolves to is a public one."""
        u = urlsplit(url)
        if u.scheme != "https" or not u.hostname or u.username or u.password:
            return False
        try:
            infos = socket.getaddrinfo(u.hostname, u.port or 443, type=socket.SOCK_STREAM)
        except OSError:
            return False
        return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)

    def first_ip(url):
        """The first IPv4 address the host resolves to here (the Mac's connection is pinned to it), or ""."""
        try:
            u = urlsplit(url)
            return next((i[4][0] for i in socket.getaddrinfo(u.hostname, u.port or 443, family=socket.AF_INET, type=socket.SOCK_STREAM)), "")
        except OSError:
            return ""

    async def fetch_direct(url, page):
        agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
        headers = {"User-Agent": agent, "Accept": "image/webp,image/png,image/jpeg,image/*;q=0.8"}
        if isinstance(page, str) and page.startswith("https://"):
            headers["Referer"] = page   # the figure is asked for as the article's own page asks for it
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0), follow_redirects=False, headers=headers) as web:
            for _ in range(4):   # each hop of a redirect is checked like the first address
                if not await asyncio.get_running_loop().run_in_executor(None, public_https, url):
                    return None
                async with web.stream("GET", url) as r:
                    if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                        url = urljoin(url, r.headers["location"])
                        continue
                    if r.status_code != 200:
                        return None
                    data = bytearray()
                    async for chunk in r.aiter_bytes():
                        data += chunk
                        if len(data) > 12 * 1024 * 1024:
                            return None
                    return bytes(data)
        return None

    # The Mac's line. This server is abroad, and from time to time cannot open a connection to hosts on the mainland
    # at all (晚点 and 量子位 stopped answering on 2026-11-18 while a Mac on a mainland line reached them in under a
    # second). A picture whose host does not answer here is fetched by that Mac instead (relay/mac/nyx-fetch-image,
    # installed there as ~/.local/bin/nyx-fetch-image; it also makes the picture small before it travels back), and
    # the host is then asked through the Mac first for half an hour. RELAY_READ_MAC names the ssh host; "" = never.
    mac = os.environ.get("RELAY_READ_MAC", "PigeonXian_0")
    silent, mac_gate = {}, asyncio.Semaphore(2)   # host → when it last did not answer from here

    async def via_mac(url, page, px):
        loop = asyncio.get_running_loop()
        if not mac or "\n" in url or "\r" in url or not await loop.run_in_executor(None, public_https, url):
            return None
        page = page if isinstance(page, str) and page.startswith("https://") and "\n" not in page and "\r" not in page else ""
        ip = await loop.run_in_executor(None, first_ip, url)
        proc = None
        async with mac_gate:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ControlMaster=auto",
                    "-o", "ControlPath=/run/nyx-mac-%C", "-o", "ControlPersist=180", mac, ".local/bin/nyx-fetch-image",
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
                out, _ = await asyncio.wait_for(proc.communicate(f"{url}\n{page}\n{ip}\n{int(px)}\n".encode()), timeout=90)
            except (OSError, asyncio.TimeoutError):
                if proc and proc.returncode is None:
                    proc.kill()
                return None
        return out if proc.returncode == 0 and out and len(out) <= 12 * 1024 * 1024 else None

    async def fetch_image(url, page, px=1600):
        host = urlsplit(url).hostname or ""
        if not (mac and time.time() - silent.get(host, 0) < 1800):
            try:
                return await fetch_direct(url, page)   # (None when the host answered but had no picture: the Mac would fare no better)
            except httpx.TransportError:
                silent[host] = time.time()
        return await via_mac(url, page, px)

    async def make_cover(aid, out, none):
        base, token, client = library()
        raws = []
        try:
            r = await client.get(f"{base}/api/articles/{aid}", headers={"X-Reading-Proxy-Token": token}, timeout=25.0)
            article = r.json() if r.status_code == 200 else {}
            # the article's first few figures: the fullest of them makes the cover (cover_shrink.py chooses)
            urls = [b.get("url") for b in (article.get("blocks") or []) if isinstance(b, dict) and b.get("type") == "image"
                    and isinstance(b.get("url"), str) and b["url"].startswith("https://")][:4] if article.get("cover") else []
            async with gate:
                for i, url in enumerate(urls):
                    data = await fetch_image(url, article.get("url"), 900)
                    if data:
                        raw = out.with_suffix(f".raw{i}")
                        raw.write_bytes(data)
                        raws.append(raw)
                if raws:
                    proc = await asyncio.create_subprocess_exec("/usr/bin/python3", "-I", str(shrinker), str(out), *[str(p) for p in raws],
                                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=60)
                    except asyncio.TimeoutError:
                        proc.kill()
        except (httpx.HTTPError, OSError, ValueError):
            pass   # the card simply goes without a picture
        finally:
            for raw in raws:
                raw.unlink(missing_ok=True)
        if not out.exists():
            none.write_text(str(int(time.time())))

    def cover_job(aid):
        """The making of this article's cover, started if it is neither made, nor known to be wanting, nor under way."""
        covers.mkdir(parents=True, exist_ok=True)
        out, none = covers / f"{aid}.webp", covers / f"{aid}.none"
        if out.exists() or (none.exists() and time.time() - none.stat().st_mtime < 6 * 3600):
            return out, None
        job = making.get(aid)
        if job is None:
            job = making[aid] = asyncio.ensure_future(make_cover(aid, out, none))
            job.add_done_callback(lambda _f: making.pop(aid, None))
        return out, job

    def warm(body):
        try:
            d = json.loads(body)
        except ValueError:
            return
        cards = (d.get("items") or []) + (d.get("daily") or []) + (d.get("weekly") or []) if isinstance(d, dict) else []
        for c in cards:
            if isinstance(c, dict) and c.get("cover") and isinstance(c.get("id"), str) and re.fullmatch(ID, c["id"]):
                cover_job(c["id"])

    # ---- figures: a picture where it stands in an article (the block's index in the article says which) ----
    figures = Path(os.environ.get("RELAY_READ_FIGURES", str(Path.home() / ".cache" / "nyx-read-figures")))
    listing = {}   # article id → (when asked, {block index: url}, the article's own address), for the last few articles

    async def figure_url(aid, n):
        hit = listing.get(aid)
        if not hit or time.time() - hit[0] > 600:
            base, token, client = library()
            r = await client.get(f"{base}/api/articles/{aid}", headers={"X-Reading-Proxy-Token": token}, timeout=25.0)
            article = r.json() if r.status_code == 200 else {}
            urls = {i: b["url"] for i, b in enumerate(article.get("blocks") or [])
                    if isinstance(b, dict) and b.get("type") == "image" and isinstance(b.get("url"), str) and b["url"].startswith("https://")}
            hit = listing[aid] = (time.time(), urls, article.get("url"))
            for old in sorted(listing, key=lambda k: listing[k][0])[:-8]:
                listing.pop(old, None)
        return hit[1].get(n), hit[2]

    async def make_figure(aid, n, out, none):
        raw = out.with_suffix(".raw")
        try:
            url, page = await figure_url(aid, n)
            data = await fetch_image(url, page) if url else None
            if data:
                raw.write_bytes(data)
                async with gate:
                    proc = await asyncio.create_subprocess_exec("/usr/bin/python3", "-I", str(shrinker), "--figure", str(out), str(raw),
                                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=60)
                    except asyncio.TimeoutError:
                        proc.kill()
        except (httpx.HTTPError, OSError, ValueError):
            pass   # the page shows the caption and the way to the original instead
        finally:
            raw.unlink(missing_ok=True)
        if not out.exists():
            none.write_text(str(int(time.time())))
        kept = sorted(figures.glob("*.webp"), key=lambda p: p.stat().st_mtime)
        for old in kept[:-1500]:   # a shelf of figures, not an archive of them
            old.unlink(missing_ok=True)

    @app.get("/app/read/figure/{aid}/{n}")
    async def read_figure(aid: str, n: int, request: Request):
        check_auth(request)
        if not re.fullmatch(ID, aid) or not 0 <= n < 5000:
            raise HTTPException(status_code=404, detail="no such figure")
        figures.mkdir(parents=True, exist_ok=True)
        out, none = figures / f"{aid}-{n}.webp", figures / f"{aid}-{n}.none"
        if not out.exists():
            if none.exists() and time.time() - none.stat().st_mtime < 3600:
                raise HTTPException(status_code=404, detail="no figure")
            key = f"{aid}/{n}"
            job = making.get(key)
            if job is None:
                job = making[key] = asyncio.ensure_future(make_figure(aid, n, out, none))
                job.add_done_callback(lambda _f: making.pop(key, None))
            await asyncio.shield(job)
            if not out.exists():
                raise HTTPException(status_code=404, detail="no figure")
        return FileResponse(out, media_type="image/webp", headers={"Cache-Control": "private, max-age=604800"})

    @app.get("/app/read/cover/{aid}")
    async def read_cover(aid: str, request: Request):
        check_auth(request)
        if not re.fullmatch(ID, aid):
            raise HTTPException(status_code=404, detail="no such article")
        out, job = cover_job(aid)
        if job is not None:
            await asyncio.shield(job)
        if not out.exists():
            raise HTTPException(status_code=404, detail="no cover")
        return FileResponse(out, media_type="image/webp", headers={"Cache-Control": "private, max-age=604800"})

    # One article, as the page needs it. A programme comes from the library with everything it was made from: every
    # subtitle cue with its times, and the edited transcript three times over (the parts as the editor returned them,
    # the blocks made of them, and the body itself) — megabytes for a long conversation, none of it shown. The page
    # reads the body, and of the edition only who speaks and the subtitles as they came (to switch back to).
    ONE = re.compile(r"^articles/[A-Za-z0-9_-]{1,128}$")

    def slim(raw):
        try:
            a = json.loads(raw)
            c = a.get("content") if isinstance(a, dict) else None
            if not isinstance(c, dict):
                return raw
            for basis in ("subtitle", "transcript"):
                if isinstance(c.get(basis), dict) and isinstance(c[basis].get("segments"), list):
                    c[basis] = {**{k: v for k, v in c[basis].items() if k != "segments"}, "segmentCount": len(c[basis]["segments"])}
            c.pop("editingDraft", None)
            if isinstance(c.get("edited"), dict):
                e = c["edited"]
                c["edited"] = {**{k: v for k, v in e.items() if k not in ("parts", "blocks", "corrections", "retry", "approvedCorrections")},
                               "correctionCount": len(e.get("corrections") or [])}
            return json.dumps(a, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        except (ValueError, TypeError, AttributeError):
            return raw

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
        if request.method == "GET" and r.status_code == 200 and path in ("articles", "recommendations"):
            warm(r.content)   # the cards just handed out: have their covers made before they are asked for
        content = r.content
        if request.method == "GET" and r.status_code == 200 and ONE.match(path):
            content = slim(content)
        return Response(content=content, status_code=r.status_code,
                        media_type=r.headers.get("content-type", "application/json; charset=utf-8"),
                        headers={"Cache-Control": "no-store"})

    return {}
