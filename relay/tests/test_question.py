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
        self.assertEqual([(r["label"], r["value"], r["on"]) for r in q["rows"]],
                         [("How you use Claude here", "Mixed", False), ("Also scan shell history", "true", True),
                          ("Also scan your other repos", "false", False), ("Continue", "", False)])
        self.assertNotIn("Continue", [t["t"] for t in q["text"]])   # a row is a row, not a line of the words over it
        self.assertTrue({"Up", "Down", "Left", "Right", "Enter", "Escape"} <= set(q["keys"]))

    def test_rows_say_what_a_tap_does(self):
        # 2.1.329: the foot names the keys of the row the cursor is on
        q = read_dialog(screen("rows-toggle.txt"))
        self.assertEqual([(r["label"], r["value"], r["on"]) for r in q["rows"]],
                         [("How you use Claude here", "Mixed", False), ("Also scan shell history", "on", True),
                          ("Also scan your other repos", "off", False), ("Continue", "", False)])
        self.assertEqual(q["does"], "toggle")
        self.assertIn("Space", q["keys"])
        q = read_dialog(screen("rows-adjust.txt"))
        self.assertEqual([(r["label"], r["value"]) for r in q["rows"] if r["on"]], [("How you use Claude here", "Mixed")])
        self.assertEqual(q["does"], "adjust")
        self.assertTrue({"Left", "Right"} <= set(q["keys"]))
        q = read_dialog(screen("rows-continue.txt"))
        self.assertEqual([r["label"] for r in q["rows"] if r["on"]], ["Continue"])
        self.assertEqual((q["does"], q["enter"]), ("enter", "continue"))

    def test_rows_box_is_one_box_wherever_the_cursor_is(self):
        sigs = {read_dialog(screen(n))["sig"] for n in ("rows-toggle.txt", "rows-adjust.txt", "rows-continue.txt")}
        self.assertEqual(len(sigs), 1)

    def test_box_as_tall_as_the_window(self):
        # it has no rule over it and no input box under it: the whole screen is the box
        q = read_dialog(screen("tall-review.txt"))
        self.assertEqual([(r["label"], r["on"]) for r in q["rows"]], [("Looks good — save it", True), ("Discard and exit", False)])
        self.assertEqual((q["does"], q["enter"], q["above"]), ("enter", "confirm", 13))
        self.assertNotIn("↑ 13 more lines", [t["t"] for t in q["text"]])
        self.assertFalse(input_box(screen("tall-review.txt").splitlines()))

    def test_a_list_over_the_rows_is_not_rows(self):
        # the notes are set in exactly as far as the rows under them, an empty line between
        q = read_dialog(screen("tall-review-notes.txt"))
        self.assertEqual([(r["label"], r["on"]) for r in q["rows"]], [("Looks good — save it", False), ("Discard and exit", True)])
        self.assertTrue(any(t["t"].startswith("· Existing auto-mode settings") for t in q["text"]))
        self.assertEqual(q["above"], 10)

    def test_a_status_line_under_the_box(self):
        # "✻ Waiting for API response…" under the box is Claude Code's, not the end of the talk
        q = read_dialog(screen("model-switch.txt"))
        self.assertEqual([(o["n"], o["label"], o["own"]) for o in q["options"]],
                         [(1, "Switch automatically", False), (2, "Stay on Fable 5.2", False), (3, "Type something.", True), (4, "Chat about this", False)])
        self.assertEqual(q["options"][0]["desc"], "Continue on Opus 4.8 now, and switch without asking from now on")
        self.assertTrue(q["options"][0]["on"])
        self.assertTrue(any(t["t"].startswith("Fable 5.2's safeguards flagged this message.") for t in q["text"]))   # the bar down its side is not shown
        self.assertEqual(q["enter"], "select")
        self.assertFalse(any("Waiting for API response" in t["t"] for t in q["text"]))

    def test_a_box_that_names_no_keys(self):
        # "Session paused" (2.1.329): numbered choices, no line under them that names a key, and Claude Code's status
        # line at the foot of the screen — which is not the end of the talk
        s = screen("session-paused.txt")
        self.assertFalse(input_box(s.splitlines()))
        q = read_dialog(s)
        self.assertEqual([(o["n"], o["label"], o["on"]) for o in q["options"]],
                         [(1, "Switch to Opus 4.8", True), (2, "Edit prompt and retry with Opus 5.5", False)])
        self.assertEqual(q["text"][0]["t"], "Session paused")
        self.assertTrue(any(t["t"].startswith("Opus 5.5's safeguards flagged this session.") and t["t"].endswith("or learn more") for t in q["text"]))
        self.assertFalse(any("Waiting for API response" in t["t"] for t in q["text"]))
        self.assertTrue({"Up", "Down", "Enter", "Escape"} <= set(q["keys"]))   # with no keys named, the plain ones
        self.assertNotIn("raw", q)
        # the status line counts its seconds: the box is the same box
        self.assertEqual(q["sig"], read_dialog(s.replace("will retry in 0s", "will retry in 7s"))["sig"])
        self.assertEqual(q["sig"], read_dialog(s.replace("\u273b Waiting for API response \u00b7 will retry in 0s \u00b7 check your network", ""))["sig"])

    def test_a_box_the_page_has_not_met(self):
        # no input box, and nothing the reader knows the shape of: nothing — unless asked for the screen as it stands
        s = screen("unknown-box.txt")
        self.assertFalse(input_box(s.splitlines()))
        self.assertIsNone(read_dialog(s))
        q = read_dialog(s, raw=True)
        self.assertTrue(q["raw"])
        self.assertEqual([t["t"] for t in q["text"] if t["t"]],
                         ["Something new", "A box the page has not met: no rule over it, no numbers, nothing under it that names a key.", "[ Go on ]   Leave it"])
        self.assertEqual(set(q["keys"]), {"Up", "Down", "Left", "Right", "Enter", "Escape", "Tab", "Space"})
        wide = read_dialog(s.replace("[ Go on ]   Leave it", "[ Go on ]" + " " * 90 + "verbose"), raw=True)   # words at the far side of the window
        self.assertIn("[ Go on ]   verbose", [t["t"] for t in wide["text"]])
        # a spinner under it turns without making it another box
        self.assertEqual(q["sig"], read_dialog(s + "\n\u273b Waiting for API response \u00b7 will retry in 3s\n", raw=True)["sig"])
        # with nothing under the talk at all, the foot of the screen
        bare = "\n".join(screen("idle.txt").rstrip().splitlines()[:-6])
        if not input_box(bare.splitlines()):
            self.assertTrue(read_dialog(bare, raw=True)["text"])
        # a window at its input box is never one, and a box that is read is the same box either way
        for n in ("idle.txt", "busy.txt", "long-input.txt"):
            self.assertIsNone(read_dialog(screen(n), raw=True), n)
        for n in ("permission.txt", "question.txt", "review.txt", "model-switch.txt", "rows-toggle.txt", "tall-review.txt", "session-paused.txt"):
            self.assertEqual(read_dialog(screen(n), raw=True), read_dialog(screen(n)), n)

    def test_a_line_the_window_broke_is_one_paragraph(self):
        q = read_dialog(screen("model-switch.txt"))
        para = next(t["t"] for t in q["text"] if t["t"].startswith("Fable 5.2's safeguards flagged"))
        self.assertTrue(para.endswith("tasks. Switch to Opus 4.8 and keep going whenever this happens? You can change this later in /config."))
        q = read_dialog(screen("tall-review.txt"))   # a list keeps its items apart
        self.assertTrue(any(t["t"].startswith("· **Trusted cloud buckets**") for t in q["text"]))
        self.assertTrue(any(t["t"].startswith("· **Sensitive remote targets**") and t["t"].endswith("not `producer`)") for t in q["text"]))
        q = read_dialog(screen("permission.txt"))   # short lines stay lines
        self.assertIn("1 hello", [t["t"] for t in q["text"]])

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
