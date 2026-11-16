import { readFileSync } from 'node:fs'

/**
 * Build-time constants for src/components/cite.ts: the version from package.json and the release
 * year from the date in CITATION.cff, so the citation strings cannot drift from the package.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const cff = readFileSync(new URL('./CITATION.cff', import.meta.url), 'utf8')
const year = /^date-released:\s*"?(\d{4})-/m.exec(cff)?.[1]
if (year === undefined) throw new Error('CITATION.cff has no date-released: "YYYY-MM-DD" line')

export const buildDefines = {
  __CA_VERSION__: JSON.stringify(pkg.version),
  __CA_YEAR__: year,
}
