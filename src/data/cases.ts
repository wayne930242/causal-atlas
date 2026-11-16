/** Raw case files keyed by path, e.g. `./cases/rock-throwing.json`. Validate with `loadCase`. */
export const caseFiles: Readonly<Record<string, unknown>> = import.meta.glob('./cases/*.json', {
  eager: true,
  import: 'default',
})

/** The file name without extension, which must equal the case id. */
export function fileId(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.json$/, '')
}
