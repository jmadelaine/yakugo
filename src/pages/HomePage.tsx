import { Link } from 'react-router'
import { Avatar } from '../components/Avatar'
import { CreateChangeButton } from '../components/CreateChangeButton'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { Status } from '../components/Status'
import { formatDate } from '../lib/format'
import { changePath } from '../lib/routes'

export function HomePage() {
  const { data: projects, error: projectsError, loading: projectsLoading } = useAsync(() => api.projects(), [])
  const { data: branches, error, loading } = useAsync(() => api.branches(), [])
  const { data: config } = useAsync(() => api.config(), [])

  return (
    <main className="page">
      <h1>{'Projects'}</h1>
      {config && (
        <p className="muted">{`Edits are made against ${config.baseBranch} in ${config.repo} and submitted for review.`}</p>
      )}
      <Status loading={projectsLoading} error={projectsError} />
      {projects && (
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={`/project/${project.id}`} className="project-card">
                <h2 className="project-name">{project.name}</h2>
                <code className="muted">{project.path || '/'}</code>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="section-header">
        <h2>{'Changes'}</h2>
        <CreateChangeButton destination={(branch) => changePath(branch)} />
      </div>
      <Status loading={loading} error={error} />
      {branches && branches.length === 0 && <p className="muted">{'No changes in progress.'}</p>}
      {branches && branches.length > 0 && (
        <ul className="pr-list">
          {branches.map((entry) => (
            <li key={entry.branch}>
              <Link to={changePath(entry.branch)} className="pr-item">
                <Avatar src={entry.authorAvatar} name={entry.author} size={40} />
                <span className="pr-title">
                  {entry.pull ? (
                    <span
                      className={`pill ${entry.pull.state === 'open' ? 'added' : ''}`}
                    >{`Submitted #${entry.pull.number}`}</span>
                  ) : (
                    <span className="pill changed">{'Draft'}</span>
                  )}
                  {entry.title}
                </span>
                <span className="muted">{`${entry.author} · updated ${formatDate(entry.updatedAt)}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
