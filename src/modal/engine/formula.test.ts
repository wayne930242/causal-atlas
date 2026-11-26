import { describe, expect, it } from 'vitest'
import { modalProblemOf } from './errors.ts'
import type { Formula } from './formula.ts'
import { atomsOf, parseFormula } from './formula.ts'
import { formulaKey, formulaLatex, formulaText } from './print.ts'

function problemCode(text: string): string | undefined {
  try {
    parseFormula(text)
    return undefined
  } catch (error) {
    return modalProblemOf(error)?.code
  }
}

function problemAt(text: string): number | undefined {
  try {
    parseFormula(text)
    return undefined
  } catch (error) {
    const p = modalProblemOf(error)
    return p !== undefined && 'position' in p.params ? p.params.position : undefined
  }
}

describe('parseFormula', () => {
  it('reads ASCII and Unicode alike', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ['~p', '¬p'],
      ['p & q', 'p ∧ q'],
      ['p | q', 'p ∨ q'],
      ['p -> q', 'p ⊃ q'],
      ['p -> q', 'p → q'],
      ['p <-> q', 'p ≡ q'],
      ['[]p', '□p'],
      ['<>p', '◇p'],
      ['p > q', 'p □→ q'],
      ['true', '⊤'],
      ['false', '⊥'],
    ]
    for (const [ascii, unicode] of pairs) expect(parseFormula(unicode)).toEqual(parseFormula(ascii))
  })

  it('binds unary operators tightest, then ∧, ∨, >, and ⊃ last', () => {
    expect(formulaKey(parseFormula('~[]p & q | r'))).toBe('~[]p & q | r')
    expect(parseFormula('p | q & r')).toEqual(parseFormula('p | (q & r)'))
    expect(parseFormula('p & q > r | s')).toEqual(parseFormula('(p & q) > (r | s)'))
    expect(parseFormula('p -> q -> r')).toEqual(parseFormula('p -> (q -> r)'))
    expect(parseFormula('p > q > r')).toEqual(parseFormula('p > (q > r)'))
    expect(parseFormula('p & q & r')).toEqual(parseFormula('(p & q) & r'))
    expect(parseFormula('[]<>~p')).toEqual({ kind: 'box', arg: { kind: 'dia', arg: { kind: 'not', arg: { kind: 'atom', id: 'p' } } } })
  })

  it('asks for brackets where > meets ⊃ or ≡, and ≡ meets ⊃ or ≡', () => {
    for (const text of ['p > q -> r', 'p -> q > r', 'p > q <-> r', 'p <-> q > r', 'p <-> q <-> r', 'p <-> q -> r', 'p -> q <-> r']) {
      expect([text, problemCode(text)]).toEqual([text, 'ambiguous-mix'])
    }
    for (const text of ['(p > q) -> r', 'p -> (q > r)', '(p <-> q) <-> r', 'p -> (q <-> r)', '(p -> q) <-> r']) {
      expect([text, problemCode(text)]).toEqual([text, undefined])
    }
    expect(problemAt('p > q -> r')).toBe(6)
  })

  it('reports where the formula goes wrong', () => {
    expect(problemCode('')).toBe('parse-unexpected-end')
    expect(problemCode('p &')).toBe('parse-unexpected-end')
    expect(problemCode('(p & q')).toBe('parse-expected')
    expect(problemCode('p q')).toBe('parse-unexpected-token')
    expect(problemCode('p)')).toBe('parse-unexpected-token')
    expect(problemCode('P')).toBe('parse-unexpected-character')
    expect(problemCode('p % q')).toBe('parse-unexpected-character')
    expect(problemAt('p % q')).toBe(2)
    expect(problemAt('(p & q')).toBe(6)
  })

  it('lists atoms in order of appearance', () => {
    expect(atomsOf(parseFormula('[](rain -> wet) & ~rain & <>rain_2'))).toEqual(['rain', 'wet', 'rain_2'])
  })
})

describe('printing', () => {
  it('writes the modern and Garson notations, bracketing nested conditionals', () => {
    const f = parseFormula('[](p -> q) -> ([]p -> []q)')
    expect(formulaText(f)).toBe('□(p ⊃ q) ⊃ (□p ⊃ □q)')
    expect(formulaText(parseFormula('~(p & q) | ~p'), 'garson')).toBe('~(p & q) ∨ ~p')
    expect(formulaText(parseFormula('(p > q) -> r'))).toBe('(p > q) ⊃ r')
    expect(formulaLatex(parseFormula('rain > ~wet_lawn'))).toBe('\\mathit{rain} > \\neg \\mathit{wet}_{lawn}')
    expect(formulaLatex(parseFormula('[]p -> <>p'))).toBe('\\Box p \\supset \\Diamond p')
  })

  it('round-trips through the authoring syntax', () => {
    const texts = ['p & (q & r)', '(p | q) & r', '(p -> q) -> r', 'p -> q -> r', '(p > q) > r', 'p > q > r', '~(p > q)', '[](p > q)', '(p <-> q) <-> r', '~~p', 'true -> false']
    for (const text of texts) {
      const f: Formula = parseFormula(text)
      expect(parseFormula(formulaKey(f))).toEqual(f)
      expect(parseFormula(formulaText(f))).toEqual(f)
      expect(parseFormula(formulaText(f, 'garson'))).toEqual(f)
    }
  })
})
