import { Link } from 'react-router'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Status } from '../components/Status'
import { formatDate } from '../lib/format'

export function HomePage() {
  const { data: pulls, error, loading } = useAsync(() => api.pulls(), [])
  const { data: config } = useAsync(() => api.config(), [])

  return (
    <main className="page">
      <div className="page-header">
        <h1>{'Open translation changes'}</h1>
        <Link to="/edit" className="button primary">
          {'Edit translations'}
        </Link>
      </div>
      {config && (
        <p className="muted">{`Edits are made against ${config.baseBranch} and proposed as pull requests on ${config.repo}.`}</p>
      )}
      <Status loading={loading} error={error} />
      {pulls && pulls.length === 0 && <p className="muted">{'No open translation pull requests.'}</p>}
      {pulls && pulls.length > 0 && (
        <ul className="pr-list">
          {pulls.map((pr) => (
            <li key={pr.number}>
              <Link to={`/pr/${pr.number}`} className="pr-item">
                <img className="avatar" src={pr.authorAvatar} alt="" />
                <span className="pr-title">
                  {pr.draft && <span className="pill">{'Draft'}</span>}
                  {pr.title}
                </span>
                <span className="muted">{`#${pr.number} by ${pr.author} · updated ${formatDate(pr.updatedAt)}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
