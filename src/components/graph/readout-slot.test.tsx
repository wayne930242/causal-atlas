// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import type { LoadedCase } from '../../data/load.ts'
import { resolveDoc } from '../model/doc-case.ts'
import { CausalPlayground, ModelEditor } from '../index.ts'
import { doNode, openMenu } from '../test-menu.ts'
import { withProbability } from '../model/model-state.ts'
import { marginals, mixedMarginals, priorWithSliders } from '../model/probability-view.ts'
import { nameAfterId } from '../model/wording.ts'

afterEach(cleanup)

const boolVar = (id: string, zh: string, en: string, kind: 'exogenous' | 'endogenous') => ({
  id,
  label: { 'zh-TW': zh, en },
  kind,
  domain: 'boolean',
})

/** A fork: the common cause Z drives X and Y. Z's label repeats its id; X's and Y's are the id alone. */
const forkSpec = {
  format: 'causal-atlas/model',
  version: 1,
  title: 'Fork',
  model: {
    variables: [
      boolVar('U_Z', 'U_Z', 'U_Z', 'exogenous'),
      boolVar('U_X', 'U_X', 'U_X', 'exogenous'),
      boolVar('U_Y', 'U_Y', 'U_Y', 'exogenous'),
      boolVar('Z', '共同原因 Z', 'common cause Z', 'endogenous'),
      boolVar('X', 'X', 'X', 'endogenous'),
      boolVar('Y', 'Y', 'Y', 'endogenous'),
    ],
    equations: { Z: 'U_Z', X: 'Z and U_X', Y: 'Z or U_Y' },
  },
}
const fork: ModelDoc = modelDocSchema.parse({ ...forkSpec, priors: { independent: { U_Z: 0.5, U_X: 0.8, U_Y: 0.4 } } })
const forkWorld: ModelDoc = modelDocSchema.parse({ ...forkSpec, context: { U_Z: 1, U_X: 1, U_Y: 0 } })

/** A biased die D1, a fair one D2, and whether they match. */
const faces = [1, 2, 3, 4, 5, 6]
const dice: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: 'Dice',
  model: {
    variables: [
      { id: 'U1', label: { 'zh-TW': '擲一', en: 'Roll 1' }, kind: 'exogenous', domain: faces },
      { id: 'U2', label: { 'zh-TW': '擲二', en: 'Roll 2' }, kind: 'exogenous', domain: faces },
      { id: 'D1', label: { 'zh-TW': '骰一', en: 'Die 1' }, kind: 'endogenous', domain: faces },
      { id: 'D2', label: { 'zh-TW': '骰二', en: 'Die 2' }, kind: 'endogenous', domain: faces },
      { id: 'EQ', label: { 'zh-TW': '相等', en: 'Equal' }, kind: 'endogenous', domain: 'boolean' },
    ],
    equations: { D1: 'U1', D2: 'U2', EQ: 'D1 = D2' },
  },
  priors: {
    independent: {
      U1: [
        [1, 0.1],
        [2, 0.1],
        [3, 0.1],
        [4, 0.1],
        [5, 0.1],
        [6, 0.5],
      ],
      U2: faces.map((f) => [f, 1 / 6]),
    },
  },
})

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const labelOf = (container: HTMLElement, id: string): Element => node(container, id).querySelector('text.ca-svg-label') as Element
const readout = (container: HTMLElement, id: string): Element => node(container, id).querySelector(`[data-readout="${id}"]`)?.closest('text') as Element
const y = (el: Element): number => Number(el.getAttribute('y'))
const chip = (container: HTMLElement): string | null => container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text') ?? null
const level = (container: HTMLElement, id: string): number => Number(node(container, id).querySelector('[data-level]')?.getAttribute('data-level'))

describe('label dedupe', () => {
  it('drops an id the label only repeats', () => {
    expect(nameAfterId('X', 'X')).toBe('')
    expect(nameAfterId('Z', '共同原因 Z')).toBe('共同原因')
    expect(nameAfterId('Z', 'common cause Z')).toBe('common cause')
    expect(nameAfterId('Z', 'Z common cause')).toBe('common cause')
    expect(nameAfterId('Z', 'Zebra')).toBe('Zebra')
    expect(nameAfterId('D1', '骰一')).toBe('骰一')
  })

  it('draws the id once in the graph, in each language', () => {
    const { container } = render(<CausalPlayground doc={fork} />)
    expect(labelOf(container, 'X').textContent).toBe('X')
    expect(labelOf(container, 'Z').textContent).toBe('Z 共同原因')
    expect(node(container, 'Z').getAttribute('aria-label')).toMatch(/^Z 共同原因，/)
    cleanup()
    const en = render(<CausalPlayground doc={fork} locale="en" />)
    expect(labelOf(en.container, 'Z').textContent).toBe('Z common cause')
    expect(labelOf(en.container, 'Y').textContent).toBe('Y')
  })
})

