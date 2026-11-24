/** The file name without extension, which must equal the case id. */
export function fileId(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.json$/, '')
}
