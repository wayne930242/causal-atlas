// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CausalPlayground } from '../index.ts'
import { textWithMath } from '../test-menu.ts'

afterEach(cleanup)

const deviant = (container: HTMLElement, id: string): string | null =>
  container.querySelector(`[data-node="${id}"] [data-deviant]`)?.textContent ?? null
const normLine = (container: HTMLElement): string => textWithMath(container.querySelector('[data-normality]'))

describe('defaults: deviations from the model normality', () => {
  it('lesson 01: models B and C differ only in whether O deviates', () => {
    const b = render(<CausalPlayground doc={lessonModel('m01-fire-oxygen')} />)
    expect(deviant(b.container, 'O')).toBeNull()
    expect(deviant(b.container, 'L')).toBe('偏離（預設 0）')
    expect(normLine(b.container)).toContain('實際世界 {L, MD, FF}')
    b.unmount()
    const c = render(<CausalPlayground doc={lessonModel('m01-fire-oxygen-lab')} />)
    expect(deviant(c.container, 'O')).toBe('偏離（預設 0）')
    expect(normLine(c.container)).toContain('實際世界 {L, MD, O, FF}')
  })

  it('lesson 09: the gardener and the Queen both leave D=0; only the deviations tell them apart', () => {
    const { container } = render(<CausalPlayground caseId="gardener-queen" />)
    fireEvent.click(within(container).getByRole('button', { name: '園丁澆了花' }))
    expect(normLine(container)).toContain('這個世界 {}；實際世界 {GW, D}')
    expect(normLine(container)).toContain('更正常')
    fireEvent.click(within(container).getByRole('button', { name: '女王澆了花' }))
    expect(deviant(container, 'QW')).toBe('偏離（預設 0）')
    expect(normLine(container)).toContain('這個世界 {GW, QW}；實際世界 {GW, D}')
    expect(normLine(container)).toContain('無法比較')
  })

  it('the equations name each default', () => {
    const { container } = render(<CausalPlayground caseId="gardener-queen" />)
    expect(container.querySelector('[data-default="GW"]')?.textContent).toBe('預設 1')
    expect(container.querySelector('[data-default="D"]')?.textContent).toBe('預設 0')
  })

  it('normality={false} hides all of it; a model without defaults shows none', () => {
    const off = render(<CausalPlayground caseId="gardener-queen" normality={false} />)
    expect(off.container.querySelector('[data-deviant]')).toBeNull()
    expect(off.container.querySelector('[data-normality]')).toBeNull()
    expect(off.container.querySelector('[data-default]')).toBeNull()
    off.unmount()
    const none = render(<CausalPlayground caseId="forest-fire-disjunctive" />)
    expect(none.container.querySelector('[data-normality]')).toBeNull()
  })

  it("the normality cell's reason is the same comparison", () => {
    const { container } = render(<CausalPlayground caseId="gardener-queen" verdicts={[{ cause: 'QW=0', effect: 'D=1' }]} />)
    fireEvent.click(within(container).getByRole('button', { name: '女王澆了花' }))
    const now = textWithMath(container.querySelector('[data-witness-now]'))
    expect(now).toContain('HP 加上常態：不是，這個世界 {GW, QW}；實際世界 {GW, D}，無法比較')
  })
})
