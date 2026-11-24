import { isBundledCase } from '../../data/case-store.ts'
import type { ModelDoc } from '../../data/schema.ts'

/**
 * The bundled cases a figure draws: its `caseId`, and the case a document's `from` names (whose sources
 * the figure credits). Unknown ids are left out; the figure reports them itself.
 */
export function casesOf(caseId: string | undefined, docs: readonly (ModelDoc | string | undefined)[] = []): string[] {
  const ids: string[] = []
  if (isBundledCase(caseId)) ids.push(caseId)
  for (const d of docs) {
    const from = typeof d === 'string' ? d : typeof d === 'object' && d !== null ? (d as { readonly from?: unknown }).from : undefined
    if (isBundledCase(from)) ids.push(from)
  }
  return ids
}
