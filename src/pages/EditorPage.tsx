import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { TranslationSnapshot } from '@shared/types'
import { ChangeList, ChangeSummary } from '../components/ChangeList'
import { Dialog } from '../components/Dialog'
import { Status } from '../components/Status'
import { TranslationTable } from '../components/TranslationTable'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useTranslationEditor } from '../lib/useTranslationEditor'

/** Loads the branch, then hands over to the editor. `/pr/:number/edit` edits the PR branch. */
export function EditorPage() {
  const params = useParams()
  const prNumber = params.number ? Number(params.number) : undefined

  const { data, error, loading } = useAsync(async () => {
    if (prNumber === undefined) return { snapshot: await api.translations(), pr: undefined }
    const pr = await api.pull(prNumber)
    if (pr.state !== 'open') throw new Error('This pull request is no longer open.')
    return { snapshot: await api.translations(pr.branch), pr }
  }, [prNumber])

  if (loading) return <Status loading />
  if (error || !data) return <Status error={error ?? new Error('Could not load translations')} />
  if (data.snapshot.locales.length === 0) {
    return <Status error={new Error(`No <locale>.json files found on branch ${data.snapshot.branch}.`)} />
  }
  return <Editor key={data.snapshot.headSha} snapshot={data.snapshot} prNumber={data.pr?.number} />
}

function Editor({ snapshot, prNumber }: { snapshot: TranslationSnapshot; prNumber?: number }) {
  const editor = useTranslationEditor(snapshot)
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [newKey, setNewKey] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<Error>()

  const dirty = editor.changes.length > 0

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const needle = filter.trim().toLowerCase()
  const visibleKeys = needle
    ? editor.keys.filter(
        (key) =>
          key.toLowerCase().includes(needle) ||
          editor.locales.some((locale) => editor.values[locale]?.[key]?.toLowerCase().includes(needle)),
      )
    : editor.keys

  function handleAddKey(event: FormEvent) {
    event.preventDefault()
    if (editor.addKey(newKey)) {
      setFilter(newKey.trim())
      setNewKey('')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(undefined)
    try {
      const payload = { expectedHeadSha: snapshot.headSha, locales: editor.toPayload() }
      if (prNumber === undefined) {
        const pr = await api.propose({ ...payload, title, description })
        navigate(`/pr/${pr.number}`)
      } else {
        await api.commitToPull(prNumber, { ...payload, message: title })
        navigate(`/pr/${prNumber}`)
      }
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason : new Error(String(reason)))
      setSubmitting(false)
    }
  }

  return (
    <main className="page wide">
      <div className="page-header">
        <div>
          <p>
            <Link to={prNumber === undefined ? '/' : `/pr/${prNumber}`}>{'← Back'}</Link>
          </p>
          <h1>{prNumber === undefined ? 'Edit translations' : `Edit change #${prNumber}`}</h1>
          <p className="muted">{`Branch ${snapshot.branch} · ${editor.keys.length} keys · ${editor.locales.length} locales`}</p>
        </div>
        <div className="actions">
          <ChangeSummary changes={editor.changes} />
          <button className="button" disabled={!dirty} onClick={editor.reset}>
            {'Discard'}
          </button>
          <button className="button primary" disabled={!dirty} onClick={() => setDialogOpen(true)}>
            {prNumber === undefined ? 'Propose changes…' : 'Save to pull request…'}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Filter keys or text"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter"
        />
        <form className="inline-form" onSubmit={handleAddKey}>
          <input
            placeholder="new.key.name"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            aria-label="New key"
          />
          <button type="submit" className="button" disabled={!newKey.trim() || editor.keys.includes(newKey.trim())}>
            {'Add key'}
          </button>
        </form>
      </div>

      <TranslationTable
        locales={editor.locales}
        keys={visibleKeys}
        values={editor.values}
        original={editor.original}
        onChange={editor.setValue}
        onRemoveKey={editor.removeKey}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={prNumber === undefined ? 'Propose changes' : 'Save to pull request'}
      >
        <form onSubmit={submit} className="stack">
          <label>
            {prNumber === undefined ? 'Title' : 'Commit message (optional)'}
            <input value={title} onChange={(event) => setTitle(event.target.value)} required={prNumber === undefined} autoFocus />
          </label>
          {prNumber === undefined && (
            <label>
              {'Description (optional)'}
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
            </label>
          )}
          <div className="dialog-changes">
            <ChangeList changes={editor.changes} />
          </div>
          {submitError && <Status error={submitError} />}
          <div className="actions end">
            <button type="button" className="button" onClick={() => setDialogOpen(false)} disabled={submitting}>
              {'Cancel'}
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Saving…' : prNumber === undefined ? 'Create pull request' : 'Save'}
            </button>
          </div>
        </form>
      </Dialog>
    </main>
  )
}
