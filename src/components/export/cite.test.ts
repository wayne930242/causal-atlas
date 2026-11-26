import citeSource from './cite.ts?raw'
import cff from '../../../CITATION.cff?raw'
import licenseData from '../../../LICENSE-DATA?raw'
import packageJson from '../../../package.json?raw'
import readme from '../../../README.md?raw'
import { describe, expect, it } from 'vitest'
import { AUTHOR_EN, VERSION, YEAR, authorYear, authorYearEn, bibtex, watermarkLine } from './cite.ts'

describe('citation', () => {
  it('README carries both author-year citations and BibTeX, and CITATION.cff names the author', () => {
    expect(readme).toContain(bibtex())
    expect(readme).toContain(`> ${authorYear()}`)
    expect(readme).toContain(`> ${authorYearEn()}`)
    expect(cff).toMatch(/given-names: Wei\n\s+family-names: Hung\n\s+alias: 洪偉/)
    expect(AUTHOR_EN).toBe('Wei Hung')
  })

  it('watermark names author, project, licence and url', () => {
    expect(watermarkLine('https://x.test/')).toBe('洪偉（Wei Hung）· causal-atlas · CC BY 4.0 · https://x.test/')
  })

  it('REV-F008: VERSION and YEAR come from package.json and CITATION.cff, not from a copy', () => {
    const pkg = JSON.parse(packageJson) as { version: string; license: string }
    expect(VERSION).toBe(pkg.version)
    expect(cff).toContain(`version: ${pkg.version}`)
    expect(cff).toMatch(new RegExp(`date-released: "${YEAR}-`))
    expect(citeSource).not.toMatch(/VERSION\s*=\s*'\d/)
    expect(citeSource).not.toMatch(/YEAR\s*=\s*\d/)
  })

  it('REV-F007: package.json declares both licences and LICENSE-DATA covers the bundled data', () => {
    const pkg = JSON.parse(packageJson) as { license: string }
    expect(pkg.license).toBe('MIT AND CC-BY-4.0')
    expect(licenseData).toMatch(/dist\/\*\.js/)
    expect(licenseData).toMatch(/wherever (it is )?bundled/)
    expect(licenseData).not.toMatch(/The case dataset in src\/data \(/)
  })
})
