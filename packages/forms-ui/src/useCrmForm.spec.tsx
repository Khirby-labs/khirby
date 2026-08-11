import { jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCrmForm } from './useCrmForm.js'

describe('useCrmForm', () => {
  function mockResponse(data: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => data,
    }
  }

  it('loads fields and becomes ready', async () => {
    const fetchMock = jest.fn(async () =>
      mockResponse({
        name: 'Contact',
        slug: 'contact',
        kind: 'contact',
        fields: [
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'name', label: 'Name', type: 'text', required: true },
        ],
      }),
    )

    const { result } = renderHook(() =>
      useCrmForm({
        token: 'tok',
        baseUrl: 'https://crm.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }),
    )

    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })

    expect(result.current.fields).toHaveLength(2)
    expect(result.current.values).toEqual({ email: '', name: '' })
    expect(fetchMock).toHaveBeenCalled()
  })

  it('validates required fields before submit', async () => {
    const fetchMock = jest.fn(async () =>
      mockResponse({
        name: 'Contact',
        slug: 'contact',
        kind: 'contact',
        fields: [
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'name', label: 'Name', type: 'text', required: true },
        ],
      }),
    )

    const { result } = renderHook(() =>
      useCrmForm({
        token: 'tok',
        baseUrl: 'https://crm.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }),
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.fieldErrors.name).toBeTruthy()
    expect(result.current.fieldErrors.email).toBeTruthy()
  })

  it('submits flat values to CRM', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/submit')) {
        expect(init?.method).toBe('POST')
        const body = JSON.parse(String(init?.body))
        expect(body).toMatchObject({
          email: 'jan@example.com',
          name: 'Jan',
          _hp: '',
        })
        return mockResponse({
          success: true,
          contactId: 'c1',
          submissionId: 's1',
        })
      }
      return mockResponse({
        name: 'Contact',
        slug: 'contact',
        kind: 'contact',
        fields: [
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'name', label: 'Name', type: 'text', required: true },
        ],
      })
    })

    const { result } = renderHook(() =>
      useCrmForm({
        token: 'tok',
        baseUrl: 'https://crm.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }),
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => {
      result.current.setValue('email', 'jan@example.com')
      result.current.setValue('name', 'Jan')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.status).toBe('success')
    expect(result.current.result?.contactId).toBe('c1')
  })
})
