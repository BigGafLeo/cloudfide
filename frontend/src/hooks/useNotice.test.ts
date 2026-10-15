import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('shows a notice and clears it after 4000 ms', () => {
  const { result } = renderHook(() => useNotice())
  expect(result.current.message).toBe('')
  act(() => result.current.notify('A'))
  expect(result.current.message).toBe('A')
  act(() => {
    vi.advanceTimersByTime(3999)
  })
  expect(result.current.message).toBe('A')
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(result.current.message).toBe('')
})

it('restarts the timer when the same message is notified again', () => {
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('B'))
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  act(() => result.current.notify('B'))
  act(() => {
    vi.advanceTimersByTime(3999)
  })
  expect(result.current.message).toBe('B')
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(result.current.message).toBe('')
})
