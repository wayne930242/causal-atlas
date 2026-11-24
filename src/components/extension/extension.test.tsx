// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { BOGUS_SEQUENCE, ROCK_COARSE } from '../../fixtures/extension/docs.ts'
import { ConservativeExtension } from '../index.ts'

afterEach(cleanup)

const verdicts = [{ cause: 'B=1', effect: 'VS=1' }]

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\u200b/g, '').replace(/\s+/g, ' ')
const node = (root: Element, side: string, id: string) => root.querySelector(`[data-side="${side}"] [data-node="${id}"]`) as Element
const row = (root: Element, id: string) => root.querySelector(`[data-testid="ext-agree"] tr[data-old="${id}"]`)

describe('ConservativeExtension, pair', () => {
  it('renders on the server in both languages', () => {
    const zh = renderToString(<ConservativeExtension models={[ROCK_COARSE, 'rock-throwing']} />)
    expect(zh).toContain('ca-graph')
    expect(zh).toContain('是 ')
    expect(zh).toContain('保守擴充')
    expect(zh).toContain('data-new="SH"')
    const en = renderToString(<ConservativeExtension models={[ROCK_COARSE, 'rock-throwing']} locale="en" />)
    expect(en).toContain('is a conservative extension of')
    expect(en).not.toMatch(/[一-鿿]{2,}保守/)
  })

  it('marks the new variables, sets do() on old ones in both graphs and keeps them agreeing', () => {
    const { container } = render(<ConservativeExtension models={[ROCK_COARSE, 'rock-throwing']} locale="en" />)
    expect([...container.querySelectorAll('[data-side="extension"] [data-new]')].map((e) => e.getAttribute('data-new'))).toEqual(['SH', 'BH'])
    expect(container.querySelector('[data-side="base"] [data-new]')).toBeNull()
    expect([...container.querySelectorAll('[data-testid="ext-agree"] tbody tr')].map((r) => r.getAttribute('data-old'))).toEqual(['ST', 'BT', 'BS'])
    const verdict = container.querySelector('.ca-ext-verdict') as Element
    expect(verdict.getAttribute('data-verdict')).toBe('extension')
    expect(text(verdict)).toContain('M2 is a conservative extension of M1')
    expect(text(verdict)).toContain('108 in all')
    // A new variable cannot be set; an old one can, on either side.
    expect(node(container, 'extension', 'SH').getAttribute('role')).toBe('img')
    fireEvent.click(node(container, 'extension', 'ST'))
    expect(node(container, 'base', 'ST').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'extension', 'ST').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'extension', 'SH').getAttribute('data-value')).toBe('0')
    expect(row(container, 'BS')?.getAttribute('data-ok')).toBe('true')
    expect(text(container.querySelector('.ca-ext-setting'))).toContain('do(ST=0)')
    fireEvent.click(node(container, 'base', 'BT'))
    expect(node(container, 'base', 'BS').getAttribute('data-value')).toBe('0')
    expect(node(container, 'extension', 'BS').getAttribute('data-value')).toBe('0')
    fireEvent.click(container.querySelector('[data-ext-clear]') as Element)
    expect(container.querySelector('[data-intervened="true"]')).toBeNull()
  })

  it('names a counterexample and shows it on the graphs', () => {
    const broken = { ...BOGUS_SEQUENCE[1], model: { ...BOGUS_SEQUENCE[1].model, equations: { ...BOGUS_SEQUENCE[1].model.equations, VS: 'U and PN1' } } }
    const { container } = render(<ConservativeExtension models={[BOGUS_SEQUENCE[0], broken]} locale="en" initialInterventions={{ B: 0 }} />)
    const verdict = container.querySelector('.ca-ext-verdict') as Element
    expect(verdict.getAttribute('data-verdict')).toBe('counterexample')
    expect(text(verdict)).toContain('M2 is not a conservative extension of M1: in context U=1 with no intervention, VS is 1 in M1 and 0 in M2.')
    fireEvent.click(container.querySelector('[data-ext-show]') as Element)
    expect(container.querySelector('[data-intervened="true"]')).toBeNull()
    expect(row(container, 'VS')?.getAttribute('data-ok')).toBe('false')
    expect(container.querySelector('[data-ext-show]')).toBeNull()
  })

  it('says why models whose exogenous variables differ cannot be compared', () => {
    const { container } = render(<ConservativeExtension models={[ROCK_COARSE, BOGUS_SEQUENCE[0]]} />)
    const verdict = container.querySelector('.ca-ext-verdict') as Element
    expect(verdict.getAttribute('data-verdict')).toBe('precondition')
    expect(text(verdict)).toContain('外生變數不同')
  })

  it('shows a broken document as its problems', () => {
    const bad = { ...ROCK_COARSE, model: { ...ROCK_COARSE.model, equations: { ...ROCK_COARSE.model.equations, BS: 'ST or' } } }
    const { container } = render(<ConservativeExtension models={[bad, 'rock-throwing']} />)
    expect(container.querySelector('.ca-doc-error')).not.toBeNull()
  })
})

