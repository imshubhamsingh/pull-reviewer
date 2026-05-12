export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly url: string,
    public readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type QueryValue = string | number | boolean | null | undefined
type Query = Record<string, QueryValue>

export interface HttpClient {
  get<T>(path: string, query?: Query, init?: RequestInit): Promise<T>
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>
  del<T>(path: string, init?: RequestInit): Promise<T>
  stream(path: string, init?: RequestInit): Promise<Response>
}

const defaultHeaders = { 'Content-Type': 'application/json' }

export function buildClient(getBaseUrl: () => Promise<string>): HttpClient {
  async function request(path: string, init: RequestInit): Promise<Response> {
    const baseUrl = await getBaseUrl()
    const url = `${baseUrl}${path}`
    const method = init.method ?? 'GET'

    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: new Headers({ ...defaultHeaders, ...init.headers }),
      })
    } catch (err) {
      throw new ApiError(0, method, url, null, `Network error: ${(err as Error).message}`)
    }

    if (!response.ok) {
      const body = await parseBody(response)
      const message =
        (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
          ? body.error
          : undefined) ?? `HTTP ${response.status} on ${method} ${path}`
      throw new ApiError(response.status, method, url, body, message)
    }

    return response
  }

  async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await request(path, init)
    return (await parseBody(response)) as T
  }

  function withQuery(path: string, query?: Query): string {
    if (!query) return path
    const entries = Object.entries(query).filter(([, v]) => v != null) as [string, QueryValue][]
    if (entries.length === 0) return path
    const search = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
    return path.includes('?') ? `${path}&${search}` : `${path}?${search}`
  }

  return {
    get: <T,>(path: string, query?: Query, init?: RequestInit) =>
      requestJson<T>(withQuery(path, query), { ...init, method: 'GET' }),
    post: <T,>(path: string, body?: unknown, init?: RequestInit) =>
      requestJson<T>(path, { ...init, method: 'POST', body: body == null ? undefined : JSON.stringify(body) }),
    patch: <T,>(path: string, body?: unknown, init?: RequestInit) =>
      requestJson<T>(path, { ...init, method: 'PATCH', body: body == null ? undefined : JSON.stringify(body) }),
    del: <T,>(path: string, init?: RequestInit) =>
      requestJson<T>(path, { ...init, method: 'DELETE' }),
    stream: (path: string, init?: RequestInit) =>
      request(path, { ...init, method: init?.method ?? 'GET' }),
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