describe('readout slot', () => {
  it('puts each readout right under its label, the same way for every node', () => {
    const { container } = render(<CausalPlayground doc={fork} />)
    for (const id of ['X', 'Y']) {
      expect(node(container, id).getAttribute('data-block')).toBe('below')
      const lab = labelOf(container, id)
      const num = readout(container, id)
      expect(lab.getAttribute('x')).toBeNull()
      expect(num.getAttribute('x')).toBeNull()
      expect(num.getAttribute('text-anchor')).toBe('middle')
      expect(y(lab)).toBeGreaterThan(34)
    }
    expect(y(readout(container, 'X')) - y(labelOf(container, 'X'))).toBe(22)
    expect(y(readout(container, 'Y')) - y(labelOf(container, 'Y'))).toBe(22)
    expect(y(labelOf(container, 'X'))).toBe(y(labelOf(container, 'Y')))
  })

  it('moves the whole block above a node when an edge runs through the space under it', () => {
    // Z on top, X straight under it: the edge Z→X crosses where Z's block would go.
    const { container } = render(<CausalPlayground doc={{ ...fork, layout: { Z: [1, 0], X: [1, 1], Y: [2, 1] } }} />)
    expect(node(container, 'Z').getAttribute('data-block')).toBe('above')
    const lab = labelOf(container, 'Z')
    const num = readout(container, 'Z')
    expect(y(num)).toBeLessThan(0)
    expect(y(num) - y(lab)).toBe(22)
    expect(node(container, 'X').getAttribute('data-block')).toBe('below')
  })

  it('puts a multi-valued node’s bars under its label, centred', () => {
    const { container } = render(<CausalPlayground doc={dice} />)
    for (const id of ['D1', 'D2']) {
      expect(node(container, id).getAttribute('data-block')).toBe('below')
      const bars = node(container, id).querySelector('[data-bars]') as Element
      const [x0, base] = (/translate\(([-\d.]+) ([-\d.]+)\)/.exec(bars.getAttribute('transform') ?? '') ?? []).slice(1).map(Number)
      const width = Number(bars.querySelector('line')?.getAttribute('x2'))
      expect(x0).toBeCloseTo(-width / 2, 5)
      // The bars stand under the label: their top is below its baseline.
      expect(base - 24).toBeGreaterThan(y(labelOf(container, id)))
    }
  })
})

describe('bar scaling', () => {
  it('scales the most likely value to full height and writes its probability', () => {
    const { container } = render(<CausalPlayground doc={dice} />)
    const heights = [...node(container, 'D1').querySelectorAll('[data-bar] rect')].map((r) => Number(r.getAttribute('height')))
    expect(heights[5]).toBe(24)
    expect(heights[0]).toBeCloseTo(24 * (0.1 / 0.5), 5)
    const max = node(container, 'D1').querySelector('[data-max]') as Element
    expect(max.textContent).toBe('最高 0.50')
    expect(node(container, 'D2').querySelector('[data-max]')?.textContent).toBe('最高 0.17')
    // A uniform die fills every bar.
    for (const r of node(container, 'D2').querySelectorAll('[data-bar] rect')) expect(Number(r.getAttribute('height'))).toBeCloseTo(24, 5)
    // Each bar still names its own probability.
    expect([...node(container, 'D1').querySelectorAll('[data-bar] title')].map((t) => t.textContent)[0]).toBe('P(D1=1)=0.10')
    expect(node(container, 'D1').getAttribute('aria-label')).toContain('P(D1=6)=0.50')
    cleanup()
    const en = render(<CausalPlayground doc={dice} locale="en" />)
    expect(node(en.container, 'D1').querySelector('[data-max]')?.textContent).toBe('max 0.50')
  })

  it('leaves a boolean node as fill and one number', () => {
    const { container } = render(<CausalPlayground doc={dice} />)
    const eq = node(container, 'EQ')
    expect(eq.querySelector('[data-bar]')).toBeNull()
    expect(eq.querySelector('[data-max]')).toBeNull()
    expect(readout(container, 'EQ').textContent).toBe('P(=1) 0.17')
  })
})

