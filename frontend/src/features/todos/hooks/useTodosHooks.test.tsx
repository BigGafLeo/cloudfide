import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'
import { useTodoFilters } from './useTodoFilters'
import { useTodosBusy } from './useTodosBusy'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({
  todosApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(todosApi.create).mockReset()
  vi.mocked(todosApi.list).mockReset()
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

it('loads the list and passes the abort signal to the API', async () => {
  const { wrapper } = setup()
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([todoFixture])
  expect(todosApi.list).toHaveBeenCalledWith(expect.any(AbortSignal))
})

it('is busy only while a todo mutation is pending', async () => {
  const { wrapper } = setup()
  let resolve!: (value: typeof todoFixture) => void
  vi.mocked(todosApi.create).mockReturnValue(
    new Promise((r) => {
      resolve = r
    }),
  )
  const { result } = renderHook(
    () => ({ busy: useTodosBusy(), mutation: useCreateTodoMutation() }),
    { wrapper },
  )
  expect(result.current.busy).toBe(false)
  act(() => {
    void result.current.mutation.mutateAsync(todoFixture)
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => {
    resolve(todoFixture)
  })
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('defaults filters and updates the visible list when the filter changes', () => {
  const active = { ...todoFixture, id: 1 }
  const done = { ...todoFixture, id: 2, completed: true }
  const { result } = renderHook(() => useTodoFilters([active, done]))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
  act(() => result.current.setFilter('completed'))
  expect(result.current.filter).toBe('completed')
  expect(result.current.visible.map((t) => t.id)).toEqual([2])
})
