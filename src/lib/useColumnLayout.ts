import { useCallback, useMemo, useState } from 'react'
import type { Column } from './useTranslationEditor'

export function columnId(column: Column): string {
  return `${column.kind}:${column.name}`
}

export interface ColumnEntry {
  column: Column
  id: string
  visible: boolean
}

export interface ColumnLayout {
  /** Every column in display order, with its visibility. */
  entries: ColumnEntry[]
  /** Visible columns in display order; what the table renders. */
  visible: Column[]
  toggle: (id: string) => void
  /** Moves a column one step left (-1) or right (+1). */
  move: (id: string, direction: -1 | 1) => void
}

interface Stored {
  order: string[]
  hidden: string[]
}

function load(key: string): Stored | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Stored) : undefined
  } catch {
    return undefined
  }
}

function save(key: string, value: Stored): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be unavailable; the layout then lasts for the page only.
  }
}

/** Keeps stored ids that still exist, then appends columns that are new since the layout was saved. */
function reconcile(all: Column[], stored: Stored | undefined): Stored {
  const ids = all.map(columnId)
  const order = [...(stored?.order ?? []).filter((id) => ids.includes(id)), ...ids.filter((id) => !stored?.order.includes(id))]
  const hidden = (stored?.hidden ?? []).filter((id) => ids.includes(id))
  return { order, hidden }
}

/**
 * Column visibility and order for one project's table, remembered per browser.
 * The key column is not part of this; it is always first and always shown.
 * The caller remounts when `all` or `storageKey` change.
 */
export function useColumnLayout(all: Column[], storageKey: string): ColumnLayout {
  const [stored, setStored] = useState<Stored | undefined>(() => load(storageKey))
  const state = useMemo(() => reconcile(all, stored), [all, stored])

  const update = useCallback(
    (next: Stored) => {
      save(storageKey, next)
      setStored(next)
    },
    [storageKey],
  )

  const toggle = useCallback(
    (id: string) =>
      update({
        ...state,
        hidden: state.hidden.includes(id) ? state.hidden.filter((h) => h !== id) : [...state.hidden, id],
      }),
    [state, update],
  )

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      const index = state.order.indexOf(id)
      const target = index + direction
      if (index === -1 || target < 0 || target >= state.order.length) return
      const order = [...state.order]
      ;[order[index], order[target]] = [order[target], order[index]]
      update({ ...state, order })
    },
    [state, update],
  )

  const entries = useMemo<ColumnEntry[]>(() => {
    const byId = new Map(all.map((column) => [columnId(column), column]))
    return state.order.flatMap((id) => {
      const column = byId.get(id)
      return column ? [{ column, id, visible: !state.hidden.includes(id) }] : []
    })
  }, [all, state])

  const visible = useMemo(() => entries.filter((entry) => entry.visible).map((entry) => entry.column), [entries])

  return { entries, visible, toggle, move }
}
