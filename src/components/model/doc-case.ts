import { useMemo } from 'react'
import { isBundledCase, requireCase } from '../../data/case-store.ts'
import type { LoadedCase } from '../../data/load.ts'
import { caseToDoc, docToCase, sameModel, schemaProblems } from '../../data/model-doc.ts'
import type { CaseFile, ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import type { Problem } from '../../engine/index.ts'
import { problem, problemOf } from '../../engine/index.ts'

/**
 * The bundled case a document may credit: `from` names one and the model is that case's model
 * (`sameModel`). Anything else is the author's own and carries no case origin.
 */
export function creditedFrom(doc: ModelDoc): string | undefined {
  return isBundledCase(doc.from) && sameModel(doc, caseToDoc(requireCase(doc.from))) ? doc.from : undefined
}

/** The sources an exported image credits for a document: the bundled case's, or none. */
export function docOrigin(doc: ModelDoc): CaseFile['sources'] | undefined {
  const from = creditedFrom(doc)
  return from === undefined ? undefined : requireCase(from).data.sources
}

export type DocCase = { readonly ok: true; readonly c: LoadedCase } | { readonly ok: false; readonly problems: readonly Problem[] }

/** A document as the case the components draw; never throws: a bad document comes back as its problems. */
export function resolveDoc(doc: ModelDoc): DocCase {
  const parsed = modelDocSchema.safeParse(doc, { reportInput: true })
  if (!parsed.success) return { ok: false, problems: schemaProblems(parsed.error) }
  try {
    return { ok: true, c: docToCase(parsed.data, docOrigin(parsed.data)) }
  } catch (error) {
    return {
      ok: false,
      problems: [problemOf(error) ?? problem('schema', { message: { 'zh-TW': String(error), en: String(error) } })],
    }
  }
}

/** The case to draw for a bundled case id or a document: resolved once per input, never throws on a bad document. */
export function useCaseOrDoc(caseId: string | undefined, doc: ModelDoc | undefined): DocCase {
  return useMemo((): DocCase => {
    if (doc !== undefined) return resolveDoc(doc)
    if (caseId === undefined) throw new Error('pass a caseId or a doc')
    return { ok: true, c: requireCase(caseId) }
  }, [caseId, doc])
}
