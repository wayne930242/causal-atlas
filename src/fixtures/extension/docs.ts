import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'

/**
 * Lesson 09's model documents for the conservative-extension tests, copied from the blog: the coarse
 * rock-throwing model (Halpern 2016's M_RT, beside the bundled `rock-throwing` case) and the four
 * models of Theorem 4.4.1's bogus-prevention sequence.
 */
const files = import.meta.glob<unknown>('./*.json', { eager: true, import: 'default' })

function doc(name: string): ModelDoc {
  const raw = files[`./${name}.json`]
  if (raw === undefined) throw new Error(`no fixture ${name}`)
  return modelDocSchema.parse(raw)
}

export const ROCK_COARSE: ModelDoc = doc('m09-rock-coarse')

export const BOGUS_SEQUENCE: readonly ModelDoc[] = [1, 2, 3, 4].map((k) => doc(`m09-bogus-seq-${k}`))
