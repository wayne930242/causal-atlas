// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { lessonModel } from '../demo/lesson-models.ts'
import { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } from './index.ts'

afterEach(cleanup)

/**
 * Graph first: the blocks under a figure's graph (verdicts, tables, equations) sit behind one row
 * of tab buttons. The figure's own focus block is open at first, the equations are closed, and a
 * closed block stays in the page.
 */

const tab = (c: HTMLElement, id: string): HTMLButtonElement => {
  const el = c.querySelector<HTMLButtonElement>(`button[data-tab="${id}"]`)
  if (el === null) throw new Error(`no tab ${id}`)
  return el
}
const panel = (c: HTMLElement, id: string): HTMLElement => {
  const el = c.querySelector<HTMLElement>(`[data-tab-panel="${id}"]`)
  if (el === null) throw new Error(`no panel ${id}`)
  return el
}
/** The tabs in row order. */
const tabs = (c: HTMLElement): string[] => [...c.querySelectorAll<HTMLElement>('button[data-tab]')].map((b) => b.dataset.tab ?? '')
/** The blocks open now. */
const open = (c: HTMLElement): string[] => [...c.querySelectorAll<HTMLElement>('[data-tab-panel]:not([hidden])')].map((p) => p.dataset.tabPanel ?? '')
/** Whether `selector` matches something outside every tab panel (it stays on view). */
const visible = (c: HTMLElement, selector: string): boolean => {
  const el = c.querySelector(selector)
  return el !== null && el.closest('[data-tab-panel]') === null
}
const inside = (c: HTMLElement, selector: string, id: string): boolean => panel(c, id).querySelector(selector) !== null

describe('CausalPlayground', () => {
  it('a plain figure has one 式子 tab, closed, with the equations still in the page', () => {
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    expect(tabs(container)).toEqual(['equations'])
    expect(tab(container, 'equations').textContent).toBe('式子')
    expect(open(container)).toEqual([])
    expect(panel(container, 'equations').hidden).toBe(true)
    expect(inside(container, '.ca-eqs', 'equations')).toBe(true)
    expect(inside(container, '.ca-copy-latex', 'equations')).toBe(true)
    fireEvent.click(tab(container, 'equations'))
    expect(open(container)).toEqual(['equations'])
    fireEvent.click(tab(container, 'equations'))
    expect(open(container)).toEqual([])
  })

  it('the step buttons, hint and trail stay on view', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m02-collider')} track={['Y']} presets={[{ label: 'X=1', interventions: { X: 1 } }]} />)
    expect(visible(container, '.ca-presets')).toBe(true)
    expect(visible(container, '.ca-hint')).toBe(true)
    expect(visible(container, '.ca-trail')).toBe(true)
    expect(visible(container, '.ca-reading')).toBe(true)
    expect(visible(container, '.ca-export')).toBe(true)
  })

  it('with verdicts, the verdicts are open and the equations closed', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" verdicts={[{ cause: 'L=1', effect: 'FF=1' }]} />)
    expect(tabs(container)).toEqual(['verdicts', 'equations'])
    expect(tab(container, 'verdicts').textContent).toBe('判定')
    expect(open(container)).toEqual(['verdicts'])
    expect(inside(container, '[data-verdict-cell]', 'verdicts')).toBe(true)
    expect(inside(container, '[data-witness-now]', 'verdicts')).toBe(true)
  })

  it('opens one block at a time, and the closed one stays in the page', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" verdicts={[{ cause: 'L=1', effect: 'FF=1' }]} />)
    fireEvent.click(tab(container, 'equations'))
    expect(open(container)).toEqual(['equations'])
    expect(tab(container, 'verdicts').getAttribute('aria-expanded')).toBe('false')
    expect(panel(container, 'verdicts').hidden).toBe(true)
    expect(container.querySelectorAll('[data-verdict-cell]').length).toBeGreaterThan(0)
    fireEvent.click(tab(container, 'equations'))
    expect(open(container)).toEqual([])
  })

  it('the witness button works while the verdicts are closed to the eye', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" verdicts={[{ cause: 'L=1', effect: 'FF=1' }]} />)
    fireEvent.click(tab(container, 'verdicts'))
    expect(open(container)).toEqual([])
    const show = panel(container, 'verdicts').querySelector<HTMLButtonElement>('[data-verdict-cell="hp-original"] button')
    expect(show).not.toBeNull()
    fireEvent.click(show as HTMLButtonElement)
    expect(container.querySelector('[data-node="L"]')?.getAttribute('data-value')).toBe('0')
  })

  it('with a decision, the expected-utility bars are open and the sliders stay on view', () => {
    const { container } = render(<CausalPlayground caseId="smoking-lesion" sliders={['N_S1']} decision />)
    expect(tabs(container)).toEqual(['ev', 'equations'])
    expect(tab(container, 'ev').textContent).toBe('期望值')
    expect(open(container)).toEqual(['ev'])
    expect(inside(container, '.ca-ev', 'ev')).toBe(true)
    expect(visible(container, '.ca-slider-list')).toBe(true)
  })

  it('with a d-separation pair, the paths are open', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m04-admission')} dsep={['G', 'M']} />)
    expect(tabs(container)).toEqual(['dsep', 'equations'])
    expect(tab(container, 'dsep').textContent).toBe('d-分離')
    expect(open(container)).toEqual(['dsep'])
    expect(inside(container, '[data-dsep]', 'dsep')).toBe(true)
  })

  it('the normality line is one sentence and stays on view', () => {
    const { container } = render(<CausalPlayground caseId="gardener-queen" verdicts={[{ cause: 'QW=0', effect: 'D=1' }]} />)
    expect(visible(container, '[data-normality]')).toBe(true)
  })

  it('an embed page starts the same way', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" verdicts={[{ cause: 'L=1', effect: 'FF=1' }]} embedded />)
    expect(open(container)).toEqual(['verdicts'])
  })

  it('English labels', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" locale="en" verdicts={[{ cause: 'L=1', effect: 'FF=1' }]} />)
    expect(tab(container, 'verdicts').textContent).toBe('Verdicts')
    expect(tab(container, 'equations').textContent).toBe('Equations')
  })

  it('the graph keeps one box, with the tabs inside it', () => {
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    expect(container.querySelector('.ca-graph-box .ca-tabs')).not.toBeNull()
    expect(container.querySelector('.ca-eq-box')).toBeNull()
  })
})