describe('ConservativeExtension, sequence', () => {
  it('renders the sequence on the server in both languages', () => {
    for (const locale of ['zh-TW', 'en'] as const) {
      const html = renderToString(<ConservativeExtension models={BOGUS_SEQUENCE} verdicts={verdicts} locale={locale} />)
      expect(html).toContain('data-steps="3"')
      expect(html).toContain('ext-overview')
    }
  })

  it('steps through M1 … M4 and shows the HP verdict flip in the row over all models', () => {
    const { container } = render(<ConservativeExtension models={BOGUS_SEQUENCE} verdicts={verdicts} />)
    const root = container.querySelector('.ca-ext') as Element
    const pairNow = () => [...container.querySelectorAll('.ca-ext-side')].map((s) => s.getAttribute('data-model'))
    expect(root.getAttribute('data-step')).toBe('1')
    expect(pairNow()).toEqual(['M1', 'M2'])
    expect(container.querySelector('[data-ext-prev]')?.hasAttribute('disabled')).toBe(true)
    expect(text(container.querySelector('.ca-progress'))).toContain('1/3')
    const overview = container.querySelector('[data-testid="ext-overview"]') as Element
    expect([...overview.querySelectorAll('[data-row="extends"] td')].map((td) => td.getAttribute('data-extends'))).toEqual([null, 'true', 'true', 'true'])
    const verdictsOf = (theory: string) => [...overview.querySelectorAll(`[data-row="0:${theory}"] td`)].map((td) => td.getAttribute('data-verdict'))
    expect(verdictsOf('butfor')).toEqual(['not-cause', 'not-cause', 'not-cause', 'not-cause'])
    expect(verdictsOf('hp-original')).toEqual(['cause', 'not-cause', 'cause', 'not-cause'])
    expect(verdictsOf('hp-updated')).toEqual(['cause', 'not-cause', 'cause', 'not-cause'])
    expect(verdictsOf('hp-modified')).toEqual(['part-of-cause', 'not-cause', 'part-of-cause', 'not-cause'])
    for (const [step, pair, added] of [
      [2, ['M2', 'M3'], ['A2']],
      [3, ['M3', 'M4'], ['PN2']],
    ] as const) {
      fireEvent.click(container.querySelector('[data-ext-next]') as Element)
      expect(root.getAttribute('data-step')).toBe(String(step))
      expect(pairNow()).toEqual(pair)
      expect([...container.querySelectorAll('[data-side="extension"] [data-new]')].map((e) => e.getAttribute('data-new'))).toEqual(added)
      expect(container.querySelector('.ca-ext-verdict')?.getAttribute('data-verdict')).toBe('extension')
    }
    expect(container.querySelector('[data-ext-next]')?.hasAttribute('disabled')).toBe(true)
    expect([...overview.querySelectorAll('thead th[data-current="true"]')].map((th) => text(th))).toHaveLength(2)
    fireEvent.click(container.querySelector('[data-ext-prev]') as Element)
    expect(pairNow()).toEqual(['M2', 'M3'])
  })

  it('keeps do() on a variable the next base model still has, and takes names', () => {
    const { container } = render(<ConservativeExtension models={BOGUS_SEQUENCE} names={['M_1', 'M_2', 'M_3', 'M_4']} initialStep={2} locale="en" />)
    expect([...container.querySelectorAll('.ca-ext-side')].map((s) => s.getAttribute('data-model'))).toEqual(['M_2', 'M_3'])
    fireEvent.click(node(container, 'base', 'PN1'))
    expect(node(container, 'extension', 'PN1').getAttribute('data-intervened')).toBe('true')
    fireEvent.click(container.querySelector('[data-ext-next]') as Element)
    expect(node(container, 'base', 'PN1').getAttribute('data-intervened')).toBe('true')
    fireEvent.click(container.querySelector('[data-ext-prev]') as Element)
    fireEvent.click(container.querySelector('[data-ext-prev]') as Element)
    expect(container.querySelector('[data-intervened="true"]')).toBeNull()
  })
})
