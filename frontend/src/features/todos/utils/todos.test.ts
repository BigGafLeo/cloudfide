import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

afterEach(() => vi.useRealTimers())

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('returns only completed tasks for the completed filter', () => {
    const todos = [
      { ...base, id: 1 },
      { ...base, id: 2, completed: true },
    ]
    expect(
      selectTodos(todos, 'completed', '', 'newest').map((t) => t.id),
    ).toEqual([2])
  })

  it('sorts by due date with missing dates last and id as tiebreak', () => {
    const todos = [
      { ...base, id: 1, due_date: '2026-10-20' },
      { ...base, id: 2 },
      { ...base, id: 3, due_date: '2026-10-10' },
      { ...base, id: 4 },
    ]
    expect(selectTodos(todos, 'all', '', 'due').map((t) => t.id)).toEqual([
      3, 1, 4, 2,
    ])
  })

  it('sorts newest first and breaks ties by higher id', () => {
    const todos = [
      { ...base, id: 1, created_at: '2026-10-01T12:00:00Z' },
      { ...base, id: 2, created_at: '2026-10-03T12:00:00Z' },
      { ...base, id: 3, created_at: '2026-10-03T12:00:00Z' },
    ]
    expect(selectTodos(todos, 'all', '', 'newest').map((t) => t.id)).toEqual([
      3, 2, 1,
    ])
  })
})

describe('validateTodo', () => {
  const valid = {
    title: 'Task',
    description: '',
    priority: 'medium' as const,
    due_date: null,
    completed: false,
  }

  it('accepts boundary values', () => {
    expect(
      validateTodo({
        ...valid,
        title: 'x'.repeat(120),
        description: 'x'.repeat(2000),
        due_date: '2024-02-29',
      }),
    ).toEqual({})
  })

  it('rejects a blank title', () => {
    expect(validateTodo({ ...valid, title: '  ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('rejects an over-long title and description', () => {
    expect(
      validateTodo({
        ...valid,
        title: 'x'.repeat(121),
        description: 'x'.repeat(2001),
      }),
    ).toEqual({
      title: 'The title must be at most 120 characters.',
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each(['2026-02-30', '2025-02-29', '2026-1-1', 'abc'])(
    'rejects invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...valid, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )
})

describe('isOverdue', () => {
  function at(due_date: string | null, completed = false) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0))
    return isOverdue({ ...base, due_date, completed })
  }

  it('is true for an incomplete task due before today', () => {
    expect(at('2026-10-14')).toBe(true)
  })
  it('is false for a task due today', () => {
    expect(at('2026-10-15')).toBe(false)
  })
  it('is false without a due date', () => {
    expect(at(null)).toBe(false)
  })
  it('is false for a completed task', () => {
    expect(at('2026-10-14', true)).toBe(false)
  })
})

describe('formatDate', () => {
  it.each([
    ['2026-10-15', '15 Oct 2026'],
    ['2024-02-29', '29 Feb 2024'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatDate(input)).toBe(expected)
  })
})
