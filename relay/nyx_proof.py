"""Nyx · proofs: a look at a file that was handed over, on the page, without downloading it.

  GET /app/proof?path=<outbox path>   what the page needs to show it:
        {kind: "pages", key, total, pages: [{w, h, url, thumb}], notes: [text|null]|null}   slides, documents, sheets, PDFs
        {kind: "text", lang}     the page fetches the file itself and sets it
        {kind: "image"}          the same
        {kind: "none", why}      nothing to show; download it
      Each answer also carries name, path, size and versions: the other files in the outbox of the same name — the same
      file handed over again ("deck (2).pptx", or on another day) — oldest first, so the page can go between them.
  GET /app/proof/<key>/p-<n>.jpg      page n, large;  t-<n>.jpg the same, small

Slides, documents and spreadsheets (pptx, docx, xlsx, the older Office formats, OpenDocument, Keynote) go through
LibreOffice to a PDF, and the PDF — that one, or a PDF handed over as it is — is set as pictures by poppler's pdftoppm.
A proof is made once per file (keyed by its path, size and time), kept under ~/.cache/nyx-proof (RELAY_PROOF), the oldest
dropped past 80. One is made at a time: LibreOffice is heavy for a small server. A hand-over starts its proof straight
away (warm), so it is usually ready by the time the card is clicked. A deck's speaker notes come out of the pptx itself,
one per slide shown (hidden slides are left out of the PDF too). What a proof can't show: animation, and fonts the server
doesn't have — relay/fonts.conf sends those to the nearest ones it has.

Part of the Nyx relay, a modified Tidal Echo, GNU AGPL v3.
"""
import asyncio
import hashlib
import json
import os
import posixpath
import re
import shutil
import signal
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

from fastapi import HTTPException, Request

OFFICE = {".pptx", ".ppt", ".pps", ".ppsx", ".potx", ".odp", ".key",
          ".docx", ".doc", ".dotx", ".odt", ".rtf",
          ".xlsx", ".xls", ".ods"}
PDF = {".pdf"}
DECK = {".pptx", ".ppsx", ".potx"}
IMAGE = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
TEXT = {".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
        ".log", ".xml", ".html", ".htm", ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".py", ".sh", ".bash", ".zsh", ".sql",
        ".rs", ".go", ".java", ".kt", ".swift", ".c", ".h", ".cc", ".cpp", ".hpp", ".rb", ".php", ".r", ".lua", ".tex",
        ".bib", ".srt", ".vtt", ".diff", ".patch"}
MAX_PAGES = int(os.environ.get("RELAY_PROOF_PAGES", "80"))
KEEP = 80
BIG, SMALL = 1600, 360

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _run(cmd, timeout, env=None):
    """Run a converter in its own process group, so a hung LibreOffice is killed whole (soffice is a wrapper)."""
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=env, start_new_session=True)
    try:
        _, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except OSError:
            pass
        p.communicate()
        raise RuntimeError("it took too long to set")
    return p.returncode, (err or b"").decode("utf-8", "replace")


def _rels(z, part):
    """A part's relationships: id → (type, the target as a path inside the package)."""
    d, f = posixpath.split(part)
    try:
        x = ET.fromstring(z.read(posixpath.join(d, "_rels", f + ".rels")))
    except KeyError:
        return {}
    return {r.get("Id"): (r.get("Type", ""), posixpath.normpath(posixpath.join(d, r.get("Target", ""))))
            for r in x.iter(PR + "Relationship") if r.get("TargetMode") != "External"}


def deck_notes(src):
    """The speaker notes of a pptx, one per slide that is shown, in order (None where a slide has none)."""
    try:
        with zipfile.ZipFile(src) as z:
            pres = "ppt/presentation.xml"
            rels, out = _rels(z, pres), []
            for s in ET.fromstring(z.read(pres)).iter(P + "sldId"):
                slide = rels.get(s.get(R + "id"), ("", ""))[1]
                if not slide:
                    continue
                if ET.fromstring(z.read(slide)).get("show") == "0":   # hidden: not in the PDF either
                    continue
                text = None
                for typ, target in _rels(z, slide).values():
                    if typ.endswith("/notesSlide"):
                        paras = []
                        for sp in ET.fromstring(z.read(target)).iter(P + "sp"):
                            ph = sp.find(f"{P}nvSpPr/{P}nvPr/{P}ph")
                            if ph is None or ph.get("type") != "body":
                                continue
                            for para in sp.iter(A + "p"):
                                bits = []
                                for el in para.iter():
                                    if el.tag == A + "t":
                                        bits.append(el.text or "")
                                    elif el.tag == A + "br":
                                        bits.append("\n")
                                paras.append("".join(bits))
                        text = "\n".join(paras).strip() or None
                        break
                out.append(text)
            return out if any(out) else None
    except Exception:
        return None


