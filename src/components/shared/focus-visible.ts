/** Whether `el` has focus the browser would draw a ring for (a keyboard, not a click); true where `:focus-visible` is unknown. */
export function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}
