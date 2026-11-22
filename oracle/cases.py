"""Choose ADMGs before asking any oracle, then enumerate a seeded SCM per graph."""

from collections import defaultdict
from collections.abc import Iterator
from itertools import combinations, product
from random import Random
from typing import TypedDict


SEED = 240618
ASSIGNMENT = dict[str, int]
EDGE = tuple[str, str]


class Case(TypedDict):
    id: str
    source: str
    nodes: list[str]
    directed: list[EDGE]
    bidirected: list[EDGE]
    y: list[str]
    x: list[str]
    w: list[str]


class JointRow(TypedDict):
    assignment: ASSIGNMENT
    p: float


class TruthRow(TypedDict):
    at: ASSIGNMENT
    p: float


def named(case_id: str, nodes: str, arrows: str, arcs: str) -> Case:
    return Case(
        id=case_id, source="named", nodes=list(nodes),
        directed=[(a, b) for a, b in arrows.split()],
        bidirected=[(a, b) for a, b in arcs.split()],
        y=["Y"], x=["X"], w=[],
    )


def cases(seed: int) -> list[Case]:
    result = [
        named("backdoor", "ZXY", "ZX ZY XY", ""),
        named("frontdoor", "XZY", "XZ ZY", "XY"),
        # Pearl and Mackenzie's napkin graph, as drawn in arXiv:2512.19861 Fig. 1(a).
        named("napkin", "WZXY", "WZ ZX XY", "WX WY"),
        named("bow", "XY", "XY", "XY"),
    ]
    rng = Random(seed)
    for i in range(48):
        nodes = list("ABCDEF"[:3 + i % 4])
        pairs = list(combinations(nodes, 2))
        # Vary the densities, independently of the query and oracle results.
        p_directed, p_bidirected = [(0.4, 0.1), (0.5, 0.35), (0.65, 0.5)][i % 3]
        directed = [edge for edge in pairs if rng.random() < p_directed]
        bidirected = [edge for edge in pairs if rng.random() < p_bidirected]
        order = rng.sample(nodes, len(nodes))
        nx = 2 if i % 5 == 0 else 1
        ny = 2 if i % 7 == 0 and len(nodes) >= 4 else 1
        nw = min(1 + int(i % 8 == 3), len(nodes) - nx - ny) if i % 2 else 0
        result.append(Case(
            id=f"random-{i + 1:02d}", source="random", nodes=nodes,
            directed=directed, bidirected=bidirected,
            y=sorted(order[:ny]), x=sorted(order[ny:ny + nx]),
            w=sorted(order[ny + nx:ny + nx + nw]),
        ))
    return result


def assignments(names: list[str]) -> Iterator[ASSIGNMENT]:
    for values in product((0, 1), repeat=len(names)):
        yield dict(zip(names, values, strict=True))


def scm(case: Case, seed: int) -> tuple[list[JointRow], list[TruthRow]]:
    rng = Random(f"{seed}:{case['id']}")
    nodes = case["nodes"]
    latent = [f"U{i}" for i in range(len(case["bidirected"]))]
    parents: dict[str, list[str]] = {v: [] for v in latent + nodes}
    for a, b in case["directed"]:
        parents[b].append(a)
    for u, (a, b) in zip(latent, case["bidirected"], strict=True):
        parents[a].append(u)
        parents[b].append(u)

    # A table cell k represents Bernoulli(k/8); exact integer factors are
    # multiplied and summed first, with division only when writing outputs.
    cpt = {
        v: {tuple(row.values()): rng.randrange(1, 8) for row in assignments(pa)}
        for v, pa in parents.items()
    }
    query = case["y"] + case["x"] + case["w"]
    joint: list[JointRow] = []
    truth_mass: dict[tuple[int, ...], int] = defaultdict(int)
    evidence_mass: dict[tuple[int, ...], int] = defaultdict(int)
    states_u = list(assignments(latent))
    denominator = 8 ** len(parents)
    for observed in assignments(nodes):
        observational_mass = 0
        interventional_mass = 0
        for hidden in states_u:
            state = observed | hidden
            shared = 1
            treatment = 1
            for v, pa in parents.items():
                p = cpt[v][tuple(state[parent] for parent in pa)]
                weight = p if state[v] else 8 - p
                if v in case["x"]:
                    treatment *= weight
                else:
                    shared *= weight
            observational_mass += shared * treatment
            # Truncated factorization: fix X, omit every treatment CPT.
            interventional_mass += shared
        joint.append({"assignment": observed, "p": observational_mass / denominator})
        truth_mass[tuple(observed[v] for v in query)] += interventional_mass
        evidence_mass[tuple(observed[v] for v in case["x"] + case["w"])] += interventional_mass

    truth: list[TruthRow] = []
    for at in assignments(query):
        mass = evidence_mass[tuple(at[v] for v in case["x"] + case["w"])]
        # Every evidence assignment has positive mass with the strictly positive CPTs.
        truth.append({"at": at, "p": truth_mass[tuple(at.values())] / mass})
    return joint, truth
