import { Link, Route, Routes, useNavigate } from 'react-router'
import { api } from './lib/api'
import { AuthGate } from './lib/auth'
import { useUser } from './lib/userContext'
import { useAsync } from './lib/useAsync'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'
import { PullRequestPage } from './pages/PullRequestPage'

export function App() {
  return (
    <AuthGate>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/edit" element={<EditorPage />} />
        <Route path="/pr/:number" element={<PullRequestPage />} />
        <Route path="/pr/:number/edit" element={<EditorPage />} />
        <Route path="*" element={<main className="page">{'Page not found'}</main>} />
      </Routes>
    </AuthGate>
  )
}

function Header() {
  const user = useUser()
  const navigate = useNavigate()
  const { data: config } = useAsync(() => api.config(), [])

  async function logout() {
    await api.logout()
    navigate(0)
  }

  return (
    <header className="header">
      <Link to="/" className="brand">
        {'Translation editor'}
      </Link>
      {config && (
        <a className="repo" href={`https://github.com/${config.repo}`} target="_blank" rel="noreferrer">
          {config.repo}
        </a>
      )}
      <span className="spacer" />
      <img className="avatar" src={user.avatarUrl} alt="" />
      <span>{user.name ?? user.login}</span>
      <button className="button small" onClick={logout}>
        {'Sign out'}
      </button>
    </header>
  )
}
