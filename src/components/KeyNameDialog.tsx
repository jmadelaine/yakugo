import { useState, type FormEvent } from 'react'
import { KEY_RULES, validateKey } from '@shared/keys'
import { Button } from './Button'
import { Dialog } from './Dialog'

export interface KeyNameDialogProps {
  open: boolean
  title: string
  submitLabel: string
  /** Starting value, e.g. the current name when renaming. */
  initialValue?: string
  existingKeys: string[]
  onClose: () => void
  onSubmit: (key: string) => void
}

/** Asks for a key name and checks it against the key rules. Used to add and to rename keys. */
export function KeyNameDialog({ open, title, ...form }: KeyNameDialogProps) {
  return (
    <Dialog open={open} onClose={form.onClose} title={title}>
      <KeyNameForm {...form} />
    </Dialog>
  )
}

// Mounted only while the dialog is open, so the field starts fresh each time.
function KeyNameForm({
  submitLabel,
  initialValue = '',
  existingKeys,
  onClose,
  onSubmit,
}: Omit<KeyNameDialogProps, 'open' | 'title'>) {
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(false)
  const key = value.trim()
  const unchanged = key === initialValue
  const problem = unchanged && initialValue ? 'Enter a different name' : validateKey(key, existingKeys)

  function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (problem) return
    onSubmit(key)
    onClose()
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        {'Key name'}
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="section.element.purpose"
          autoFocus
          spellCheck={false}
          aria-invalid={touched && problem !== undefined}
          aria-describedby="key-rules"
        />
        {touched && problem && <span className="form-error">{problem}</span>}
      </label>
      <ul id="key-rules" className="form-hint">
        {KEY_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <div className="actions end">
        <Button onClick={onClose}>{'Cancel'}</Button>
        <Button type="submit" variant="primary" disabled={problem !== undefined}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
