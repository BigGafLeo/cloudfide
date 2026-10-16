import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { update: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  return { queryClient, result }
}

const older: Todo = { ...todoFixture, id: 3, title: 'Older task' }
const newer: Todo = { ...todoFixture, id: 9, title: 'Newer task' }
const saved: Todo = { ...todoFixture, completed: true }

it('sends the id and partial input and replaces only the matching task in place', async () => {
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [older, todoFixture, newer])
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  await expect(
    result.current.mutateAsync({ id: 7, input: { completed: true } }),
  ).resolves.toEqual(saved)
  expect(todosApi.update).toHaveBeenCalledWith(7, { completed: true })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([older, saved, newer])
})

it('does not create a list cache when none exists', async () => {
  const { queryClient, result } = setup()
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  await result.current.mutateAsync({ id: 7, input: { completed: true } })
  expect(todosApi.update).toHaveBeenCalledWith(7, { completed: true })
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('cancels an in-flight list fetch so a stale copy cannot overwrite the saved task', async () => {
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [older, todoFixture])
  let signal: AbortSignal | undefined
  let resolveFetch: (value: Todo[]) => void = () => {}
  const pending = new Promise<Todo[]>((resolve) => {
    resolveFetch = resolve
  })
  const fetching = queryClient
    .fetchQuery({
      queryKey: todoKeys.list,
      queryFn: (context) => {
        signal = context.signal
        return pending
      },
      staleTime: 0,
    })
    .catch(() => undefined)
  expect(signal).toBeDefined()
  expect(signal?.aborted).toBe(false)
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  await result.current.mutateAsync({ id: 7, input: { completed: true } })
  expect(signal?.aborted).toBe(true)
  resolveFetch([older, { ...todoFixture, completed: false }])
  await fetching
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([older, saved])
})