def register(app, check_auth, outbox, outbox_file, prefix=""):
    root = Path(os.environ.get("RELAY_PROOF", str(Path.home() / ".cache" / "nyx-proof")))
    fonts = Path(__file__).with_name("fonts.conf")
    lock = asyncio.Lock()
    making = {}

    def key_of(p):
        st = p.stat()
        return hashlib.sha1(f"{p}|{st.st_size}|{st.st_mtime_ns}".encode()).hexdigest()[:20]

    def family(name):
        stem, ext = os.path.splitext(name)
        return re.sub(r" \(\d+\)$", "", stem).strip().lower(), ext.lower()

    def versions(p):
        fam, out = family(p.name), []
        base = outbox.resolve()
        for q in base.rglob("*"):
            rel = q.relative_to(base)
            if q.is_file() and not any(x.startswith(".") for x in rel.parts) and family(q.name) == fam:
                st = q.stat()
                out.append({"path": rel.as_posix(), "name": q.name, "size": st.st_size, "mtime": st.st_mtime,
                            "url": f"{prefix}/app/outbox/{quote(rel.as_posix())}"})
        out.sort(key=lambda v: v["mtime"])
        return out[-20:]

    def pages_of(pdf):
        r = subprocess.run(["pdfinfo", "-f", "1", "-l", str(MAX_PAGES), str(pdf)], capture_output=True, text=True, timeout=60)
        total = int((re.search(r"^Pages:\s+(\d+)", r.stdout, re.M) or [0, 0])[1])
        sizes = {int(n): (float(w), float(h)) for n, w, h in
                 re.findall(r"^Page\s+(\d+) size:\s+([\d.]+) x ([\d.]+)", r.stdout, re.M)}
        if not sizes:
            m = re.search(r"^Page size:\s+([\d.]+) x ([\d.]+)", r.stdout, re.M)
            if m:
                sizes = {1: (float(m[1]), float(m[2]))}
        return total, sizes

    def prune():
        """Keep the newest proofs; and clear what a converter that died mid-way left behind."""
        try:
            ds = [d for d in root.iterdir() if d.is_dir()]
            for d in ds:
                if d.name.startswith(".proof-") and time.time() - d.stat().st_mtime > 3600:
                    shutil.rmtree(d, ignore_errors=True)
            ds = sorted((d for d in ds if re.fullmatch(r"[0-9a-f]{20}", d.name)), key=lambda d: d.stat().st_mtime)
            for d in ds[:-KEEP]:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass

    def make(src, key):
        """Set the proof of one file (in a thread). Returns its manifest, or raises with a reason a person can read."""
        done = root / key / "proof.json"
        if done.is_file():
            return json.loads(done.read_text())
        root.mkdir(parents=True, exist_ok=True)
        work = Path(tempfile.mkdtemp(prefix=".proof-", dir=root))
        try:
            ext = src.suffix.lower()
            if ext in PDF:
                pdf = src
            else:
                soffice = shutil.which("soffice") or shutil.which("libreoffice")
                if not soffice:
                    raise RuntimeError("LibreOffice isn’t installed on the server")
                inp = work / ("in" + ext)   # a plain name: LibreOffice names what it writes after what it read
                shutil.copyfile(src, inp)
                env = {**os.environ, "HOME": str(work)}
                if fonts.is_file():
                    env["FONTCONFIG_FILE"] = str(fonts)
                code, err = _run([soffice, f"-env:UserInstallation=file://{work}/lo", "--headless", "--norestore",
                                  "--nolockcheck", "--convert-to", "pdf", "--outdir", str(work), str(inp)], 180, env)
                pdf = work / "in.pdf"
                if not pdf.is_file():
                    raise RuntimeError("LibreOffice couldn’t open it — the file may be damaged, or of a kind it can’t read")
            total, sizes = pages_of(pdf)
            if not total:
                raise RuntimeError("it has no pages")
            n = min(total, MAX_PAGES)
            img = work / "img"
            img.mkdir()
            for pre, px, q in (("p", BIG, 90), ("t", SMALL, 80)):
                code, err = _run(["pdftoppm", "-jpeg", "-jpegopt", f"quality={q},optimize=y", "-scale-to", str(px),
                                  "-f", "1", "-l", str(n), str(pdf), str(img / pre)], 240)
                if code:
                    raise RuntimeError("the pages couldn’t be set" + (f" ({err.strip()[:120]})" if err.strip() else ""))
            for f in img.glob("*.jpg"):   # pdftoppm pads the number to the page count's width: p-01.jpg
                pre, num = f.stem.split("-", 1)
                f.rename(img / f"{pre}-{int(num)}.jpg")
            last = sizes.get(1, (BIG, BIG * 9 / 16))
            pages = []
            for i in range(1, n + 1):
                if not (img / f"p-{i}.jpg").is_file():
                    break
                w, h = sizes.get(i, last)
                last = (w, h)
                pages.append({"w": round(w, 2), "h": round(h, 2)})
            notes = deck_notes(src) if ext in DECK else None
            if notes:
                notes = (notes + [None] * len(pages))[:len(pages)]
            man = {"kind": "pages", "key": key, "total": total, "pages": pages, "notes": notes, "from": "pdf" if ext in PDF else "office"}
            (img / "proof.json").write_text(json.dumps(man, ensure_ascii=False))
            out = root / key
            if out.exists():
                shutil.rmtree(out, ignore_errors=True)
            img.rename(out)
            prune()
            return man
        finally:
            shutil.rmtree(work, ignore_errors=True)

    async def made(p):
        key = key_of(p)
        done = root / key / "proof.json"
        if done.is_file():
            return json.loads(done.read_text())
        t = making.get(key)
        if t is None:
            async def job():
                async with lock:
                    return await asyncio.to_thread(make, p, key)
            t = making[key] = asyncio.ensure_future(job())
            t.add_done_callback(lambda _t, k=key: making.pop(k, None))
        return await asyncio.shield(t)

    def urls(man):
        k = man["key"]
        for i, pg in enumerate(man["pages"], 1):
            pg["url"] = f"{prefix}/app/proof/{k}/p-{i}.jpg"
            pg["thumb"] = f"{prefix}/app/proof/{k}/t-{i}.jpg"
        return man

    def warm(p):
        """A file was just handed over: start its proof now, so it is ready when the card is opened."""
        if Path(p).suffix.lower() not in OFFICE | PDF:
            return

        async def go():
            try:
                await made(Path(p))
            except Exception:
                pass
        asyncio.ensure_future(go())

    @app.get("/app/proof")
    async def proof(request: Request, path: str = ""):
        check_auth(request)
        p = outbox_file(path)
        ext = p.suffix.lower()
        base = {"name": p.name, "path": path, "size": p.stat().st_size, "versions": await asyncio.to_thread(versions, p)}
        if ext in IMAGE:
            return {**base, "kind": "image"}
        if ext in TEXT:
            return {**base, "kind": "text", "lang": ext[1:]}
        if ext not in OFFICE | PDF:
            return {**base, "kind": "none", "why": "there’s no proof for this kind of file"}
        try:
            return {**base, **urls(dict(await made(p)))}
        except Exception as e:
            return {**base, "kind": "none", "why": str(e)[:240] or "it couldn’t be set"}

    @app.get("/app/proof/{key}/{name}")
    async def proof_page(request: Request, key: str, name: str):
        from fastapi.responses import FileResponse
        check_auth(request)
        if not re.fullmatch(r"[0-9a-f]{20}", key) or not re.fullmatch(r"[pt]-\d{1,4}\.jpg", name):
            raise HTTPException(status_code=404, detail="no such page")
        f = root / key / name
        if not f.is_file():
            raise HTTPException(status_code=404, detail="no such page")
        return FileResponse(str(f), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"})

    return {"warm": warm, "kinds": {"office": sorted(OFFICE), "pdf": sorted(PDF), "text": sorted(TEXT), "image": sorted(IMAGE)}}
