import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { BranchDetail } from '@shared/types'
import { Edit } from 'reicon-react/icons/Edit'
import { Plus } from 'reicon-react/icons/Plus'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { ChangeList, ChangeSummary, ExampleChangeList } from '../components/ChangeList'
import { Dialog } from '../components/Dialog'
import { Status } from '../components/Status'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { changePath } from '../lib/routes'
import { useAsync } from '../lib/useAsync'

type Action = 'submit' | 'merge' | 'withdraw' | 'delete'

/** One change: the diff of its branch, and the draft → pull request → merged lifecycle. */
export function ChangePage() {
  const branch = useParams().branch ?? ''
  const navigate = useNavigate()
  const { data: change, error, loading, reload } = useAsync(() => api.branch(branch), [branch])
  const [busy, setBusy] = useState<Action>()
  const [actionError, setActionError] = useState<Error>()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function run(action: Exclude<Action, 'submit'>) {
    if (!change) return
    const question = {
      merge: `Merge "${change.title}" into the base branch? This publishes the translations.`,
      withdraw: `Withdraw "${change.title}" from review? It goes back to being a draft you can edit and submit again.`,
      delete: `Delete the draft "${change.title}"? Its saved edits are lost.`,
    }[action]
    if (!window.confirm(question)) return
    setBusy(action)
    setActionError(undefined)
    try {
      if (action === 'merge' && change.pull) await api.mergePull(change.pull.number)
      if (action === 'withdraw' && change.pull) await api.closePull(change.pull.number)
      if (action === 'delete') await api.deleteBranch(change.branch)
      if (action === 'withdraw') {
        setBusy(undefined)
        reload()
        return
      }
      navigate('/')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason : new Error(String(reason)))
      setBusy(undefined)
    }
  }

  if (loading) return <Status loading />
  if (error || !change) return <Status error={error ?? new Error('Not found')} />

  const pull = change.pull
  const isDraft = pull === undefined
  const isOpen = isDraft || pull.state === 'open'
  const canMerge = !isDraft && isOpen && pull.mergeable !== false && !pull.draft
  const allChanges = change.projects.flatMap((entry) => entry.changes)
  const hasAnything = allChanges.length > 0 || change.projects.some((entry) => entry.placeholderExamples.length > 0)

  return (
    <main className="page">
      <p>
        <Link to="/">{'← All changes'}</Link>
      </p>
      <div className="page-header">
        <div className="title-row">
          <h1>{change.title}</h1>
          {isOpen && (
            <Button
              variant="ghost"
              title="Edit name and description"
              aria-label="Edit name and description"
              onClick={() => setDetailsOpen(true)}
            >
              <Edit size={22} />
            </Button>
          )}
        </div>
        <div className="actions">
          {pull?.url && (
            <Button href={pull.url} target="_blank" rel="noreferrer">
              {'Open on GitHub'}
            </Button>
          )}
          {isDraft && (
            <Button variant="danger" disabled={busy !== undefined} onClick={() => run('delete')}>
              {busy === 'delete' ? 'Deleting' : 'Delete draft'}
            </Button>
          )}
          {isDraft && (
            <Button variant="primary" disabled={!hasAnything} onClick={() => setSubmitOpen(true)}>
              {'Submit'}
            </Button>
          )}
          {!isDraft && isOpen && (
            <Button variant="danger" disabled={busy !== undefined} onClick={() => run('withdraw')}>
              {busy === 'withdraw' ? 'Withdrawing' : 'Withdraw'}
            </Button>
          )}
          {!isDraft && isOpen && (
            <Button variant="primary" disabled={!canMerge || busy !== undefined} onClick={() => run('merge')}>
              {busy === 'merge' ? 'Merging' : 'Merge'}
            </Button>
          )}
        </div>
      </div>

      <p className="byline">
        <Avatar src={change.authorAvatar} name={change.author} size={28} />
        <span className="muted">{`${change.author} · updated ${formatDate(change.updatedAt)} · branch ${change.branch}`}</span>
      </p>

      <ChangeStatus change={change} onRefresh={reload} />
      {actionError && <Status error={actionError} />}

      {change.description && <p className="pr-body">{change.description}</p>}

      {change.otherFiles.length > 0 && (
        <div className="banner">
          {`This change also touches ${change.otherFiles.length} non-translation file(s): ${change.otherFiles.join(', ')}`}
        </div>
      )}

      <section className="edits-section">
        <div className="section-header">
          <h2>{'Edits in this change'}</h2>
          <ChangeSummary changes={allChanges} />
        </div>
        {isOpen && change.projects.length > 1 && (
          <p className="muted">
            {'One change can cover several projects. Edit any project below to add its edits to this change.'}
          </p>
        )}
        {change.projects.map((entry) => (
          <section key={entry.project.id} className="project-changes">
            <div className="project-changes-header">
              <div className="title-row">
                <h3 className="project-heading">{entry.project.name}</h3>
                {entry.changes.length > 0 && <ChangeSummary changes={entry.changes} />}
              </div>
              {isOpen && (
                <Button to={changePath(change.branch, `/edit/${entry.project.id}`)}>
                  {entry.changes.length > 0 || entry.placeholderExamples.length > 0 ? (
                    'Edit'
                  ) : (
                    <>
                      <Plus size={20} strokeWidth={2} />
                      {'Add edits'}
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="stack">
              <ExampleChangeList changes={entry.placeholderExamples} />
              {entry.changes.length > 0 && <ChangeList changes={entry.changes} />}
              {entry.changes.length === 0 && entry.placeholderExamples.length === 0 && (
                <p className="muted project-empty">{'No changes in this project.'}</p>
              )}
            </div>
          </section>
        ))}
      </section>

      <DetailsDialog
        open={detailsOpen}
        change={change}
        onClose={() => setDetailsOpen(false)}
        onSaved={() => {
          setDetailsOpen(false)
          reload()
        }}
      />
      <SubmitDialog
        open={submitOpen}
        change={change}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={() => {
          setSubmitOpen(false)
          reload()
        }}
      />
    </main>
  )
}

function SubmitDialog({
  open,
  change,
  onClose,
  onSubmitted,
}: {
  open: boolean
  change: BranchDetail
  onClose: () => void
  onSubmitted: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Submit change">
      <SubmitForm change={change} onClose={onClose} onSubmitted={onSubmitted} />
    </Dialog>
  )
}

// Mounted only while open, so the fields start from the change title each time.
function SubmitForm({
  change,
  onClose,
  onSubmitted,
}: {
  change: BranchDetail
  onClose: () => void
  onSubmitted: () => void
}) {
  const [title, setTitle] = useState(change.title)
  const [description, setDescription] = useState(change.description)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      await api.propose(change.branch, { title: title.trim(), description })
      onSubmitted()
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error(String(reason)))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <p className="muted">{'This submits the change for review. Once approved it can be merged.'}</p>
      <label className="field">
        {'Title'}
        <input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
      </label>
      <label className="field">
        {'Description (optional)'}
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </label>
      {error && <Status error={error} />}
      <div className="actions end">
        <Button onClick={onClose} disabled={submitting}>
          {'Cancel'}
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || !title.trim()}>
          {submitting ? 'Submitting' : 'Submit'}
        </Button>
      </div>
    </form>
  )
}

