import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown } from 'reicon-react/icons/ArrowDown'
import { ArrowUp } from 'reicon-react/icons/ArrowUp'
import { Layout } from 'reicon-react/icons/Layout'
import { COLUMN_KIND } from '../lib/useTranslationEditor'
import type { ColumnLayout } from '../lib/useColumnLayout'
import { Button } from './Button'
import { Checkbox } from './Checkbox'

const GAP = 6

/**
 * Column settings for the table header: an ordered list of columns with
 * visibility checkboxes and up/down controls. The key column is fixed and listed
 * first for reference only. The panel renders in a portal, positioned under the
 * button, so the scrolling table does not clip it.
 */
export function ColumnMenu({ layout }: { layout: ColumnLayout }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number }>()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setPosition({ top: rect.bottom + GAP, right: window.innerWidth - rect.right })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const last = layout.entries.length - 1

  return (
    <>
      <Button
        ref={buttonRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Columns"
        title="Columns"
        onClick={() => setOpen((value) => !value)}
      >
        <Layout size={22} />
      </Button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className="column-panel"
            role="dialog"
            aria-label="Columns"
            style={{ top: position.top, right: position.right }}
          >
            <div className="column-row fixed">
              <Checkbox checked disabled readOnly>
                {'Key'}
              </Checkbox>
            </div>
            {layout.entries.map((entry, index) => (
              <div key={entry.id} className="column-row">
                <Checkbox
                  checked={entry.visible}
                  onChange={() => layout.toggle(entry.id)}
                  className={entry.column.kind === COLUMN_KIND.FIELD ? 'field-col' : undefined}
                >
                  {entry.column.name}
                </Checkbox>
                <span className="column-row-actions">
                  <Button
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => layout.move(entry.id, -1)}
                    aria-label={`Move ${entry.column.name} up`}
                    title="Move up"
                  >
                    <ArrowUp size={18} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={index === last}
                    onClick={() => layout.move(entry.id, 1)}
                    aria-label={`Move ${entry.column.name} down`}
                    title="Move down"
                  >
                    <ArrowDown size={18} strokeWidth={2} />
                  </Button>
                </span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
