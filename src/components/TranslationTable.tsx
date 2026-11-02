import { useState } from 'react'
import type { FlatTranslations } from '@shared/types'

export interface TranslationTableProps {
  locales: string[]
  keys: string[]
  values: Record<string, FlatTranslations>
  original: Record<string, FlatTranslations>
  onChange: (locale: string, key: string, value: string) => void
  onRemoveKey: (key: string) => void
}

const PAGE_SIZE = 200

export function TranslationTable({ locales, keys, values, original, onChange, onRemoveKey }: TranslationTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const visible = keys.slice(0, limit)

  return (
    <>
      <div className="table-wrap">
        <table className="translations">
          <thead>
            <tr>
              <th className="key-col">{'Key'}</th>
              {locales.map((locale) => (
                <th key={locale}>{locale}</th>
              ))}
              <th className="actions-col" />
            </tr>
          </thead>
          <tbody>
            {visible.map((key) => {
              const isNew = locales.every((locale) => original[locale]?.[key] === undefined)
              return (
                <tr key={key} className={isNew ? 'row-added' : undefined}>
                  <th scope="row" className="key-col">
                    <code>{key}</code>
                  </th>
                  {locales.map((locale) => {
                    const value = values[locale]?.[key] ?? ''
                    const before = original[locale]?.[key] ?? ''
                    return (
                      <td key={locale} className={value !== before ? 'cell-changed' : undefined}>
                        <textarea
                          aria-label={`${key} (${locale})`}
                          value={value}
                          rows={1}
                          onChange={(event) => onChange(locale, key, event.target.value)}
                        />
                      </td>
                    )
                  })}
                  <td className="actions-col">
                    <button
                      type="button"
                      className="button small danger"
                      title="Remove key from all locales"
                      onClick={() => onRemoveKey(key)}
                    >
                      {'Remove'}
                    </button>
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
          <button type="button" className="button" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            {`Show more (${keys.length - limit} hidden)`}
          </button>
        </div>
      )}
    </>
  )
}
