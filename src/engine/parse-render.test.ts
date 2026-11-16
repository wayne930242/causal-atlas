import { describe, expect, it } from 'vitest'
import type { Expr } from './expr.ts'
import { buildModel } from './model.ts'
import { ParseError, parseExpr, parseFormula } from './parse.ts'
import { causalFormulas, renderEquation, renderExpr, renderModel } from './render.ts'
import { rockThrowing, variable } from './test-models.ts'

const v = (name: string): Expr => ({ op: 'var', name })

describe('parser', () => {
  it('parses precedence: not > and > or > implies > iff', () => {
    expect(parseExpr('BT and not SH')).toEqual({ op: 'and', args: [v('BT'), { op: 'not', arg: v('SH') }] })
    expect(parseExpr('A or B and C')).toEqual({ op: 'or', args: [v('A'), { op: 'and', args: [v('B'), v('C')] }] })
    expect(parseExpr('A -> B -> C')).toEqual({
      op: 'implies',
      left: v('A'),
      right: { op: 'implies', left: v('B'), right: v('C') },
    })
    expect(parseExpr('A <-> B or C')).toEqual({ op: 'iff', left: v('A'), right: { op: 'or', args: [v('B'), v('C')] } })
  })

  it('accepts unicode connectives and comparisons with literals', () => {
    expect(parseExpr('¬A ∧ B ∨ C')).toEqual(parseExpr('not A and B or C'))
    expect(parseExpr("Pred = 'one'")).toEqual({
      op: 'eq',
      left: v('Pred'),
      right: { op: 'const', value: 'one' },
      negated: false,
    })
    expect(parseExpr('X != 2')).toEqual({ op: 'eq', left: v('X'), right: { op: 'const', value: 2 }, negated: true })
    expect(parseExpr('if E then not D else D')).toEqual({ op: 'if', cond: v('E'), then: { op: 'not', arg: v('D') }, else: v('D') })
  })

  it('parses interventions as a prefix operator in formulas only', () => {
    expect(parseFormula('[ST<-0, BH←0] not BS=1 and A')).toEqual({
      op: 'and',
      args: [
        {
          op: 'do',
          interventions: [
            { variable: 'ST', value: 0 },
            { variable: 'BH', value: 0 },
          ],
          body: { op: 'not', arg: { op: 'eq', left: v('BS'), right: { op: 'const', value: 1 }, negated: false } },
        },
        v('A'),
      ],
    })
    expect(() => parseExpr('[ST<-0] BS')).toThrow(ParseError)
  })

  it('reports syntax errors with a position', () => {
    expect(() => parseExpr('ST or')).toThrow(/position 5/)
    expect(() => parseExpr('ST BT')).toThrow(/unexpected "BT"/)
    expect(() => parseExpr('ST # BT')).toThrow(/unexpected character/)
  })
})

describe('renderers', () => {
  const rock = rockThrowing()

  it('renders a structural equation in text and LaTeX', () => {
    expect(renderEquation(rock, 'BS', 'structural', 'text')).toBe('BS := SH ∨ BH')
    expect(renderEquation(rock, 'BH', 'structural', 'text')).toBe('BH := BT ∧ ¬SH')
    expect(renderEquation(rock, 'BH', 'structural', 'latex')).toBe('\\mathit{BH} := \\mathit{BT} \\land \\lnot \\mathit{SH}')
  })

  it('renders the propositional reading', () => {
    expect(renderEquation(rock, 'BS', 'propositional', 'text')).toBe('BS ↔ (SH ∨ BH)')
    expect(renderEquation(rock, 'SH', 'propositional', 'text')).toBe('SH ↔ ST')
    expect(renderEquation(rock, 'BS', 'propositional', 'latex')).toBe(
      '\\mathit{BS} \\leftrightarrow (\\mathit{SH} \\lor \\mathit{BH})',
    )
  })

  it('renders the Halpern–Pearl causal-language reading, one conjunct per parent setting', () => {
    expect(renderEquation(rock, 'BS', 'causal', 'text')).toBe(
      '[SH←0, BH←0](BS=0) ∧ [SH←0, BH←1](BS=1) ∧ [SH←1, BH←0](BS=1) ∧ [SH←1, BH←1](BS=1)',
    )
    expect(renderEquation(rock, 'ST', 'causal', 'text')).toBe('(U_ST=0 → ST=0) ∧ (U_ST=1 → ST=1)')
    expect(renderEquation(rock, 'SH', 'causal', 'latex')).toBe(
      '[\\mathit{ST}\\leftarrow 0](\\mathit{SH}=0) \\land [\\mathit{ST}\\leftarrow 1](\\mathit{SH}=1)',
    )
    expect(renderModel(rock, 'structural', 'text')).toHaveLength(5)
  })

  it('renders lookup tables as cases', () => {
    const model = buildModel({
      variables: [
        variable('D', 'exogenous', { kind: 'finite', values: ['one', 'two'] }),
        variable('E', 'exogenous'),
        variable('P', 'endogenous', { kind: 'finite', values: ['one', 'two'] }),
      ],
      equations: {
        P: {
          op: 'lookup',
          inputs: ['D', 'E'],
          rows: [
            { when: ['one', false], value: 'one' },
            { when: ['two', false], value: 'two' },
          ],
          fallback: 'two',
        },
      },
    })
    expect(renderEquation(model, 'P', 'structural', 'text')).toBe(
      'P := { one if D=one ∧ E=0; two if D=two ∧ E=0; two otherwise }',
    )
    expect(renderEquation(model, 'P', 'propositional', 'text')).toBe(
      '(D=one ∧ E=0 → P=one) ∧ (D=two ∧ E=0 → P=two) ∧ (¬(D=one ∧ E=0 ∨ D=two ∧ E=0) → P=two)',
    )
    expect(renderEquation(model, 'P', 'structural', 'latex')).toContain('\\begin{cases} \\text{one} & \\text{if } ')
  })

  it('round-trips text renderings through the formula parser', () => {
    for (const source of ['[ST<-0, BH<-0] not BS=1', '(A or B) and not (C -> D)', 'A <-> (B <-> C)', 'X != 2 or [Y<-1](Z=0)']) {
      const formula = parseFormula(source)
      expect(parseFormula(renderExpr(formula, 'text'))).toEqual(formula)
    }
    // Booleans render as 1/0, so compare the re-rendered text rather than the AST.
    for (const formula of causalFormulas(rock, 'BH')) {
      const text = renderExpr(formula, 'text')
      expect(renderExpr(parseFormula(text), 'text')).toBe(text)
    }
  })
})
