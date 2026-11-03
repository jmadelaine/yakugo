import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'reicon-react/icons/Plus'
import { api } from '../lib/api'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Status } from './Status'

export interface CreateChangeButtonProps {
  /** Where to go once the change exists, given its branch name. */
  destination: (branch: string) => string
}

/** "Create change" button with its naming dialog. Creating starts an empty change and navigates to `destination`. */
export function CreateChangeButton({ destination }: CreateChangeButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={20} strokeWidth={2} />
        {'Create change'}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create change">
        <CreateChangeForm destination={destination} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  )
}

// Mounted only while the dialog is open, so the form starts empty each time.
function CreateChangeForm({ destination, onClose }: CreateChangeButtonProps & { onClose: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      const created = await api.createBranch({ title: title.trim() })
      navigate(destination(created.branch))
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error(String(reason)))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <p className="muted">
        {'A change collects edits across multiple projects. Submit it for review when it is ready.'}
      </p>
      <label className="field">
        {'Name of the change'}
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Fix typos on the user page"
          required
          autoFocus
        />
      </label>
      {error && <Status error={error} />}
      <div className="actions end">
        <Button onClick={onClose} disabled={submitting}>
          {'Cancel'}
        </Button>
        <Button type="submit" variant="primary" loading={submitting} disabled={!title.trim()}>
          {'Create'}
        </Button>
      </div>
    </form>
  )
}
