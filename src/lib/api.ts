import type {
  BranchDetail,
  BranchMetaRequest,
  BranchSummary,
  CreateBranchRequest,
  ProjectSummary,
  ProposeRequest,
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
  /** Where translations live: a GitHub repo, or a local folder in development. */
  source: 'github' | 'local'
}

export const api = {
  me: () => request<User>('/api/me'),
  config: () => request<AppConfig>('/api/config'),
  logout: () => post<{ ok: true }>('/auth/logout'),
  projects: () => request<ProjectSummary[]>('/api/projects'),
  translations: (project: string, branch?: string) => {
    const params = new URLSearchParams({ project })
    if (branch) params.set('branch', branch)
    return request<TranslationSnapshot>(`/api/translations?${params}`)
  },
  branches: () => request<BranchSummary[]>('/api/branches'),
  branch: (branch: string) => request<BranchDetail>(`/api/branches/${encodeURIComponent(branch)}`),
  createBranch: (body: CreateBranchRequest) => post<{ branch: string }>('/api/branches', body),
  updateBranch: (branch: string, body: BranchMetaRequest) =>
    request<{ ok: true }>(`/api/branches/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  commitToBranch: (branch: string, body: WritePayload) =>
    post<{ sha: string; changedFiles: string[] }>(`/api/branches/${encodeURIComponent(branch)}/commit`, body),
  propose: (branch: string, body: ProposeRequest) =>
    post<PullRequestSummary>(`/api/branches/${encodeURIComponent(branch)}/propose`, body),
  deleteBranch: (branch: string) =>
    request<{ ok: true }>(`/api/branches/${encodeURIComponent(branch)}`, { method: 'DELETE' }),
  mergePull: (number: number) => post<{ ok: true }>(`/api/pulls/${number}/merge`),
  closePull: (number: number) => post<{ ok: true }>(`/api/pulls/${number}/close`),
}
