import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { TranslationSnapshot } from '@shared/types'
import { CreateChangeButton } from '../components/CreateChangeButton'
import { Status } from '../components/Status'
import { TranslationTable } from '../components/TranslationTable'
import { api } from '../lib/api'
import { changePath } from '../lib/routes'
import { useAsync } from '../lib/useAsync'
import { useColumnLayout } from '../lib/useColumnLayout'
import { filterKeys, useTranslationEditor } from '../lib/useTranslationEditor'

/** Read-only view of a project's current translations on the base branch. */
export function ProjectPage() {
  const projectId = useParams().project ?? ''
  const { data: snapshot, error, loading } = useAsync(() => api.translations(projectId), [projectId])

  if (loading) return <Status loading />
  if (error || !snapshot) return <Status error={error ?? new Error('Could not load translations')} />
  return <ProjectView key={snapshot.headSha} snapshot={snapshot} />
}

function ProjectView({ snapshot }: { snapshot: TranslationSnapshot }) {
  const editor = useTranslationEditor(snapshot)
  const layout = useColumnLayout(editor.columns, `yakugo.columns.${snapshot.project.id}`)
  const [filter, setFilter] = useState('')
  const visibleKeys = filterKeys(editor, filter)

  return (
    <main className="page wide">
      <div className="page-header">
        <div>
          <p>
            <Link to="/">{'← All projects'}</Link>
          </p>
          <h1>{snapshot.project.name}</h1>
          <p className="muted">{`Branch ${snapshot.branch} · ${editor.keys.length} keys · ${editor.locales.length} locales`}</p>
        </div>
        <div className="actions">
          <CreateChangeButton destination={(branch) => changePath(branch, `/edit/${snapshot.project.id}`)} />
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

      {editor.keys.length === 0 ? (
        <p className="muted">{`No translation files found for ${snapshot.project.name} on branch ${snapshot.branch}.`}</p>
      ) : (
        <TranslationTable editor={editor} layout={layout} keys={visibleKeys} readOnly />
      )}
    </main>
  )
}
