"""Run: scripts/verify/.venv/bin/python scripts/verify/test_verify.py"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent


def run(req):
    p = subprocess.run([sys.executable, str(HERE / "verify.py")], input=json.dumps(req),
                       capture_output=True, text=True, check=True)
    return json.loads(p.stdout)


def eq(correct, choices, expr="(x+2)(x+3)"):
    return {"correct": correct, "choices": choices,
            "check": {"kind": "equal", "answer_expr": expr, "choice_is_expr": True}}


GOOD = {"A": "x^2+5x+6", "B": "x^2+6", "C": "x^2+5x+5", "D": "x^2+x+6"}

r = run(eq("A", GOOD))
assert r["ok"], r

r = run(eq("B", GOOD))  # wrong key
assert not r["ok"] and "A" in r["reason"], r

r = run(eq("A", {**GOOD, "B": "(x+2)*(x+3)"}))  # distractor also correct
assert not r["ok"], r

r = run(eq("A", {**GOOD, "B": "x^2+5x+6"}))  # duplicate choices
assert not r["ok"] and "distinct" in r["reason"], r

r = run(eq("A", {**GOOD, "B": "__import__('os').system('id')"}))  # malicious
assert not r["ok"] and "rejected" in r["reason"], r

r = run(eq("A", {**GOOD, "B": "x+1"}, expr="__import__('os')"))  # malicious answer_expr
assert not r["ok"] and "rejected" in r["reason"], r

solve = {"correct": "C", "choices": {"A": "2", "B": "-5", "C": "-2", "D": "5"},
         "check": {"kind": "solve", "equation": "x^2 + 7x + 10 = 0 + 2x + 6", "var": "x",
                   "choice_is_value": True}}
# x^2+5x+4=0 -> x=-1 or -4, so none of these are right: key must fail
assert not run(solve)["ok"]
solve["check"]["equation"] = "x^2 + 5x + 6 = 0"  # roots -2, -3
r = run(solve)
assert r["ok"], r

r = run(eq("A", {**GOOD, "B": "9**9**9**9"}))  # huge exponent: must fail cleanly, not hang or crash
assert not r["ok"], r

print("all verify tests passed")
