import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

afterEach(() => vi.useRealTimers())

it('starts without a notice and exposes a notification callback', () => {
  const { result } = renderHook(() => useNotice())
  expect(result.current.message).toBe('')
  expect(result.current.notify).toEqual(expect.any(Function))
})

it('shows a notice until 4000 ms have passed and then clears it', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('Saved'))
  expect(result.current.message).toBe('Saved')
  act(() => {
    vi.advanceTimersByTime(3999)
  })
  expect(result.current.message).toBe('Saved')
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(result.current.message).toBe('')
})

it('restarts the timer for a newer notice so the older timer cannot clear it', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('A'))
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  act(() => result.current.notify('B'))
  expect(result.current.message).toBe('B')
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(result.current.message).toBe('B')
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(result.current.message).toBe('')
})

it('keeps a stable notify callback across notices', () => {
  const { result } = renderHook(() => useNotice())
  const first = result.current.notify
  act(() => result.current.notify('Hello'))
  expect(result.current.notify).toBe(first)
})
