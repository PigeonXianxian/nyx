#!/usr/bin/python3
"""Make an article's pictures small enough for the page.

  cover_shrink.py <out.webp> <in> [<in> …]     a cover: of the article's first figures, the one with the most in it
  cover_shrink.py --figure <out.webp> <in>     a figure as it stands in the article, whatever is on it

Run by relay/nyx_read.py with the system's Python (Pillow comes with it; the relay's own environment has no imaging
library). A picture is read (an animation gives a frame from its middle, not its blank first one) and laid on white
if it was drawn on a clear ground.
A cover is judged by how much is on it: a nearly empty sheet — a blank frame — loses to a fuller one, and an icon, a
rule or a banner strip is no cover at all; the winner is written at most 720 px on its longer side.
A figure is kept as it is, at most 1600 px wide and 2400 px tall.
Exits non-zero, writing nothing, when there is nothing worth showing (or the file is not a picture).
"""
import sys
from pathlib import Path

from PIL import Image, ImageStat

Image.MAX_IMAGE_PIXELS = 60_000_000   # a figure, not a poster wall
ENOUGH = 13.0                         # the least spread of tone (0–127) a cover must have: a pale diagram passes, a blank sheet does not


def read(path):
    im = Image.open(path)
    frames = getattr(im, "n_frames", 1)
    im.seek(frames // 2 if frames > 1 else 0)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        ground = Image.new("RGB", im.size, (255, 255, 255))
        ground.paste(im, mask=im.split()[-1])
        return ground
    return im.convert("RGB")


def load(path):
    im = read(path)
    if im.width < 200 or im.height < 120 or im.width > im.height * 5 or im.height > im.width * 3:
        return None, 0.0   # an icon, a rule, a banner strip
    small = im.convert("L").resize((96, 96))
    return im, ImageStat.Stat(small).stddev[0]


def write(im, out, quality):
    tmp = out.with_suffix(".tmp")
    im.save(tmp, "WEBP", quality=quality, method=4)
    tmp.replace(out)


def main():
    args = sys.argv[1:]
    if args[:1] == ["--figure"]:
        if len(args) != 3:
            return 2
        im = read(args[2])
        if im.width < 24 or im.height < 24:
            return 3   # a spacer, a tracking dot
        im.thumbnail((1600, 2400))
        write(im, Path(args[1]), 82)
        return 0
    if len(args) < 2:
        return 2
    out, best, score = Path(args[0]), None, 0.0
    for src in args[1:]:
        try:
            im, s = load(src)
        except Exception:   # noqa: BLE001 — not a picture Pillow can read; try the next
            continue
        if im is not None and s > score:
            best, score = im, s
    if best is None or score < ENOUGH:
        return 3
    best.thumbnail((720, 720))
    write(best, out, 76)
    return 0


if __name__ == "__main__":
    sys.exit(main())
