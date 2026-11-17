import { describe, expect, it } from 'vitest'
import { subscriptParts } from './subscript.ts'
import { splitProse, textToLatex } from './typeset-text.ts'

const ids = new Set(['A', 'B', 'D', 'U', 'L', 'S', 'C', 'FF', 'MD', 'BT', 'SH', 'BH', 'GW', 'QW', 'N_S1', 'U_L'])

const formulas = (text: string, narrative = false): string[] =>
  splitProse(text, ids, narrative)
    .filter((s) => s.formula)
    .map((s) => s.text)

describe('subscriptParts', () => {
  it('splits X_Y identifiers out of plain text', () => {
    expect(subscriptParts('固定 N_S1=1, U_L=0')).toEqual([
      '固定 ',
      { head: 'N', sub: 'S1' },
      '=1, ',
      { head: 'U', sub: 'L' },
      '=0',
    ])
    expect(subscriptParts('no ids here')).toEqual(['no ids here'])
  })
})

describe('textToLatex', () => {
  it('subscripts X_Y and spaces the operators', () => {
    expect(textToLatex('N_S1=1')).toBe('N_{\\mathit{S1}}=1')
    expect(textToLatex('do(A=0)')).toBe('\\mathrm{do}(A=0)')
    expect(textToLatex('P(C=1 | S=1)')).toBe('P(C=1\\mid S=1)')
    expect(textToLatex("A='one'")).toBe('A=\\text{one}')
    expect(textToLatex('A=one')).toBe('A=\\text{one}')
    expect(textToLatex('L=1 ∧ MD=1')).toBe('L=1\\land \\mathit{MD}=1')
    expect(textToLatex('[ST←0, BH←0](BS=0)')).toBe('[\\mathit{ST}\\leftarrow 0,\\ \\mathit{BH}\\leftarrow 0](\\mathit{BS}=0)')
  })
})

describe('splitProse', () => {
  it('finds assignments, do() and P() fragments', () => {
    expect(formulas('Seeing A=0 means no order was given.')).toEqual(['A=0'])
    expect(formulas('看到 A 沒有開槍（A=0）')).toEqual(['A', 'A=0'])
    expect(formulas('Equals P(C=1): smoking has no effect.')).toEqual(['P(C=1)'])
    expect(formulas('Abduction: D=1 ⇒ U=1 ⇒ B=1.')).toEqual(['D=1 ⇒ U=1 ⇒ B=1'])
    expect(formulas('Fails AC3: L=1 alone suffices.')).toEqual(['L=1'])
    expect(formulas('套上 do(A=0, B=1)')).toEqual(['do(A=0, B=1)'])
  })

  it('finds equations written in prose, not the parentheses around them', () => {
    expect(formulas('需要兩者同時發生（FF = L·MD）。')).toEqual(['FF = L·MD'])
    expect(formulas('burns (FF = max(L, MD)). This')).toEqual(['FF = max(L, MD)'])
    expect(formulas('dies (D = ¬GW·¬QW).')).toEqual(['D = ¬GW·¬QW'])
    expect(formulas('(BH = BT·(1−SH));')).toEqual(['BH = BT·(1−SH)'])
  })

  it('types a bare variable id only when it is a known variable', () => {
    expect(formulas('病灶 L 同時影響 S 與 C，EDT 不算')).toEqual(['L', 'S', 'C'])
    expect(formulas('Wei and X are not variables')).toEqual([])
    expect(formulas('N_S1 is the urge')).toEqual(['N_S1'])
  })

  it('keeps and-joined events apart and leaves plain numbers alone', () => {
    expect(formulas('cause L=1 and MD=1')).toEqual(['L=1', 'MD=1'])
    expect(formulas('0.3·0.6 + 0.7·0.1')).toEqual([])
    expect(formulas('A, B')).toEqual(['A', 'B'])
  })

  it('does not take a word that merely contains an id', () => {
    expect(formulas('SHE LATE DAB ASH')).toEqual([])
  })

  it('reads a sentence-initial A as the article in a narrative, but A=0 stays a formula', () => {
    expect(formulas('A court orders. Riflemen A and B fire; had A not fired', true)).toEqual(['A', 'B', 'A'])
    expect(formulas('A fired, and the prisoner died.')).toEqual(['A'])
    expect(formulas('A=1 holds.', true)).toEqual(['A=1'])
  })

  it('round-trips the text', () => {
    const text = 'Abduction: D=1 ⇒ U=1 ⇒ B=1. 看到 A（A=0） and L=1'
    expect(
      splitProse(text, ids)
        .map((s) => s.text)
        .join(''),
    ).toBe(text)
  })
})
