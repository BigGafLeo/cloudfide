import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  let resolve: () => void = () => {}
  const deferred = new Promise<void>((r) => {
    resolve = r
  })
  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      todos: useMutation({
        mutationKey: todoKeys.update,
        mutationFn: () => deferred,
      }),
      other: useMutation({
        mutationKey: ['other'],
        mutationFn: () => deferred,
      }),
    }),
    { wrapper },
  )
  return { result, resolve: () => act(async () => resolve()) }
}

it('is false when no mutation is running', () => {
  const { result } = setup()
  expect(result.current.busy).toBe(false)
})

it('is true while a todos-keyed mutation is pending and false once it settles', async () => {
  const { result, resolve } = setup()
  act(() => {
    result.current.todos.mutate()
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await resolve()
  await waitFor(() => expect(result.current.todos.isSuccess).toBe(true))
  expect(result.current.busy).toBe(false)
})

it('ignores a pending mutation with an unrelated key', async () => {
  const { result, resolve } = setup()
  act(() => {
    result.current.other.mutate()
  })
  await waitFor(() => expect(result.current.other.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
  await resolve()
  await waitFor(() => expect(result.current.other.isSuccess).toBe(true))
  expect(result.current.busy).toBe(false)
})
