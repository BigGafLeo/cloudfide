import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from './http'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(impl: () => unknown) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('request', () => {
  it('prefixes /api, merges headers and returns the JSON body', async () => {
    const fetchMock = mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ a: 1 }),
    }))
    await expect(request('/path', { headers: { X: '1' } })).resolves.toEqual({
      a: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/path',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', X: '1' },
      }),
    )
  })

  it('resolves undefined for 204 without reading a body', async () => {
    const json = vi.fn()
    mockFetch(async () => ({ ok: true, status: 204, json }))
    await expect(request('/path')).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })

  it('maps a network failure to a friendly message', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(request('/path')).rejects.toThrow(
      'Cannot connect to the server. Please try again.',
    )
  })

  it('rethrows the original error when the request was aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = new DOMException('Aborted', 'AbortError')
    mockFetch(async () => {
      throw error
    })
    await expect(
      request('/path', { signal: controller.signal }),
    ).rejects.toBe(error)
  })

  it('maps 422 to the task details message', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ detail: [] }),
    }))
    await expect(request('/path')).rejects.toThrow(
      'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
    )
  })

  it('uses the server detail string for other errors', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Nope' }),
    }))
    await expect(request('/path')).rejects.toThrow('Nope')
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    }))
    await expect(request('/path')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })
})
