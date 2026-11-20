"""A transcript is read on a piece at a time (the relay was killed for holding a 170 MB one whole):
relay/venv/bin/python -m unittest discover relay/tests"""
import json
import pathlib
import sys
import tempfile
import tracemalloc
import unittest

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
from nyx_cc import new_lines  # noqa: E402


def write(lines, tail=b""):
    f = pathlib.Path(tempfile.mkstemp(suffix=".jsonl")[1])
    f.write_bytes(b"".join(l.encode() + b"\n" for l in lines) + tail)
    return f


class NewLines(unittest.TestCase):
    def test_every_whole_line_once_whatever_the_piece(self):
        lines = [json.dumps({"n": i, "t": "字" * (i % 50) + "🙂" * (i % 3)}, ensure_ascii=False) for i in range(400)]
        f = write(lines, b'{"half": "a line still being wr')
        size = f.stat().st_size
        for piece in (64, 1000, 4096, 1 << 20):
            got, took = [], 0
            for ls, n in new_lines(f, 0, size, piece):
                got += ls
                took += n
            self.assertEqual(got, lines, piece)
            self.assertEqual(took, size - len(b'{"half": "a line still being wr'), piece)   # the unfinished line is left for next time
        f.unlink()

    def test_reads_on_from_where_it_stopped(self):
        lines = ["a" * 10, "b" * 10, "c" * 10]
        f = write(lines)
        self.assertEqual([ls for ls, _ in new_lines(f, 11, f.stat().st_size, 5)], [["b" * 10], ["c" * 10]])
        self.assertEqual(list(new_lines(f, 33, f.stat().st_size)), [])
        f.unlink()

    def test_a_line_longer_than_a_piece(self):
        lines = ["x", "p" * 5000, "y"]
        f = write(lines)
        got = [l for ls, _ in new_lines(f, 0, f.stat().st_size, 256) for l in ls]
        self.assertEqual(got, lines)
        f.unlink()

    def test_a_long_session_is_not_held_whole(self):
        line = json.dumps({"type": "user", "message": {"content": "写" * 300 + "🙂" + "x" * 3000}}, ensure_ascii=False)
        f = write([line] * 6000)   # about 24 MB
        size = f.stat().st_size
        tracemalloc.start()
        n = sum(len(ls) for ls, _ in new_lines(f, 0, size, 1 << 20))
        peak = tracemalloc.get_traced_memory()[1]
        tracemalloc.stop()
        f.unlink()
        self.assertEqual(n, 6000)
        # text with an emoji in it takes four bytes a character, twice over (the text, then its lines): about twelve
        # times the bytes read — of one piece, where it used to be of the whole file
        self.assertLess(peak, 16 << 20, "peak %d MB for a %d MB file" % (peak >> 20, size >> 20))


if __name__ == "__main__":
    unittest.main()
