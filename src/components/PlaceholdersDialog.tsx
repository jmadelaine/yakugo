import { useState, type FormEvent } from 'react'
import { Trash5 } from 'reicon-react/icons/Trash5'
import { Button } from './Button'
import { Dialog } from './Dialog'
import type { EditorModel } from '../lib/useTranslationEditor'

export interface PlaceholdersDialogProps {
  open: boolean
  editor: EditorModel
  /** Placeholder whose row gets focus when the dialog opens. */
  focus?: string
  onClose: () => void
}

/**
 * Edit the project's placeholder example values. Saved with the change, into
 * yakugo.yaml. Mounted only while open so Cancel can restore the values from
 * when it opened.
 */
export function PlaceholdersDialog({ open, editor, focus, onClose }: PlaceholdersDialogProps) {
  if (!open) return null
  return <PlaceholdersForm editor={editor} focus={focus} onClose={onClose} />
}

function PlaceholdersForm({ editor, focus, onClose }: Omit<PlaceholdersDialogProps, 'open'>) {
  const examples = editor.examples ?? {}
  const [initial] = useState(() => ({ ...examples }))
  const [newName, setNewName] = useState('')

  /** Puts the examples back to what they were when the dialog opened. */
  function cancel() {
    for (const name of Object.keys(editor.examples ?? {})) if (!(name in initial)) editor.removeExample(name)
    for (const [name, value] of Object.entries(initial)) editor.setExample(name, value)
    onClose()
  }

  const pattern = editor.placeholders?.config.pattern ?? '{placeholder}'
  const names = Object.keys(examples)
  const addName = newName.trim()
  const canAdd = addName !== '' && /^[\w.-]+$/.test(addName) && !(addName in examples)

  function add(event: FormEvent) {
    event.preventDefault()
    if (!canAdd) return
    editor.setExample(addName, '')
    setNewName('')
  }

  return (
    <Dialog open onClose={cancel} title="Placeholder examples">
      <div className="stack">
        <p className="muted">
          {`Example values fill in placeholders in previews. Placeholders look like ${pattern} in this project. Changes are saved with this change into yakugo.yaml.`}
        </p>
        {names.length === 0 && <p className="muted">{'No examples yet.'}</p>}
        {names.length > 0 && (
          <div className="example-list">
            {names.map((name) => (
              <div key={name} className="example-row">
                <label className="example-name" htmlFor={`example-${name}`}>
                  <code>{name}</code>
                </label>
                <input
                  id={`example-${name}`}
                  value={examples[name]}
                  placeholder="Example value"
                  autoFocus={name === focus}
                  onChange={(event) => editor.setExample(name, event.target.value)}
                />
                <Button
                  variant="danger"
                  title={`Remove example for ${name}`}
                  aria-label={`Remove ${name}`}
                  onClick={() => editor.removeExample(name)}
                >
                  <Trash5 size={22} />
                </Button>
              </div>
            ))}
          </div>
        )}
        <form className="example-add" onSubmit={add}>
          <input
            value={newName}
            placeholder="New placeholder name"
            aria-label="New placeholder name"
            spellCheck={false}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button type="submit" disabled={!canAdd}>
            {'Add'}
          </Button>
        </form>
        <div className="actions end">
          <Button onClick={cancel}>{'Cancel'}</Button>
          <Button variant="primary" onClick={onClose}>
            {'Done'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
