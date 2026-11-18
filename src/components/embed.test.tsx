// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCase } from '../data/index.ts'
import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'
import { embedFragment, embedHome, fitEmbedState, readEmbedState } from './embed.ts'
import { CausalPlayground } from './index.ts'
import { resolveDoc } from './doc-case.ts'

const boolVar = (id: string, kind: 'exogenous' | 'endogenous') => ({ id, label: { 'zh-TW': id, en: id }, kind, domain: 'boolean' })
const collider: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: '對撞',
  model: {
    variables: [boolVar('U_X', 'exogenous'), boolVar('U_Y', 'exogenous'), boolVar('X', 'endogenous'), boolVar('Y', 'endogenous'), boolVar('Z', 'endogenous')],
    equations: { X: 'U_X', Y: 'U_Y', Z: 'X or Y' },
  },
  priors: { independent: { U_X: 0.5, U_Y: 0.5 } },
})

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const readout = (container: HTMLElement, id: string): string => node(container, id).querySelector(`[data-readout="${id}"]`)?.textContent ?? ''

let copied: string[] = []
beforeEach(() => {
  copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
  })
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

describe('embed address', () => {
  it('round-trips do, pdo and obs', () => {
    const state = { interventions: { X: true }, stochastic: { Y: 0.3 }, observed: { Z: false } }
    expect(embedFragment(state)).toBe('do=X:1&pdo=Y:0.30&obs=Z:0')
    expect(readEmbedState(`#${embedFragment(state)}`)).toEqual({ interventions: { X: 1 }, stochastic: { Y: 0.3 }, observed: { Z: 0 } })
  })

  it('keeps what fits the case and drops an impossible observation', () => {
    const c = (resolveDoc(collider) as { ok: true; c: Parameters<typeof fitEmbedState>[0] }).c
    expect(fitEmbedState(c, { interventions: { X: 1, U_X: 1, Q: 1 }, stochastic: {}, observed: { Z: 1 } })).toEqual({
      interventions: { X: true },
      stochastic: {},
      observed: { Z: true },
    })
    // Under do(X=1), Z is always 1.
    expect(fitEmbedState(c, { interventions: { X: 1 }, stochastic: {}, observed: { Z: 0 } }).observed).toEqual({})
    // A case with one actual world has nothing to observe.
    expect(fitEmbedState(getCaseLoaded('rock-throwing'), { interventions: {}, stochastic: {}, observed: { SH: 1 } }).observed).toEqual({})
  })

  it('links the credit back only to a path on its own site', () => {
    expect(embedHome('?from=%2Fposts%2Fa%2F', 'https://wayneh.tw')).toBe('https://wayneh.tw/posts/a/')
    expect(embedHome('?from=%2F%2Fevil.example%2F', 'https://wayneh.tw')).toBe('https://wayneh.tw/causal/')
    expect(embedHome('?from=https%3A%2F%2Fevil.example%2F', 'https://wayneh.tw')).toBe('https://wayneh.tw/causal/')
    expect(embedHome('', 'https://wayneh.tw')).toBe('https://wayneh.tw/causal/')
  })
})

const getCaseLoaded = getCase

describe('embed code in the export menu', () => {
  it('copies an iframe of the bundled case with the state on screen and the citation', async () => {
    window.history.replaceState(null, '', '/posts/causal/lessons/00/')
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    fireEvent.click(node(container, 'SH'))
    fireEvent.click(screen.getByRole('button', { name: '下載圖片' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '複製嵌入碼' }))
    })
    expect(copied).toHaveLength(1)
    const [iframe, cite] = copied[0].split('\n')
    expect(iframe).toMatch(/^<iframe src="https:\/\/wayneh\.tw\/causal\/embed\/case\/rock-throwing\/\?from=%2Fposts%2Fcausal%2Flessons%2F00%2F#do=SH:1" /)
    expect(iframe).toContain('title="')
    expect(cite).toMatch(/^<p>洪偉（Wei Hung）（\d{4}）。causal-atlas（[\d.]+ 版）。https:\/\/wayneh\.tw\/causal\/ 資料與教學文字以 CC BY 4\.0 授權。 案例出處：/)
    expect(iframe).toContain('｜causal-atlas"')
  })

  it('offers no embed code for a document without an embed page, and one with it', () => {
    const { unmount } = render(<CausalPlayground doc={collider} />)
    fireEvent.click(screen.getByRole('button', { name: '下載圖片' }))
    expect(screen.queryByRole('button', { name: '複製嵌入碼' })).toBeNull()
    unmount()
    render(<CausalPlayground doc={collider} embedUrl="https://wayneh.tw/causal/embed/model/m02-collider/" />)
    fireEvent.click(screen.getByRole('button', { name: '下載圖片' }))
    expect(screen.getByRole('button', { name: '複製嵌入碼' })).not.toBeNull()
  })
})

describe('embedded figure', () => {
  it('takes its state from the address and shows the credit with a link back', () => {
    window.history.replaceState(null, '', '/causal/embed/model/m02-collider/?from=%2Fposts%2Fcausal%2Flessons%2F02%2F#obs=Z:1')
    const { container } = render(<CausalPlayground doc={collider} embedded embedUrl="https://wayneh.tw/causal/embed/model/m02-collider/" />)
    expect(node(container, 'Z').getAttribute('data-observed')).toBe('1')
    expect(readout(container, 'Y')).toBe('0.67')
    const credit = container.querySelector('.ca-embed-credit')
    expect(credit?.textContent).toContain('CC BY 4.0')
    expect(credit?.textContent).not.toContain('案例出處')
    expect(credit?.querySelector('a')?.getAttribute('href')).toBe(`${window.location.origin}/posts/causal/lessons/02/`)
    // An embedded figure does not offer to embed itself again.
    fireEvent.click(screen.getByRole('button', { name: '下載圖片' }))
    expect(screen.queryByRole('button', { name: '複製嵌入碼' })).toBeNull()
  })
})
