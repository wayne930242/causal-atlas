import { describe, expect, it } from 'vitest'
import { getCase } from '../data/index.ts'
import { messagesFor } from './i18n.ts'
import { equationRows } from './view-model.ts'

describe('equationRows worked values (arithmetic)', () => {
  const c = getCase('firing-squad')
  const values = { U: 1, C: 1, A: 1, B: 1, D: 1 }
  const rows = equationRows(messagesFor('zh-TW'), c, ['C', 'D'], 'arithmetic', values, {}, ['U', 'C', 'A', 'B', 'D'])

  it('does not repeat the value when the equation is a bare parent', () => {
    expect(rows[0].worked).toBe('= 1')
  })

  it('keeps the substituted step when it differs from the result', () => {
    expect(rows[1].worked).toBe('= max(1, 1) = 1')
  })
})
