import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluate } from '../engine/index.ts'
import { caseFiles, fileId } from './cases.ts'
import type { LoadedCase } from './load.ts'
import { checkVerdict, describeVerdict, loadCase } from './load.ts'

/**
 * Dataset acceptance gate: every case file must validate against the schema, build into an
 * acyclic model, and reproduce every expected verdict with the engine.
 */

const entries = Object.entries(caseFiles).sort(([a], [b]) => a.localeCompare(b))

describe('case dataset', () => {
  it('contains case files', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  describe.each(entries)('%s', (path, raw) => {
    const id = fileId(path)
    let loaded: LoadedCase | undefined

    it('validates and builds', () => {
      loaded = loadCase(raw)
      expect(loaded.data.id, `case file ${path}: id must equal the file name`).toBe(id)
      const context = loaded.context
      for (const showcase of loaded.data.showcase) {
        if (context !== undefined) evaluate(loaded.model, context, showcase.interventions)
      }
    })

    const verdicts = (() => {
      try {
        return loadCase(raw).data.verdicts
      } catch {
        return []
      }
    })()

    it.each(verdicts.map((verdict, index) => ({ verdict, index, name: describeVerdict(verdict) })))(
      'verdict #$index $name',
      ({ verdict, index }) => {
        const current = loaded ?? loadCase(raw)
        const check = checkVerdict(current, verdict)
        expect(
          check.ok,
          `case ${id}, verdict #${index} (${check.label}): expected ${String(check.expected)}, engine computed ${String(check.actual)}`,
        ).toBe(true)
      },
    )
  })
})

describe('case display fields', () => {
  it.each(entries)('%s has a subtitle, story tags and Chinese names', (path, raw) => {
    const c = loadCase(raw)
    expect(c.data.subtitle, path).toBeDefined()
    expect(c.data.story_tags?.['zh-TW'].length ?? 0, path).toBeGreaterThan(0)
    expect(c.data.story_tags?.en.length, path).toBe(c.data.story_tags?.['zh-TW'].length)
    const text = [c.data.title['zh-TW'], c.data.story['zh-TW'], c.data.explanation['zh-TW'], ...c.model.variables.map((v) => v.label['zh-TW'])]
    expect(text.join(), path).not.toMatch(/Suzy|Billy/)
  })

  it.each(entries)('%s: intuition.agree lists exactly the theories that reach the intuition', (path, raw) => {
    const c = loadCase(raw)
    const intuition = c.data.intuition
    if (intuition === undefined) return
    const q = intuition.query
    const agree = new Set<string>()
    for (const v of c.data.verdicts) {
      if ('choice' in q) {
        if ((v.theory === 'edt' || v.theory === 'cdt') && 'choice' in v.query && v.query.choice === q.choice) {
          const check = checkVerdict(c, { ...v, expected: intuition.expected })
          if (check.ok) agree.add(v.theory)
        }
      } else if ('cause' in v.query && v.query.cause === q.cause && v.query.effect === q.effect) {
        const check = checkVerdict(c, { ...v, expected: intuition.expected } as typeof v)
        if (check.ok) agree.add(v.theory)
      }
    }
    expect([...agree].sort(), path).toEqual([...intuition.agree].sort())
  })

  it('rock-throwing has an intuition', () => {
    expect(loadCase(caseFiles['./cases/rock-throwing.json']).data.intuition?.expected).toBe('cause')
  })
})

describe('case ids are unique', () => {
  it('has no duplicate ids', () => {
    const ids = entries.map(([path]) => fileId(path))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/** Citation keys the bibliography lacks; their sources stay `verified: false` until it gains them. */
const NOT_IN_BIB = new Set(['nozick-1969', 'eells-1982', 'skyrms-1980', 'mcgrath-2005', 'pearl-2000'])

describe('case sources', () => {
  const bibPath = process.env.CA_BIB ?? '/Users/weihung/knowledge-base/literature/references/bibliography.bib'

  it('uses bibliography citation keys', () => {
    if (!existsSync(bibPath)) {
      throw new Error(`bibliography not found at ${bibPath}; set CA_BIB to bibliography.bib (this check must run, not skip)`)
    }
    const bib = new Set([...readFileSync(bibPath, 'utf8').matchAll(/^@\w+\{([^,\s]+),/gm)].map((m) => m[1]))
    const missing: string[] = []
    for (const [path, raw] of entries) {
      for (const s of loadCase(raw).data.sources) {
        if (bib.has(s.key)) {
          expect(NOT_IN_BIB.has(s.key), `${path}: ${s.key} is in the bibliography now; drop it from NOT_IN_BIB`).toBe(false)
        } else {
          missing.push(s.key)
          expect(NOT_IN_BIB.has(s.key), `${path}: source key ${s.key} is not a bibliography key`).toBe(true)
          expect(s.verified, `${path}: ${s.key} is not in the bibliography, so it stays unverified`).toBe(false)
        }
      }
    }
    expect(new Set(missing)).toEqual(NOT_IN_BIB)
  })

  it('calls the rock-throwing case late preemption, not early', () => {
    const c = loadCase(caseFiles['./cases/rock-throwing.json'])
    const text = JSON.stringify(c.data)
    expect(text).not.toMatch(/it is a case of early preemption/)
    expect(text).toContain('late preemption')
    expect(text).toContain('晚期先發制人')
  })
})
