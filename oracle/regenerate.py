"""Run external oracle APIs and check their results against enumerated SCMs."""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
from importlib.metadata import version
from math import fsum, isfinite
from pathlib import Path

from y0.algorithm.identify import identify_outcomes
from y0.dsl import Distribution, P, Variable
from y0.graph import NxMixedGraph

from cases import SEED, cases, scm
from evaluate import evaluator

ROOT = Path(__file__).resolve().parent
TOL = 1e-9
NAPKIN = ("napkin", "y0", "0.2.11")
ERRORS = {
    "random-10": "left argument is not in graph: B",
    "random-14": "left argument is not in graph: A",
    "random-38": "right argument is not in graph: B",
    "random-46": "left argument is not in graph: A",
}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def dosearch_witness(case, evaluate):
    formula = case["formulas"]["dosearch"]
    match = re.fullmatch(r"p\(([A-Z](?:,[A-Z])*)(?:\|([A-Z](?:,[A-Z])*))?\)", formula)
    if match:
        event, given = match.groups()
        expr = P(Distribution(tuple(map(Variable, event.split(","))),
                              tuple(map(Variable, given.split(","))) if given else ()))
        return [evaluate(expr, row["at"]) for row in case["truth"]]
    require(case["id"] == "napkin" and formula == (
        r"\frac{\sum_{W}\left(p(W)p(X,Y|Z,W)\right)}"
        r"{\sum_{Y}\sum_{W}\left(p(W)p(X,Y|Z,W)\right)}"
    ), f"Unsupported dosearch witness: {formula}")
    w, x, y, z = map(Variable, "WXYZ")
    joint_term = P(Distribution((x, y), (z, w)))

    def numerator(at):
        return fsum(evaluate(P(w), at | {"W": value}) *
                    evaluate(joint_term, at | {"W": value}) for value in (0, 1))

    # The ratio is independent of Z; fix one positive stratum.
    return [numerator(at) / fsum(numerator(at | {"Y": value}) for value in (0, 1))
            for row in case["truth"] for at in [row["at"] | {"Z": 0}]]


def derivation(dot):
    labels = {}
    edges = []
    for line in dot.strip().splitlines()[1:-1]:
        node = re.fullmatch(r'(n\d+)\[shape=polygon,sides=4,label="(.*)"\]', line)
        edge = re.fullmatch(r'(n\d+) -> (n\d+)\[label="(\w+)"\]', line)
        if node:
            labels[node[1]] = node[2]
        elif edge:
            edges.append(edge.groups())
        else:
            raise ValueError(f"Unexpected derivation line: {line}")
    return {"dot": dot, "steps": [
        {"rule": rule, "from": labels[left], "to": labels[right],
         "fromSets": probability_sets(labels[left]), "toSets": probability_sets(labels[right])}
        for left, right, rule in edges
    ]}


def probability_sets(label):
    event, _, conditions = label[2:-1].partition("|")
    intervention = re.search(r"do\(([^)]*)\)", conditions)
    observed = re.sub(r"do\([^)]*\)", "", conditions).strip(",")
    return {"y": event.split(","), "x": intervention[1].split(",") if intervention else [],
            "w": observed.split(",") if observed else []}


def check(case, tools):
    cid = case["id"]
    ds, ce, y0 = (case["verdicts"][name] for name in ("dosearch", "causaleffect", "y0"))
    require(ds == ce and (y0 == ds or y0 == "error"), f"{cid}: verdict disagreement")
    require(cid != "bow" or ds is ce is y0 is False, "bow must be non-identifiable in all tools")
    if not ds:
        return
    values = case["oracleValues"]
    faults = case.get("knownOracleFaults", [])
    expected_fault = (cid, "y0", tools["y0"]) == NAPKIN
    require(bool(faults) == expected_fault, f"{cid}: unexpected or missing oracle fault")
    witness = "dosearch" if y0 == "error" or expected_fault else "y0"
    truth = case["truth"]
    for tool, vector in values.items():
        require(len(vector) == len(truth) and all(map(isfinite, vector)), f"{cid}: invalid {tool} values")
    error = max(abs(value - row["p"]) for value, row in zip(values[witness], truth, strict=True))
    require(error <= TOL, f"{cid}: {witness} witness differs from truth by {error:.12g}")
    if expected_fault:
        error = max(abs(value - row["p"]) for value, row in zip(values["y0"], truth, strict=True))
        require(error > TOL and faults == [{"tool": "y0", "version": tools["y0"],
            "issue": "y0#372", "maxError": error}], f"{cid}: y0 fault not reproduced")


