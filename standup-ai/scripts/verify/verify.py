"""Verify an LLM-generated math MCQ key with sympy. JSON in on stdin, {ok, reason} out on stdout."""
import json
import re
import resource
import signal
import sys

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor, implicit_multiplication_application, parse_expr, standard_transformations,
)

ALLOWED = re.compile(r"^[A-Za-z0-9_+\-*/^().,= ]*$")
BANNED = ("__", "import", "lambda", "exec", "eval")
# Only these names resolve to functions; any other name becomes a plain Symbol.
NAMESPACE = {
    "__builtins__": {}, "expand": sp.expand, "factor": sp.factor, "simplify": sp.simplify,
    "sqrt": sp.sqrt, "Rational": sp.Rational,
    # constructors parse_expr's own transformations emit; not callable from user text meaningfully
    "Integer": sp.Integer, "Float": sp.Float, "Symbol": sp.Symbol,
}
TRANSFORMS = standard_transformations + (convert_xor, implicit_multiplication_application)


class Bad(Exception):
    pass


def parse(s):
    if not isinstance(s, str) or not ALLOWED.match(s) or any(b in s.lower() for b in BANNED):
        raise Bad(f"rejected expression: {s!r}")
    try:
        return parse_expr(s, global_dict=dict(NAMESPACE), transformations=TRANSFORMS)
    except Exception as e:
        raise Bad(f"cannot parse {s!r}: {type(e).__name__}")


def same(a, b):
    return sp.simplify(a - b) == 0


def check(req):
    choices, key, chk = req["choices"], req["correct"], req["check"]
    if key not in choices:
        raise Bad("correct key is not one of the choices")
    if len({str(v).strip() for v in choices.values()}) != len(choices):
        raise Bad("choices are not distinct")

    if chk["kind"] == "equal":
        answer = parse(chk["answer_expr"])
        matches = lambda c: same(parse(c), answer)  # noqa: E731
    elif chk["kind"] == "solve":
        if chk["equation"].count("=") != 1:
            raise Bad("equation must contain exactly one '='")
        lhs, rhs = (parse(p) for p in chk["equation"].split("="))
        sols = sp.solve(sp.Eq(lhs, rhs), sp.Symbol(chk["var"]))
        if not sols:
            raise Bad("equation has no solutions")
        matches = lambda c: any(same(parse(c), s) for s in sols)  # noqa: E731
    else:
        raise Bad(f"unknown check kind: {chk['kind']!r}")

    right = [k for k, v in choices.items() if matches(v)]
    if right != [key]:
        raise Bad(f"expected only {key} to be correct, but correct choices are {right}")


def main():
    req = json.load(sys.stdin)  # malformed input is a real crash: let it raise
    try:  # shortcut: 1 GiB cap so a string like 9**9**9**9 fails fast instead of eating RAM; POSIX only
        resource.setrlimit(resource.RLIMIT_AS, (1 << 30, 1 << 30))
    except (ValueError, OSError):
        pass
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Bad("timed out")))
    signal.alarm(10)  # shortcut: sympy simplify can hang on adversarial input, 10s cap
    try:
        check(req)
        out = {"ok": True, "reason": "verified"}
    except Bad as e:
        out = {"ok": False, "reason": str(e)}
    except MemoryError:
        out = {"ok": False, "reason": "ran out of memory"}
    print(json.dumps(out))


if __name__ == "__main__":
    main()
