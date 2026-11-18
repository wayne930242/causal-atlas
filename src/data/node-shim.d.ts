/** The Node APIs the tests read files with (the bibliography, model documents); the project carries no @types/node. */
declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
  export function readdirSync(path: string): string[]
}
declare const process: { readonly env: Readonly<Record<string, string | undefined>> }
