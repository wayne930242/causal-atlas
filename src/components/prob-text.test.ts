import { describe, expect, it } from 'vitest'
import { probText } from './view-model.ts'

describe('probText', () => {
  it('keeps two decimals away from the ends', () => {
    expect(probText(0.5)).toBe('0.50')
    expect(probText(0.24)).toBe('0.24')
    expect(probText(0.01)).toBe('0.01')
    expect(probText(0)).toBe('0.00')
    expect(probText(1)).toBe('1.00')
    expect(probText(Number.NaN)).toBe('—')
  })

  it('shows small probabilities instead of rounding them to 0.00 or 1.00', () => {
    expect(probText(0.0001)).toBe('0.0001')
    expect(probText(0.000095)).toBe('0.000095')
    expect(probText(0.00941)).toBe('0.0094')
    expect(probText(0.9999)).toBe('0.9999')
    expect(probText(0.995)).toBe('0.995')
  })

  it('bounds values closer than 1e-6 to an end', () => {
    expect(probText(1e-8)).toBe('<0.000001')
    expect(probText(1 - 1e-8)).toBe('>0.999999')
  })
})
