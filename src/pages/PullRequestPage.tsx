import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChangeList, ChangeSummary } from '../components/ChangeList'
import { Status } from '../components/Status'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/format'

export function PullRequestPage() {
  const number = Number(useParams().number)
  const navigate = useNavigate()
  const { data: pr, error, loading, reload } = useAsync(() => api.pull(number), [number])
  const [busy, setBusy] = useState<'merge' | 'close'>()
  const [actionError, setActionError] = useState<Error>()

  async function run(action: 'merge' | 'close') {
    const question =
      action === 'merge'
        ? `Merge "${pr?.title}" into the base branch? This publishes the translations.`
        : `Close "${pr?.title}" without merging?`
    if (!window.confirm(question)) return
    setBusy(action)
    setActionError(undefined)
    try {
      if (action === 'merge') await api.mergePull(number)
      else await api.closePull(number)
      navigate('/')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason : new Error(String(reason)))
      setBusy(undefined)
    }
  }

  if (loading) return <Status loading />
  if (error || !pr) return <Status error={error ?? new Error('Not found')} />

  const isOpen = pr.state === 'open'
  const canMerge = isOpen && pr.mergeable !== false && !pr.draft

  return (
    <main className="page">
      <p>
        <Link to="/">{'← All changes'}</Link>
      </p>
      <div className="page-header">
        <h1>
          {pr.title} <span className="muted">{`#${pr.number}`}</span>
        </h1>
        <div className="actions">
          {isOpen && (
            <Link to={`/pr/${pr.number}/edit`} className="button">
              {'Edit this change'}
            </Link>
          )}
          <a className="button" href={pr.url} target="_blank" rel="noreferrer">
            {'Open on GitHub'}
          </a>
          {isOpen && (
            <button className="button danger" disabled={busy !== undefined} onClick={() => run('close')}>
              {busy === 'close' ? 'Closing…' : 'Close'}
            </button>
          )}
          {isOpen && (
            <button className="button primary" disabled={!canMerge || busy !== undefined} onClick={() => run('merge')}>
              {busy === 'merge' ? 'Merging…' : 'Merge'}
            </button>
          )}
        </div>
      </div>

      <p className="muted">
        <img className="avatar" src={pr.authorAvatar} alt="" /> {`${pr.author} · opened ${formatDate(pr.createdAt)} · branch ${pr.branch}`}
      </p>

      {!isOpen && <div className="banner">{pr.merged ? 'This change has been merged.' : 'This change was closed without merging.'}</div>}
      {isOpen && pr.mergeable === false && (
        <div className="banner error">
          {'GitHub reports this change cannot be merged automatically (' + pr.mergeableState + '). Resolve it on GitHub.'}
        </div>
      )}
      {isOpen && pr.mergeable === null && (
        <div className="banner">
          {'GitHub is still checking whether this can be merged. '}
          <button className="button small" onClick={reload}>
            {'Refresh'}
          </button>
        </div>
      )}
      {actionError && <Status error={actionError} />}

      {pr.body && <p className="pr-body">{pr.body}</p>}

      {pr.otherFiles.length > 0 && (
        <div className="banner">
          {`This pull request also changes ${pr.otherFiles.length} non-translation file(s): ${pr.otherFiles.join(', ')}`}
        </div>
      )}

      <h2>
        {'Translation changes '}
        <ChangeSummary changes={pr.changes} />
      </h2>
      <ChangeList changes={pr.changes} />
    </main>
  )
}
