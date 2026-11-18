import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, expect, it } from 'vitest'
import type { Locale } from '../i18n.ts'
import { LocaleProvider } from '../i18n.ts'

/**
 * The markup baseline recorded at 0.4.2 (f64af86) for the 0.4.3 refactor round: the server markup
 * of every subject, hashed. A refactor keeps every hash; an intended change of what is drawn
 * re-records them with `GOLDEN_UPDATE=1 pnpm vitest run src/components/golden` and says so in its
 * commit.
 */

export const GOLDEN_LOCALES: readonly Locale[] = ['zh-TW', 'en']

const UPDATE = process.env.GOLDEN_UPDATE === '1'

/** `useId` tokens (React 19 server form `_R_…_`), renamed by first appearance, so an added component layer keeps the hash. */
export function normalizeIds(html: string): string {
  const seen = new Map<string, string>()
  return html.replace(/_R_[0-9a-z]+_/g, (token) => {
    let name = seen.get(token)
    if (name === undefined) {
      name = `_ID${seen.size}_`
      seen.set(token, name)
    }
    return name
  })
}

export function markupHash(html: string): string {
  return createHash('sha256').update(normalizeIds(html)).digest('hex').slice(0, 16)
}

/** The hash of a subject's markup in `locale`, or of the message it throws (bad-prop messages are part of the contract). */
export function renderHash(node: () => ReactNode, locale: Locale): string {
  try {
    return markupHash(renderToStaticMarkup(createElement(LocaleProvider, { locale }, node())))
  } catch (error) {
    return `throws:${markupHash(error instanceof Error ? error.message : String(error))}`
  }
}

/** One baseline file: the recorded hashes, checked per subject (or recorded with GOLDEN_UPDATE=1). */
export function goldenFile(url: string) {
  const path = new URL(url).pathname
  const recorded: Record<string, string> = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>) : {}
  const fresh: Record<string, string> = {}
  return {
    /** Compares a subject's hashes (keys `subject/variant/locale`) with the baseline. */
    check(subject: string, actual: Readonly<Record<string, string>>): void {
      if (UPDATE) {
        Object.assign(fresh, actual)
        return
      }
      const expected = Object.fromEntries(Object.entries(recorded).filter(([k]) => k.startsWith(`${subject}/`)))
      expect(Object.keys(actual).length).toBeGreaterThan(0)
      expect(actual).toEqual(expected)
    },
    /** Writes the baseline after an update run. */
    save(): void {
      if (!UPDATE) return
      const sorted = Object.fromEntries(Object.entries(fresh).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      writeFileSync(path, `${JSON.stringify(sorted, null, 1)}\n`)
    },
  }
}

/** Hashes of one subject: each variant in both languages. */
export function subjectHashes(subject: string, variants: Readonly<Record<string, () => ReactNode>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [variant, node] of Object.entries(variants)) {
    for (const locale of GOLDEN_LOCALES) out[`${subject}/${variant}/${locale}`] = renderHash(node, locale)
  }
  return out
}

/** One test per subject against the baseline file beside the test (`<test>.json`). */
export function goldenSuite(testUrl: string, subjects: Readonly<Record<string, Readonly<Record<string, () => ReactNode>>>>): void {
  const file = goldenFile(testUrl.replace(/\.test\.tsx?$/, '.json'))
  afterAll(() => file.save())
  for (const [subject, variants] of Object.entries(subjects)) {
    it(subject, () => file.check(subject, subjectHashes(subject, variants)))
  }
}
