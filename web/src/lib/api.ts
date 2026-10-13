export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; credentials?: RequestCredentials }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: init?.credentials ?? 'same-origin',
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText)
  return data as T
}
