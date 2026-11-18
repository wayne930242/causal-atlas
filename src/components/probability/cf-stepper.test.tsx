// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { ProbabilityPanel } from '../index.ts'

afterEach(cleanup)

const nervous = lessonModel('m00-firing-squad-nervous')
const query = { evidence: 'D=1', do: { A: 0 }, event: 'D=0' }

const readout = (container: HTMLElement, id: string): string =>
  container.querySelector(`[data-node="${id}"] [data-readout="${id}"]`)?.textContent ?? ''
const stepButton = (container: HTMLElement, n: number): HTMLElement =>
  within(within(container).getByRole('group', { name: '反事實的步驟' })).getAllByRole('button')[n - 1]

describe('ProbabilityPanel view="counterfactual": abduction, action, prediction', () => {
  it('lesson 07: P(D_{A=0}=0 | D=1) = 0.0789 on the nervous firing squad', () => {
    const { container, getByTestId } = render(
      <ProbabilityPanel doc={nervous} view="counterfactual" counterfactual={query} actionLabel="已知囚犯死了；若 A 沒開槍？" />,
    )
    const root = container.querySelector('[data-view="counterfactual"]')
    expect(root?.getAttribute('data-step')).toBe('1')
    expect(container.textContent).toContain('已知囚犯死了；若 A 沒開槍？')
    // Step 1, abduction: D is observed, the background table gives each context's posterior.
    expect(container.querySelector('[data-node="D"]')?.getAttribute('data-observed')).toBe('1')
    expect(readout(container, 'C')).toBe('0.92')
    expect(readout(container, 'W')).toBe('0.26')
    const rows = [...container.querySelectorAll('[data-background]')]
    expect(rows.length).toBe(4)
    const posterior = rows.map((r) => r.querySelector('[data-posterior]')?.getAttribute('data-posterior'))
    expect(posterior).toEqual(['0.1842', '0.7368', '0.0789', '0.0000'])
    expect(rows[3].getAttribute('data-zero')).toBe('true')
    expect(container.querySelector('[data-cf-value]')).toBeNull()

    // Step 2, action: A is set to 0, the arrows into A are cut; the table does not change.
    fireEvent.click(within(container).getByRole('button', { name: '下一步' }))
    expect(root?.getAttribute('data-step')).toBe('2')
    expect(container.querySelector('[data-node="A"]')?.getAttribute('data-intervened')).toBe('true')
    expect(container.querySelectorAll('[data-state="cut"]').length).toBe(2)
    expect(container.querySelector('[data-node="D"] [data-note]')?.textContent).toBe('尚未重算')

    // Step 3, prediction: the column of D after do(A=0), the surviving row marked, the number.
    fireEvent.click(stepButton(container, 3))
    expect(root?.getAttribute('data-step')).toBe('3')
    expect(readout(container, 'D')).toBe('0.92')
    const after = [...container.querySelectorAll('[data-background]')].map((r) => r.querySelector('[data-cf-value]')?.textContent)
    expect(after).toEqual(['1', '1', '0', '—'])
    expect([...container.querySelectorAll('[data-background][data-event="true"]')].length).toBe(1)
    expect(getByTestId('cf-value').textContent).toBe('0.0789')
    expect(container.querySelector('[data-testid="cf-expression"] .ca-tex')?.getAttribute('data-text')).toBe('P(D_{A=0}=0 | D=1)')
  })

  it('Pearl models 1 and 2 ask the same question and answer 0 and 1', () => {
    const q = { evidence: 'X=1 and Y=1', do: { X: 0 }, event: 'Y=0' }
    const one = render(<ProbabilityPanel doc={lessonModel('m02-pearl-model1')} view="counterfactual" counterfactual={q} initialStep={3} />)
    expect(one.getByTestId('cf-value').textContent).toBe('0.00')
    one.unmount()
    const two = render(<ProbabilityPanel doc={lessonModel('m02-pearl-model2')} view="counterfactual" counterfactual={q} initialStep={3} />)
    expect(two.getByTestId('cf-value').textContent).toBe('1.00')
  })

  it('recomputes when a prior slider moves', () => {
    const { container, getByTestId } = render(<ProbabilityPanel doc={nervous} view="counterfactual" counterfactual={query} initialStep={3} />)
    fireEvent.click(within(container).getByRole('button', { name: /式子和機率/ }))
    const w = container.querySelector<HTMLInputElement>('input[type="range"][id$="-W"]')
    if (w === null) throw new Error('no slider for W')
    fireEvent.change(w, { target: { value: '0.5' } })
    // P(U=0, W=1) / P(D=1) = 0.15 / 0.85.
    expect(getByTestId('cf-value').textContent).toBe('0.1765')
  })
})
