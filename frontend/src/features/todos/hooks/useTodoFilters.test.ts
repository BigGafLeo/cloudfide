import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const alpha: Todo = {
  ...todoFixture,
  id: 1,
  title: 'Alpha',
  completed: true,
  priority: 'high',
  due_date: '2026-10-10',
  created_at: '2026-10-01T12:00:00Z',
}
const beta: Todo = {
  ...todoFixture,
  id: 2,
  title: 'Beta',
  completed: false,
  priority: 'low',
  due_date: '2026-10-20',
  created_at: '2026-10-02T12:00:00Z',
}
const todos = [alpha, beta]
const ids = (list: Todo[]) => list.map((todo) => todo.id)

it('starts with all statuses, empty search and newest-first order', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(ids(result.current.visible)).toEqual([2, 1])
})

it('recomputes visible tasks from the filter and search setters', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.filter).toBe('completed')
  expect(ids(result.current.visible)).toEqual([1])
  act(() => result.current.setFilter('all'))
  act(() => result.current.setSearch('alp'))
  expect(result.current.search).toBe('alp')
  expect(ids(result.current.visible)).toEqual([1])
  act(() => result.current.setFilter('completed'))
  act(() => result.current.setSearch('beta'))
  expect(result.current.visible).toEqual([])
})

it('recomputes visible tasks from the sort setter', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(ids(result.current.visible)).toEqual([1, 2])
  act(() => result.current.setSort('due'))
  expect(result.current.sort).toBe('due')
  expect(ids(result.current.visible)).toEqual([1, 2])
})
