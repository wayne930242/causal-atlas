"""An independent modal-logic evaluator: the test oracle for causal-atlas/modal.

Written from the textbook truth conditions, not ported from the TypeScript engine. Standard library
only. It draws random Kripke models, frames and systems of spheres (seed SEED), evaluates random
formulas, checks every result two independent ways, and only then writes fixtures/modal.json.

    python3 -I oracle/modal.py              # regenerate the fixture
    python3 -I oracle/modal.py --break-truth  # corrupt one stored value; must exit nonzero
"""

import argparse
import itertools
import json
import platform
import random
import sys
from pathlib import Path

SEED = 20261126
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "fixtures" / "modal.json"
ATOMS = ("p", "q", "r")

# ---- formulas as tuples: ("atom", "p"), ("not", A), ("box", A), ("dia", A),
# ("and"|"or"|"imp"|"iff"|"cf", A, B)

ASCII = {"and": "&", "or": "|", "imp": "->", "iff": "<->", "cf": ">"}
UNARY = {"not": "~", "box": "[]", "dia": "<>"}


def write(f):
    """ASCII with every binary node bracketed, so no precedence rule is relied on."""
    kind = f[0]
    if kind == "atom":
        return f[1]
    if kind in UNARY:
        return UNARY[kind] + write(f[1])
    return "(" + write(f[1]) + " " + ASCII[kind] + " " + write(f[2]) + ")"


def random_formula(rand, depth, ops):
    if depth == 0 or rand.random() < 0.2:
        return ("atom", rand.choice(ATOMS))
    kind = rand.choice(ops)
    if kind in UNARY:
        return (kind, random_formula(rand, depth - 1, ops))
    return (kind, random_formula(rand, depth - 1, ops), random_formula(rand, depth - 1, ops))


# ---- Kripke truth, two ways


def holds(model, f, w):
    """Per world, straight from the truth clauses."""
    kind = f[0]
    if kind == "atom":
        return f[1] in model["val"][w]
    if kind == "not":
        return not holds(model, f[1], w)
    if kind == "and":
        return holds(model, f[1], w) and holds(model, f[2], w)
    if kind == "or":
        return holds(model, f[1], w) or holds(model, f[2], w)
    if kind == "imp":
        return (not holds(model, f[1], w)) or holds(model, f[2], w)
    if kind == "iff":
        return holds(model, f[1], w) == holds(model, f[2], w)
    if kind == "box":
        return all(holds(model, f[1], v) for v in model["worlds"] if (w, v) in model["R"])
    if kind == "dia":
        return any(holds(model, f[1], v) for v in model["worlds"] if (w, v) in model["R"])
    if kind == "cf":
        return lewis(model, f[1], f[2], w)
    raise ValueError(kind)


def extension(model, f):
    """The set of worlds where f is true, built bottom-up from sets."""
    W = frozenset(model["worlds"])
    kind = f[0]
    if kind == "atom":
        return frozenset(w for w in W if f[1] in model["val"][w])
    if kind == "not":
        return W - extension(model, f[1])
    if kind in ("and", "or", "imp", "iff"):
        a, b = extension(model, f[1]), extension(model, f[2])
        return {"and": a & b, "or": a | b, "imp": (W - a) | b, "iff": W - (a ^ b)}[kind]
    if kind in ("box", "dia"):
        a = extension(model, f[1])
        succ = {w: frozenset(v for (u, v) in model["R"] if u == w) for w in W}
        if kind == "box":
            return frozenset(w for w in W if succ[w] <= a)
        return frozenset(w for w in W if succ[w] & a)
    if kind == "cf":
        a, b = extension(model, f[1]), extension(model, f[2])
        out = set()
        for w in W:
            # Lewis via ranks: the A-worlds of least rank all lie in B.
            rank = model["rank"][w]
            reach = [v for v in a if v in rank]
            if not reach:
                out.add(w)
                continue
            least = min(rank[v] for v in reach)
            if all(v in b for v in reach if rank[v] == least):
                out.add(w)
        return frozenset(out)
    raise ValueError(kind)


