import type { ModalDocInput } from '../modal/data/schema.ts'

/** The example modal models: the demo page's figures and the modal tests' fixtures. Not part of the package. */
const files = import.meta.glob<ModalDocInput>('./modal-models/*.json', { eager: true, import: 'default' })

export const MODAL_MODELS: Readonly<Record<string, ModalDocInput>> = Object.fromEntries(
  Object.entries(files).map(([path, doc]) => [path.replace(/^.*\/(.*)\.json$/, '$1'), doc]),
)

export function modalModel(id: string): ModalDocInput {
  const doc = MODAL_MODELS[id]
  if (doc === undefined) throw new Error(`no modal model ${id}`)
  return doc
}
