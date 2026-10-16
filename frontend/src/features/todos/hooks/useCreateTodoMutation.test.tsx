import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo, TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { create: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  return { queryClient, result }
}

const older: Todo = { ...todoFixture, id: 3, title: 'Older task' }
const saved: Todo = { ...todoFixture, id: 7, title: 'Saved from server' }
const input: TodoInput = {
  title: saved.title,
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

it('sends the input and puts the saved task first without duplicating its id', async () => {
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [older, todoFixture])
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  await expect(result.current.mutateAsync(input)).resolves.toEqual(saved)
  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, older])
})

it('creates the list cache when none exists', async () => {
  const { queryClient, result } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  await result.current.mutateAsync(input)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved])
})

it('cancels an in-flight list fetch so it cannot overwrite the saved task', async () => {
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [older])
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
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  await result.current.mutateAsync(input)
  expect(signal?.aborted).toBe(true)
  resolveFetch([older, { ...saved, title: 'Stale server copy' }])
  await fetching
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, older])
})
