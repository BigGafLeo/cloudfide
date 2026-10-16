import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodoEmptyState } from './TodoEmptyState'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('invites creating the first task and calls onCreate when enabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(<TodoEmptyState hasTodos={false} disabled={false} onCreate={onCreate} />)
  expect(
    screen.getByRole('heading', { name: 'Add your first task' }),
  ).toBeVisible()
  expect(
    screen.getByText('Write down what you need to do and get started.'),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Add your first task' }))
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('disables the create button and ignores clicks when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(<TodoEmptyState hasTodos={false} disabled onCreate={onCreate} />)
  const button = screen.getByRole('button', { name: 'Add your first task' })
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).not.toHaveBeenCalled()
})

it('shows filter guidance and no create button when tasks exist but none match', () => {
  render(<TodoEmptyState hasTodos disabled={false} onCreate={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'No matching tasks' })).toBeVisible()
  expect(
    screen.getByText('Change the status filter or search to find your tasks.'),
  ).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByText('Add your first task')).not.toBeInTheDocument()
})
