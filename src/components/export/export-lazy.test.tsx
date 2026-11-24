// @vitest-environment jsdom
// The image export is a chunk of its own: nothing here loads it up front, so the first download waits for it.
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { saveFile } from './download.ts'
import { CausalPlayground } from '../index.ts'

vi.mock('./download.ts', () => ({ saveFile: vi.fn() }))
const saved = vi.mocked(saveFile)

afterEach(cleanup)

it('loads the image export on first use and saves the image', async () => {
  const { container } = render(<CausalPlayground caseId="rock-throwing" />)
  fireEvent.click(within(container).getByRole('button', { name: '下載圖片' }))
  const menu = within(container).getByRole('group', { name: '圖片設定' })
  fireEvent.click(within(menu).getByRole('button', { name: 'SVG' }))
  fireEvent.click(within(menu).getByRole('button', { name: '下載' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  const [name, svg] = saved.mock.calls[0]
  expect(name).toBe('rock-throwing-graph-light.svg')
  expect(String(svg)).toContain('<svg')
})
