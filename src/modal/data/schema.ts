import { z } from 'zod'
import { ATOM_PATTERN } from '../engine/formula.ts'

/**
 * Modal documents, as hosts write them in JSON: a Kripke model, a frame, or a model with systems of
 * spheres. Formulas are strings in the authoring syntax (see `parseFormula`). The schema checks the
 * shape; `checkModalDoc` checks what the shape cannot say (known ids, nesting, formulas that parse).
 */

/** Text in both languages, or one string for both. */
export const modalTextSchema = z.union([z.string(), z.object({ 'zh-TW': z.string(), en: z.string() }).strict()])

/** World ids: a letter, then letters, digits or underscores (`w`, `v1`, `noon`). */
export const WORLD_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

const worldId = z.string().regex(WORLD_PATTERN)
const pos = z.object({ x: z.number(), y: z.number() }).strict()

const atomSchema = z
  .object({
    id: z.string().regex(ATOM_PATTERN),
    label: modalTextSchema.optional(),
  })
  .strict()

const worldSchema = z
  .object({
    id: worldId,
    /** The atoms true here; every other atom is false here. */
    true: z.array(z.string()).default([]),
    label: modalTextSchema.optional(),
    pos: pos.optional(),
  })
  .strict()

const frameWorldSchema = worldSchema.omit({ true: true })

const layoutSchema = z.enum(['manual', 'circle', 'line', 'layers'])

const common = {
  id: z.string().optional(),
  title: modalTextSchema.optional(),
  /** Formulas listed by default. */
  formulas: z.array(z.string()).optional(),
}

export const kripkeDocSchema = z
  .object({
    kind: z.literal('kripke'),
    ...common,
    atoms: z.array(atomSchema).default([]),
    worlds: z.array(worldSchema).min(1),
    access: z.array(z.tuple([worldId, worldId])).default([]),
    /** The actual world, selected first. */
    actual: worldId.optional(),
    layout: layoutSchema.default('circle'),
  })
  .strict()

export const frameDocSchema = z
  .object({
    kind: z.literal('frame'),
    id: common.id,
    title: common.title,
    worlds: z.array(frameWorldSchema).min(1),
    access: z.array(z.tuple([worldId, worldId])).default([]),
    actual: worldId.optional(),
    layout: layoutSchema.default('circle'),
  })
  .strict()

const lawSchema = z
  .object({
    formula: z.string(),
    /** The cost of a world where the law is false (a miracle); default 1. */
    cost: z.number().nonnegative().default(1),
    label: modalTextSchema.optional(),
  })
  .strict()

export const spheresDocSchema = z
  .object({
    kind: z.literal('spheres'),
    ...common,
    atoms: z.array(atomSchema).default([]),
    worlds: z.array(worldSchema).min(1),
    /** The world the spheres are drawn around. */
    center: worldId.optional(),
    /** The centre's spheres, innermost first. */
    spheres: z.array(z.array(worldId)).optional(),
    /** A system per world, for nested counterfactuals; instead of `center` and `spheres`. */
    systems: z.record(z.string(), z.array(z.array(worldId))).optional(),
    /** Spheres around `center` from weights and laws, instead of `spheres`. */
    similarity: z
      .object({
        weights: z.record(z.string(), z.number().nonnegative()).default({}),
        laws: z.array(lawSchema).default([]),
      })
      .strict()
      .optional(),
    centering: z.enum(['strong', 'weak']).default('strong'),
    /** Boolean structural equations for minimal surgery: atom → formula. */
    structural: z.object({ equations: z.record(z.string(), z.string()) }).strict().optional(),
  })
  .strict()

export const modalDocSchema = z.discriminatedUnion('kind', [kripkeDocSchema, frameDocSchema, spheresDocSchema])

export type ModalText = z.infer<typeof modalTextSchema>
export type KripkeDoc = z.infer<typeof kripkeDocSchema>
export type FrameDoc = z.infer<typeof frameDocSchema>
export type SpheresDoc = z.infer<typeof spheresDocSchema>
/** A checked document. */
export type ModalDoc = z.infer<typeof modalDocSchema>
/** A document as written, before defaults are filled in. */
export type ModalDocInput = z.input<typeof modalDocSchema>
export type KripkeDocInput = z.input<typeof kripkeDocSchema>
export type FrameDocInput = z.input<typeof frameDocSchema>
export type SpheresDocInput = z.input<typeof spheresDocSchema>
