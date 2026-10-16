import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

function renderItem(override: Partial<typeof todoFixture>) {
  const callbacks = { onEdit: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() }
  render(
    <TodoItem
      todo={{ ...todoFixture, ...override }}
      busy={false}
      {...callbacks}
    />,
  )
  return callbacks
}

it('shows a completed task with its description, no overdue marker, and forwards toggle and delete', async () => {
  const user = userEvent.setup()
  const { onEdit, onToggle, onDelete } = renderItem({
    completed: true,
    description: 'Notes',
    due_date: '2000-01-05',
  })
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.queryByText('To do')).not.toBeInTheDocument()
  expect(screen.getByText('Notes')).toBeVisible()
  const checkbox = screen.getByRole('checkbox', {
    name: `Mark as active: ${todoFixture.title}`,
  })
  expect(checkbox).toBeChecked()
  expect(screen.getByText(/5 Jan 2000/)).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  await user.click(checkbox)
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onDelete).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onEdit).not.toHaveBeenCalled()
})

it('marks an active task with a past due date as overdue', () => {
  renderItem({ completed: false, due_date: '2000-01-05' })
  expect(screen.getByText(/5 Jan 2000 · overdue/)).toBeVisible()
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).not.toBeChecked()
})

it('shows a future due date without the overdue marker', () => {
  renderItem({ completed: false, due_date: '2999-01-05' })
  expect(screen.getByText(/5 Jan 2999/)).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})
