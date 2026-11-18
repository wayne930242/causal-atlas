/** Seen only by tsconfig.test.json (test and golden files), not by browser code. The Node APIs the tests read files with (the bibliography, model documents) and the markup baseline writes and hashes with; the project carries no @types/node. */
declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
  export function readdirSync(path: string): string[]
  export function writeFileSync(path: string, data: string): void
}
declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): { update(data: string): { digest(encoding: 'hex'): string } }
}
declare const process: { readonly env: Readonly<Record<string, string | undefined>> }
