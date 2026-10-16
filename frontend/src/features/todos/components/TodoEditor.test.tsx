import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    onSubmit,
  }: {
    onSubmit: (input: TodoInput) => Promise<void>
  }) => <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>,
}))

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

function mockMutations(create: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
}

it('updates an existing task by its own id and reports the save', async () => {
  const user = userEvent.setup()
  const create = vi.fn()
  const update = vi.fn().mockResolvedValue(todoFixture)
  mockMutations(create, update)
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <TodoEditor
      todo={{ ...todoFixture, id: 9 }}
      busy={false}
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(onSaved).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledWith({ id: 9, input: todoFixture })
  expect(create).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

it.each([
  ['new' as const, 'create'],
  [{ ...todoFixture, id: 9 }, 'update'],
])('does not report a save or close when the %j save is rejected (%s)', async (todo, which) => {
  const user = userEvent.setup()
  const failing = vi.fn().mockRejectedValue(new Error('Server rejected'))
  const other = vi.fn()
  if (which === 'create') mockMutations(failing, other)
  else mockMutations(other, failing)
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <TodoEditor todo={todo} busy={false} onClose={onClose} onSaved={onSaved} />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(failing).toHaveBeenCalledTimes(1))
  await expect(failing.mock.results[0].value).rejects.toThrow('Server rejected')
  await act(async () => {
    await Promise.resolve()
  })
  expect(onSaved).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(other).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeVisible()
})
