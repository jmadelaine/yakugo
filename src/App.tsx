import { Link, Route, Routes, useNavigate } from 'react-router'
import { Avatar } from './components/Avatar'
import { Button } from './components/Button'
import { api } from './lib/api'
import { AuthGate } from './lib/auth'
import { useUser } from './lib/userContext'
import { useAsync } from './lib/useAsync'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'
import { ChangePage } from './pages/ChangePage'
import { ProjectPage } from './pages/ProjectPage'

export function App() {
  return (
    <AuthGate>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project/:project" element={<ProjectPage />} />
        <Route path="/change/:branch" element={<ChangePage />} />
        <Route path="/change/:branch/edit/:project" element={<EditorPage />} />
        <Route
          path="*"
          element={
            <main className="page">
              <h1>{'Page not found'}</h1>
            </main>
          }
        />
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
      {config && config.source === 'github' && (
        <a className="repo" href={`https://github.com/${config.repo}`} target="_blank" rel="noreferrer">
          {config.repo}
        </a>
      )}
      {config && config.source === 'local' && <span className="repo">{config.repo}</span>}
      <div className="header-user">
        <Avatar src={user.avatarUrl} name={user.name ?? user.login} />
        <span>{user.name ?? user.login}</span>
        <Button onClick={logout}>{'Sign out'}</Button>
      </div>
    </header>
  )
}
