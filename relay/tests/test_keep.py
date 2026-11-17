"""Uploads are let go only when the disk is short, only past two weeks, oldest first, only as many as it takes."""
import os
import pathlib
import sys
import tempfile
import time
import unittest
from collections import namedtuple

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from nyx_keep import sweep  # noqa: E402

Usage = namedtuple("Usage", "total used free")
GB, DAY = 1024 ** 3, 86400


class Sweep(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        self.now = time.time()
        for name, days, mb in (("a-30d", 30, 300), ("b-20d", 20, 300), ("c-15d", 15, 300), ("d-3d", 3, 300), ("e-today", 0, 300)):
            p = self.dir / name
            p.write_bytes(b"x")
            os.utime(p, (self.now - days * DAY, self.now - days * DAY))
            self.sizes = getattr(self, "sizes", {})
            self.sizes[name] = mb * 1024 ** 2

    def run_with(self, free_gb):
        sizes = self.sizes
        real = pathlib.Path.stat

        def stat(p, *a, **k):   # pretend each file is as big as the test says
            st = real(p, *a, **k)
            if p.name in sizes:
                return os.stat_result((st.st_mode, st.st_ino, st.st_dev, st.st_nlink, st.st_uid, st.st_gid, sizes[p.name], st.st_atime, st.st_mtime, st.st_ctime))
            return st
        pathlib.Path.stat = stat
        try:
            return sweep(self.dir, keep_days=14, min_free=5 * GB, usage=lambda _: Usage(58 * GB, 0, free_gb * GB), now=self.now)
        finally:
            pathlib.Path.stat = real

    def left(self):
        return sorted(p.name for p in self.dir.iterdir())

    def test_plenty_of_room_nothing_goes(self):
        self.assertEqual(self.run_with(24), [])
        self.assertEqual(len(self.left()), 5)

    def test_short_oldest_first_only_as_many_as_needed(self):
        # the line is max(5 GB, 8% of 58 GB = 4.64 GB) = 5 GB; 4.5 GB free → 0.5 GB to find → the two oldest (300 MB each)
        gone = self.run_with(4.5)
        self.assertEqual([n for n, _ in gone], ["a-30d", "b-20d"])
        self.assertEqual(self.left(), ["c-15d", "d-3d", "e-today"])

    def test_never_younger_than_two_weeks(self):
        self.run_with(0.1)   # far short: everything past two weeks goes, nothing younger
        self.assertEqual(self.left(), ["d-3d", "e-today"])


if __name__ == "__main__":
    unittest.main()
