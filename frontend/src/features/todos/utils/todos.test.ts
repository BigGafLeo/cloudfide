import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo, TodoInput } from '../types'

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

  it('sorts by due date with undated tasks last and newest id first on ties', () => {
    const todos: Todo[] = [
      { ...base, id: 1, due_date: '2026-11-01' },
      { ...base, id: 2, due_date: null },
      { ...base, id: 3, due_date: '2026-10-05' },
      { ...base, id: 4, due_date: '2026-11-01' },
      { ...base, id: 5, due_date: null },
    ]
    expect(selectTodos(todos, 'all', '', 'due').map((t) => t.id)).toEqual([
      3, 4, 1, 5, 2,
    ])
  })

  it('sorts newest by created_at descending with ties broken by id descending', () => {
    const todos: Todo[] = [
      { ...base, id: 1, created_at: '2026-10-01T12:00:00Z' },
      { ...base, id: 2, created_at: '2026-10-03T12:00:00Z' },
      { ...base, id: 3, created_at: '2026-10-03T12:00:00Z' },
      { ...base, id: 4, created_at: '2026-10-02T12:00:00Z' },
    ]
    expect(selectTodos(todos, 'all', '', 'newest').map((t) => t.id)).toEqual([
      3, 2, 4, 1,
    ])
  })
})

describe('isOverdue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    ['yesterday, active', '2026-10-15', false, true],
    ['today, active', '2026-10-16', false, false],
    ['tomorrow, active', '2026-10-17', false, false],
    ['yesterday, completed', '2026-10-15', true, false],
    ['no due date, active', null, false, false],
  ])('at midday: %s', (_name, due_date, completed, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0))
    expect(isOverdue({ ...base, due_date, completed })).toBe(expected)
  })

  it.each([
    ['2026-10-15', true],
    ['2026-10-16', false],
  ])(
    'uses the local calendar date shortly after midnight (due %s)',
    (due_date, expected) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-16T00:30:00+02:00'))
      // Model local 00:30 at UTC+02 even when the runner uses another timezone.
      vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
      vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(9)
      vi.spyOn(Date.prototype, 'getDate').mockReturnValue(16)
      expect(isOverdue({ ...base, due_date })).toBe(expected)
    },
  )
})

describe('validateTodo', () => {
  const input: TodoInput = {
    title: 'Task',
    description: '',
    priority: 'medium',
    due_date: null,
    completed: false,
  }

  it.each([
    ['an empty title', { title: '' }, { title: 'Enter a task title.' }],
    [
      'a whitespace-only title',
      { title: '   ' },
      { title: 'Enter a task title.' },
    ],
    ['a 120-character title', { title: 'x'.repeat(120) }, {}],
    [
      'a 120-character title padded with spaces',
      { title: `  ${'x'.repeat(120)}  ` },
      {},
    ],
    [
      'a 121-character title',
      { title: 'x'.repeat(121) },
      { title: 'The title must be at most 120 characters.' },
    ],
    ['a 2000-character description', { description: 'x'.repeat(2000) }, {}],
    [
      'a 2001-character description',
      { description: 'x'.repeat(2001) },
      { description: 'The description must be at most 2000 characters.' },
    ],
    ['a leap day', { due_date: '2024-02-29' }, {}],
    ['no due date', { due_date: null }, {}],
    ['an empty due date', { due_date: '' }, {}],
    [
      'a rolled-over date',
      { due_date: '2026-02-30' },
      { due_date: 'Enter a valid date.' },
    ],
    [
      'a non-leap Feb 29',
      { due_date: '2025-02-29' },
      { due_date: 'Enter a valid date.' },
    ],
    [
      'an unpadded date',
      { due_date: '2026-1-5' },
      { due_date: 'Enter a valid date.' },
    ],
  ] as [string, Partial<TodoInput>, Record<string, string>][])(
    'validates %s',
    (_name, override, expected) => {
      expect(validateTodo({ ...input, ...override })).toEqual(expected)
    },
  )

  it('reports every invalid field together', () => {
    expect(
      validateTodo({
        ...input,
        title: '',
        description: 'x'.repeat(2001),
        due_date: '2026-02-30',
      }),
    ).toEqual({
      title: 'Enter a task title.',
      description: 'The description must be at most 2000 characters.',
      due_date: 'Enter a valid date.',
    })
  })
})
