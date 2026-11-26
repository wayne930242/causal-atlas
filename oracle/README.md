# Identification test oracles

From `oracle/`, run `uv run --locked python regenerate.py` with Docker running.
The first run builds the R image; a cached run takes about six seconds. The
Python lockfile selects y0 0.2.11; the R 4.5.2 image installs dosearch 1.0.12
and causaleffect 1.3.15. These are test-only dependencies. The harness calls
public APIs; neither GPL R package is a runtime dependency of causal-atlas.

`fixtures/cases.json` contains four named cases and 48 random ADMGs selected
before querying any oracle (seed `240618`). The date marks the fixture
baseline, not the wall clock. Each binary SCM has an independent latent per
bidirected edge and strictly positive, seeded Bernoulli CPTs. Integer-weight
enumeration computes the observational joint and the interventional truth;
intervening fixes treatment values and removes their CPT factors. In IDC
cases, truth divides the resulting outcome-and-evidence mass by the evidence
mass within each intervention.

The evaluator computes probabilities from the joint by marginalization and
conditioning, and recursively evaluates y0's sums, products and fractions.
For y0 error cases that are identifiable, it evaluates the returned dosearch
probability instead. For napkin it checks the exact returned dosearch ratio,
then evaluates its numerator and denominator in the `Z=0` stratum. Every
identifiable case must match its SCM truth within `1e-9`. The derivations file
keeps dosearch's DOT for backdoor, frontdoor and napkin, plus labeled edges
with the rule and probability sets at both ends. Multiple edges can feed the
same inference.

The 52 cases include 39 identifiable, 13 non-identifiable and 24 conditional
queries (IDC). Bow is non-identifiable in all three tools. There are no
unexpected disagreements. The exceptions are:

- Napkin: y0 0.2.11 says identifiable, but its formula misses the truth by up
  to `0.0025627615062761566` ([y0#372](https://github.com/y0-causal-inference/y0/issues/372)).
  The fixture keeps its formula, verdict and numeric values. The exception
  applies to this case and version only; upgrades require re-confirmation.
- Four y0 0.2.11 `KeyError`s (`random-10`, `random-14`, `random-38`, `random-46`)
  are kept without resampling. Their verdicts are compared using dosearch
  and causaleffect. Three are identifiable; `random-38` is not.
- The edgeless `random-10` produces the warning `number of items to replace
  is not a multiple of replacement length` during the **causaleffect** call,
  not the dosearch call. The fixture records the warning with its source.

To exercise the failure path, append `--break-truth`. This adds `0.01` to one
backdoor truth row in memory; validation must exit nonzero before writing
fixtures. Normal regeneration checks all cases before writing either file.

# Modal logic oracle

`modal.py` is an independent modal evaluator for `causal-atlas/modal`, written from the textbook truth
clauses rather than ported from the TypeScript engine. It needs only the Python standard library:
from the repository root run `python3 -I oracle/modal.py`; it writes `fixtures/modal.json` and records
its seed (`20261126`) and Python version there.

The fixture holds 40 random Kripke models (one to six worlds, atoms `p`, `q`, `r`) with twelve random
formulas each and their truth sets; 60 random four-world frames (every fourth one left as drawn, the
others closed under symmetry, reflexivity and transitivity so each condition holds often) with
serial, reflexive, transitive, symmetric and euclidean, and whether D, M, 4, B and 5 are valid on
them; and 30 random strongly centred systems of spheres around every world with nested Lewis
counterfactuals and Stalnaker's verdicts on flat ones, `null` where the closest antecedent worlds are
several. Formulas are written fully bracketed, so the engine's parser is tested too.

Before writing, every truth set is computed a second way (bottom-up from sets, with Lewis's
counterfactual by ranks instead of his clause over spheres), □ and ◇ are checked dual, and each frame
condition must agree with its axiom's validity, which is found by trying every assignment. Append
`--break-truth` to corrupt one stored truth set in memory: validation must exit nonzero without
writing. `src/modal/engine/oracle.test.ts` compares the engine with the fixture.
