import type React from 'react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // A click on the backdrop lands on the dialog element itself, not on its content.
  function onBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === ref.current) ref.current.close()
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onClick={onBackdropClick}>
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {open && children}
      </div>
    </dialog>
  )
}
