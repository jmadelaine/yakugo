import type { ReactNode } from 'react'

export interface TagProps {
  children: ReactNode
  title?: string
  /** Dashed, muted look for something that exists but has no value yet. */
  tentative?: boolean
  /** When set, the tag is a real button and clicking it calls this. */
  onClick?: () => void
}

/** Small monospace label, e.g. a placeholder name. A button when clickable, plain text otherwise. */
export function Tag({ children, title, tentative = false, onClick }: TagProps) {
  const className = `tag${tentative ? ' tentative' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} title={title} onClick={onClick}>
        {children}
      </button>
    )
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  )
}
