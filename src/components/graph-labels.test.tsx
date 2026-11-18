// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getCase } from '../data/index.ts'
import type { LoadedCase } from '../data/load.ts'
import { docToCase } from '../data/model-doc.ts'
import { modelDocSchema } from '../data/schema.ts'
import { marginals, shownVariables, textWidth } from './view-model.ts'
import type { Box } from './graph-labels.ts'
import { firstClear, intersects, segmentHitsBox, textBox } from './graph-labels.ts'
import { SignalGraph } from './SignalGraph.tsx'

afterEach(cleanup)

const num = (el: Element, name: string): number => Number(el.getAttribute(name))

function translate(el: Element): [number, number] {
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(el.getAttribute('transform') ?? '')
  return m === null ? [0, 0] : [Number(m[1]), Number(m[2])]
}

/** The box a <text> covers, from its position, anchor and content. */
function textBoxOf(el: Element, offset: [number, number] = [0, 0], size = 12): Box {
  const anchor = (el.getAttribute('text-anchor') ?? 'start') as 'start' | 'middle' | 'end'
  return textBox(num(el, 'x') + offset[0], num(el, 'y') + offset[1], anchor, textWidth(el.textContent ?? '', size), size)
}

function graph(c: LoadedCase, props: Partial<Parameters<typeof SignalGraph>[0]> = {}): HTMLElement {
  const { container } = render(
    <SignalGraph c={c} shown={shownVariables(c)} interventions={{}} removedEdges={[]} title="t" {...props} />,
  )
  return container
}

describe('graph labels', () => {
  it('textBox and firstClear pick the first spot that is free', () => {
    const wall: Box = { x0: 0, y0: 0, x1: 50, y1: 20 }
    const first = { x: 10, y: 10, anchor: 'start' as const, box: textBox(10, 10, 'start', 20, 12) }
    const second = { x: 100, y: 10, anchor: 'start' as const, box: textBox(100, 10, 'start', 20, 12) }
    expect(intersects(first.box, wall)).toBe(true)
    expect(firstClear([first, second], [wall])).toBe(second)
    expect(firstClear([first], [wall])).toBe(first)
  })

  it('切斷 does not sit under the do() tag in the compact comparison', () => {
    const c = getCase('smoking-lesion')
    const shown = shownVariables(c)
    const intervene = { S: 1 }
    const probs = marginals(c.model, c.prior!, { do: intervene }).p
    const removed = c.model.edges.filter((e) => e.to === 'S')
    const root = graph(c, { shown, probs, compact: true, interventions: intervene, removedEdges: removed })
    const label = [...root.querySelectorAll('.ca-edge-cut text')].find((t) => t.textContent === '切斷')
    expect(label).toBeDefined()
    const labelBox = textBoxOf(label as Element)
    const node = root.querySelector('[data-node="S"]') as Element
    const [nx, ny] = translate(node)
    const tag = [...node.querySelectorAll(':scope > g')].find((g) => g.querySelector('rect.ca-fill-accent') !== null) as Element
    const [tx, ty] = translate(tag)
    const rect = tag.querySelector('rect') as Element
    const tagBox: Box = { x0: nx + tx, y0: ny + ty, x1: nx + tx + num(rect, 'width'), y1: ny + ty + num(rect, 'height') }
    expect(intersects(labelBox, tagBox, 0)).toBe(false)
  })

  it('¬ labels stay off nodes and node labels in a layout the user dragged', () => {
    const base = getCase('rock-throwing')
    // Found by trying 4000 random layouts: the default spot for ¬SH lands on SH's own label here.
    const layout: Record<string, [number, number]> = { ST: [1.5, 0.5], SH: [2, 1.5], BT: [3, 2], BH: [1.5, 2.5], BS: [2.5, 0] }
    const c: LoadedCase = { ...base, data: { ...base.data, layout } }
    const root = graph(c, { values: { ST: true, BT: true, SH: true, BH: false, BS: true, U_ST: true, U_BT: true } })
    const label = [...root.querySelectorAll('[data-edge="SH>BH"] text')].find((t) => (t.textContent ?? '').startsWith('¬'))
    expect(label).toBeDefined()
    const labelBox = textBoxOf(label as Element)
    for (const node of root.querySelectorAll('[data-node]')) {
      const [x, y] = translate(node)
      const circle = node.querySelector('circle.ca-node-on, circle.ca-node-off') as Element
      const r = num(circle, 'r')
      expect(intersects(labelBox, { x0: x - r, y0: y - r, x1: x + r, y1: y + r }, 0)).toBe(false)
      const name = node.querySelector('text.ca-svg-label') as Element
      expect(intersects(labelBox, textBoxOf(name, [x, y], 14), 0)).toBe(false)
    }
  })

  it('切斷 and its slash sit on the cut edge, off every edge still drawn (the sprinkler after do(S=1))', () => {
    const variable = (id: string, kind: 'exogenous' | 'endogenous') => ({ id, label: { 'zh-TW': id }, kind, domain: 'boolean' })
    const c = docToCase(
      modelDocSchema.parse({
        format: 'causal-atlas/model',
        version: 1,
        title: 'sprinkler',
        model: {
          variables: [variable('U_R', 'exogenous'), variable('N_S', 'exogenous'), variable('R', 'endogenous'), variable('S', 'endogenous'), variable('W', 'endogenous')],
          equations: { R: 'U_R', S: 'not R and N_S', W: 'R or S' },
        },
        priors: { independent: { U_R: 0.4, N_S: 0.6 } },
      }),
    )
    const intervene = { S: 1 }
    for (const probs of [undefined, marginals(c.model, c.prior!, { do: intervene }).p]) {
      const removed = c.model.edges.filter((e) => e.to === 'S')
      const root = graph(c, { probs, interventions: intervene, removedEdges: removed })
      const cut = root.querySelector('[data-edge="R>S"]') as Element
      const label = cut.querySelector('text') as Element
      const slash = cut.querySelector('path') as Element
      // The slash's centre: the mean of its two strokes' ends.
      const n = (slash.getAttribute('d') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? []
      const cx = (n[0] + n[2] + n[4] + n[6]) / 4
      const cy = (n[1] + n[3] + n[5] + n[7]) / 4
      const mark = { x0: cx - 6, y0: cy - 6, x1: cx + 6, y1: cy + 6 }
      for (const line of root.querySelectorAll('.ca-edge:not(.ca-edge-cut) line')) {
        const a = { x: num(line, 'x1'), y: num(line, 'y1') }
        const b = { x: num(line, 'x2'), y: num(line, 'y2') }
        expect(segmentHitsBox(a, b, textBoxOf(label)), `切斷 on ${line.parentElement?.getAttribute('data-edge')}`).toBe(false)
        expect(segmentHitsBox(a, b, mark), `slash on ${line.parentElement?.getAttribute('data-edge')}`).toBe(false)
      }
      cleanup()
    }
  })
})
