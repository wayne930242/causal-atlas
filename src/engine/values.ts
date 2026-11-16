import type { Assignment, Domain, Value, Variable } from './types.ts'

export class ModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelError'
  }
}

/** Words the equation syntax uses: a variable cannot be called any of them. */
export const RESERVED_WORDS: ReadonlySet<string> = new Set(['and', 'or', 'not', 'implies', 'iff', 'if', 'then', 'else', 'true', 'false'])

/**
 * Names a variable cannot have: the equation keywords, and anything `{}` already has
 * (`toString`, `constructor`, `__proto__`, …), which would read as an assigned value.
 */
export function isReservedName(name: string): boolean {
  return RESERVED_WORDS.has(name) || name in Object.prototype
}

/** All values of a domain, in declaration order (`false` before `true` for booleans). */
export function domainValues(domain: Domain): readonly Value[] {
  return domain.kind === 'boolean' ? [false, true] : domain.values
}

/**
 * Interpret a value as a boolean. Accepts `true`/`false` and the numbers 1/0, so that
 * authoring syntax such as `BS=1` works on boolean variables.
 */
export function asBool(value: Value, where: string): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1) return true
  if (value === 0) return false
  throw new ModelError(`${where}: expected a boolean, got ${JSON.stringify(value)}`)
}

/** Equality that treats 1/0 and true/false as the same value. */
export function valuesEqual(a: Value, b: Value): boolean {
  if (typeof a === 'boolean' && typeof b === 'number') return (b === 1 && a) || (b === 0 && !a)
  if (typeof b === 'boolean' && typeof a === 'number') return valuesEqual(b, a)
  return a === b
}

/** Coerce a raw value into the variable's domain, or throw. */
export function coerceToDomain(variable: Variable, value: Value): Value {
  const { domain } = variable
  if (domain.kind === 'boolean') {
    return asBool(value, `variable ${variable.id}`)
  }
  for (const candidate of domain.values) {
    if (valuesEqual(candidate, value)) return candidate
  }
  throw new ModelError(
    `variable ${variable.id}: value ${JSON.stringify(value)} is not in domain ${JSON.stringify(domain.values)}`,
  )
}

/** Plain-text rendering of a value: booleans as 1/0. */
export function formatValue(value: Value): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

/** Stable key for an assignment restricted to the given variable order. */
export function assignmentKey(assignment: Assignment, order: readonly string[]): string {
  return order.map((id) => formatValue(requireValue(assignment, id))).join('|')
}

export function requireValue(assignment: Assignment, id: string): Value {
  const value = assignment[id]
  if (value === undefined) throw new ModelError(`no value for variable ${id}`)
  return value
}

/** Cartesian product of the given variables' domains, as assignments. */
export function* enumerateAssignments(
  variables: readonly Variable[],
): Generator<Record<string, Value>> {
  const domains = variables.map((v) => domainValues(v.domain))
  const indices = variables.map(() => 0)
  if (domains.some((d) => d.length === 0)) return
  while (true) {
    const assignment: Record<string, Value> = {}
    variables.forEach((v, i) => {
      assignment[v.id] = domains[i][indices[i]]
    })
    yield assignment
    let k = variables.length - 1
    while (k >= 0) {
      indices[k] += 1
      if (indices[k] < domains[k].length) break
      indices[k] = 0
      k -= 1
    }
    if (k < 0) return
  }
}

/** All subsets of `items`, ordered by size then by position (smallest first). */
export function subsetsBySize<T>(items: readonly T[]): T[][] {
  const result: T[][] = []
  const n = items.length
  for (let mask = 0; mask < 1 << n; mask += 1) {
    const subset: T[] = []
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) subset.push(items[i])
    }
    result.push(subset)
  }
  return result.sort((a, b) => a.length - b.length)
}
