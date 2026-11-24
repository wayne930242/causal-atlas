import { caseFiles, fileId } from './cases.ts'
import { bundledCaseIds, isBundledCase, readyCase, rememberCase } from './case-store.ts'
import type { LoadedCase } from './load.ts'

export type { LoadedCase, VerdictCheck } from './load.ts'
export { buildCase, checkVerdict, decisionProblem, describeVerdict, loadCase } from './load.ts'
export type { CaseDecision, CaseFamily, CaseFile, CaseTheory, CaseVerdict, ModelDoc } from './schema.ts'
export { LOCALES, MODEL_DOC_FORMAT, caseSchema, localizedSchema, modelDocSchema } from './schema.ts'
export type { ImportResult } from './model-doc.ts'
export { caseToDoc, decodeShare, docToCase, encodeShare, parseModelJson, sameModel, schemaProblems, shareFromHash, tableToSource } from './model-doc.ts'
export { caseFiles, fileId }
export { preloadCase } from './case-store.ts'

/** Every bundled case, validated, in id order. */
export function listCases(): LoadedCase[] {
  return bundledCaseIds.map((id) => getCase(id))
}

/** A bundled case by id. Throws when the id is unknown. Shares its cache with the components, which then draw it without waiting. */
export function getCase(id: string): LoadedCase {
  const cached = isBundledCase(id) ? readyCase(id) : undefined
  if (cached !== undefined) return cached
  const raw = caseFiles[`./cases/${id}.json`]
  if (raw === undefined) throw new Error(`unknown case ${id}`)
  return rememberCase(id, raw)
}

export const caseIds: readonly string[] = bundledCaseIds
