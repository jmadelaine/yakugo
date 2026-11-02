import { useState, type KeyboardEvent } from 'react'
import { validateKey } from '@shared/keys'

export interface KeyCellProps {
  name: string
  existingKeys: string[]
  /** Called with the new name when the user confirms a valid rename. */
  onRename: (to: string) => void
}

/**
 * Editable key name. Enter or leaving the field renames; Escape reverts; invalid
 * names are flagged and not applied. Rows are keyed by name, so a rename mounts
 * a fresh cell with the new name.
 */
export function KeyCell({ name, existingKeys, onRename }: KeyCellProps) {
  const [draft, setDraft] = useState(name)

  const next = draft.trim()
  const dirty = next !== name
  const problem = dirty ? validateKey(next, existingKeys) : undefined

  function commit() {
    if (!dirty) return
    if (problem) {
      setDraft(name)
      return
    }
    onRename(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setDraft(name)
      event.currentTarget.blur()
    }
  }

  return (
    <input
      className="key-input"
      value={draft}
      spellCheck={false}
      aria-label={`Key name ${name}`}
      aria-invalid={problem !== undefined}
      title={problem}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  )
}
