import { groupChangesByKey } from '@shared/translations'
import { CHANGE_TYPE, type TranslationChange } from '@shared/types'

const LABEL = {
  [CHANGE_TYPE.ADDED]: 'Added',
  [CHANGE_TYPE.REMOVED]: 'Removed',
  [CHANGE_TYPE.CHANGED]: 'Changed',
}

export function ChangeSummary({ changes }: { changes: TranslationChange[] }) {
  const count = (type: TranslationChange['type']) => changes.filter((c) => c.type === type).length
  return (
    <span className="change-summary">
      <span className="pill added">{`+${count(CHANGE_TYPE.ADDED)} added`}</span>
      <span className="pill changed">{`~${count(CHANGE_TYPE.CHANGED)} changed`}</span>
      <span className="pill removed">{`−${count(CHANGE_TYPE.REMOVED)} removed`}</span>
    </span>
  )
}

/** Translation-aware diff: one block per key, one row per locale. */
export function ChangeList({ changes }: { changes: TranslationChange[] }) {
  if (changes.length === 0) return <p className="muted">{'No translation changes.'}</p>
  return (
    <div className="change-list">
      {groupChangesByKey(changes).map((group) => (
        <section key={group.key} className="change-group">
          <h3 className="change-key">{group.key}</h3>
          <table className="change-table">
            <tbody>
              {group.changes.map((change) => (
                <tr key={change.locale} className={`change ${change.type}`}>
                  <th scope="row">{change.locale}</th>
                  <td className="change-type">{LABEL[change.type]}</td>
                  <td>
                    {change.before !== undefined && <del>{change.before}</del>}
                    {change.after !== undefined && <ins>{change.after}</ins>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
