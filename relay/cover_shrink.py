#!/usr/bin/python3
"""cover_shrink.py <out.webp> <in> [<in> …]: of an article's first figures, keep the one with the most in it, made small.

Run by relay/nyx_read.py with the system's Python (Pillow comes with it; the relay's own environment has no imaging
library). Each candidate is read (an animation gives a frame from its middle, not its blank first one), laid on white
if it was drawn on a clear ground, and judged by how much is on it: a nearly empty sheet — a pale diagram, a blank
frame — makes a poor cover and loses to a fuller one. The winner is written at most 720 px on its longer side, WebP.
Exits non-zero, writing nothing, when no candidate is a picture with enough on it to be worth showing.
"""
import sys
from pathlib import Path

from PIL import Image, ImageStat

Image.MAX_IMAGE_PIXELS = 60_000_000   # a figure, not a poster wall
ENOUGH = 13.0                         # the least spread of tone (0–127) a cover must have: a pale diagram passes, a blank sheet does not


def load(path):
    im = Image.open(path)
    frames = getattr(im, "n_frames", 1)
    im.seek(frames // 2 if frames > 1 else 0)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        ground = Image.new("RGB", im.size, (255, 255, 255))
        ground.paste(im, mask=im.split()[-1])
        im = ground
    else:
        im = im.convert("RGB")
    if im.width < 200 or im.height < 120 or im.width > im.height * 5 or im.height > im.width * 3:
        return None, 0.0   # an icon, a rule, a banner strip
    small = im.convert("L").resize((96, 96))
    return im, ImageStat.Stat(small).stddev[0]


def main():
    if len(sys.argv) < 3:
        return 2
    out, best, score = Path(sys.argv[1]), None, 0.0
    for src in sys.argv[2:]:
        try:
            im, s = load(src)
        except Exception:   # noqa: BLE001 — not a picture Pillow can read; try the next
            continue
        if im is not None and s > score:
            best, score = im, s
    if best is None or score < ENOUGH:
        return 3
    best.thumbnail((720, 720))
    tmp = out.with_suffix(".tmp")
    best.save(tmp, "WEBP", quality=76, method=4)
    tmp.replace(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
