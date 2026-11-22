// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { docToCase, modelDocSchema } from '../../data/index.ts'
import { lessonModel } from '../../demo/lesson-models.ts'
import { IdentifyPanel } from '../index.ts'

const front = docToCase(lessonModel('m05-frontdoor'))
const bow = docToCase(lessonModel('m06-bow-a'))
const department = docToCase(lessonModel('m08-sex-department'))
const departmentClean = docToCase(lessonModel('m08-sex-department-clean'))
const query = { x: 'X', y: 'Y' }
afterEach(cleanup)

function editGraph() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit graph' }))
}

describe('identification experiment', () => {
  it('shows the observational front-door formula and the exact-model comparison', () => {
    const { container } = render(<IdentifyPanel c={front} query={query} locale="en" />)
    expect(container.querySelector('[data-identification="identified"]')).not.toBeNull()
    const formula = container.querySelector('[data-observational-formula]')
    expect(formula?.querySelector('.katex')).not.toBeNull()
    expect(formula?.textContent).toContain('∑')
    expect(screen.getAllByText('0.370')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /3.*Rule 2/ }))
    const rules = container.querySelector('[data-view="rules"]')
    expect(rules?.querySelector('[data-verdict="applies"]')).not.toBeNull()
    expect(rules?.querySelector('[data-node] [role="button"], [data-node][role="button"]')).toBeNull()
  })

  it('describes front-door transformations above their equations', () => {
    const { container } = render(<IdentifyPanel c={front} query={query} locale="zh-TW" />)
    const rows = [...container.querySelectorAll('.ca-id-step')]
    for (const [i, sentence] of [
      [0, '對 Z 加總展開'],
      [2, '以觀察 X 代替干預 X（對 Z）'],
      [3, '以干預 Z 代替觀察 Z（給定 do(X)）'],
      [4, '保留干預 Z，移除干預 X'],
      [7, '移除不影響 X 的干預 Z'],
      [8, '給定 X，以觀察 Z 代替干預 Z'],
    ] as const) {
      const row = rows[i]
      expect(row.textContent).toContain(sentence)
      expect(row.querySelector('code')?.textContent).toContain(' = ')
    }
  })

  it('requires two endogenous variables when there is no explicit query', () => {
    const doc = modelDocSchema.parse({
      format: 'causal-atlas/model', version: 1, title: 'One outcome',
      model: {
        variables: [
          { id: 'U', label: { 'zh-TW': 'U' }, domain: 'boolean', kind: 'exogenous' },
          { id: 'X', label: { 'zh-TW': 'X' }, domain: 'boolean', kind: 'endogenous' },
        ],
        equations: { X: 'U' },
      },
      context: { U: true },
    })
    render(<IdentifyPanel doc={doc} locale="en" />)
    expect(screen.getByRole('status').textContent).toBe('Identification needs at least two endogenous variables.')
  })

  it('highlights precisely the bow hedge nodes and edges', () => {
    const { container } = render(<IdentifyPanel c={bow} query={query} locale="en" />)
    expect(container.querySelector('[data-identification="hedge"]')).not.toBeNull()
    expect([...container.querySelectorAll('[data-hedge="f"]')].map((n) => n.getAttribute('data-member'))).toEqual(['X', 'Y'])
    expect(container.querySelector('[data-hedge="f-prime"][data-member="Y"]')).not.toBeNull()
    expect(container.querySelector('[data-edge="X>Y"][data-hedge-edge]')).not.toBeNull()
    expect(container.querySelector('[data-arc][data-hedge-edge]')).not.toBeNull()
    expect(screen.queryByText('Formula value')).toBeNull()
  })

  it('draws the bidirected arc implied by a dependent joint prior', () => {
    const doc = modelDocSchema.parse({
      format: 'causal-atlas/model', version: 1, title: 'Dependent latent causes',
      model: {
        variables: ['U', 'V', 'X', 'Y'].map((id, i) => ({ id, label: { 'zh-TW': id }, domain: 'boolean', kind: i < 2 ? 'exogenous' : 'endogenous' })),
        equations: { X: 'U', Y: 'X or V' },
      },
      priors: { joint: { variables: ['U', 'V'], rows: [[false, false, 0.5], [true, true, 0.5]] } },
    })
    const { container } = render(<IdentifyPanel doc={doc} query={query} locale="en" />)
    expect(container.querySelector('[data-identification="hedge"]')).not.toBeNull()
    expect(container.querySelector('[data-arc][data-hedge-edge]')).not.toBeNull()
  })

  it('adds a direct edge, removes the arc and restores the model; edited graphs never have checks', () => {
    const { container } = render(<IdentifyPanel c={front} query={query} locale="en" />)
    editGraph()
    fireEvent.click(screen.getByRole('button', { name: 'Add X → Y' }))
    expect(container.querySelector('[data-identification="hedge"]')).not.toBeNull()
    expect(screen.queryByText('0.370')).toBeNull()
    expect(screen.getByText(/no probability model/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove X ↔ Y' }))
    expect(container.querySelector('[data-identification="identified"]')).not.toBeNull()
    expect(screen.queryByText('Formula value')).toBeNull()
    const one = container.querySelector('.ca-id-step')
    if (one === null) throw new Error('no derivation')
    fireEvent.click(one)
    expect(container.querySelector('.ca-rules-equal')?.getAttribute('data-verdict')).toBe('unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Restore graph' }))
    expect(container.querySelector('[data-edge="X>Y"]')).toBeNull()
    expect(container.querySelector('[data-arc]')).not.toBeNull()
    expect(screen.getAllByText('0.370')).toHaveLength(2)
  })

  it('changes the query with disjoint selectors and prevents cyclic directed additions', () => {
    const { container } = render(<IdentifyPanel c={front} query={query} locale="en" />)
    const condition = screen.getByRole('group', { name: 'Condition W (optional)' })
    expect(within(condition).getAllByRole('checkbox').map((o) => o.getAttribute('value'))).toEqual(['Z'])
    fireEvent.click(within(condition).getByRole('checkbox'))
    expect(container.querySelector('[data-query]')?.getAttribute('data-query')).toBe('P(y|do(x),z)')
    editGraph()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'Y' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'X' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add Y → X' }).disabled).toBe(true)
    expect(screen.getByText(/directed cycle/)).toBeDefined()
  })

  it('takes a set of treatments: the controlled direct effect P(y | do(x, z)) fails with ability confounding Z and Y', () => {
    const { container } = render(<IdentifyPanel c={department} query={{ x: ['X', 'Z'], y: 'Y' }} locale="en" />)
    expect(container.querySelector('[data-query]')?.getAttribute('data-query')).toBe('P(y|do(x,z))')
    expect(container.querySelector('[data-identification="hedge"]')).not.toBeNull()
    expect(container.querySelector('[data-hedge="f"][data-member="Y"]')).not.toBeNull()
  })

  it('identifies the controlled direct effect without the confounding arc and checks it against do()', () => {
    const { container } = render(<IdentifyPanel c={departmentClean} query={{ x: ['X', 'Z'], y: 'Y' }} locale="en" />)
    expect(container.querySelector('[data-identification="identified"]')).not.toBeNull()
    expect(container.querySelector('[data-observational-formula]')?.textContent).toMatch(/=\s*P\(y∣x,z\)/)
    expect(screen.getByText(/X=1, Z=1, Y=1/)).toBeDefined()
    expect(container.querySelector('.ca-id-check .ca-adj-ok')).not.toBeNull()
    expect(container.querySelector('.ca-id-derivation .ca-id-steps')).not.toBeNull()
  })

  it('edits a treatment set with checkboxes, never leaves it empty, and keeps the condition disjoint', () => {
    const { container } = render(<IdentifyPanel c={departmentClean} query={{ x: 'X', y: 'Y', w: ['Z'] }} locale="en" />)
    expect(container.querySelector('[data-query]')?.getAttribute('data-query')).toBe('P(y|do(x),z)')
    const treatment = screen.getByRole('group', { name: 'Intervention X' })
    const condition = screen.getByRole('group', { name: 'Condition W (optional)' })
    expect(within(treatment).getAllByRole('checkbox').map((o) => o.getAttribute('value'))).toEqual(['X'])
    expect(within(treatment).getByRole<HTMLInputElement>('checkbox').disabled).toBe(true)
    fireEvent.click(within(condition).getByRole('checkbox', { checked: true }))
    fireEvent.click(within(treatment).getByRole('checkbox', { name: /^Z/ }))
    expect(container.querySelector('[data-query]')?.getAttribute('data-query')).toBe('P(y|do(x,z))')
    expect(within(condition).queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Outcome Y'), { target: { value: 'Z' } })
    expect(container.querySelector('[data-query]')?.getAttribute('data-query')).toBe('P(z|do(x,y))')
    fireEvent.click(within(treatment).getByRole('checkbox', { name: /^X/ }))
    expect(container.querySelector('[data-query]')?.getAttribute('data-query')).toBe('P(z|do(y))')
    expect(within(treatment).getByRole<HTMLInputElement>('checkbox', { checked: true }).disabled).toBe(true)
  })
})
