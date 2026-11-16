/** The two Node APIs cases.test.ts reads the bibliography with; the project carries no @types/node. */
declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
declare const process: { readonly env: Readonly<Record<string, string | undefined>> }
