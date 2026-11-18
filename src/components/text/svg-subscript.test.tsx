// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getCase } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { WorldLanes } from '../index.ts'

afterEach(cleanup)

/** A case drawn in full, ids with an underscore (`U_L`) included. */
function everything(id: string): LoadedCase {
  const base = getCase(id)
  return { ...base, data: { ...base.data, layout: undefined } }
}

/** The lowered, smaller tspans: the subscripts. */
const subscripts = (root: ParentNode): string[] =>
  [...root.querySelectorAll('tspan[dy="0.25em"]')].map((t) => t.textContent ?? '')

describe('subscripts inside SVG', () => {
  it('draws an X_Y node id as X with a lowered Y, and keeps the plain id in the aria-label', () => {
    const c = everything('forest-fire-conjunctive')
    const { container } = render(
      <SignalGraph c={c} shown={c.model.variables.map((v) => v.id)} interventions={{}} removedEdges={[]} title="t" />,
    )
    const node = container.querySelector('[data-node="U_L"]') as Element
    expect(node).not.toBeNull()
    const label = node.querySelector('text.ca-svg-label') as Element
    expect(label.querySelector('tspan[dy="0.25em"]')?.textContent).toBe('L')
    expect(label.textContent).toContain('U')
    expect(label.textContent).not.toContain('U_L')
    expect(node.getAttribute('aria-label')).toContain('U_L')
  })

  it('lowers the subscript of an intervened id in its do() tag', () => {
    const c = everything('forest-fire-conjunctive')
    const { container } = render(
      <SignalGraph c={c} shown={c.model.variables.map((v) => v.id)} interventions={{ U_L: 0 }} removedEdges={[]} title="t" />,
    )
    expect(subscripts(container.querySelector('[data-node="U_L"]') as Element)).toEqual(['L', 'L'])
  })

  it('subscripts the context line and column heads of the world lanes', () => {
    const { container } = render(<WorldLanes caseId="rock-throwing" />)
    const svg = container.querySelector('svg.ca-lanes-svg') as Element
    expect(subscripts(svg).length).toBeGreaterThan(0)
    expect(svg.textContent).not.toMatch(/U_ST|U_BT/)
    expect(svg.getAttribute('aria-label')).toContain('ST=')
  })
})
