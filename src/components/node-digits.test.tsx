// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'
import { blockOptions, numberWidth } from './graph/signal-shapes.ts'
import { CasePage, CausalPlayground, ModelEditor, ProbabilityPanel } from './index.ts'
import { probText } from './model/wording.ts'

afterEach(cleanup)

const boolVar = (id: string, kind: 'exogenous' | 'endogenous') => ({ id, label: { 'zh-TW': id, en: id }, kind, domain: 'boolean' })

/** A fork whose numbers need more than two decimals: Z 0.175, X 0.105, Y 0.4225. */
const fork: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: 'Fork',
  model: {
    variables: [
      boolVar('U_Z', 'exogenous'),
      boolVar('U_X', 'exogenous'),
      boolVar('U_Y', 'exogenous'),
      boolVar('Z', 'endogenous'),
      boolVar('X', 'endogenous'),
      boolVar('Y', 'endogenous'),
    ],
    equations: { Z: 'U_Z', X: 'Z and U_X', Y: 'Z or U_Y' },
  },
  priors: { independent: { U_Z: 0.175, U_X: 0.6, U_Y: 0.3 } },
})

const faces = [1, 2, 3, 4, 5, 6]
const dice: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: 'Dice',
  model: {
    variables: [
      { id: 'U1', label: { 'zh-TW': '擲一', en: 'Roll 1' }, kind: 'exogenous', domain: faces },
      { id: 'D1', label: { 'zh-TW': '骰一', en: 'Die 1' }, kind: 'endogenous', domain: faces },
    ],
    equations: { D1: 'U1' },
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
    },
  },
})

const readout = (c: HTMLElement, id: string): string => c.querySelector(`[data-readout="${id}"]`)?.textContent ?? ''
const node = (c: HTMLElement, id: string): Element => c.querySelector(`[data-node="${id}"]`) as Element

describe('probText digits', () => {
  it('keeps two decimals by default and writes `digits` when given', () => {
    expect(probText(0.1056)).toBe('0.11')
    expect(probText(0.1056, 2)).toBe('0.11')
    expect(probText(0.1056, 4)).toBe('0.1056')
    expect(probText(0.175, 3)).toBe('0.175')
    expect(probText(0.5, 4)).toBe('0.5000')
    expect(probText(0, 4)).toBe('0.0000')
    expect(probText(1, 3)).toBe('1.000')
    expect(probText(Number.NaN, 4)).toBe('—')
  })
  it('gives a value near 0 or 1 two significant digits past the chosen decimals', () => {
    expect(probText(0.0001)).toBe('0.0001')
    expect(probText(0.00123, 2)).toBe('0.0012')
    expect(probText(0.00123, 4)).toBe('0.0012')
    expect(probText(0.000123, 4)).toBe('0.0001')
    expect(probText(0.0000123, 4)).toBe('0.000012')
    expect(probText(0.99996, 4)).toBe('0.99996')
    expect(probText(0.00004, 4)).toBe('0.00004')
  })
})

