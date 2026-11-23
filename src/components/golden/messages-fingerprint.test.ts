// The message tables, fingerprinted per locale: functions by their source text (import bindings
// normalized), so moving the tables between files is provably a move.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MESSAGES } from '../i18n/messages.ts'

/** A function's source with the test transform's import bindings (`(0,__vite_ssr_import_3__.f)`, `__vite_ssr_import_3__.f`) written as `f`. */
function source(fn: (...args: never[]) => unknown): string {
  return fn
    .toString()
    .replace(/\(0,\s*__vite_ssr_import_\d+__\.([A-Za-z_$][\w$]*)\)/g, '$1')
    .replace(/__vite_ssr_import_\d+__\.([A-Za-z_$][\w$]*)/g, '$1')
}

function serialize(value: unknown): unknown {
  if (typeof value === 'function') return `fn:${source(value as (...args: never[]) => unknown)}`
  if (Array.isArray(value)) return value.map(serialize)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]))
  return value
}

const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(serialize(value))).digest('hex').slice(0, 16)

describe('message tables', () => {
  it('keep their fingerprint per locale', () => {
    expect({ zh: fingerprint(MESSAGES['zh-TW']), en: fingerprint(MESSAGES.en) }).toEqual({ zh: '16b111415e3715df', en: 'a55a05f714abb0eb' })
  })
})
