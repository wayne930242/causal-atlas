/** A digit suffix is a subscript only on an identifier that has no explicit underscore. */
export function digitSubscript(id: string): { readonly head: string; readonly sub: string } | undefined {
  const match = /^([A-Za-z][A-Za-z0-9]*?)(\d+)$/.exec(id)
  return match === null ? undefined : { head: match[1], sub: match[2] }
}