describe('node readouts with digits', () => {
  it('reads two decimals without the prop, exactly as before', () => {
    const { container } = render(<CausalPlayground doc={fork} />)
    expect([readout(container, 'Z'), readout(container, 'X'), readout(container, 'Y')]).toEqual(['0.18', '0.11', '0.42'])
  })

  it('writes every node to the chosen decimals, in aria text too', () => {
    const { container } = render(<CausalPlayground doc={fork} digits={4} />)
    expect([readout(container, 'Z'), readout(container, 'X'), readout(container, 'Y')]).toEqual(['0.1750', '0.1050', '0.4225'])
    expect(node(container, 'X').getAttribute('aria-label')).toContain('P(X=1) 0.1050')
    cleanup()
    const three = render(<CausalPlayground doc={fork} digits={3} />)
    expect(readout(three.container, 'Y')).toBe('0.423')
  })

  it('writes a stochastic do() tag and the 原本 note at the same precision', () => {
    const { container } = render(<CausalPlayground doc={fork} digits={4} />)
    fireEvent.click(screen.getByRole('button', { name: /^Z/ }), { shiftKey: true })
    const slider = screen.getByRole('slider', { name: /Z/ }) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.3' } })
    expect(node(container, 'Z').textContent).toContain('P(Z=1)=0.3000')
    expect(readout(container, 'Z')).toBe('0.3000')
    expect(container.querySelector('[data-note="Z"]')?.textContent).toBe('原本 0.1750')
    expect(container.querySelector('[data-note="X"]')?.textContent).toBe('原本 0.1050')
    expect(node(container, 'Z').getAttribute('aria-label')).toContain('P(Z=1)=0.3000')
  })

  it('writes the bars’ top value and each bar’s tooltip', () => {
    const { container } = render(<CausalPlayground doc={dice} digits={3} />)
    expect(node(container, 'D1').querySelector('[data-max]')?.textContent).toBe('最高 0.500')
    expect(node(container, 'D1').querySelector('[data-bar] title')?.textContent).toBe('P(D1=1)=0.100')
    cleanup()
    const plain = render(<CausalPlayground doc={dice} />)
    expect(node(plain.container, 'D1').querySelector('[data-max]')?.textContent).toBe('最高 0.50')
  })

  it('applies to ProbabilityPanel, and in compare to the two result numbers', () => {
    const compare = render(<ProbabilityPanel caseId="smoking-lesion" view="compare" digits={4} />)
    expect(screen.getByTestId('see-value').textContent).toMatch(/^0\.4\d{3}$/)
    expect(screen.getByTestId('do-value').textContent).toBe('0.2500')
    expect(readout(compare.container, 'L')).toMatch(/^0\.\d{4}$/)
    cleanup()
    const sliders = render(<ProbabilityPanel doc={fork} digits={4} />)
    expect(readout(sliders.container, 'Y')).toBe('0.4225')
    cleanup()
    const plain = render(<ProbabilityPanel doc={fork} />)
    expect(readout(plain.container, 'Y')).toBe('0.42')
  })

  it('applies to the counterfactual and adjust views', () => {
    const cf = render(
      <ProbabilityPanel doc={fork} view="counterfactual" counterfactual={{ evidence: 'Y=1', do: { Z: 0 }, event: 'Y=1' }} digits={4} />,
    )
    for (const id of ['Z', 'X', 'Y']) expect(readout(cf.container, id)).toMatch(/^[01]\.\d{4}$/)
    cleanup()
    const adjust = render(<ProbabilityPanel doc={fork} view="adjust" adjust={{ x: 'Z', y: 'Y' }} digits={4} />)
    for (const id of ['Z', 'X', 'Y']) expect(readout(adjust.container, id)).toMatch(/^[01]\.\d{4}$/)
  })

  it('applies to CasePage and ModelEditor', () => {
    const page = render(<CasePage caseId="smoking-lesion" initialStep={3} digits={4} />)
    expect(page.container.querySelectorAll('[data-readout]').length).toBeGreaterThan(0)
    for (const r of page.container.querySelectorAll('[data-readout]')) expect(r.textContent).toMatch(/^[01]\.\d{4}$/)
    cleanup()
    const editor = render(<ModelEditor hash="#case=smoking-lesion" digits={3} />)
    expect(editor.container.querySelectorAll('[data-readout]').length).toBeGreaterThan(0)
    for (const r of editor.container.querySelectorAll('[data-readout]')) expect(r.textContent).toMatch(/^[01]\.\d{3}$/)
  })
})

describe('bad digits', () => {
  it.each([0, 1.5, 7, -1, Number.NaN, '3' as unknown as number])('throws on %s', (bad) => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<CausalPlayground doc={fork} digits={bad} />)).toThrow(/digits/)
    expect(() => render(<ProbabilityPanel doc={fork} digits={bad} />)).toThrow(/digits/)
    quiet.mockRestore()
  })
})

describe('layout at more digits', () => {
  it('reserves a wider readout slot for more digits, and the old one by default', () => {
    expect(numberWidth(2)).toBe(numberWidth())
    expect(numberWidth(4)).toBeGreaterThan(numberWidth(2))
    const [two] = blockOptions(26, 30, { kind: 'number', numberW: numberWidth(2) })
    const [four] = blockOptions(26, 30, { kind: 'number', numberW: numberWidth(4) })
    const [plain] = blockOptions(26, 30, { kind: 'number' })
    expect(JSON.stringify(plain)).toBe(JSON.stringify(two))
    const numberBox = (b: typeof two) => b.boxes.find((x) => Math.abs((x.y0 + x.y1) / 2 - b.numberY) < 8 && x.y1 - x.y0 > 12)
    const w = (b: typeof two): number => {
      const box = numberBox(b)
      if (box === undefined) throw new Error('no number box')
      return box.x1 - box.x0
    }
    expect(w(four)).toBeGreaterThan(w(two))
  })
})