/** The change's place in its lifecycle, shown as one labelled banner. */
function ChangeStatus({ change, onRefresh }: { change: BranchDetail; onRefresh: () => void }) {
  const pull = change.pull
  if (!pull) {
    return (
      <div className="status-banner draft">
        <strong>{'Draft'}</strong>
        <span>{'Not submitted yet. Submit it for review when it is ready.'}</span>
      </div>
    )
  }
  if (pull.merged) {
    return (
      <div className="status-banner merged">
        <strong>{'Merged'}</strong>
        <span>{`Submission #${pull.number} was merged.`}</span>
      </div>
    )
  }
  if (pull.mergeable === false) {
    return (
      <div className="status-banner conflict">
        <strong>{'Needs attention'}</strong>
        <span>{`Submission #${pull.number} cannot be merged automatically (${pull.mergeableState}). It needs attention on GitHub.`}</span>
      </div>
    )
  }
  return (
    <div className="status-banner submitted">
      <strong>{'Submitted'}</strong>
      <span>{`Submission #${pull.number} is waiting for review.`}</span>
      {pull.mergeable === null && (
        <>
          <span className="muted">{'Still checking whether it can be merged.'}</span>
          <Button onClick={onRefresh}>{'Refresh'}</Button>
        </>
      )}
    </div>
  )
}

function DetailsDialog({
  open,
  change,
  onClose,
  onSaved,
}: {
  open: boolean
  change: BranchDetail
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Change details">
      <DetailsForm change={change} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  )
}

// Mounted only while open, so the fields start from the current details each time.
function DetailsForm({ change, onClose, onSaved }: { change: BranchDetail; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(change.title)
  const [description, setDescription] = useState(change.description)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      await api.updateBranch(change.branch, { title: title.trim(), description })
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error(String(reason)))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        {'Name'}
        <input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
      </label>
      <label className="field">
        {'Description (optional)'}
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </label>
      {error && <Status error={error} />}
      <div className="actions end">
        <Button onClick={onClose} disabled={submitting}>
          {'Cancel'}
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || !title.trim()}>
          {submitting ? 'Saving' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
