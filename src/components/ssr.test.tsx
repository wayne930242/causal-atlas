// Runs in the node environment: no window, no document.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { caseIds, getCase } from '../data/index.ts'

describe('server rendering', () => {
  it('imports without a DOM', async () => {
    expect(typeof globalThis.window).toBe('undefined')
    const mod = await import('./index.ts')
    expect(typeof mod.CasePage).toBe('function')
  })

  it.each(caseIds)('renders %s on the server', async (id) => {
    const { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } = await import('./index.ts')
    const c = getCase(id)
    for (let step = 1; step <= 4; step += 1) {
      expect(renderToString(createElement(CasePage, { caseId: id, initialStep: step }))).toContain(c.data.title.zh)
    }
    expect(renderToString(createElement(CausalPlayground, { caseId: id }))).toContain('ca-graph')
    expect(renderToString(createElement(ProbabilityPanel, { caseId: id }))).toContain('data-level')
    if (c.context !== undefined && c.data.showcase.length > 0) {
      expect(renderToString(createElement(WorldLanes, { caseId: id, initialStep: 2 }))).toContain('data-lane="cf"')
    }
  })
})
