// Regenerates src/data/bib-keys.json: which source citation keys used by the cases are in the bibliography.
// Usage: node scripts/sync-bib-keys.mjs   (CA_BIB overrides the bibliography path)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const bibPath = process.env.CA_BIB ?? '/Users/weihung/knowledge-base/literature/references/bibliography.bib'
const casesDir = new URL('../src/data/cases/', import.meta.url)
const out = fileURLToPath(new URL('../src/data/bib-keys.json', import.meta.url))

const bib = new Set([...readFileSync(bibPath, 'utf8').matchAll(/^@\w+\{([^,\s]+),/gm)].map((m) => m[1]))
const used = new Set()
for (const f of readdirSync(casesDir).filter((n) => n.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(new URL(f, casesDir), 'utf8'))
  for (const { key } of data.sources ?? []) if (key !== undefined) used.add(key)
}
const sorted = [...used].sort()
const snapshot = {
  inBib: sorted.filter((k) => bib.has(k)),
  notInBib: sorted.filter((k) => !bib.has(k)),
}
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`)
console.log(`inBib ${snapshot.inBib.length}, notInBib ${snapshot.notInBib.length}`)
