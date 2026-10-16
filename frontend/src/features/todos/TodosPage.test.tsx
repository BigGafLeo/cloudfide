import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../test/todoFixture'
import { useNotice } from '../../hooks/useNotice'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

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
    <>
      <h1>Tasks</h1>
      <button onClick={onCreate}>Create task</button>
    </>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todos: Todo[]
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <>
      <p>Task list</p>
      {todos.map((todo) => (
        <div key={todo.id}>
          <button onClick={() => onToggle(todo)}>Toggle {todo.title}</button>
          <button onClick={() => onEdit(todo)}>Edit {todo.title}</button>
          <button onClick={() => onDelete(todo)}>Delete {todo.title}</button>
        </div>
      ))}
    </>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onSaved,
    onClose,
  }: {
    todo: Todo | 'new'
    onSaved: (message: string) => void
    onClose: () => void
  }) => (
    <div>
      <p>Editor</p>
      <p>Editing: {todo === 'new' ? 'new' : todo.title}</p>
      <button
        onClick={() =>
          onSaved(todo === 'new' ? 'New task added.' : 'Changes saved.')
        }
      >
        Save editor
      </button>
      <button onClick={() => onClose()}>Cancel editor</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onDeleted,
    onClose,
  }: {
    todo: Todo
    onDeleted: () => void
    onClose: () => void
  }) => (
    <div>
      <p>Dialog: {todo.title}</p>
      <button onClick={() => onDeleted()}>Confirm delete</button>
      <button onClick={() => onClose()}>Cancel delete</button>
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

function mockPage(
  todo: Todo,
  mutateAsync: ReturnType<typeof vi.fn>,
  busy = false,
) {
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todo],
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
    visible: [todo],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  return notify
}

it.each([
  [false, true, 'Another task complete. Well done!'],
  [true, false, 'Task marked as active.'],
  [false, false, 'Task marked as active.'],
])(
  'toggles a task with completed=%s by sending the opposite state (saved: %s)',
  async (initial, savedCompleted, message) => {
    const user = userEvent.setup()
    const todo: Todo = { ...todoFixture, id: 12, completed: initial }
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ ...todo, completed: savedCompleted })
    const notify = mockPage(todo, mutateAsync)
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: /^Toggle / }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith(message))
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 12,
      input: { completed: !initial },
    })
    expect(notify).toHaveBeenCalledTimes(1)
  },
)

it('ignores toggle requests while the page is busy', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockResolvedValue(todoFixture)
  const notify = mockPage(todoFixture, mutateAsync, true)
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: /^Toggle / }))
  await act(async () => {
    await Promise.resolve()
  })
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('shows no notice when a toggle fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('Server down'))
  const notify = mockPage(todoFixture, mutateAsync)
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: /^Toggle / }))
  await waitFor(() =>
    expect(mutateAsync).toHaveBeenCalledWith({
      id: todoFixture.id,
      input: { completed: true },
    }),
  )
  await expect(mutateAsync.mock.results[0].value).rejects.toThrow('Server down')
  await act(async () => {
    await Promise.resolve()
  })
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor on create and closes it with the notice when saved', async () => {
  const user = userEvent.setup()
  const notify = mockPage(todoFixture, vi.fn())
  render(<TodosPage />)
  expect(screen.queryByText('Editor')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Create task' }))
  expect(screen.getByText('Editor')).toBeVisible()
  expect(notify).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save editor' }))
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith('New task added.')
  expect(screen.queryByText('Editor')).not.toBeInTheDocument()
})

it('opens the editor for the chosen task and closes it with the saved notice', async () => {
  const user = userEvent.setup()
  const first: Todo = { ...todoFixture, id: 1, title: 'First task' }
  const second: Todo = { ...todoFixture, id: 2, title: 'Second task' }
  const notify = mockPage(first, vi.fn())
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [first, second],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.queryByText(/^Editing:/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit Second task' }))
  expect(screen.getByText('Editing: Second task')).toBeVisible()
  expect(screen.queryByText('Editing: First task')).not.toBeInTheDocument()
  expect(screen.queryByText('Editing: new')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save editor' }))
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith('Changes saved.')
  expect(screen.queryByText(/^Editing:/)).not.toBeInTheDocument()
})

it('closes the editor without any notice when it is cancelled', async () => {
  const user = userEvent.setup()
  const notify = mockPage(todoFixture, vi.fn())
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Create task' }))
  expect(screen.getByText('Editor')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cancel editor' }))
  expect(screen.queryByText('Editor')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Create task' }))
  expect(screen.getByText('Editor')).toBeVisible()
})

it('opens the delete dialog for the chosen task and closes it with a notice once deleted', async () => {
  const user = userEvent.setup()
  const first: Todo = { ...todoFixture, id: 1, title: 'First task' }
  const second: Todo = { ...todoFixture, id: 2, title: 'Second task' }
  const notify = mockPage(first, vi.fn())
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [first, second],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.queryByText(/^Dialog:/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete Second task' }))
  expect(screen.getByText('Dialog: Second task')).toBeVisible()
  expect(screen.queryByText('Dialog: First task')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  expect(screen.queryByText(/^Dialog:/)).not.toBeInTheDocument()
})

it('closes the delete dialog without any notice when it is cancelled', async () => {
  const user = userEvent.setup()
  const notify = mockPage(todoFixture, vi.fn())
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )
  expect(screen.getByText(`Dialog: ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cancel delete' }))
  expect(screen.queryByText(/^Dialog:/)).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
