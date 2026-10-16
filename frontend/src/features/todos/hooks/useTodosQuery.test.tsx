import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({
  todosApi: { list: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  return { queryClient, result }
}

it('loads tasks through the api with an abort signal and caches them under the list key', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { queryClient, result } = setup()
  await waitFor(() => expect(result.current.data).toEqual([todoFixture]))
  expect(todosApi.list).toHaveBeenCalledTimes(1)
  expect(vi.mocked(todosApi.list).mock.calls[0][0]).toBeInstanceOf(AbortSignal)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('exposes the api failure as the query error', async () => {
  vi.mocked(todosApi.list).mockRejectedValue(new Error('The server is unavailable.'))
  const { result } = setup()
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('The server is unavailable.')
  expect(result.current.data).toBeUndefined()
})
