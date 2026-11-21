import { fireEvent } from '@testing-library/react'

/**
 * Tests drive a graph through a node's menu (NodeMenu) as a reader does: a click on the node opens
 * it, a button in it observes or intervenes. These open the menu when it is not already open on
 * that node, press the button, and leave the menu open.
 */

/** The open menu of node `id`, opened by a click on the node when it is not. */
export function openMenu(root: ParentNode, id: string): HTMLElement {
  const open = root.querySelector<HTMLElement>(`[data-menu="${id}"]`)
  if (open !== null) return open
  const node = root.querySelector(`[data-node="${id}"]`)
  if (node === null) throw new Error(`no node ${id}`)
  fireEvent.click(node)
  const menu = root.querySelector<HTMLElement>(`[data-menu="${id}"]`)
  if (menu === null) throw new Error(`no menu for ${id}`)
  return menu
}

function press(root: ParentNode, id: string, selector: string): void {
  const button = openMenu(root, id).querySelector<HTMLButtonElement>(selector)
  if (button === null) throw new Error(`no ${selector} in the menu of ${id}`)
  fireEvent.click(button)
}

/** Observe `id` at `value` (`1`, `0` or a value's text); undefined: no longer observed. */
export function observeNode(root: ParentNode, id: string, value?: string): void {
  press(root, id, `[data-observe="${value ?? ''}"]`)
}

/** do() on `id` at `value`; undefined: release it. */
export function doNode(root: ParentNode, id: string, value?: string): void {
  press(root, id, `[data-do="${value ?? ''}"]`)
}

/** do() on boolean `id` at P*(id=1) = `p`, with the menu's slider. */
export function doProbability(root: ParentNode, id: string, p: number): void {
  const slider = openMenu(root, id).querySelector<HTMLInputElement>(`[data-do-slider="${id}"]`)
  if (slider === null) throw new Error(`no P* slider in the menu of ${id}`)
  fireEvent.change(slider, { target: { value: String(p) } })
}

/** Close the open menu with its × button. */
export function closeMenu(root: ParentNode): void {
  const close = root.querySelector<HTMLButtonElement>('.ca-node-menu-close')
  if (close !== null) fireEvent.click(close)
}