def lewis(model, a, b, w):
    """Lewis's clause as stated: no sphere holds an A-world, or some sphere holding one has every A-world in it a B-world."""
    spheres = model["spheres"][w]
    a_in = [any(holds(model, a, v) for v in s) for s in spheres]
    if not any(a_in):
        return True
    return any(a_in[i] and all(holds(model, b, v) for v in s if holds(model, a, v)) for i, s in enumerate(spheres))


def stalnaker(model, a, b, w):
    """Stalnaker's selection: the one closest A-world, or None when the closest are several."""
    rank = model["rank"][w]
    reach = [v for v in model["worlds"] if v in rank and holds(model, a, v)]
    if not reach:
        return True
    least = min(rank[v] for v in reach)
    closest = [v for v in reach if rank[v] == least]
    if len(closest) > 1:
        return None
    return holds(model, b, closest[0])


# ---- frames


def condition(worlds, R, name):
    W = worlds
    if name == "serial":
        return all(any((w, v) in R for v in W) for w in W)
    if name == "reflexive":
        return all((w, w) in R for w in W)
    if name == "symmetric":
        return all((v, w) in R for (w, v) in R)
    if name == "transitive":
        return all((w, u) in R for (w, v) in R for (x, u) in R if x == v)
    if name == "euclidean":
        return all((v, u) in R for (w, v) in R for (x, u) in R if x == w)
    raise ValueError(name)


AXIOMS = {
    "serial": ("imp", ("box", ("atom", "p")), ("dia", ("atom", "p"))),
    "reflexive": ("imp", ("box", ("atom", "p")), ("atom", "p")),
    "transitive": ("imp", ("box", ("atom", "p")), ("box", ("box", ("atom", "p")))),
    "symmetric": ("imp", ("atom", "p"), ("box", ("dia", ("atom", "p")))),
    "euclidean": ("imp", ("dia", ("atom", "p")), ("box", ("dia", ("atom", "p")))),
}


def valid(worlds, R, f):
    for bits in itertools.product((False, True), repeat=len(worlds)):
        model = {"worlds": worlds, "R": R, "val": {w: {"p"} if b else set() for w, b in zip(worlds, bits)}}
        if not all(holds(model, f, w) for w in worlds):
            return False
    return True


# ---- generation


def kripke_case(rand, k):
    n = rand.randint(1, 6)
    worlds = [f"w{i}" for i in range(n)]
    val = {w: {a for a in ATOMS if rand.random() < 0.5} for w in worlds}
    R = {(w, v) for w in worlds for v in worlds if rand.random() < 0.35}
    model = {"worlds": worlds, "val": val, "R": R}
    formulas = [random_formula(rand, 4, ["not", "box", "dia", "and", "or", "imp", "iff"]) for _ in range(12)]
    return {
        "id": f"kripke-{k}",
        "worlds": [{"id": w, "true": sorted(val[w])} for w in worlds],
        "access": sorted([list(e) for e in R]),
        "formulas": [{"text": write(f), "truthSet": [w for w in worlds if holds(model, f, w)]} for f in formulas],
        "_model": model,
        "_trees": formulas,
    }


def frame_case(rand, k):
    worlds = [f"w{i}" for i in range(4)]
    density = rand.choice([0.3, 0.5, 0.7, 0.9])
    R = {(w, v) for w in worlds for v in worlds if rand.random() < density}
    # Every fourth frame stays random; the others are closed so each condition also holds often.
    mode = k % 4
    if mode in (1, 3):
        R |= {(v, w) for (w, v) in R}
    if mode in (2, 3):
        R |= {(w, w) for w in worlds}
    if mode in (2, 3):
        while True:
            more = {(w, u) for (w, v) in R for (x, u) in R if x == v} - R
            if not more:
                break
            R |= more
    return {
        "id": f"frame-{k}",
        "worlds": worlds,
        "access": sorted([list(e) for e in R]),
        "conditions": {c: condition(worlds, R, c) for c in AXIOMS},
        "axiomValid": {c: valid(worlds, R, AXIOMS[c]) for c in AXIOMS},
    }


