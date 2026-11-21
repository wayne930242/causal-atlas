import type { Problem } from '../../engine/errors.ts'

/** What both message tables share: the author's names and the shapes of the parameterized messages. */

export const AUTHOR_ZH = '洪偉'
export const AUTHOR_EN = 'Wei Hung'

/** A problem the editor finds in what the user typed, before the model is built. */
export type DraftIssue =
  | { readonly code: 'id-invalid' }
  | { readonly code: 'id-reserved'; readonly id: string }
  | { readonly code: 'id-duplicate'; readonly id: string }
  | { readonly code: 'values-few' }
  | { readonly code: 'values-repeat' }
  | { readonly code: 'equation-empty' }
  | { readonly code: 'equation-parse'; readonly problem: Problem }
  | { readonly code: 'equation-invalid'; readonly problem: Problem }
  | { readonly code: 'value-not-in-domain'; readonly id: string; readonly value: string }
  | { readonly code: 'prior-range'; readonly id: string }
  | { readonly code: 'prior-weights'; readonly id: string }
  | { readonly code: 'normal-not-in-domain'; readonly id: string; readonly value: string }
  | { readonly code: 'cycle'; readonly cycle: readonly string[] }
  | { readonly code: 'model'; readonly problems: readonly Problem[] }

export type DraftWording = { readonly [K in DraftIssue['code']]: (issue: Extract<DraftIssue, { code: K }>) => string }

/** What a click on a node does: open its menu to observe or intervene, or to intervene only, or pick it into or out of a known set. */
export type NodeToggle = 'observeOrDo' | 'do' | 'pick'
