import type { ReactNode } from 'react'
import { use } from 'react'
import { casesPending } from '../../data/case-store.ts'

const READY: Promise<unknown> = Object.assign(Promise.resolve(undefined), { status: 'fulfilled' as const, value: undefined })

/**
 * Renders `children` once the bundled cases `ids` are loaded, suspending (as `React.lazy` does) while
 * one still loads. It adds no Suspense boundary of its own, so the markup is the same whether the case
 * was ready or not, and an error in the figure is not turned into a fallback:
 * - a server render under Node has every case preloaded (`#case-preload`) and never suspends;
 * - hydrating (an Astro island, which hydrates in a transition), React keeps the server's markup in
 *   place until the case arrives, then hydrates it, so the figure never blanks;
 * - a client render waits at the nearest Suspense boundary the host gives, or not at all after
 *   `await preloadCase(id)`.
 */
export function CaseGate({ ids, children }: { readonly ids: readonly string[]; readonly children: ReactNode }) {
  use(casesPending(ids) ?? READY)
  return children
}
