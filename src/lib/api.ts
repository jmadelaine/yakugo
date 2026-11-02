import type {
  ProposeRequest,
  PullRequestDetail,
  PullRequestSummary,
  TranslationSnapshot,
  User,
  WritePayload,
} from '@shared/types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let message = response.statusText
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // Body was not JSON; keep the status text.
    }
    throw new ApiError(response.status, message)
  }
  return (await response.json()) as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

export interface AppConfig {
  repo: string
  baseBranch: string
  localesDir: string
}

export const api = {
  me: () => request<User>('/api/me'),
  config: () => request<AppConfig>('/api/config'),
  logout: () => post<{ ok: true }>('/auth/logout'),
  translations: (branch?: string) =>
    request<TranslationSnapshot>(`/api/translations${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`),
  propose: (body: ProposeRequest) => post<PullRequestSummary>('/api/propose', body),
  pulls: () => request<PullRequestSummary[]>('/api/pulls'),
  pull: (number: number) => request<PullRequestDetail>(`/api/pulls/${number}`),
  commitToPull: (number: number, body: WritePayload & { message?: string }) =>
    post<{ sha: string; changedFiles: string[] }>(`/api/pulls/${number}/commit`, body),
  mergePull: (number: number) => post<{ ok: true }>(`/api/pulls/${number}/merge`),
  closePull: (number: number) => post<{ ok: true }>(`/api/pulls/${number}/close`),
}