describe('do() as a probability on a boolean node', () => {
  const resolved = resolveDoc(fork)
  if (!resolved.ok) throw new Error('fork does not build')
  const c: LoadedCase = resolved.c
  const prior = priorWithSliders(c, {})
  const at = (z: boolean) => marginals(c.model, prior, { do: { Z: z } }).p

  it("the menu's P*(Z=1) slider: 0 is do(Z=0), 0.3 the mixture, Release clears", () => {
    const { container } = render(<CausalPlayground doc={fork} />)
    const z = screen.getByRole('button', { name: /^Z 共同原因/ })
    expect(z.getAttribute('aria-label')).toContain('按一下打開選單，可以觀察或干預')
    expect(z.getAttribute('aria-haspopup')).toBe('dialog')
    doNode(container, 'Z', '1')
    expect(node(container, 'Z').getAttribute('data-intervened')).toBe('true')
    expect(chip(container)).toBe('do(Z=1)')
    const slider = screen.getByRole('slider', { name: /Z 共同原因：干預後等於 1 的機率/ }) as HTMLInputElement
    expect([slider.min, slider.max, slider.step]).toEqual(['0', '1', '0.05'])
    expect(slider.value).toBe('1')

    fireEvent.change(slider, { target: { value: '0' } })
    expect(chip(container)).toBe('do(Z=0)')
    expect(level(container, 'Z')).toBe(0)
    expect(readout(container, 'Z').textContent).toBe('do = 0')
    expect(level(container, 'X')).toBe(0)

    fireEvent.change(slider, { target: { value: '0.3' } })
    expect(chip(container)).toBe('do(P(Z=1)=0.30)')
    expect(node(container, 'Z').getAttribute('data-do-p')).toBe('0.30')
    expect(readout(container, 'Z').textContent).toBe('P(=1) 0.30')
    expect(level(container, 'Z')).toBeCloseTo(0.3, 4)
    const x = 0.3 * at(true).X + 0.7 * at(false).X
    const yP = 0.3 * at(true).Y + 0.7 * at(false).Y
    expect(x).toBeCloseTo(0.24, 10)
    expect(level(container, 'X')).toBeCloseTo(x, 4)
    expect(level(container, 'Y')).toBeCloseTo(yP, 4)
    expect(slider.getAttribute('aria-valuetext')).toBe('P*(Z=1)=0.30')
    expect(node(container, 'Z').textContent).toContain('P(Z=1)=0.30')
    expect(node(container, 'Z').getAttribute('aria-label')).toContain('已干預成 P(Z=1)=0.30')
    // The equation gives way to a coin.
    const row = container.querySelector('.ca-eq-row[data-intervened="true"]') as Element
    expect(row.querySelector('.ca-tex[data-text="Z ~ Bernoulli(0.30)"]')).not.toBeNull()
    expect(row.textContent).toContain('以機率 0.30 設成 1')

    fireEvent.change(slider, { target: { value: '1' } })
    expect(chip(container)).toBe('do(Z=1)')
    expect(level(container, 'X')).toBeCloseTo(at(true).X, 4)

    doNode(container, 'Z')
    expect(chip(container)).toBeNull()
    expect(node(container, 'Z').getAttribute('data-intervened')).toBe('false')
    expect(level(container, 'Z')).toBeCloseTo(0.5, 4)
  })

  it('mixes each stochastic intervention with the other interventions held', () => {
    const mixed = mixedMarginals(c.model, prior, { Y: false }, { Z: 0.3 })
    const one = marginals(c.model, prior, { do: { Y: false, Z: true } }).p
    const zero = marginals(c.model, prior, { do: { Y: false, Z: false } }).p
    expect(mixed.p.X).toBeCloseTo(0.3 * one.X + 0.7 * zero.X, 10)
    expect(mixed.p.Y).toBe(0)
    expect(withProbability({ interventions: { Z: true }, stochastic: {} }, 'Z', 0.25)).toEqual({ interventions: {}, stochastic: { Z: 0.25 } })
    expect(withProbability({ interventions: {}, stochastic: { Z: 0.25 } }, 'Z', 0)).toEqual({ interventions: { Z: false }, stochastic: {} })
  })

  it('has no P* slider in a world with values', () => {
    const { container } = render(<CausalPlayground doc={forkWorld} />)
    const z = screen.getByRole('button', { name: /^Z 共同原因/ })
    expect(z.getAttribute('aria-label')).toContain('按一下打開選單，可以干預')
    expect(openMenu(container, 'Z').querySelector('[data-do-slider]')).toBeNull()
    doNode(container, 'Z', '1')
    expect(chip(container)).toBe('do(Z=1)')
    expect(node(container, 'X').getAttribute('data-value')).toBe('1')
    doNode(container, 'Z', '0')
    expect(chip(container)).toBe('do(Z=0)')
    expect(node(container, 'X').getAttribute('data-value')).toBe('0')
    doNode(container, 'Z')
    expect(chip(container)).toBeNull()
  })

  it('reads a stochastic do() from the editor address', () => {
    const { container } = render(<ModelEditor hash="#case=smoking-lesion&pdo=S:0.30" />)
    expect(chip(container)).toBe('do(P(S=1)=0.30)')
    expect(node(container, 'S').getAttribute('data-do-p')).toBe('0.30')
  })
})