def spheres_case(rand, k):
    n = rand.randint(2, 5)
    worlds = [f"w{i}" for i in range(n)]
    val = {w: {a for a in ATOMS if rand.random() < 0.5} for w in worlds}
    systems, rank = {}, {}
    for w in worlds:
        others = [v for v in worlds if v != w and rand.random() < 0.85]
        r = {v: rand.randint(1, 3) for v in others}
        r[w] = 0
        levels = sorted(set(r.values()))
        rank[w] = {v: levels.index(x) for v, x in r.items()}
        systems[w] = [[v for v in worlds if v in r and r[v] <= lvl] for lvl in levels]
    model = {"worlds": worlds, "val": val, "spheres": systems, "rank": rank}
    model["R"] = {(w, v) for w in worlds for v in systems[w][-1]}
    nested = [random_formula(rand, 3, ["not", "and", "or", "cf", "box"]) for _ in range(8)]
    flat = [("cf", random_formula(rand, 2, ["not", "and", "or"]), random_formula(rand, 2, ["not", "and", "or"])) for _ in range(6)]
    return {
        "id": f"spheres-{k}",
        "worlds": [{"id": w, "true": sorted(val[w])} for w in worlds],
        "systems": systems,
        "lewis": [{"text": write(f), "truthSet": [w for w in worlds if holds(model, f, w)]} for f in nested],
        "stalnaker": [{"text": write(f), "values": {w: stalnaker(model, f[1], f[2], w) for w in worlds}} for f in flat],
        "_model": model,
        "_trees": nested,
    }


# ---- validation before writing


def require(ok, message):
    if not ok:
        raise ValueError(message)


def validate(fixture):
    for case in fixture["kripke"] + fixture["spheres"]:
        model = case["_model"]
        rows = case["formulas"] if "formulas" in case else case["lewis"]
        for row, tree in zip(rows, case["_trees"]):
            ext = sorted(extension(model, tree), key=model["worlds"].index)
            require(ext == row["truthSet"], f"{case['id']} {row['text']}: stored {row['truthSet']}, sets give {ext}")
            for w in model["worlds"]:
                require(holds(model, ("box", tree), w) == (not holds(model, ("dia", ("not", tree)), w)), f"{case['id']}: □/◇ duality")
    for case in fixture["frames"]:
        for c in AXIOMS:
            require(case["conditions"][c] == case["axiomValid"][c], f"{case['id']} {c}: condition and axiom disagree")
    seen_undefined = sum(v is None for case in fixture["spheres"] for row in case["stalnaker"] for v in row["values"].values())
    require(seen_undefined > 0, "no non-unique Stalnaker selection drawn")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--break-truth", action="store_true", help="corrupt one stored truth set; validation must fail")
    args = parser.parse_args()
    rand = random.Random(SEED)
    fixture = {
        "generator": {"script": "oracle/modal.py", "seed": SEED, "python": platform.python_version()},
        "kripke": [kripke_case(rand, k) for k in range(40)],
        "frames": [frame_case(rand, k) for k in range(60)],
        "spheres": [spheres_case(rand, k) for k in range(30)],
    }
    if args.break_truth:
        row = fixture["kripke"][0]["formulas"][0]
        first = fixture["kripke"][0]["worlds"][0]["id"]
        row["truthSet"] = [w for w in row["truthSet"] if w != first] if first in row["truthSet"] else [first] + row["truthSet"]
    try:
        validate(fixture)
    except ValueError as error:
        print(f"validation failed: {error}", file=sys.stderr)
        sys.exit(1)
    for case in fixture["kripke"] + fixture["spheres"]:
        del case["_model"], case["_trees"]
    OUT.write_text(json.dumps(fixture, indent=1, ensure_ascii=False) + "\n")
    counts = {k: len(fixture[k]) for k in ("kripke", "frames", "spheres")}
    print(f"wrote {OUT.relative_to(ROOT.parent)}: {counts}")


if __name__ == "__main__":
    main()