def generate(break_truth):
    inputs = cases(SEED)
    image = "causal-atlas-ident-oracles:r4.5.2"
    subprocess.run(["docker", "build", "-t", image, str(ROOT)], check=True)
    raw = json.loads(subprocess.run([
        "docker", "run", "--rm", "-i", "-v", f"{ROOT / 'run-oracles.R'}:/oracle/run-oracles.R:ro", image,
    ], text=True, input=json.dumps(inputs), stdout=subprocess.PIPE, check=True).stdout)
    tools = raw["tools"] | {"y0": version("y0")}
    # Require a new review before any version can inherit an exception.
    require(tools["y0"] == NAPKIN[2], "Re-confirm y0 exceptions before upgrading")
    derivations = {}
    output = []
    for case, r in zip(inputs, raw["cases"], strict=True):
        cid = case["id"]
        require(cid == r["id"], "R output case order differs")
        graph = NxMixedGraph.from_edges(nodes=list(map(Variable, case["nodes"])),
            directed=[tuple(map(Variable, edge)) for edge in case["directed"]],
            undirected=[tuple(map(Variable, edge)) for edge in case["bidirected"]])
        x, y, w = (set(map(Variable, case[k])) for k in ("x", "y", "w"))
        joint, truth = scm(case, SEED)
        evaluate = evaluator(joint)
        record = dict(case, joint=joint, truth=truth, domains={n: [0, 1] for n in case["nodes"]},
                      verdicts=r["verdicts"], formulas=r["formulas"], oracleValues={})
        if r["warnings"]:
            record["oracleWarnings"] = r["warnings"]
        try:
            expr = identify_outcomes(graph, x, y, w or None)
        except KeyError as exc:
            require(exc.args == (ERRORS.get(cid),), f"{cid}: unexpected y0 error: {exc}")
            record["verdicts"]["y0"] = "error"
            record["oracleErrors"] = {"y0": f"KeyError: {exc.args[0]}"}
            record["formulas"]["y0"] = ""
        else:
            require(cid not in ERRORS, f"{cid}: expected y0 error disappeared")
            record["verdicts"]["y0"] = expr is not None
            record["formulas"]["y0"] = expr.to_latex() if expr is not None else ""
            if expr is not None:
                record["oracleValues"]["y0"] = [evaluate(expr, row["at"]) for row in truth]
        if record["verdicts"]["dosearch"] and (cid == "napkin" or cid in ERRORS):
            record["oracleValues"]["dosearch"] = dosearch_witness(record, evaluate)
        if cid == "napkin":
            record["knownOracleFaults"] = [{"tool": "y0", "version": tools["y0"], "issue": "y0#372",
                "maxError": max(abs(value - row["p"]) for value, row in
                                zip(record["oracleValues"]["y0"], truth, strict=True))}]
        if r["derivation"]:
            derivations[cid] = derivation(r["derivation"])
        if break_truth and cid == "backdoor":
            truth[0]["p"] += 0.01
        check(record, tools)
        output.append(record)
    counts = Counter(c["verdicts"]["dosearch"] for c in output)
    fixtures = ROOT / "fixtures"
    fixtures.mkdir(exist_ok=True)
    payloads = {"cases": {"generated": "2026-11-22", "tools": tools, "cases": output},
                "derivations": derivations}
    for name, payload in payloads.items():
        (fixtures / f"{name}.json").write_text(json.dumps(payload, indent=2, sort_keys=True,
                                                        allow_nan=False) + "\n")
    print(f"PASS: {len(output)} cases, {counts[True]} identifiable, {counts[False]} non-identifiable, "
          f"{sum(bool(c['w']) for c in output)} IDC, {len(ERRORS)} y0 errors; 0 unexpected disagreements")


if __name__ == "__main__":
    # Set before the interpreter starts so unordered oracle objects render consistently.
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.execve(sys.executable, [sys.executable, *sys.argv], os.environ | {"PYTHONHASHSEED": "0"})
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--break-truth", action="store_true", help="Negative control: fail before writing fixtures")
    generate(parser.parse_args().break_truth)
