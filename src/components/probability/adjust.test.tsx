// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { docToCase } from '../../data/index.ts'
import { lessonModel } from '../../demo/lesson-models.ts'
import { adjustView } from './adjust-view.ts'
import { ProbabilityPanel } from '../index.ts'

afterEach(cleanup)

const backdoor = docToCase(lessonModel('m05-backdoor'))
const prior = backdoor.prior
if (prior === undefined) throw new Error('no prior')

describe('adjustView: the adjustment formula for one grouping, with the back-door verdict', () => {
  it('matches lesson 05: Z gives the do() values 0.175 / 0.325; Z, C gives 0.1536 / 0.431', () => {
    const at = (set: string[]) => adjustView(backdoor, prior, 'X', 'Y', set)
    expect(at([]).sums.map((s) => s?.toFixed(4))).toEqual(['0.1056', '0.4045'])
    const z = at(['Z'])
    expect(z.sums.map((s) => s?.toFixed(4))).toEqual(['0.1750', '0.3250'])
    expect(z.doValues.map((s) => s.toFixed(4))).toEqual(['0.1750', '0.3250'])
    expect(z).toMatchObject({ criterion: true, equal: true, descendants: [] })
    expect(at(['C']).sums.map((s) => s?.toFixed(4))).toEqual(['0.0982', '0.4310'])
    const zc = at(['Z', 'C'])
    expect(zc.sums.map((s) => s?.toFixed(4))).toEqual(['0.1536', '0.4310'])
    expect(zc.strata.map((s) => s.weight.toFixed(3))).toEqual(['0.258', '0.242', '0.173', '0.327'])
    expect(zc).toMatchObject({ criterion: false, equal: false, descendants: ['C'] })
  })

  it('lights only the non-causal paths; X→Y itself is never marked', () => {
    const zc = adjustView(backdoor, prior, 'X', 'Y', ['Z', 'C'])
    expect([...zc.marks.open]).toEqual(['X>C', 'Y>C'])
    expect(zc.marks.open.has('X>Y') || zc.marks.blocked.has('X>Y')).toBe(false)
  })
})

describe('ProbabilityPanel view="adjust"', () => {
  it('switches the grouping in the head; the verdict line and the weighted sums follow', () => {
    const { container, getByRole } = render(<ProbabilityPanel doc={lessonModel('m05-backdoor')} view="adjust" adjust={{ x: 'X', y: 'Y' }} />)
    const line = (): string => container.querySelector('.ca-adj-line')?.textContent ?? ''
    const sums = (): string[] => [...container.querySelectorAll('[data-adj-sum]')].map((e) => e.textContent ?? '')
    expect(line()).toContain('後門 X←Z→Y 通')
    fireEvent.click(getByRole('button', { name: 'Z' }))
    expect(line()).toContain('✓ 後門準則成立')
    expect(sums()).toEqual(['0.175', '0.325'])
    fireEvent.click(getByRole('button', { name: 'Z、C' }))
    expect(line()).toContain('C 是 X 的後代')
    expect(line()).toContain('已知 C 打開 X→C←Y')
    expect(sums()).toEqual(['0.1536', '0.431'])
    expect(container.querySelector('[data-node="C"]')?.textContent).toContain('分組')
  })

  it('fails fast without sets when there are more than three candidates', () => {
    expect(() => renderToString(<ProbabilityPanel doc={lessonModel('m05-backdoor')} view="adjust" />)).toThrow(/adjust/)
    const doc = lessonModel('m05-backdoor')
    const wide = {
      ...doc,
      model: {
        variables: [...doc.model.variables, ...['W1', 'W2'].map((id) => ({ id, label: { 'zh-TW': id, en: id }, kind: 'endogenous' as const, domain: 'boolean' as const }))],
        equations: { ...doc.model.equations, W1: 'Z', W2: 'C' },
      },
    }
    expect(() => renderToString(<ProbabilityPanel doc={wide} view="adjust" adjust={{ x: 'X', y: 'Y' }} />)).toThrow(/sets/)
  })
})
