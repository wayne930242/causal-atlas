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

describe('case ids are unique', () => {
  it('has no duplicate ids', () => {
    const ids = entries.map(([path]) => fileId(path))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
