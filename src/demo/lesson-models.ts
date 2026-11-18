import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'

/**
 * The lesson series' small model documents (copied from the blog's `src/data/causal/models/`; the
 * firing squad adds `show_exogenous: ["W"]`, as lesson 07 draws it). The demo's interaction page
 * and the tests load them.
 */
const files = import.meta.glob<unknown>('./lesson-models/*.json', { eager: true, import: 'default' })

export const LESSON_MODELS: Readonly<Record<string, ModelDoc>> = Object.fromEntries(
  Object.entries(files).map(([path, raw]) => [/([^/]+)\.json$/.exec(path)?.[1] ?? path, modelDocSchema.parse(raw)]),
)

export function lessonModel(id: string): ModelDoc {
  const doc = LESSON_MODELS[id]
  if (doc === undefined) throw new Error(`no lesson model ${id}`)
  return doc
}
