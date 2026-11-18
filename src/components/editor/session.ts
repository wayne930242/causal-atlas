import { caseIds, getCase } from '../../data/index.ts'
import { schemaProblems } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import type { Assignment, Problem } from '../../engine/index.ts'
import type { Messages } from '../i18n/messages.ts'
import type { DoState } from '../model/model-state.ts'
import type { ExtraModel } from './catalog.ts'
import { NO_DO, NO_OBSERVATION } from './do-state.ts'
import type { Draft } from './draft.ts'
import { blankDraft, draftFromCase, draftFromImport } from './draft.ts'

/**
 * The editor's session: the draft on screen, where it came from, and what is set on it. Every way
 * of putting a new model on screen is one action, so the fields that belong together change together.
 */

/** A model to put on screen: its draft, the problems of the document it came from, the extra model, and its `#case=` id. */
export interface Start {
  readonly draft: Draft
  readonly problems: readonly Problem[]
  /** The extra model it started from. */
  readonly picked?: string
  /** The `#case=` id that names this draft while it is unedited; none for a document. */
  readonly named?: string
}

/** A draft from a host model's document; an invalid document gives a blank draft and its problems. */
export function startFromDoc(doc: ModelDoc, t: Messages, picked?: string): Start {
  const parsed = modelDocSchema.safeParse(doc, { reportInput: true })
  if (parsed.success) return { draft: draftFromImport(parsed.data), problems: [], picked, named: picked }
  return { draft: blankDraft(t.editor.defaultTitle), problems: schemaProblems(parsed.error), picked, named: picked }
}

/** A bundled case, an extra model, or `blank` (also for an id that is neither). */
export function startNamed(id: string, t: Messages, extras: readonly ExtraModel[]): Start {
  const extra = caseIds.includes(id) ? undefined : extras.find((m) => m.id === id)
  if (extra !== undefined) return startFromDoc(extra.doc, t, extra.id)
  const known = id !== 'blank' && caseIds.includes(id)
  return { draft: startFromCase(id, t), problems: [], named: known ? id : 'blank' }
}

export function startDraft(initial: string, t: Messages, extras: readonly ExtraModel[], initialDoc?: ModelDoc): Start {
  if (initialDoc !== undefined) return { ...startFromDoc(initialDoc, t), named: undefined }
  return startNamed(initial, t, extras)
}

/** Whether `#case=<id>` names something the editor can show. */
export const knownName = (id: string, extras: readonly ExtraModel[]): boolean =>
  id === 'blank' || caseIds.includes(id) || extras.some((m) => m.id === id)

/** A bundled case's draft, or a blank one for `blank` and any other id. */
function startFromCase(initial: string, t: Messages): Draft {
  if (initial === 'blank' || !caseIds.includes(initial)) return blankDraft(t.editor.defaultTitle)
  return draftFromCase(getCase(initial), t.locale)
}

export interface Session {
  readonly draft: Draft
  /** The extra model on screen, if one was chosen; any other way of replacing the draft clears it. */
  readonly picked?: string
  /** Problems of the document the editor started from or the extra model chosen. */
  readonly docProblems: readonly Problem[]
  readonly doState: DoState
  /** Observations are not written to the address: they last while the model is edited, as long as they still fit it. */
  readonly observed: Assignment
  /**
   * The draft as a case or extra model was loaded, and its id: while the draft is still this very
   * object, the address names the id instead of encoding the model.
   */
  readonly base?: { readonly draft: Draft; readonly id: string }
  /** What reading the share link went wrong with; worded at render, so it follows the language. */
  readonly loadErrors: readonly unknown[]
}

export type SessionAction =
  /** A model read from the address, with its do(): also clears what went wrong reading an earlier one. */
  | { readonly type: 'show'; readonly start: Start; readonly doState: DoState }
  /** A case or extra model chosen from the list (or a task's start). */
  | { readonly type: 'pick'; readonly start: Start }
  /** An imported document's draft: no longer a case or extra model. */
  | { readonly type: 'replace'; readonly draft: Draft }
  /** An edit of the draft; returning the same draft changes nothing. */
  | { readonly type: 'edit'; readonly edit: (draft: Draft) => Draft }
  | { readonly type: 'setDo'; readonly doState: DoState }
  | { readonly type: 'observe'; readonly observed: Assignment }
  | { readonly type: 'loadFailed'; readonly errors: readonly unknown[] }

function baseOf(start: Start): Session['base'] {
  return start.named === undefined ? undefined : { draft: start.draft, id: start.named }
}

export function startSession(start: Start): Session {
  return { draft: start.draft, picked: start.picked, docProblems: start.problems, doState: NO_DO, observed: NO_OBSERVATION, base: baseOf(start), loadErrors: [] }
}

export function sessionReducer(s: Session, a: SessionAction): Session {
  switch (a.type) {
    case 'show':
      return { draft: a.start.draft, picked: a.start.picked, docProblems: a.start.problems, doState: a.doState, observed: NO_OBSERVATION, base: baseOf(a.start), loadErrors: [] }
    case 'pick':
      return { ...s, draft: a.start.draft, picked: a.start.picked, docProblems: a.start.problems, doState: NO_DO, observed: NO_OBSERVATION, base: baseOf(a.start) }
    case 'replace':
      return { ...s, draft: a.draft, picked: undefined, docProblems: [], doState: NO_DO, observed: NO_OBSERVATION, base: undefined }
    case 'edit': {
      const draft = a.edit(s.draft)
      return draft === s.draft ? s : { ...s, draft }
    }
    case 'setDo':
      return a.doState === s.doState ? s : { ...s, doState: a.doState }
    case 'observe':
      return a.observed === s.observed ? s : { ...s, observed: a.observed }
    case 'loadFailed':
      return { ...s, loadErrors: a.errors }
  }
}
