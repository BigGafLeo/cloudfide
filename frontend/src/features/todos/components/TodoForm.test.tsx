import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

describe('TodoForm', () => {
  it('rejects a whitespace-only title without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '   ')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values and the selected priority', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Prepare a demo',
      description: '',
      priority: 'high',
      due_date: null,
      completed: false,
    })
  })

  it('submits a trimmed description and the chosen due date', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), 'T')
    await user.type(screen.getByLabelText(/Description/), '  notes  ')
    fireEvent.change(screen.getByLabelText(/Due date/), {
      target: { value: '2026-10-15' },
    })
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'T',
      description: 'notes',
      priority: 'medium',
      due_date: '2026-10-15',
      completed: false,
    })
  })

  it('submits null rather than an empty string after the due date is cleared', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), 'T')
    const due = screen.getByLabelText(/Due date/)
    fireEvent.change(due, { target: { value: '2026-10-15' } })
    expect(due).toHaveValue('2026-10-15')
    fireEvent.change(due, { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].due_date).toBeNull()
  })

  it('shows an external error and calls onCancel without submitting', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        busy={false}
        error="Server rejected"
      />,
    )
    expect(screen.getByTestId('alert')).toHaveTextContent('Server rejected')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows no alert without an error', () => {
    render(
      <TodoForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  })

  it('disables the controls and ignores Cancel while busy', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm onSubmit={onSubmit} onCancel={onCancel} busy error={null} />,
    )
    const save = screen.getByRole('button', { name: 'Saving…' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(save).toBeDisabled()
    expect(cancel).toBeDisabled()
    expect(screen.getByLabelText(/Task title/)).toBeDisabled()
    await user.click(cancel)
    await user.click(save)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
