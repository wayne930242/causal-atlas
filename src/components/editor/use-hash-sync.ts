import type { Dispatch } from 'react'
import { useEffect, useRef } from 'react'
import { decodeShare, encodeShare } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { Messages } from '../i18n/messages.ts'
import type { DoState } from '../model/model-state.ts'
import type { ExtraModel } from './catalog.ts'
import type { Draft } from './draft.ts'
import { draftFromImport } from './draft.ts'
import type { Session, SessionAction, Start } from './session.ts'
import { knownName, startNamed } from './session.ts'
import { hashFragment, readHashState, replaceHash } from './url-state.ts'

/** How long the address waits after the last edit before it is rewritten. */
const URL_DEBOUNCE_MS = 400

export interface HashSyncOptions {
  /** `ModelEditor`'s `syncUrl`: the editor writes the address only when it is on and no `hash` is given. */
  readonly syncUrl: boolean
  /** `ModelEditor`'s `hash`: read instead of the page's address, which is then never written. */
  readonly hash?: string
  /** The draft the editor started with (the address already shows it). */
  readonly start: Draft
  readonly draft: Draft
  readonly doState: DoState
  readonly base: Session['base']
  /** The draft as a document, while it builds. */
  readonly doc?: ModelDoc
  readonly t: Messages
  readonly extraModels: readonly ExtraModel[]
  readonly dispatch: Dispatch<SessionAction>
}

/**
 * Keeps the address and the editor in step: reads `#case=`/`#model=` (with `do=`, `pdo=`) on mount,
 * from `hash` when given, and on hashchange while the editor owns the address; writes a name at
 * once and an encoded model once the edits pause.
 */
export function useHashSync({ syncUrl, hash, start, draft, doState, base, doc, t, extraModels, dispatch }: HashSyncOptions): void {
  // The state the address already shows: changes to anything else rewrite it.
  const synced = useRef<{ draft: Draft; doState: DoState }>({ draft: start, doState })
  // The state the writing effect last ran with: only a change is written, so a re-run of the
  // effect with the state of an earlier render (Strict Mode on mount) never rewrites the address.
  const seen = useRef<{ draft: Draft; doState: DoState }>({ draft: start, doState })
  const ownsUrl = syncUrl && hash === undefined

  // Write the address: a name at once, an encoded model once the edits pause. It acts on a new
  // draft or new interventions only; `base` and the document change with the draft.
  useEffect(() => {
    const changed = draft !== seen.current.draft || doState !== seen.current.doState
    seen.current = { draft, doState }
    if (!ownsUrl || !changed) return
    if (draft === synced.current.draft && doState === synced.current.doState) return
    if (base !== undefined && draft === base.draft) {
      synced.current = { draft, doState }
      replaceHash(hashFragment({ caseId: base.id }, doState.interventions, doState.stochastic))
      return
    }
    // A draft with errors leaves the address at the last model that built.
    if (doc === undefined) return
    let live = true
    const timer = window.setTimeout(() => {
      encodeShare(doc)
        .then((model) => {
          if (!live) return
          synced.current = { draft, doState }
          replaceHash(hashFragment({ model }, doState.interventions, doState.stochastic))
        })
        .catch(() => {
          // too large to share: the address keeps the last model it could carry
        })
    }, URL_DEBOUNCE_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [ownsUrl, draft, doState, base, doc])

  // What reading the address needs, without re-reading it when a host passes new arrays.
  const reading = useRef({ t, extraModels })
  useEffect(() => {
    reading.current = { t, extraModels }
  }, [t, extraModels])

  // Read the address: on mount, from `hash` when given, and on hashchange while the editor owns it.
  // `dispatch` never changes, so the address is read again only for a new `hash` or owner.
  useEffect(() => {
    let live = true
    const showNamed = (next: Start, doNext: DoState): void => {
      dispatch({ type: 'show', start: next, doState: doNext })
      synced.current = { draft: next.draft, doState: doNext }
    }
    const read = (text: string): void => {
      const wanted = readHashState(text)
      if (wanted.model !== undefined) {
        decodeShare(wanted.model)
          .then((result) => {
            if (!live) return
            if (result.ok) {
              const next = draftFromImport(result.doc)
              showNamed({ draft: next, problems: [] }, { interventions: wanted.interventions, stochastic: wanted.stochastic })
            } else dispatch({ type: 'loadFailed', errors: result.errors.map((p) => ({ problem: p })) })
          })
          .catch((error: unknown) => {
            if (live) dispatch({ type: 'loadFailed', errors: [error] })
          })
        return
      }
      // An unknown id keeps what is on screen.
      const { t: now, extraModels: extras } = reading.current
      if (wanted.caseId !== undefined && knownName(wanted.caseId, extras)) {
        showNamed(startNamed(wanted.caseId, now, extras), { interventions: wanted.interventions, stochastic: wanted.stochastic })
      }
    }
    if (hash !== undefined) read(hash)
    else if (typeof window !== 'undefined') read(window.location.hash)
    const onHashChange = (): void => read(window.location.hash)
    if (ownsUrl) window.addEventListener('hashchange', onHashChange)
    return () => {
      live = false
      if (ownsUrl) window.removeEventListener('hashchange', onHashChange)
    }
  }, [hash, ownsUrl, dispatch])
}
