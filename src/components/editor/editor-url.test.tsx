// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeShare } from '../../data/model-doc.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { formatDo, formatPdo, hashFragment, hashWith, parseDo, parsePdo, readHashState } from '../export/url-state.ts'
import { ModelEditor } from '../index.ts'
import { doNode } from '../test-menu.ts'

const setUrl = (url: string): void => window.history.replaceState(null, '', url)

beforeEach(() => setUrl('/blog/playground/'))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  setUrl('/')
})

/** Click an option of the sidebar's case list by its key. */
const pickKey = (key: string): void => {
  const el = document.querySelector<HTMLElement>(`.ca-editor-side [role="option"][data-key="${key}"]`)
  if (el === null) throw new Error(`no option ${key}`)
  fireEvent.click(el)
}

const caseShown = (): string | undefined =>
  document.querySelector<HTMLElement>('.ca-editor-case')?.dataset.case

/** Let the hash reading's promises and effects run. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

const coarse = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: '粗模型',
  model: {
    variables: [
      { id: 'U', label: { 'zh-TW': '想丟', en: 'Intends' }, kind: 'exogenous', domain: 'boolean' },
      { id: 'BS', label: { 'zh-TW': '瓶子破', en: 'Shatters' }, kind: 'endogenous', domain: 'boolean' },
    ],
    equations: { BS: 'U' },
  },
  context: { U: 1 },
})

describe('url-state', () => {
  it('reads case, model and do from a hash or a hash route', () => {
    expect(readHashState('#case=newcomb&do=ST:0,X:a%2Cb')).toEqual({
      caseId: 'newcomb',
      model: undefined,
      interventions: { ST: 0, X: 'a,b' },
      stochastic: {},
    })
    expect(readHashState('#/editor?lang=en&model=1.abc').model).toBe('1.abc')
    expect(parseDo(formatDo({ A: true, B: 'x:y', C: 2 }))).toEqual({ A: 1, B: 'x:y', C: 2 })
  })

  it('carries stochastic do() as pdo, apart from the hard interventions', () => {
    expect(hashFragment({ caseId: 'fork' }, { Y: true }, { Z: 0.3 })).toBe('case=fork&do=Y:1&pdo=Z:0.30')
    expect(hashFragment({ caseId: 'fork' }, {}, { Z: 0.3 })).toBe('case=fork&pdo=Z:0.30')
    expect(readHashState('#case=fork&pdo=Z:0.30,W:1,V:0,U:x')).toEqual({
      caseId: 'fork',
      model: undefined,
      interventions: {},
      stochastic: { Z: 0.3 },
    })
    expect(parsePdo(formatPdo({ A: 0.05, B: 0.95 }))).toEqual({ A: 0.05, B: 0.95 })
    expect(hashWith('#/editor?lang=en&case=a&pdo=Z:0.30', 'case=b')).toBe('#/editor?lang=en&case=b')
  })

  it('keeps a hash route and its other parameters', () => {
    expect(hashWith('#/editor?lang=en&case=a', 'model=1.x')).toBe('#/editor?lang=en&model=1.x')
    expect(hashWith('#section-2', 'case=a')).toBe('#case=a')
    expect(hashWith('', 'case=a')).toBe('#case=a')
  })
})

describe('ModelEditor address sync', () => {
  it('leaves the address alone on mount', () => {
    render(<ModelEditor />)
    expect(window.location.hash).toBe('')
  })

  it('picking a case writes #case=<id> without a history entry', () => {
    const before = window.history.length
    render(<ModelEditor />)
    pickKey('newcomb')
    expect(window.location.hash).toBe('#case=newcomb')
    expect(window.location.pathname).toBe('/blog/playground/')
    expect(window.history.length).toBe(before)
  })

  it('names a host model by its id', () => {
    render(<ModelEditor extraModels={[{ id: 'm08-coarse', title: '粗模型', doc: coarse }]} />)
    pickKey('model:m08-coarse')
    expect(window.location.hash).toBe('#case=m08-coarse')
  })

  it('an edit writes #model=… once the edits pause', async () => {
    vi.useFakeTimers()
    render(<ModelEditor initial="rock-throwing" />)
    fireEvent.change(screen.getByLabelText('模型名稱', { selector: 'input' }), { target: { value: '我的版本' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(window.location.hash).toBe('')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    // The timer has fired; compressing the model is real asynchronous work.
    vi.useRealTimers()
    await vi.waitFor(() => expect(window.location.hash).toMatch(/^#model=1\./))
  })

  it('an intervention on an unedited case adds &do=', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    const node = container.querySelector('.ca-graph [data-node="ST"]')
    if (node === null) throw new Error('no node ST')
    doNode(container, 'ST', '1')
    expect(window.location.hash).toBe('#case=rock-throwing&do=ST:1')
  })

  it('loads #case=newcomb, also under StrictMode', async () => {
    setUrl('/blog/playground/#case=newcomb')
    render(
      <StrictMode>
        <ModelEditor />
      </StrictMode>,
    )
    await settle()
    expect(caseShown()).toBe('newcomb')
    expect(window.location.hash).toBe('#case=newcomb')
  })

  it('loads a host model and do() from the address', async () => {
    setUrl('/#case=m08-coarse&do=BS:0')
    render(<ModelEditor extraModels={[{ id: 'm08-coarse', title: '粗模型', doc: coarse }]} />)
    await settle()
    expect((screen.getByLabelText('模型名稱', { selector: 'input' }) as HTMLInputElement).value).toBe('粗模型')
    expect(document.querySelector('.ca-graph [data-node="BS"]')?.getAttribute('data-intervened')).toBe('true')
  })

  it('an unknown id keeps the default without an error', async () => {
    setUrl('/#case=no-such-case')
    render(<ModelEditor />)
    await settle()
    expect(caseShown()).toBe('rock-throwing')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still loads #model= links', async () => {
    const value = await encodeShare(coarse)
    setUrl(`/#model=${value}`)
    render(<ModelEditor />)
    await vi.waitFor(() => expect((screen.getByLabelText('模型名稱', { selector: 'input' }) as HTMLInputElement).value).toBe('粗模型'))
    expect(window.location.hash).toBe(`#model=${value}`)
  })

  it('syncUrl={false} leaves the address alone', async () => {
    vi.useFakeTimers()
    render(<ModelEditor syncUrl={false} />)
    pickKey('newcomb')
    fireEvent.change(screen.getByLabelText('模型名稱', { selector: 'input' }), { target: { value: '我的版本' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(window.location.hash).toBe('')
  })

  it('a hash prop owns the address: read, never written', () => {
    render(<ModelEditor hash="#case=newcomb" />)
    expect(caseShown()).toBe('newcomb')
    pickKey('rock-throwing')
    expect(window.location.hash).toBe('')
  })
})
