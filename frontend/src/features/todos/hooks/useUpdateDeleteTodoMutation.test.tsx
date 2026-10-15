import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn() },
}))

const a = { ...todoFixture, id: 1, title: 'A' }
const b = { ...todoFixture, id: 2, title: 'B' }

beforeEach(() => {
  vi.mocked(todosApi.update).mockReset()
  vi.mocked(todosApi.remove).mockReset()
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

it('replaces only the matching task in the cached list on update', async () => {
  const { client, wrapper } = setup()
  const saved = { ...b, completed: true }
  client.setQueryData(todoKeys.list, [a, b])
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ id: 2, input: { completed: true } })
  })
  expect(todosApi.update).toHaveBeenCalledWith(2, { completed: true })
  expect(client.getQueryData(todoKeys.list)).toEqual([a, saved])
})

it('leaves an unseeded cache untouched on update', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.update).mockResolvedValue(b)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ id: 2, input: { title: 'B' } })
  })
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('removes the deleted task from the cached list', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [a, b])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(1)
  })
  expect(todosApi.remove).toHaveBeenCalledWith(1)
  expect(client.getQueryData(todoKeys.list)).toEqual([b])
})

it('leaves an unseeded cache untouched on delete', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(1)
  })
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})
