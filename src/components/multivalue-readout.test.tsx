// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'
import { PALETTES, inlineSvg } from './export-image.ts'
import { intersects, placePop } from './graph-labels.ts'
import { CausalPlayground, ProbabilityPanel } from './index.ts'
import { barLayout } from './view-model.ts'

afterEach(cleanup)

const faces = [1, 2, 3, 4, 5, 6]

/** Two fair dice and a lamp: EQ says they show the same face; Lamp is a plain boolean. */
const dice: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: 'Dice',
  model: {
    variables: [
      { id: 'U1', label: { 'zh-TW': '擲一', en: 'Roll 1' }, kind: 'exogenous', domain: faces },
      { id: 'U2', label: { 'zh-TW': '擲二', en: 'Roll 2' }, kind: 'exogenous', domain: faces },
      { id: 'U_L', label: { 'zh-TW': '開關', en: 'Switch' }, kind: 'exogenous', domain: 'boolean' },
      { id: 'D1', label: { 'zh-TW': '骰一', en: 'Die 1' }, kind: 'endogenous', domain: faces },
      { id: 'D2', label: { 'zh-TW': '骰二', en: 'Die 2' }, kind: 'endogenous', domain: faces },
      { id: 'EQ', label: { 'zh-TW': '相等', en: 'Equal' }, kind: 'endogenous', domain: 'boolean' },
      { id: 'Lamp', label: { 'zh-TW': '燈', en: 'Lamp' }, kind: 'endogenous', domain: 'boolean' },
    ],
    equations: { D1: 'U1', D2: 'U2', EQ: 'D1 = D2', Lamp: 'U_L' },
  },
  priors: {
    independent: {
      U1: faces.map((f) => [f, 1 / 6]),
      U2: faces.map((f) => [f, 1 / 6]),
      U_L: 0.3,
    },
  },
})

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}

const bars = (container: HTMLElement, id: string): Record<string, number> =>
  Object.fromEntries(
    [...node(container, id).querySelectorAll('[data-bar]')].map((b) => [b.getAttribute('data-bar'), Number(b.getAttribute('data-p'))]),
  )

const heights = (container: HTMLElement, id: string): number[] =>
  [...node(container, id).querySelectorAll('[data-bar] rect')].map((r) => Number(r.getAttribute('height')))

