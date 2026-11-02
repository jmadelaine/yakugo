import { useState } from 'react'
import { Trash5 } from 'reicon-react/icons/Trash5'
import { Undo3 } from 'reicon-react/icons/Undo3'
import type { PlaceholderPattern } from '@shared/placeholders'
import { columnId, type ColumnLayout } from '../lib/useColumnLayout'
import { COLUMN_KIND, type EditorModel } from '../lib/useTranslationEditor'
import { Button } from './Button'
import { ColumnMenu } from './ColumnMenu'
import { KeyCell } from './KeyCell'
import { Tag } from './Tag'

export interface TranslationTableProps {
  editor: EditorModel
  layout: ColumnLayout
  keys: string[]
  /** Show cell text without inputs or the remove button. */
  readOnly?: boolean
  /** Makes placeholder tags clickable to edit that placeholder's example. */
  onEditExample?: (name: string) => void
  /** Lets the key cell be edited in place; called with (from, to) on a confirmed rename. */
  onRenameKey?: (from: string, to: string) => void
}

const PAGE_SIZE = 200

/** Filled-in preview and tags for the placeholders a string uses. Renders nothing without placeholders. */
function PlaceholderPreview({
  text,
  pattern,
  onEdit,
}: {
  text: string
  pattern?: PlaceholderPattern
  onEdit?: (name: string) => void
}) {
  if (!pattern) return null
  const names = pattern.find(text)
  if (names.length === 0) return null
  return (
    <div className="cell-preview">
      <div className="placeholder-tags">
        {names.map((name) => {
          const known = name in pattern.config.examples
          const title = known ? `Example: ${pattern.config.examples[name]}` : 'No example value yet'
          return (
            <Tag
              key={name}
              tentative={!known}
              title={onEdit ? `${title}. Click to edit.` : title}
              onClick={onEdit ? () => onEdit(name) : undefined}
            >
              {name}
            </Tag>
          )
        })}
      </div>
      <div className="cell-preview-text" title="Preview with example values">
        {pattern.fill(text)}
      </div>
    </div>
  )
}

export function TranslationTable({
  editor,
  layout,
  keys,
  readOnly = false,
  onEditExample,
  onRenameKey,
}: TranslationTableProps) {
  const columns = layout.visible
  const [limit, setLimit] = useState(PAGE_SIZE)
  const visible = keys.slice(0, limit)

  return (
    <>
      <div className="table-wrap">
        <table className="translations">
          <thead>
            <tr>
              <th scope="col" className="key-col">
                {'Key'}
              </th>
              {columns.map((column) => (
                <th
                  key={columnId(column)}
                  scope="col"
                  className={column.kind === COLUMN_KIND.FIELD ? 'field-col' : undefined}
                >
                  {column.name}
                </th>
              ))}
              <th scope="col" className="actions-col">
                <ColumnMenu layout={layout} />
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((key) => {
              const isRemoved = editor.isRemovedKey(key)
              const rowClass = isRemoved ? 'row-removed' : editor.isNewKey(key) ? 'row-added' : undefined
              return (
                <tr key={key} className={rowClass}>
                  <th scope="row" className={`key-col${onRenameKey && !isRemoved ? ' editable' : ''}`}>
                    {onRenameKey && !isRemoved ? (
                      <KeyCell name={key} existingKeys={editor.keys} onRename={(to) => onRenameKey(key, to)} />
                    ) : (
                      <code>{key}</code>
                    )}
                  </th>
                  {columns.map((column) => {
                    const value = editor.cell(column, key)
                    const before = editor.originalCell(column, key)
                    const changed = value !== before
                    if (isRemoved) {
                      const shown = editor.removedCell(column, key)
                      return (
                        <td key={columnId(column)}>
                          <div className={`cell-text${shown ? '' : ' empty'}`}>{shown ? <del>{shown}</del> : '—'}</div>
                        </td>
                      )
                    }
                    return (
                      <td key={columnId(column)} className={changed ? 'cell-changed' : undefined}>
                        {readOnly ? (
                          <>
                            <div className={`cell-text${value ? '' : ' empty'}`}>{value || '—'}</div>
                            {column.kind === COLUMN_KIND.LOCALE && (
                              <PlaceholderPreview text={value} pattern={editor.placeholders} />
                            )}
                          </>
                        ) : (
                          <div className={`cell-edit${changed ? ' changed' : ''}`}>
                            {changed && (
                              <div className="cell-before">
                                <span className="cell-before-text" title="Current value on the branch">
                                  {before ? <del>{before}</del> : <em>{'(was empty)'}</em>}
                                </span>
                                <Button
                                  variant="ghost"
                                  className="cell-undo"
                                  title="Restore original value"
                                  aria-label={`Restore original value of ${key} (${column.name})`}
                                  onClick={() => editor.setCell(column, key, before)}
                                >
                                  <Undo3 size={24} strokeWidth={2} />
                                </Button>
                              </div>
                            )}
                            <textarea
                              aria-label={`${key} (${column.name})`}
                              value={value}
                              rows={1}
                              onChange={(event) => editor.setCell(column, key, event.target.value)}
                            />
                            {column.kind === COLUMN_KIND.LOCALE && (
                              <PlaceholderPreview text={value} pattern={editor.placeholders} onEdit={onEditExample} />
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="actions-col">
                    {!readOnly && isRemoved && (
                      <Button title="Restore key" aria-label={`Restore ${key}`} onClick={() => editor.restoreKey(key)}>
                        <Undo3 size={24} strokeWidth={2} />
                      </Button>
                    )}
                    {!readOnly && !isRemoved && (
                      <Button
                        variant="danger"
                        title="Remove key from all locales"
                        aria-label={`Remove ${key}`}
                        onClick={() => editor.removeKey(key)}
                      >
                        <Trash5 size={22} />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {keys.length === 0 && <p className="muted center">{'No keys match.'}</p>}
      </div>
      {keys.length > limit && (
        <div className="center">
          <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>{`Show more (${keys.length - limit} hidden)`}</Button>
        </div>
      )}
    </>
  )
}
