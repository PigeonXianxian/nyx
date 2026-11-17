"""Nyx · keeping the disk. What you upload is kept as it came — never shrunk or re-encoded. Room is made another way:
only when the disk runs short (less free than RELAY_MIN_FREE_GB, 5 GB, or 8% of the disk, whichever is more) are old
uploads let go — those older than RELAY_KEEP_DAYS (14) days, the oldest first, and only as many as it takes to be above
the line again. Nothing younger is ever touched. Looked at when the relay starts and every hour after; what goes is
written to the relay's log. (The proof cache keeps itself small: nyx_proof.py.) A picture in an old message whose file
has gone shows as "image unavailable".

Part of the Nyx relay, a modified Tidal Echo, GNU AGPL v3.
"""
import asyncio
import os
import shutil
import time
from pathlib import Path

KEEP_DAYS = float(os.environ.get("RELAY_KEEP_DAYS", "14"))
MIN_FREE = float(os.environ.get("RELAY_MIN_FREE_GB", "5")) * 1024 ** 3


def sweep(folder, keep_days=KEEP_DAYS, min_free=MIN_FREE, usage=shutil.disk_usage, now=None):
    """Let go of the oldest uploads past keep_days until the disk is above the line. Returns [(name, bytes)] removed."""
    folder = Path(folder)
    u = usage(str(folder))
    need, free = max(min_free, u.total * 0.08), u.free
    if free >= need or not folder.is_dir():
        return []
    cutoff = (now or time.time()) - keep_days * 86400
    old = sorted((p for p in folder.iterdir() if p.is_file() and not p.name.startswith(".") and p.stat().st_mtime < cutoff),
                 key=lambda p: p.stat().st_mtime)
    gone = []
    for p in old:
        if free >= need:
            break
        n = p.stat().st_size
        try:
            p.unlink()
        except OSError:
            continue
        free += n
        gone.append((p.name, n))
    return gone


def register(app, g):
    folder = g["UPLOAD_DIR"]

    async def keep():
        while True:
            try:
                gone = await asyncio.to_thread(sweep, folder)
                if gone:
                    print(f"nyx_keep: the disk was short; let go of {len(gone)} uploads older than {KEEP_DAYS:g} days "
                          f"({sum(n for _, n in gone) // 1024 ** 2} MB)", flush=True)
            except Exception as e:
                print(f"nyx_keep: {e}", flush=True)
            await asyncio.sleep(3600)

    g.setdefault("NYX_STARTUP", []).append(keep)
