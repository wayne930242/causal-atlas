// What a browser downloads for each package entry: the entry file in dist/ plus every file it imports
// statically, transitively (dynamic `import()` chunks, such as one case's data or the image export, are
// left out: they load on demand). `#case-preload` resolves to its browser (`default`) target; bare imports
// (react, react-dom, katex, zod) are peer or regular dependencies the host bundles once, so they are listed
// but not counted. Gzip is zlib's default level, per file.
//
// Fails when an entry with a budget below goes over it, or when a case's data is in the playground's
// static closure. Run after `pnpm build:lib`: `node scripts/check-size.mjs [--json]`.
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

/**
 * Budgets in bytes for an entry's static closure, set from the measured size plus about 10%
 * (`./causal/playground` at 0.24.0: 379.3 kB raw, 120.7 kB gzip; 0.23.0's one entry was 929.6 kB, 244.2 kB).
 */
export const BUDGETS = {
  './causal/playground': { raw: 420_000, gzip: 133_000 },
  // Set at 0.25.0 from the measured size plus about 10% (102.7 kB raw, 27.8 kB gzip, one file).
  './modal': { raw: 113_000, gzip: 30_600 },
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const STATIC_IMPORT = /^(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm

/** A `#` import's browser target, from package.json `imports`. */
function packageImport(spec) {
  const target = pkg.imports?.[spec]
  if (target === undefined) throw new Error(`package.json imports has no ${spec}`)
  return join(root, typeof target === 'string' ? target : target.default)
}

/** The static closure of `entry` (an absolute path): files with sizes, and the bare imports it leaves out. */
export function closure(entry) {
  const files = new Map()
  const bare = new Set()
  const visit = (path) => {
    if (files.has(path)) return
    const code = readFileSync(path)
    files.set(path, { raw: code.length, gzip: gzipSync(code).length })
    for (const m of code.toString('utf8').matchAll(STATIC_IMPORT)) {
      const spec = m[1] ?? m[2]
      if (spec.startsWith('.')) visit(normalize(join(dirname(path), spec)))
      else if (spec.startsWith('#')) visit(packageImport(spec))
      else bare.add(spec)
    }
  }
  visit(entry)
  let raw = 0
  let gzip = 0
  for (const f of files.values()) {
    raw += f.raw
    gzip += f.gzip
  }
  return { files: [...files.keys()].map((f) => relative(root, f)), bare: [...bare].sort(), raw, gzip }
}

/** Every JS entry of package.json `exports`, by subpath. */
export function entries() {
  const out = {}
  for (const [key, value] of Object.entries(pkg.exports)) {
    const file = typeof value === 'string' ? value : value.import
    if (file.endsWith('.js')) out[key] = join(root, file)
  }
  return out
}

function kb(n) {
  return `${(n / 1000).toFixed(1)} kB`
}

function main() {
  const report = {}
  for (const [key, file] of Object.entries(entries())) report[key] = closure(file)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    for (const [key, r] of Object.entries(report)) {
      console.log(`${key.padEnd(14)} ${kb(r.raw).padStart(10)} raw ${kb(r.gzip).padStart(10)} gzip  ${r.files.length} files`)
    }
  }
  const failures = []
  for (const [key, budget] of Object.entries(BUDGETS)) {
    const r = report[key]
    if (r === undefined) {
      failures.push(`${key}: no such entry in package.json exports`)
      continue
    }
    if (r.raw > budget.raw) failures.push(`${key}: ${r.raw} bytes raw, budget ${budget.raw}`)
    if (r.gzip > budget.gzip) failures.push(`${key}: ${r.gzip} bytes gzip, budget ${budget.gzip}`)
  }
  // The modal figures are built apart (vite.lib.modal.config.ts): no other entry may load their code.
  for (const [key, r] of Object.entries(report)) {
    if (key !== './modal' && r.files.some((f) => /(^|[/\\])modal(-chunks[/\\]|\.js$)/.test(f))) failures.push(`${key} statically imports the modal build`)
  }
  const playground = report['./causal/playground']
  const caseChunks = playground?.files.filter((f) => /[/\\]cases[/\\]/.test(f)) ?? []
  if (caseChunks.length > 0) failures.push(`./causal/playground statically imports case data: ${caseChunks.join(', ')}`)
  if (failures.length > 0) {
    console.error(`size check failed:\n  ${failures.join('\n  ')}`)
    process.exit(1)
  }
  console.log('size check passed')
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === normalize(process.argv[1])) main()
