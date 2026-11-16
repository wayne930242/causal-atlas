import cff from '../../CITATION.cff?raw'
import readme from '../../README.md?raw'
import { describe, expect, it } from 'vitest'
import { AUTHOR_EN, bibtex, watermarkLine } from './cite.ts'

describe('citation', () => {
  it('README and CITATION.cff carry the same BibTeX and author', () => {
    expect(readme).toContain(bibtex())
    expect(readme).toContain('學術或教學使用請引用')
    expect(cff).toMatch(/given-names: Wei\n\s+family-names: Hung\n\s+alias: 洪偉/)
    expect(AUTHOR_EN).toBe('Wei Hung')
  })

  it('watermark names author, project, licence and url', () => {
    expect(watermarkLine('https://x.test/')).toBe('洪偉（Wei Hung）· causal-atlas · CC BY 4.0 · https://x.test/')
  })
})