describe('multi-valued readout', () => {
  it('draws one bar per value, with do(D1=3) full on 3 only and D2 untouched', () => {
    const { container } = render(<CausalPlayground doc={dice} initialInterventions={{ D1: 3 }} />)
    expect(bars(container, 'D1')).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0 })
    const d2 = Object.values(bars(container, 'D2'))
    expect(d2).toHaveLength(6)
    for (const p of d2) expect(p).toBeCloseTo(1 / 6, 3)
    expect([...node(container, 'D1').querySelectorAll('[data-bar]')].map((b) => b.getAttribute('data-bar'))).toEqual(faces.map(String))
    expect(heights(container, 'D1').map((h) => h > 0)).toEqual([false, false, true, false, false, false])
    // EQ is a boolean node: fill and one number, here P(D1 = D2) = 1/6.
    expect(node(container, 'EQ').querySelector('[data-level]')?.getAttribute('data-level')).toBe((1 / 6).toFixed(4))
    expect(node(container, 'EQ').textContent).toContain('0.17')
    // No single-value readout like `D1=1 0.00` on a non-boolean node, and no fill rect.
    const drawn = [...node(container, 'D1').querySelectorAll('text')].map((t) => t.textContent)
    expect(drawn.join(' ')).not.toMatch(/D1=\d/)
    expect(drawn).toEqual(expect.arrayContaining(faces.map(String)))
    expect(node(container, 'D1').querySelector('[data-level]')).toBeNull()
    expect(node(container, 'D1').querySelector('[data-fill-means]')).toBeNull()
  })

  it('names each probability for assistive technology', () => {
    const { container } = render(<CausalPlayground doc={dice} initialInterventions={{ D1: 3 }} />)
    const titles = [...node(container, 'D2').querySelectorAll('[data-bar] title')].map((t) => t.textContent)
    expect(titles[2]).toBe('P(D2=3)=0.17')
    expect([...node(container, 'D1').querySelectorAll('[data-bar] title')].map((t) => t.textContent)[2]).toBe('P(D1=3)=1.00')
    const aria = node(container, 'D1').getAttribute('aria-label') ?? ''
    expect(aria).toContain('P(D1=3)=1.00')
    expect(aria).toContain('P(D1=1)=0.00')
  })

  it('leaves a boolean node as fill and one number', () => {
    const { container } = render(<ProbabilityPanel doc={dice} />)
    const lamp = node(container, 'Lamp')
    expect(lamp.querySelector('[data-level]')?.getAttribute('data-level')).toBe('0.3000')
    expect(lamp.querySelector('[data-bar]')).toBeNull()
    expect(lamp.textContent).toContain('0.30')
    expect(lamp.getAttribute('aria-label')).toContain('P(Lamp=1) 0.30')
  })

  it('describes both kinds in the legend', () => {
    const { container } = render(<ProbabilityPanel doc={dice} />)
    expect(container.textContent).toContain('填色的高度＝等於 1 的機率；多值變項每個值一根長條')
  })

  it('survives export: bars keep their fill and the hover titles are dropped', () => {
    const { container } = render(<CausalPlayground doc={dice} initialInterventions={{ D1: 3 }} />)
    const out = inlineSvg(container.querySelector('svg.ca-graph') as SVGSVGElement, PALETTES.light)
    expect(out.querySelectorAll('title')).toHaveLength(0)
    // Twelve bars (D1 and D2) carry the foreground fill; the baseline is a stroked line.
    const filled = [...out.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') === PALETTES.light.foreground)
    expect(filled.length).toBeGreaterThanOrEqual(12)
  })

  it('sizes bars so a six-value domain stays within the chart width', () => {
    const six = barLayout(['1', '2', '3', '4', '5', '6'], 11)
    expect(six.width).toBeLessThanOrEqual(126)
    expect(six.labelsFit).toBe(true)
    expect(barLayout(Array.from({ length: 40 }, (_, i) => String(i)), 11).labelsFit).toBe(false)
  })
})

describe('do-value popover placement', () => {
  const size = { w: 184, h: 72 }
  const bounds = { w: 600, h: 300 }

  it('prefers the right of the node, vertically centred on it', () => {
    expect(placePop({ x: 100, y: 150 }, 30, size, bounds, 16)).toEqual({ x: 146, y: 114, side: 'right' })
  })

  it('falls back to the left near the right edge, then below, then above', () => {
    expect(placePop({ x: 560, y: 150 }, 30, size, bounds, 16)).toEqual({ x: 330, y: 114, side: 'left' })
    expect(placePop({ x: 150, y: 100 }, 30, size, { w: 300, h: 300 }, 16).side).toBe('below')
    expect(placePop({ x: 100, y: 200 }, 30, size, { w: 300, h: 260 }, 16)).toEqual({ x: 8, y: 82, side: 'above' })
  })

  it('goes to a side that covers no other node (the sprinkler at 390 px: not over W)', () => {
    const w = { x0: 260, y0: 110, x1: 340, y1: 190 }
    const at = placePop({ x: 100, y: 150 }, 30, size, { w: 360, h: 300 }, 16, [w])
    expect(at.side).toBe('below')
    expect(intersects({ x0: at.x, y0: at.y, x1: at.x + size.w, y1: at.y + size.h }, w, 0)).toBe(false)
  })

  it('stays inside the box when the node is near the top or bottom', () => {
    expect(placePop({ x: 100, y: 10 }, 30, size, bounds, 16).y).toBe(0)
    expect(placePop({ x: 100, y: 295 }, 30, size, bounds, 16).y).toBe(228)
  })

  it('opens beside the node in the graph', () => {
    const { container } = render(<CausalPlayground doc={dice} />)
    // In probability mode a click observes; Shift+click intervenes and opens the value control.
    fireEvent.click(screen.getByRole('button', { name: /^D1 骰一/ }), { shiftKey: true })
    const box = container.querySelector('.ca-do-pop-box') as Element
    const [tx] = (node(container, 'D1').getAttribute('transform') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? []
    expect(Number(box.getAttribute('x'))).toBeGreaterThan(tx)
  })
})
