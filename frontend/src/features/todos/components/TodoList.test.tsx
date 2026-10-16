import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: () => <p>Empty task list</p>,
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      <span>
        Task {todo.title} busy: {String(busy)}
      </span>
      <button onClick={() => onToggle()}>Toggle {todo.title}</button>
      <button onClick={() => onEdit()}>Edit {todo.title}</button>
      <button onClick={() => onDelete()}>Delete {todo.title}</button>
    </li>
  ),
}))

const baseProps = {
  todos: [],
  hasTodos: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('shows the unavailable message instead of the empty state when loading failed with no known tasks', () => {
  render(<TodoList {...baseProps} loading={false} failed hasTodos={false} />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps the empty state when a failure happens while known tasks are filtered out', () => {
  render(<TodoList {...baseProps} loading={false} failed hasTodos />)
  expect(screen.getByText('Empty task list')).toBeVisible()
  expect(
    screen.queryByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).not.toBeInTheDocument()
})

it('binds each row callback to its own task and passes busy through', async () => {
  const user = userEvent.setup()
  const first: Todo = { ...todoFixture, id: 1, title: 'First task' }
  const second: Todo = { ...todoFixture, id: 2, title: 'Second task' }
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoList
      {...baseProps}
      todos={[first, second]}
      hasTodos
      loading={false}
      busy
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  expect(screen.getAllByText(/busy: true/)).toHaveLength(2)

  await user.click(screen.getByRole('button', { name: 'Toggle Second task' }))
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onToggle).toHaveBeenCalledWith(second)
  expect(onToggle).not.toHaveBeenCalledWith(first)
  expect(onEdit).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Edit Second task' }))
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onEdit).toHaveBeenCalledWith(second)
  expect(onEdit).not.toHaveBeenCalledWith(first)
  expect(onDelete).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Delete Second task' }))
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onDelete).toHaveBeenCalledWith(second)
  expect(onDelete).not.toHaveBeenCalledWith(first)
})
