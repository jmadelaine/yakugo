import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Plus } from 'reicon-react/icons/Plus'
import type { BranchDetail, ProjectContent, TranslationSnapshot } from '@shared/types'
import { KeyNameDialog } from '../components/KeyNameDialog'
import { Button } from '../components/Button'
import { ChangeList, ChangeSummary, ExampleChangeList } from '../components/ChangeList'
import { Dialog } from '../components/Dialog'
import { PlaceholdersDialog } from '../components/PlaceholdersDialog'
import { Status } from '../components/Status'
import { TranslationTable } from '../components/TranslationTable'
import { api } from '../lib/api'
import { changePath } from '../lib/routes'
import { useAsync } from '../lib/useAsync'
import { useColumnLayout } from '../lib/useColumnLayout'
import { filterKeys, useTranslationEditor } from '../lib/useTranslationEditor'

/** Edits one project on a change's branch (`/change/:branch/edit/:project`). */
export function EditorPage() {
  const params = useParams()
  const projectId = params.project ?? ''
  const branch = params.branch ?? ''

  const { data, error, loading } = useAsync(async () => {
    const change = await api.branch(branch)
    if (change.pull && change.pull.state !== 'open') throw new Error('This change is closed and cannot be edited.')
    // The base content lets the editor show keys deleted on this branch as removed rows.
    const [snapshot, base] = await Promise.all([api.translations(projectId, branch), api.translations(projectId)])
    return { snapshot, change, base }
  }, [projectId, branch])

  if (loading) return <Status loading />
  if (error || !data) return <Status error={error ?? new Error('Could not load translations')} />
  if (data.snapshot.data.locales.length === 0) {
    return (
      <Status
        error={
          new Error(`No translation files found for ${data.snapshot.project.name} on branch ${data.snapshot.branch}.`)
        }
      />
    )
  }
  return <Editor key={data.snapshot.headSha} snapshot={data.snapshot} change={data.change} baseline={data.base.data} />
}

function Editor({
  snapshot,
  change,
  baseline,
}: {
  snapshot: TranslationSnapshot
  change: BranchDetail
  baseline: ProjectContent
}) {
  const editor = useTranslationEditor(snapshot, baseline)
  const layout = useColumnLayout(editor.columns, `yakugo.columns.${snapshot.project.id}`)
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [addKeyOpen, setAddKeyOpen] = useState(false)
  const [placeholderFocus, setPlaceholderFocus] = useState<string | null>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<Error>()

  const dirty = editor.changes.length > 0 || editor.exampleChanges.length > 0

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const visibleKeys = filterKeys(editor, filter)

  function handleAddKey(key: string) {
    if (editor.addKey(key)) setFilter(key)
  }

  function handleRenameKey(from: string, to: string) {
    if (editor.renameKey(from, to) && filter) setFilter(to)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(undefined)
    try {
      const payload = { project: snapshot.project.id, expectedHeadSha: snapshot.headSha, ...editor.toEdit() }
      await api.commitToBranch(change.branch, payload)
      navigate(changePath(change.branch))
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
            <Link to={changePath(change.branch)}>{'← Back to change'}</Link>
          </p>
          <h1>{`${snapshot.project.name} · ${change.title}`}</h1>
          <p className="muted">{`Branch ${snapshot.branch} · ${editor.keys.length} keys · ${editor.locales.length} locales`}</p>
        </div>
        <div className="actions">
          <ChangeSummary changes={editor.changes} />
          <Button onClick={() => setAddKeyOpen(true)}>
            <Plus size={20} strokeWidth={2} />
            {'Add key'}
          </Button>
          {editor.examples && <Button onClick={() => setPlaceholderFocus(null)}>{'Edit placeholders'}</Button>}
          <Button disabled={!dirty} onClick={editor.reset}>
            {'Discard'}
          </Button>
          <Button variant="primary" disabled={!dirty} onClick={() => setDialogOpen(true)}>
            {'Save'}
          </Button>
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
      </div>

      <KeyNameDialog
        open={addKeyOpen}
        title="Add key"
        submitLabel="Add key"
        existingKeys={editor.keys}
        onClose={() => setAddKeyOpen(false)}
        onSubmit={handleAddKey}
      />

      <TranslationTable
        editor={editor}
        layout={layout}
        keys={visibleKeys}
        onRenameKey={handleRenameKey}
        onEditExample={
          editor.examples
            ? (name) => {
                // A tag without an example yet gets an empty row to fill in.
                if (!editor.examples || !(name in editor.examples)) editor.setExample(name, '')
                setPlaceholderFocus(name)
              }
            : undefined
        }
      />

      {editor.examples && (
        <PlaceholdersDialog
          open={placeholderFocus !== undefined}
          editor={editor}
          focus={placeholderFocus ?? undefined}
          onClose={() => setPlaceholderFocus(undefined)}
        />
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Save to this change">
        <form onSubmit={submit} className="stack">
          <p className="muted">{'These edits will be saved to the change.'}</p>
          <div className="dialog-changes stack">
            <ExampleChangeList changes={editor.exampleChanges} />
            {(editor.changes.length > 0 || editor.exampleChanges.length === 0) && (
              <ChangeList changes={editor.changes} />
            )}
          </div>
          {submitError && <Status error={submitError} />}
          <div className="actions end">
            <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
              {'Cancel'}
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {'Save'}
            </Button>
          </div>
        </form>
      </Dialog>
    </main>
  )
}
