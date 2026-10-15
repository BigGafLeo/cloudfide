import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../test/todoFixture'
import { useNotice } from '../../hooks/useNotice'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({ onCreate }: { onCreate: () => void }) => (
    <div>
      <h1>Tasks</h1>
      <button onClick={onCreate}>Create from header</button>
    </div>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    onToggle,
    onDelete,
  }: {
    onToggle: (todo: unknown) => void
    onDelete: (todo: unknown) => void
  }) => (
    <div>
      <p>Task list</p>
      <button onClick={() => onToggle(todoFixture)}>Toggle task</button>
      <button onClick={() => onDelete(todoFixture)}>Delete task</button>
    </div>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: {
    todo: unknown
    onClose: () => void
    onSaved: (message: string) => void
  }) => (
    <div data-testid="editor">
      <span>{todo === 'new' ? 'editor:new' : 'editor:existing'}</span>
      <button onClick={() => onSaved('Saved!')}>Save editor</button>
      <button onClick={onClose}>Close editor</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onClose,
    onDeleted,
  }: {
    todo: { title: string }
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div data-testid="delete-dialog">
      <span>{`delete:${todo.title}`}</span>
      <button onClick={onDeleted}>Confirm deleted</button>
      <button onClick={onClose}>Close delete</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

function setup({ busy = false }: { busy?: boolean } = {}) {
  const mutateAsync = vi.fn()
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todoFixture],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset: vi.fn(),
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [todoFixture],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  return { mutateAsync, notify }
}

it('toggles a task to completed and congratulates the user', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup()
  mutateAsync.mockResolvedValue({ ...todoFixture, completed: true })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Toggle task' }))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: true },
  })
  expect(notify).toHaveBeenCalledWith('Another task complete. Well done!')
})

it('announces when a task is marked as active again', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup()
  mutateAsync.mockResolvedValue({ ...todoFixture, completed: false })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Toggle task' }))
  expect(notify).toHaveBeenCalledWith('Task marked as active.')
})

it('swallows a failed toggle without a notice', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup()
  mutateAsync.mockRejectedValue(new Error('fail'))
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Toggle task' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('does not toggle while busy', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup({ busy: true })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Toggle task' }))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('opens the new-task editor, closes it on save and notifies', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Create from header' }))
  expect(screen.getByText('editor:new')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Save editor' }))
  expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Saved!')
})

it('closes the editor without a notice', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Create from header' }))
  await user.click(screen.getByRole('button', { name: 'Close editor' }))
  expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('opens the delete dialog for a task and notifies after deletion', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  expect(screen.getByText(`delete:${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Confirm deleted' }))
  expect(screen.queryByTestId('delete-dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})

it('closes the delete dialog without a notice', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await user.click(screen.getByRole('button', { name: 'Close delete' }))
  expect(screen.queryByTestId('delete-dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
