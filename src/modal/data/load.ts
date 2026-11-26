import type { z } from 'zod'
import zhTW from 'zod/v4/locales/zh-TW.js'
import type { Locale } from '../../engine/types.ts'
import type { ModalProblem } from '../engine/errors.ts'
import { modalProblem, modalProblemOf } from '../engine/errors.ts'
import type { Formula } from '../engine/formula.ts'
import { isAtomId, isTruthFunctional, parseFormula } from '../engine/formula.ts'
import type { Frame, ModalModel } from '../engine/model.ts'
import { checkSystem, frameOf, kripkeModel, sphereModel } from '../engine/model.ts'
import { formulaText } from '../engine/print.ts'
import type { Similarity } from '../engine/similarity.ts'
import { withSimilaritySpheres } from '../engine/similarity.ts'
import { equationOrder } from '../engine/surgery.ts'
import type { FrameDoc, KripkeDoc, ModalDoc, ModalText, SpheresDoc } from './schema.ts'
import { modalDocSchema } from './schema.ts'

/** The most worlds a document may draw. */
export const MAX_DOC_WORLDS = 12

/** The longest JSON text `parseModalJson` reads. */
export const MAX_MODAL_DOC_CHARS = 200_000

export type ModalImportResult = { readonly ok: true; readonly doc: ModalDoc } | { readonly ok: false; readonly errors: readonly ModalProblem[] }

const zhIssue = zhTW().localeError

function schemaProblems(error: { readonly issues: readonly z.core.$ZodIssue[] }): ModalProblem[] {
  return error.issues.map((issue) => {
    const zh = zhIssue(issue as unknown as z.core.$ZodRawIssue)
    const zhText = typeof zh === 'string' ? zh : (zh?.message ?? issue.message)
    return modalProblem('schema', { message: { 'zh-TW': zhText, en: issue.message } }, issue.path.map(String).join('.'))
  })
}

/** Runs `f`; one of our errors comes back as a problem at `where`. */
function attempt(problems: ModalProblem[], where: string, f: () => void): void {
  try {
    f()
  } catch (error) {
    const p = modalProblemOf(error)
    if (p === undefined) throw error
    problems.push({ ...p, where })
  }
}

function parseInto(problems: ModalProblem[], where: string, text: string, truthFunctional = false): void {
  attempt(problems, where, () => {
    const f = parseFormula(text)
    if (truthFunctional && !isTruthFunctional(f)) problems.push(modalProblem('not-truth-functional', { formula: formulaText(f) }, where))
  })
}

/** Everything the schema cannot say: known and unique ids, nesting and centring, formulas that parse. */
export function checkModalDoc(doc: ModalDoc): ModalProblem[] {
  const problems: ModalProblem[] = []
  const worlds = doc.worlds.map((w) => w.id)
  if (worlds.length > MAX_DOC_WORLDS) problems.push(modalProblem('too-many-worlds', { count: worlds.length, limit: MAX_DOC_WORLDS }, 'worlds'))
  const seen = new Set<string>()
  doc.worlds.forEach((w, i) => {
    if (seen.has(w.id)) problems.push(modalProblem('duplicate-world', { world: w.id }, `worlds.${i}.id`))
    seen.add(w.id)
    if (doc.kind !== 'spheres' && doc.layout === 'manual' && w.pos === undefined) problems.push(modalProblem('missing-position', { world: w.id }, `worlds.${i}.pos`))
  })
  const knownWorld = (w: string, where: string): void => {
    if (!seen.has(w)) problems.push(modalProblem('unknown-world', { world: w }, where))
  }
  if (doc.kind !== 'frame') {
    const atoms = new Set<string>()
    doc.atoms.forEach((a, i) => {
      if (!isAtomId(a.id)) problems.push(modalProblem('reserved-atom', { atom: a.id }, `atoms.${i}.id`))
      if (atoms.has(a.id)) problems.push(modalProblem('duplicate-atom', { atom: a.id }, `atoms.${i}.id`))
      atoms.add(a.id)
    })
    doc.worlds.forEach((w, i) => {
      w.true.forEach((a, k) => {
        if (!atoms.has(a)) problems.push(modalProblem('unknown-atom', { atom: a }, `worlds.${i}.true.${k}`))
      })
    })
    doc.formulas?.forEach((text, i) => parseInto(problems, `formulas.${i}`, text))
  }
  if (doc.kind === 'kripke' || doc.kind === 'frame') {
    doc.access.forEach(([a, b], i) => {
      knownWorld(a, `access.${i}.0`)
      knownWorld(b, `access.${i}.1`)
    })
    if (doc.actual !== undefined) knownWorld(doc.actual, 'actual')
    return problems
  }
  checkSpheres(doc, worlds, problems, knownWorld)
  return problems
}