describe('ProbabilityPanel', () => {
  it('adjust: the strata table is open, the equations closed, the verdict line on view', () => {
    const { container } = render(<ProbabilityPanel doc={lessonModel('m05-backdoor')} view="adjust" adjust={{ x: 'X', y: 'Y' }} />)
    expect(tabs(container)).toEqual(['strata', 'probabilities'])
    expect(tab(container, 'strata').textContent).toBe('分組表')
    expect(open(container)).toEqual(['strata'])
    expect(inside(container, '.ca-adj-table', 'strata')).toBe(true)
    expect(visible(container, '.ca-adj-line')).toBe(true)
    expect(inside(container, '.ca-eqs', 'probabilities')).toBe(true)
  })

  it('adjust: the switch between groupings keeps the open block', () => {
    const { container } = render(<ProbabilityPanel doc={lessonModel('m05-backdoor')} view="adjust" adjust={{ x: 'X', y: 'Y' }} />)
    const seg = container.querySelectorAll<HTMLButtonElement>('.ca-seg-item')
    fireEvent.click(seg[seg.length - 1])
    expect(open(container)).toEqual(['strata'])
  })

  it('counterfactual: the backgrounds table is open, the equations closed, the result stays on view', () => {
    const { container } = render(
      <ProbabilityPanel
        doc={lessonModel('m02-pearl-model1')}
        view="counterfactual"
        counterfactual={{ evidence: 'X=1 and Y=1', do: { X: 0 }, event: 'Y=0' }}
        initialStep={3}
      />,
    )
    expect(tabs(container)).toEqual(['background', 'probabilities'])
    expect(tab(container, 'background').textContent).toBe('背景表')
    expect(open(container)).toEqual(['background'])
    expect(inside(container, '.ca-cf-table', 'background')).toBe(true)
    expect(visible(container, '[data-testid="cf-value"]')).toBe(true)
    expect(visible(container, '.ca-cf-caption')).toBe(true)
  })

  it('compare: both graphs and their numbers stay on view; one closed tab holds the equations and sliders', () => {
    const { container } = render(<ProbabilityPanel doc={lessonModel('m03-sprinkler')} view="compare" pair={{ event: 'W=1', observe: 'S=1', intervene: { S: 1 } }} />)
    expect(tabs(container)).toEqual(['probabilities'])
    expect(tab(container, 'probabilities').textContent).toBe('式子和機率')
    expect(open(container)).toEqual([])
    expect(visible(container, '[data-testid="see-value"]')).toBe(true)
    expect(visible(container, '[data-testid="do-value"]')).toBe(true)
    expect(inside(container, '.ca-eqs', 'probabilities')).toBe(true)
    expect(inside(container, '.ca-slider-list', 'probabilities')).toBe(true)
  })

  it('sliders: the sliders stay on view and the equations are one closed 式子 tab', () => {
    const { container } = render(<ProbabilityPanel doc={lessonModel('m03-sprinkler')} />)
    expect(tabs(container)).toEqual(['equations'])
    expect(open(container)).toEqual([])
    expect(visible(container, '.ca-slider-list')).toBe(true)
    expect(inside(container, '.ca-eqs', 'equations')).toBe(true)
  })
})

describe('WorldLanes', () => {
  it('has one 看式子 toggle, closed, with the equations still in the page', () => {
    const { container } = render(<WorldLanes caseId="rock-throwing" />)
    expect(tabs(container)).toEqual(['equations'])
    expect(open(container)).toEqual([])
    expect(inside(container, '.ca-eqs', 'equations')).toBe(true)
    fireEvent.click(tab(container, 'equations'))
    expect(open(container)).toEqual(['equations'])
    expect(tab(container, 'equations').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(tab(container, 'equations'))
    expect(open(container)).toEqual([])
  })

  it('the toggle stays in the foot row beside the progress and the export menu', () => {
    const { container } = render(<WorldLanes caseId="rock-throwing" />)
    expect(container.querySelector('.ca-lanes-foot [data-tab="equations"]')).not.toBeNull()
  })
})

describe('CasePage', () => {
  it('the equations are one closed 式子 tab inside the graph box', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={2} />)
    expect(tabs(container)).toEqual(['equations'])
    expect(open(container)).toEqual([])
    expect(container.querySelector('.ca-graph-box [data-tab="equations"]')).not.toBeNull()
    expect(inside(container, '.ca-eqs', 'equations')).toBe(true)
  })
})
