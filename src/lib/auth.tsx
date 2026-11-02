import type { ReactNode } from 'react'
import { api, ApiError } from './api'
import { useAsync } from './useAsync'
import { Status } from '../components/Status'
import { UserContext } from './userContext'

/** Shows a sign-in screen until the GitHub session exists. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: user, error, loading } = useAsync(
    () =>
      api.me().catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) return undefined
        throw reason
      }),
    [],
  )

  if (loading) return <Status loading />
  if (error) return <Status error={error} />
  if (!user) return <SignIn />
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

function SignIn() {
  return (
    <main className="signin">
      <h1>{'Translation editor'}</h1>
      <p>{'Edit translations in a table and propose them as GitHub pull requests.'}</p>
      <a className="button primary" href="/auth/login">
        {'Sign in with GitHub'}
      </a>
    </main>
  )
}
