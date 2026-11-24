import { fileId } from './case-id.ts'

/**
 * Raw case files keyed by path, e.g. `./cases/rock-throwing.json`. Validate with `loadCase`.
 * Importing this module bundles every case; the components load one case at a time through `case-store.ts`.
 */
export const caseFiles: Readonly<Record<string, unknown>> = import.meta.glob('./cases/*.json', {
  eager: true,
  import: 'default',
})

export { fileId }
