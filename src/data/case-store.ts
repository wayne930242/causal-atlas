import { fileId } from './case-id.ts'
import { preloadedCaseFiles } from './case-preload.ts'
import type { LoadedCase } from './load.ts'
import { loadCase } from './load.ts'

/**
 * The bundled cases, one at a time. Each case file is its own chunk, imported on first request, so a
 * page drawing one case downloads that case alone. Where `#case-preload` resolves to every case file (a
 * server render under Node), each case is ready synchronously and nothing waits.
 */
const importers = import.meta.glob<unknown>('./cases/*.json', { import: 'default' })
const preloaded: Readonly<Record<string, unknown>> | undefined = preloadedCaseFiles

/** Every bundled case id, in order; known without loading any case. */
export const bundledCaseIds: readonly string[] = Object.keys(importers).map(fileId).sort()

const known = new Set(bundledCaseIds)
const ready = new Map<string, LoadedCase>()

/** A promise React's `use` reads without suspending (it checks `status` first). */
type Tracked<T> = Promise<T> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: T; reason?: unknown }
const requests = new Map<string, Tracked<unknown>>()

function track<T>(promise: Promise<T>): Tracked<T> {
  const tracked: Tracked<T> = promise
  tracked.status = 'pending'
  promise.then(
    (value) => {
      tracked.status = 'fulfilled'
      tracked.value = value
    },
    (reason: unknown) => {
      tracked.status = 'rejected'
      tracked.reason = reason
    },
  )
  return tracked
}

function settled<T>(value: T): Tracked<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value })
}

function pathOf(id: string): string {
  return `./cases/${id}.json`
}

/** Whether `id` names a bundled case. */
export function isBundledCase(id: unknown): id is string {
  return typeof id === 'string' && known.has(id)
}

/** Validate a bundled case's raw file once and keep the result. */
export function rememberCase(id: string, raw: unknown): LoadedCase {
  const cached = ready.get(id)
  if (cached !== undefined) return cached
  const loaded = loadCase(raw)
  ready.set(id, loaded)
  return loaded
}

/** A bundled case if it is already loaded (or preloaded); undefined while it still has to load. */
export function readyCase(id: string): LoadedCase | undefined {
  const cached = ready.get(id)
  if (cached !== undefined) return cached
  const raw = preloaded?.[pathOf(id)]
  return raw === undefined ? undefined : rememberCase(id, raw)
}

/** A bundled case that must be ready now. Throws for an unknown id, and for one not loaded yet. */
export function requireCase(id: string): LoadedCase {
  const c = isBundledCase(id) ? readyCase(id) : undefined
  if (c !== undefined) return c
  if (!isBundledCase(id)) throw new Error(`unknown case ${id}`)
  throw new Error(`case ${id} is not loaded yet; await preloadCase('${id}') before rendering it outside a component`)
}

/**
 * Load a bundled case (its own chunk) and keep it, so a component given its id renders without
 * waiting. Resolves at once when the case is already loaded; rejects for an unknown id.
 */
export function preloadCase(id: string): Promise<LoadedCase> {
  const c = isBundledCase(id) ? readyCase(id) : undefined
  if (c !== undefined) return settled(c)
  const existing = requests.get(id) as Tracked<LoadedCase> | undefined
  if (existing !== undefined) return existing
  const importer = importers[pathOf(id)]
  const request = track(importer === undefined ? Promise.reject(new Error(`unknown case ${id}`)) : importer().then((raw) => rememberCase(id, raw)))
  requests.set(id, request)
  return request
}

const groups = new Map<string, Tracked<unknown>>()

/**
 * What a component drawing `ids` must wait for: undefined when every bundled one is ready (unknown ids
 * are left to the component, which reports them), else one stable promise for the rest.
 */
export function casesPending(ids: readonly string[]): Promise<unknown> | undefined {
  const missing = [...new Set(ids)].filter((id) => isBundledCase(id) && readyCase(id) === undefined).sort()
  if (missing.length === 0) return undefined
  if (missing.length === 1) return preloadCase(missing[0])
  const key = missing.join('\n')
  const existing = groups.get(key)
  if (existing !== undefined) return existing
  const group = track(Promise.all(missing.map(preloadCase)))
  groups.set(key, group)
  return group
}
