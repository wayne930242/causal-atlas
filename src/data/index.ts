import { caseFiles, fileId } from './cases.ts'
import type { LoadedCase } from './load.ts'
import { loadCase } from './load.ts'

export type { LoadedCase, VerdictCheck } from './load.ts'
export { buildCase, checkVerdict, describeVerdict, loadCase } from './load.ts'
export type { CaseFamily, CaseFile, CaseTheory, CaseVerdict, ModelDoc } from './schema.ts'
export { LOCALES, MODEL_DOC_FORMAT, caseSchema, localizedSchema, modelDocSchema } from './schema.ts'
export type { ImportResult } from './model-doc.ts'
export { caseToDoc, decodeShare, docToCase, encodeShare, parseModelJson, sameModel, schemaProblems, shareFromHash, tableToSource } from './model-doc.ts'
export { caseFiles, fileId }

const loaded = new Map<string, LoadedCase>()

/** Every bundled case, validated, in id order. */
export function listCases(): LoadedCase[] {
  return Object.keys(caseFiles)
    .map(fileId)
    .sort()
    .map((id) => getCase(id))
}

/** A bundled case by id. Throws when the id is unknown. */
export function getCase(id: string): LoadedCase {
  const cached = loaded.get(id)
  if (cached !== undefined) return cached
  const raw = caseFiles[`./cases/${id}.json`]
  if (raw === undefined) throw new Error(`unknown case ${id}`)
  const result = loadCase(raw)
  loaded.set(id, result)
  return result
}

export const caseIds: readonly string[] = Object.keys(caseFiles).map(fileId).sort()
