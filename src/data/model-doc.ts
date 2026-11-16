import type { Value } from '../engine/index.ts'
import { ModelError } from '../engine/index.ts'
import type { LoadedCase } from './load.ts'
import { buildCase } from './load.ts'
import type { CaseFile, ModelDoc } from './schema.ts'
import { MODEL_DOC_FORMAT, caseSchema, modelDocSchema } from './schema.ts'

/** Model documents: what the editor saves, shares and imports. */

type TableEquation = Exclude<CaseFile['model']['equations'][string], string>

function literal(value: Value): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  return `'${value}'`
}

/**
 * A lookup table written in the compact syntax: `if A=1 and B='x' then 'y' else if … else z`.
 * Without a default, the last row's value closes the chain (the tables cover every input).
 */
export function tableToSource(table: TableEquation['table']): string {
  const { inputs, rows } = table
  const parts = rows.map((row) => {
    const when = inputs.map((id, i) => `${id}=${literal(row[i])}`).join(' and ')
    return { when, value: literal(row[row.length - 1]) }
  })
  const last = table.default === undefined ? parts.pop() : undefined
  const tail = table.default !== undefined ? literal(table.default) : (last?.value ?? '0')
  return parts.reduceRight((rest, p) => `if ${p.when} then ${p.value} else ${rest}`, tail)
}

/** A bundled case as a model document, tables written out as equations. */
export function caseToDoc(c: LoadedCase): ModelDoc {
  const { data } = c
  const equations: Record<string, string> = {}
  for (const [id, eq] of Object.entries(data.model.equations)) {
    equations[id] = typeof eq === 'string' ? eq : tableToSource(eq.table)
  }
  return modelDocSchema.parse({
    format: MODEL_DOC_FORMAT,
    version: 1,
    title: data.title.zh,
    from: data.id,
    model: { variables: data.model.variables, equations },
    context: data.context,
    priors: data.context === undefined ? data.priors : undefined,
    normality: data.normality,
    layout: data.layout,
  })
}

/** Turn a document into the engine objects the components draw. Throws ModelError on a bad model. */
export function docToCase(doc: ModelDoc, origin?: CaseFile['sources']): LoadedCase {
  return buildCase({
    id: 'my-model',
    title: { zh: doc.title, en: doc.title },
    family: 'actual',
    story_zh: doc.title,
    explanation_zh: doc.title,
    sources: origin ?? [],
    model: doc.model,
    context: doc.context,
    priors: doc.context === undefined ? doc.priors : undefined,
    normality: doc.normality,
    verdicts: [],
    showcase: [],
    layout: doc.layout,
  })
}

/** A share link's value may be this long (characters, after the version prefix). */
export const MAX_SHARE_CHARS = 65_536

/** A document may be this long as JSON text, pasted, uploaded or inflated from a share link. */
export const MAX_DOC_CHARS = 1_048_576

const TOO_LARGE = '資料過大'

export type ImportResult = { readonly ok: true; readonly doc: ModelDoc } | { readonly ok: false; readonly errors: readonly string[] }

function issueLines(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map((i) => `${i.path.map(String).join('.') || '（根）'}：${i.message}`)
}

function errorLines(error: unknown): string[] {
  if (typeof error === 'object' && error !== null && 'issues' in error && Array.isArray(error.issues)) {
    return issueLines(error as { issues: { path: PropertyKey[]; message: string }[] })
  }
  return [error instanceof Error ? error.message : String(error)]
}

/**
 * Parse pasted or uploaded JSON: a model document, or a whole case file used as a starting point.
 * Never throws: whatever is wrong comes back as `errors`.
 */
export function parseModelJson(text: string): ImportResult {
  if (text.length > MAX_DOC_CHARS) return { ok: false, errors: [TOO_LARGE] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [`不是 JSON：${(error as Error).message}`] }
  }
  const asDoc = modelDocSchema.safeParse(raw)
  if (asDoc.success) return checkBuilds(asDoc.data)
  if (typeof raw === 'object' && raw !== null && 'story_zh' in raw) {
    const asCase = caseSchema.safeParse(raw)
    if (!asCase.success) return { ok: false, errors: issueLines(asCase.error) }
    try {
      return checkBuilds(caseToDoc(buildCase(asCase.data)))
    } catch (error) {
      return { ok: false, errors: errorLines(error) }
    }
  }
  return { ok: false, errors: issueLines(asDoc.error) }
}

function checkBuilds(doc: ModelDoc): ImportResult {
  try {
    docToCase(doc)
    return { ok: true, doc }
  } catch (error) {
    return { ok: false, errors: errorLines(error) }
  }
}

// ---- share links: `1.` + base64url(deflate-raw(JSON)) ----

const SHARE_VERSION = '1'

/** Pipe bytes through a (de)compression stream; throws ModelError(資料過大) once the output passes `limit`. */
async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  void writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => undefined)
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    if (size > limit) {
      void reader.cancel().catch(() => undefined)
      throw new ModelError(TOO_LARGE)
    }
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
}

/** The hash value for a share link, e.g. `1.q1YqT…`. */
export async function encodeShare(doc: ModelDoc): Promise<string> {
  const valid = modelDocSchema.parse(doc)
  const json = JSON.stringify(valid)
  if (json.length > MAX_DOC_CHARS) throw new ModelError(TOO_LARGE)
  const packed = await through(new TextEncoder().encode(json), new CompressionStream('deflate-raw'), MAX_SHARE_CHARS)
  return `${SHARE_VERSION}.${toBase64Url(packed)}`
}

/** Read a share value back; rejects unknown versions, damaged data and invalid models. */
export async function decodeShare(value: string): Promise<ImportResult> {
  const dot = value.indexOf('.')
  const version = dot < 0 ? '' : value.slice(0, dot)
  if (version !== SHARE_VERSION) return { ok: false, errors: [`分享連結的版本 ${version || '（無）'} 不支援`] }
  if (value.length > MAX_SHARE_CHARS) return { ok: false, errors: [TOO_LARGE] }
  let text: string
  try {
    text = new TextDecoder().decode(
      await through(fromBase64Url(value.slice(dot + 1)), new DecompressionStream('deflate-raw'), MAX_DOC_CHARS),
    )
  } catch (error) {
    return { ok: false, errors: [error instanceof ModelError ? error.message : '分享連結的資料損壞'] }
  }
  return parseModelJson(text)
}

/** The share value inside a URL hash: `#model=…` or `#/route?model=…`. */
export function shareFromHash(hash: string): string | undefined {
  const m = /[#?&]model=([^&]+)/.exec(hash)
  if (m === null) return undefined
  try {
    return decodeURIComponent(m[1])
  } catch {
    // A malformed escape: hand it on as it is; decodeShare then reports damaged data.
    return m[1]
  }
}