function checkSpheres(doc: SpheresDoc, worlds: readonly string[], problems: ModalProblem[], knownWorld: (w: string, where: string) => void): void {
  const sources = [doc.spheres !== undefined, doc.systems !== undefined, doc.similarity !== undefined].filter(Boolean).length
  if (sources !== 1 || (doc.systems === undefined) !== (doc.center !== undefined)) {
    problems.push(modalProblem('spheres-source', {}))
  }
  if (doc.center !== undefined) knownWorld(doc.center, 'center')
  if (problems.length > 0) return
  const systems: Record<string, readonly (readonly string[])[]> = doc.systems ?? (doc.spheres !== undefined && doc.center !== undefined ? { [doc.center]: doc.spheres } : {})
  for (const [w, system] of Object.entries(systems)) {
    const where = doc.systems !== undefined ? `systems.${w}` : 'spheres'
    attempt(problems, where, () => checkSystem(worlds, w, system, doc.centering))
  }
  doc.similarity?.laws.forEach((law, i) => parseInto(problems, `similarity.laws.${i}.formula`, law.formula, true))
  const atoms = new Set(doc.atoms.map((a) => a.id))
  for (const atom of Object.keys(doc.similarity?.weights ?? {})) {
    if (!atoms.has(atom)) problems.push(modalProblem('unknown-atom', { atom }, `similarity.weights.${atom}`))
  }
  if (doc.structural !== undefined) {
    const before = problems.length
    for (const [atom, text] of Object.entries(doc.structural.equations)) parseInto(problems, `structural.equations.${atom}`, text, true)
    if (problems.length === before) {
      attempt(problems, 'structural.equations', () => {
        equationOrder(doc.atoms.map((a) => a.id), structuralEquations(doc))
      })
    }
  }
}

/**
 * Read a document from JSON text or an already parsed value. Never throws: what is wrong comes back as
 * `errors`, each a {@link ModalProblem} with the path where it sits.
 */
export function parseModalJson(input: string | unknown): ModalImportResult {
  let raw: unknown = input
  if (typeof input === 'string') {
    if (input.length > MAX_MODAL_DOC_CHARS) return { ok: false, errors: [modalProblem('too-large', {})] }
    try {
      raw = JSON.parse(input)
    } catch (error) {
      return { ok: false, errors: [modalProblem('not-json', { detail: (error as Error).message })] }
    }
  }
  const parsed = modalDocSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, errors: schemaProblems(parsed.error) }
  const problems = checkModalDoc(parsed.data)
  return problems.length > 0 ? { ok: false, errors: problems } : { ok: true, doc: parsed.data }
}

/** A frame document, or a Kripke document with its valuation ignored, as a frame. */
export function frameOfDoc(doc: FrameDoc | KripkeDoc): Frame {
  return frameOf(
    doc.worlds.map((w) => w.id),
    doc.access,
  )
}

/** The similarity a spheres document gives, with `weights` overriding its own. */
export function similarityOf(doc: SpheresDoc, weights?: Readonly<Record<string, number>>): Similarity {
  return {
    weights: { ...doc.similarity?.weights, ...weights },
    laws: (doc.similarity?.laws ?? []).map((law) => ({ formula: parseFormula(law.formula), cost: law.cost })),
  }
}

/** The structural equations of a spheres document, parsed. */
export function structuralEquations(doc: SpheresDoc): Record<string, Formula> {
  return Object.fromEntries(Object.entries(doc.structural?.equations ?? {}).map(([atom, text]) => [atom, parseFormula(text)]))
}

/**
 * The model a checked document describes. A frame has no atoms. A spheres document gets its systems
 * as written, or the centre's spheres from its similarity (with `weights` overriding the document's).
 */
export function modelOfDoc(doc: ModalDoc, weights?: Readonly<Record<string, number>>): ModalModel {
  const atoms = doc.kind === 'frame' ? [] : doc.atoms.map((a) => a.id)
  const worlds = doc.worlds.map((w) => ({ id: w.id, true: 'true' in w ? w.true : [] }))
  if (doc.kind !== 'spheres') return kripkeModel({ atoms, worlds, access: doc.access })
  if (doc.similarity !== undefined && doc.center !== undefined) {
    return withSimilaritySpheres(sphereModel({ atoms, worlds, systems: {} }), doc.center, similarityOf(doc, weights))
  }
  const systems = doc.systems ?? (doc.center !== undefined && doc.spheres !== undefined ? { [doc.center]: doc.spheres } : {})
  return sphereModel({ atoms, worlds, systems, centering: doc.centering })
}

/** The world a figure starts at: `actual`, the centre, or the first world. */
export function startWorld(doc: ModalDoc): string {
  if (doc.kind === 'spheres') return doc.center ?? (Object.keys(doc.systems ?? {})[0] as string | undefined) ?? (doc.worlds[0] as { id: string }).id
  return doc.actual ?? (doc.worlds[0] as { id: string }).id
}

/** Document text in `locale`. */
export function modalText(text: ModalText | undefined, locale: Locale): string | undefined {
  if (text === undefined) return undefined
  return typeof text === 'string' ? text : text[locale]
}
