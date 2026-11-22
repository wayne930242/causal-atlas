// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { docToCase, modelDocSchema } from '../../data/index.ts'
import { lessonModel } from '../../demo/lesson-models.ts'
import { IdentifyPanel } from '../index.ts'

const front = docToCase(lessonModel('m05-frontdoor'))
const bow = docToCase(lessonModel('m06-bow-a'))
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
    const condition = screen.getByLabelText('Condition W (optional)')
    expect(within(condition).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['', 'Z'])
    fireEvent.change(condition, { target: { value: 'Z' } })
    expect(container.querySelector('[data-query]')?.getAttribute('data-query')).toBe('P(y|do(x),z)')
    editGraph()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'Y' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'X' } })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add Y → X' }).disabled).toBe(true)
    expect(screen.getByText(/directed cycle/)).toBeDefined()
  })
})
