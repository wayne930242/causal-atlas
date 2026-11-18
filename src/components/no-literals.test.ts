import { describe, expect, it } from 'vitest'

/**
 * Interface text lives in i18n/ (zh.ts, en.ts). Any other component source with a CJK character outside a
 * comment is a string someone forgot to move there, unless it is listed here with its reason.
 */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  // Full-width characters counted as one em when estimating label widths.
  'text/text-measure.ts': ['，。：；（）「」？！…—＝／、《》・'],
  // Value lists may be typed with full-width commas and the enumeration comma.
  'editor/draft.ts': ['，、'],
  // Sentence-ending punctuation: where a sentence starts, to tell the article A from the variable A.
  'text/typeset-text.ts': ['。！？「'],
}

/** The string tables: the only sources that may hold interface text. The rest of i18n/ is scanned. */
const TABLES = new Set(['i18n/messages.ts', 'i18n/zh.ts', 'i18n/en.ts', 'i18n/common.ts'])

const CJK = /[　-〿㐀-䶿一-鿿＀-￯]+/g

/** Every component source but the tests, keyed `./path`. */
const sources: Record<string, string> = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

describe('interface text', () => {
  it('comes only from the string tables', () => {
    const stray: string[] = []
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    for (const [path, code] of Object.entries(sources)) {
      const file = path.replace(/^\.\//, '')
      if (TABLES.has(file)) continue
      const allowed = ALLOWED[file] ?? []
      for (const hit of withoutComments(code).match(CJK) ?? []) {
        if (!allowed.some((a) => a.includes(hit))) stray.push(`${file}: ${hit}`)
      }
    }
    expect(stray).toEqual([])
  })
})
