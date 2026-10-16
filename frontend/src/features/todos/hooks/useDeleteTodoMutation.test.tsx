import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { remove: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  return { queryClient, result }
}

const older: Todo = { ...todoFixture, id: 3, title: 'Older task' }
const newer: Todo = { ...todoFixture, id: 9, title: 'Newer task' }

it('removes the task by id and keeps the others in order', async () => {
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [older, todoFixture, newer])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  await result.current.mutateAsync(7)
  expect(todosApi.remove).toHaveBeenCalledWith(7)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([older, newer])
})

it('does not create a list cache when none exists', async () => {
  const { queryClient, result } = setup()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  await result.current.mutateAsync(7)
  expect(todosApi.remove).toHaveBeenCalledWith(7)
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('leaves the cache untouched when the delete fails', async () => {
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [older, todoFixture])
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Server down'))
  await expect(result.current.mutateAsync(7)).rejects.toThrow('Server down')
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([older, todoFixture])
})

it('cancels an in-flight list fetch so a stale list cannot resurrect the deleted task', async () => {
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
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  await result.current.mutateAsync(7)
  expect(signal?.aborted).toBe(true)
  resolveFetch([older, todoFixture])
  await fetching
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([older])
})
