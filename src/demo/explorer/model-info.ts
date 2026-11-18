import { caseIds, getCase } from '../../data/index.ts'
import { caseToDoc, docToCase } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { Value } from '../../engine/index.ts'
import { LESSON_MODELS } from '../lesson-models.ts'

/** Where the explorer's model comes from. `blank` is the editor's empty model. */
export type ModelSource =
  | { readonly kind: 'lesson'; readonly id: string }
  | { readonly kind: 'case'; readonly id: string }
  | { readonly kind: 'blank' }

/** A JSON object laid over the model document; a `null` value removes that key (e.g. `priors: null`). */
export type DocPatch = Readonly<Record<string, unknown>>

export interface VariableInfo {
  readonly id: string
  readonly name: string
  readonly exogenous: boolean
  /** The values a control offers: 0 and 1 for a boolean variable, else the domain's own. */
  readonly values: readonly Value[]
  readonly boolean: boolean
}

export interface ModelInfo {
  /** `values`: one actual context, a graph with values; `probability`: priors, a probability graph. */
  readonly kind: 'values' | 'probability'
  readonly variables: readonly VariableInfo[]
  readonly endogenous: readonly string[]
  readonly exogenous: readonly string[]
  /** Exogenous variables a slider can move: boolean or two-valued. */
  readonly sliderable: readonly string[]
  readonly hasNormality: boolean
  readonly hasDecision: boolean
  readonly hasPriors: boolean
}

export const LESSON_IDS: readonly string[] = Object.keys(LESSON_MODELS).sort()

export function sourceKey(source: ModelSource): string {
  return source.kind === 'blank' ? 'blank' : `${source.kind}:${source.id}`
}

/** `lesson:<id>`, `case:<id>` or `blank`; undefined when it names no model. */
export function parseSource(text: string): ModelSource | undefined {
  if (text === 'blank') return { kind: 'blank' }
  const [kind, ...rest] = text.split(':')
  const id = rest.join(':')
  if (kind === 'lesson' && LESSON_IDS.includes(id)) return { kind, id }
  if (kind === 'case' && caseIds.includes(id)) return { kind, id }
  return undefined
}

/** The model document of a lesson model or a bundled case, with the patch laid over it; undefined for `blank`. */
export function sourceDoc(source: ModelSource, patch?: DocPatch): ModelDoc | undefined {
  if (source.kind === 'blank') return undefined
  const base = source.kind === 'lesson' ? LESSON_MODELS[source.id] : caseToDoc(getCase(source.id))
  if (base === undefined || patch === undefined || Object.keys(patch).length === 0) return base
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else merged[key] = value
  }
  return merged as ModelDoc
}

/** What the figure components take for this model: a case id, or a document. */
export function sourceProps(source: ModelSource, patch?: DocPatch): { caseId: string } | { doc: ModelDoc } | undefined {
  if (source.kind === 'blank') return undefined
  const hasPatch = patch !== undefined && Object.keys(patch).length > 0
  if (source.kind === 'case' && !hasPatch) return { caseId: source.id }
  const doc = sourceDoc(source, patch)
  return doc === undefined ? undefined : { doc }
}

/** The source's variables and what its graph offers; undefined for `blank`, or when the (patched) model does not build. */
export function modelInfo(source: ModelSource, patch?: DocPatch): ModelInfo | undefined {
  if (source.kind === 'blank') return undefined
  try {
    const props = sourceProps(source, patch)
    if (props === undefined) return undefined
    const c = 'caseId' in props ? getCase(props.caseId) : docToCase(props.doc)
    const variables = c.model.variables.map((v): VariableInfo => {
      const boolean = v.domain.kind === 'boolean'
      return {
        id: v.id,
        name: v.label['zh-TW'],
        exogenous: v.kind === 'exogenous',
        boolean,
        values: v.domain.kind === 'boolean' ? [0, 1] : v.domain.values,
      }
    })
    const exogenous = variables.filter((v) => v.exogenous)
    return {
      kind: c.context === undefined ? 'probability' : 'values',
      variables,
      endogenous: variables.filter((v) => !v.exogenous).map((v) => v.id),
      exogenous: exogenous.map((v) => v.id),
      sliderable: exogenous.filter((v) => v.values.length === 2).map((v) => v.id),
      hasNormality: c.context !== undefined && c.normality !== undefined,
      hasDecision: c.decision !== undefined,
      hasPriors: c.prior !== undefined && c.context === undefined,
    }
  } catch {
    return undefined
  }
}

/** The five lesson models whose demo copy differs from the blog's copy; an `id=` snippet draws the blog's. */
export const BLOG_DIFFERS: readonly string[] = [
  'm02-pearl-model1',
  'm02-pearl-model2',
  'm05-frontdoor',
  'm06-bow-a',
  'm06-bow-b',
]
