import { describe, expect, it } from 'vitest'
import { fixed, probText } from './view-model.ts'

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

  it('rounds halves away from zero, whatever the binary form (0.175 → 0.18, 0.325 → 0.33)', () => {
    expect(probText(0.175)).toBe('0.18')
    expect(probText(0.325)).toBe('0.33')
    expect(probText(0.145)).toBe('0.15')
    expect(probText(0.00175)).toBe('0.0018')
    expect(fixed(1.005, 2)).toBe('1.01')
    expect(fixed(-0.175, 2)).toBe('-0.18')
    expect(fixed(108000, 1)).toBe('108000.0')
    expect(fixed(0.0001, 2)).toBe('0.00')
  })
})
