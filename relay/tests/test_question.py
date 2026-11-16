"""The question at the terminal, read off real Claude Code screens (2.1.325): python3 -m unittest discover relay/tests"""
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent))
from nyx_question import box_text, input_box, read_dialog  # noqa: E402


def screen(name):
    return (HERE / "screens" / name).read_text(encoding="utf-8")


class ReadDialog(unittest.TestCase):
    def test_permission_prompt(self):
        q = read_dialog(screen("permission.txt"))
        self.assertEqual([o["label"] for o in q["options"]][0::2], ["Yes", "No"])
        self.assertTrue(q["options"][0]["on"])
        self.assertIn("Do you want to create note2.txt?", [t["t"] for t in q["text"]])
        self.assertIn("1 hello", [t["t"] for t in q["text"]])   # the file it would write is shown
        self.assertIn("Escape", q["keys"])

    def test_claudes_own_question(self):
        q = read_dialog(screen("question.txt"))
        self.assertEqual([(o["n"], o["label"]) for o in q["options"]],
                         [(1, "Tea"), (2, "Coffee"), (3, "Water"), (4, "Type something."), (5, "Chat about this")])
        self.assertEqual(q["options"][1]["desc"], "A cup of coffee")
        self.assertEqual([o["own"] for o in q["options"]], [False, False, False, True, False])
        self.assertIn("Which drink would you like?", [t["t"] for t in q["text"]])
        self.assertTrue({"Left", "Right", "Tab"} <= set(q["keys"]))

    def test_review_without_key_hints(self):
        q = read_dialog(screen("review.txt"))
        self.assertEqual([o["label"] for o in q["options"]], ["Submit answers", "Cancel"])
        self.assertIn("→ nuts", [t["t"] for t in q["text"]])

    def test_claude_codes_own_box(self):
        q = read_dialog(screen("claude-code-box.txt"))
        self.assertEqual(q["options"], [])
        self.assertEqual(q["text"][0]["t"], "Teach auto mode about your environment?")
        self.assertEqual([t["t"] for t in q["text"] if t["on"]], ["Also scan shell history     true"])
        self.assertTrue({"Up", "Down", "Left", "Right", "Enter", "Escape"} <= set(q["keys"]))

    def test_no_question(self):
        for n in ("idle.txt", "busy.txt", "before-question.txt"):
            self.assertIsNone(read_dialog(screen(n)), n)

    def test_words_over_several_lines_are_still_the_input_box(self):
        # a long message wraps, and a picture adds an "[image] …" line: the box is still the input box, not a question
        for n in ("long-input.txt", "numbered-input.txt"):
            lines = screen(n).splitlines()
            self.assertTrue(input_box(lines), n)
            self.assertIsNone(read_dialog(screen(n)), n)
        self.assertIn("[image] /root/repo/nyx/relay/uploads/att-example.png", box_text(screen("long-input.txt")))

    def test_a_question_is_not_the_input_box(self):
        for n in ("permission.txt", "question.txt", "review.txt", "claude-code-box.txt"):
            self.assertFalse(input_box(screen(n).splitlines()), n)
        for n in ("idle.txt", "busy.txt", "before-question.txt"):
            self.assertTrue(input_box(screen(n).splitlines()), n)

    def test_sig_ignores_the_cursor(self):
        a = screen("question.txt")
        b = a.replace("❯ 1. Tea", "  1. Tea").replace("  2. Coffee", "❯ 2. Coffee")
        self.assertEqual(read_dialog(a)["sig"], read_dialog(b)["sig"])
        self.assertNotEqual(read_dialog(a)["sig"], read_dialog(screen("permission.txt"))["sig"])

    def test_box_text(self):
        self.assertEqual(box_text(screen("idle.txt")), "")
        self.assertEqual(box_text(screen("before-question.txt")), "23nuts")
        self.assertIsNone(box_text(screen("permission.txt")))


if __name__ == "__main__":
    unittest.main()
