// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { docToCase, getCase } from '../../data/index.ts'
import { lessonModel } from '../../demo/lesson-models.ts'
import { evaluate } from '../../engine/index.ts'
import { causalTable } from './causal-table.ts'
import { Equations } from './Equations.tsx'
import { equationsLatex } from './equations-latex.ts'
import { shownVariables } from '../graph/graph-layout.ts'

afterEach(cleanup)

const bow = docToCase(lessonModel('m06-bow-a'))
const count = (c: ReturnType<typeof docToCase>, o: Parameters<typeof causalTable>[1]) => causalTable(c, o).count

describe('causalTable: the causal rows that hold under what is set, with the parents that do not matter left out', () => {
  it('matches the design counts: bow A 10 / 5 / 6 / 3, front door 11, back door 10', () => {
    expect(causalTable(bow, { interventions: {} })).toMatchObject({ count: 10, full: 40 })
    expect(count(bow, { interventions: { X: true } })).toBe(5)
    expect(count(bow, { interventions: {}, observed: { X: true } })).toBe(6)
    expect(count(bow, { interventions: { X: true }, observed: { Y: true } })).toBe(3)
    expect(count(docToCase(lessonModel('m05-frontdoor')), { interventions: { X: true } })).toBe(11)
    expect(count(docToCase(lessonModel('m05-backdoor')), { interventions: { X: true } })).toBe(10)
  })

  it('bow A under do(X=1): X←1, then the four X=1 rows of Y', () => {
    const t = causalTable(bow, { interventions: { X: true } })
    expect(t.rows.flatMap((r) => r.lines.map((l) => l.text))).toEqual([
      'X←1',
      'U=0 ∧ A10=0 → [X←1](Y=0)',
      'U=0 ∧ A10=1 → [X←1](Y=1)',
      'U=1 ∧ A11=0 → [X←1](Y=0)',
      'U=1 ∧ A11=1 → [X←1](Y=1)',
    ])
  })

  it('a graph with values keeps the actual world: one row per variable', () => {
    const ff = getCase('forest-fire-disjunctive')
    if (ff.context === undefined) throw new Error('no context')
    const t = causalTable(ff, { values: evaluate(ff.model, ff.context).values, interventions: {} })
    expect(t.rows.map((r) => r.lines.length)).toEqual([1, 1, 1])
    expect(t.rows[2].lines[0].text).toBe('[L←1, MD←1](FF=1)')
    expect(t.full).toBe(8)
  })

  it('the panel lists the rows, says how many hold and keeps the full table behind an expander', () => {
    const { container, getByRole } = render(<Equations c={bow} shown={shownVariables(bow)} notation="causal" interventions={{ X: true }} />)
    expect(container.querySelectorAll('.ca-eq-line')).toHaveLength(5)
    expect(container.querySelector('.ca-tt-count')?.textContent).toContain('5 列，在 do(X=1) 下成立')
    fireEvent.click(getByRole('button', { name: /展開完整真值表（40 列）/ }))
    expect(container.querySelectorAll('.ca-tt-full .ca-eq-line')).toHaveLength(40)
  })

  it('copy LaTeX copies the rows on screen', () => {
    const tex = equationsLatex({ c: bow, shown: shownVariables(bow), notation: 'causal', interventions: { X: true } })
    expect(tex.split('\\\\')).toHaveLength(5)
    expect(tex).toContain('A10')
  })
})
