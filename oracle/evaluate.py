"""Evaluate the public y0 expression objects on an observational joint."""

from collections.abc import Callable
from functools import cache
from math import fsum, prod

from y0.dsl import Expression, Fraction, One, Probability, Product, Sum, Variable, Zero

from cases import ASSIGNMENT, JointRow, assignments


def evaluator(joint: list[JointRow]) -> Callable[[Expression, ASSIGNMENT], float]:
    @cache
    def marginal(known: tuple[tuple[str, int], ...]) -> float:
        return fsum(row["p"] for row in joint if all(
            row["assignment"][name] == value for name, value in known
        ))

    def evaluate(expr: Expression, at: ASSIGNMENT) -> float:
        match expr:
            case Probability():
                if any(type(v) is not Variable or v.star is not None for v in (*expr.parents, *expr.children)):
                    raise ValueError(f"Non-observational probability in oracle formula: {expr!r}")
                given = tuple(sorted((v.name, at[v.name]) for v in expr.parents))
                event = dict(given) | {v.name: at[v.name] for v in expr.children}
                return marginal(tuple(sorted(event.items()))) / marginal(given)
            case Sum():
                names = sorted(v.name for v in expr.ranges)
                # This binding is local to the operand; it may shadow a query assignment.
                return fsum(evaluate(expr.expression, at | bound) for bound in assignments(names))
            case Product():
                return prod(evaluate(factor, at) for factor in expr.expressions)
            case Fraction():
                return evaluate(expr.numerator, at) / evaluate(expr.denominator, at)
            case One():
                return 1.0
            case Zero():
                return 0.0
            case _:
                raise ValueError(f"Unsupported y0 expression: {expr!r}")

    return evaluate
