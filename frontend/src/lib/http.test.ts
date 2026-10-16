import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from './http'

function stubFetch(impl: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function response(status: number, json: () => Promise<unknown>) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(json) }
}

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('prefixes the path with /api and sends JSON headers merged with caller headers', async () => {
    const fetchMock = stubFetch(async () =>
      response(200, async () => ({ ok: true })),
    )
    await request('/todos', { method: 'POST', headers: { 'X-Test': '1' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/todos')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Test': '1',
    })
  })

  it('resolves the parsed body of a successful response', async () => {
    stubFetch(async () => response(200, async () => [{ id: 1 }]))
    await expect(request('/todos')).resolves.toEqual([{ id: 1 }])
  })

  it('resolves undefined for 204 without reading a body', async () => {
    const res = response(204, async () => {
      throw new Error('no body')
    })
    stubFetch(async () => res)
    await expect(request('/todos/1', { method: 'DELETE' })).resolves.toBeUndefined()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('reports a connection problem when the network fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(request('/todos')).rejects.toThrow(
      'Cannot connect to the server. Please try again.',
    )
  })

  it('reports a connection problem when a non-aborted signal was supplied', async () => {
    const controller = new AbortController()
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(
      request('/todos', { signal: controller.signal }),
    ).rejects.toThrow('Cannot connect to the server. Please try again.')
  })

  it('rethrows the original error when the caller aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('Aborted', 'AbortError')
    stubFetch(async () => {
      throw abortError
    })
    const error = await request('/todos', { signal: controller.signal }).catch(
      (e: unknown) => e,
    )
    expect(error).toBe(abortError)
  })

  it('explains validation limits for a 422 even when the body has a detail', async () => {
    stubFetch(async () => response(422, async () => ({ detail: 'raw detail' })))
    const error = await request('/todos').catch((e: unknown) => e as Error)
    expect((error as Error).message).toBe(
      'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
    )
  })

  it('uses the server detail string for other failures', async () => {
    stubFetch(async () => response(500, async () => ({ detail: 'Boom' })))
    await expect(request('/todos')).rejects.toThrow('Boom')
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    stubFetch(async () =>
      response(500, async () => {
        throw new SyntaxError('Unexpected token <')
      }),
    )
    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })

  it('falls back to a generic message when detail is not a string', async () => {
    stubFetch(async () => response(404, async () => ({ detail: [{ msg: 'x' }] })))
    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })
})
