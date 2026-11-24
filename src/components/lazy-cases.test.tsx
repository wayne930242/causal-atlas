// @vitest-environment jsdom
// The browser build loads a case on demand (no `#case-preload`); the server build has every case ready.
// These tests take the server's markup from a store with every case preloaded, then hydrate it with a
// fresh store that has none, as an Astro island does in the browser.
import type { ReactNode } from 'react'
import { Suspense, createElement, startTransition } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Components = typeof import('./index.ts')
type Store = typeof import('../data/case-store.ts')

/** The components and case store as the server build has them: every case preloaded. */
async function serverBuild(): Promise<{ components: Components; store: Store }> {
  vi.resetModules()
  vi.doUnmock('../data/case-preload.ts')
  return { components: await import('./index.ts'), store: await import('../data/case-store.ts') }
}

/** The components and case store as the browser build has them: nothing preloaded. */
async function browserBuild(): Promise<{ components: Components; store: Store }> {
  vi.resetModules()
  vi.doMock('../data/case-preload.ts', () => ({ preloadedCaseFiles: undefined }))
  return { components: await import('./index.ts'), store: await import('../data/case-store.ts') }
}

/** Whether React has hydrated `host`'s markup (attached its fiber to the first element). */
const hydrated = (host: HTMLElement): boolean => Object.keys(host.firstElementChild ?? {}).some((k) => k.startsWith('__reactFiber'))

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const held: string[] = []

/** Hold back the case files `ids` until the returned release is called, so a test sees the wait itself. */
function holdCases(ids: readonly string[]): () => void {
  let release = (): void => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  for (const id of ids) {
    const path = `../data/cases/${id}.json`
    held.push(path)
    vi.doMock(path, async (importOriginal) => {
      await gate
      return importOriginal()
    })
  }
  return release
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.doUnmock('../data/case-preload.ts')
  for (const path of held.splice(0)) vi.doUnmock(path)
})

describe('case store in the browser build', () => {
  it('loads one case on request and keeps it', async () => {
    const { store } = await browserBuild()
    expect(store.bundledCaseIds).toContain('rock-throwing')
    expect(store.readyCase('rock-throwing')).toBeUndefined()
    expect(() => store.requireCase('rock-throwing')).toThrow(/not loaded yet/)
    expect(() => store.requireCase('no-such-case')).toThrow('unknown case no-such-case')
    const pending = store.casesPending(['rock-throwing'])
    expect(pending).toBeDefined()
    expect(store.casesPending(['rock-throwing'])).toBe(pending)
    const c = await store.preloadCase('rock-throwing')
    expect(c.data.id).toBe('rock-throwing')
    expect(store.readyCase('rock-throwing')).toBe(c)
    expect(store.readyCase('firing-squad')).toBeUndefined()
    expect(store.casesPending(['rock-throwing', 'no-such-case'])).toBeUndefined()
    await expect(store.preloadCase('no-such-case')).rejects.toThrow('unknown case no-such-case')
  })

  it('waits for every case a figure draws, as one stable promise', async () => {
    const { store } = await browserBuild()
    const both = store.casesPending(['firing-squad', 'rock-throwing'])
    expect(store.casesPending(['rock-throwing', 'firing-squad'])).toBe(both)
    await both
    expect(store.readyCase('firing-squad')?.data.id).toBe('firing-squad')
    expect(store.readyCase('rock-throwing')?.data.id).toBe('rock-throwing')
  })
})

describe('hydrating server markup before the case has loaded', () => {
  const figures: readonly [string, (c: Components) => ReactNode][] = [
    ['CausalPlayground', (c) => createElement(c.CausalPlayground, { caseId: 'rock-throwing' })],
    ['ProbabilityPanel', (c) => createElement(c.ProbabilityPanel, { caseId: 'smoking-lesion', view: 'compare' })],
    ['WorldLanes', (c) => createElement(c.WorldLanes, { caseId: 'rock-throwing', interventions: { SH: 0 } })],
    ['CasePage', (c) => createElement(c.CasePage, { caseId: 'rock-throwing', initialStep: 3 })],
    ['IdentifyPanel', (c) => createElement(c.IdentifyPanel, { caseId: 'smoking-lesion' })],
    ['ConservativeExtension', (c) => createElement(c.ConservativeExtension, { models: ['rock-throwing', 'rock-throwing'] })],
  ]

  it.each(figures)('keeps the server markup of %s, then hydrates it without a mismatch', async (_, figure) => {
    const server = await serverBuild()
    const html = renderToString(figure(server.components))
    expect(html).toContain('ca-root')

    const browser = await browserBuild()
    const release = holdCases(['rock-throwing', 'smoking-lesion'])
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    const markup = host.innerHTML
    const errors: unknown[] = []
    // Astro hydrates an island in a transition.
    startTransition(() => {
      hydrateRoot(host, figure(browser.components), { onRecoverableError: (e) => errors.push(e) })
    })
    await tick()
    expect(host.innerHTML === markup).toBe(true)
    expect(hydrated(host)).toBe(false)

    release()
    await vi.waitFor(() => expect(hydrated(host)).toBe(true))
    expect(errors).toEqual([])
    expect(host.innerHTML === markup).toBe(true)
  })

  it('a hydration outside a transition keeps the markup too', async () => {
    const server = await serverBuild()
    const html = renderToString(createElement(server.components.CausalPlayground, { caseId: 'firing-squad' }))
    const browser = await browserBuild()
    const release = holdCases(['firing-squad'])
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    const markup = host.innerHTML
    const errors: unknown[] = []
    hydrateRoot(host, createElement(browser.components.CausalPlayground, { caseId: 'firing-squad' }), { onRecoverableError: (e) => errors.push(e) })
    await tick()
    expect(host.innerHTML === markup).toBe(true)
    expect(hydrated(host)).toBe(false)
    release()
    await vi.waitFor(() => expect(hydrated(host)).toBe(true))
    expect(browser.store.readyCase('firing-squad')?.data.id).toBe('firing-squad')
    expect(errors).toEqual([])
    expect(host.innerHTML === markup).toBe(true)
  })
})

describe('a client-only render', () => {
  it('waits at the host Suspense boundary, then draws the case', async () => {
    const { components } = await browserBuild()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(createElement(Suspense, { fallback: createElement('p', { id: 'wait' }) }, createElement(components.CausalPlayground, { caseId: 'bogus-prevention' })))
    await vi.waitFor(() => expect(host.querySelector('#wait')).not.toBeNull())
    await vi.waitFor(() => expect(host.querySelector('.ca-graph')).not.toBeNull())
    root.unmount()
  })

  it('draws at once after preloadCase', async () => {
    const { components } = await browserBuild()
    await components.preloadCase('sharks')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(createElement(Suspense, { fallback: createElement('p', { id: 'wait' }) }, createElement(components.CausalPlayground, { caseId: 'sharks' })))
    await vi.waitFor(() => expect(host.querySelector('.ca-graph')).not.toBeNull())
    expect(host.querySelector('#wait')).toBeNull()
    root.unmount()
  })
})
