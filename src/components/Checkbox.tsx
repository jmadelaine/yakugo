import type { InputHTMLAttributes, ReactNode } from 'react'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  /** Visible label text. Pass `aria-label` instead for an icon-only checkbox. */
  children?: ReactNode
  className?: string
}

/**
 * Themed checkbox: the native input stays in the DOM for keyboard and screen
 * reader support; the visible box and tick are drawn next to it.
 */
export function Checkbox({ children, className, ...input }: CheckboxProps) {
  return (
    <label className={`checkbox${className ? ` ${className}` : ''}`}>
      <input type="checkbox" {...input} />
      <span className="checkbox-box" aria-hidden="true">
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      </span>
      {children !== undefined && <span className="checkbox-label">{children}</span>}
    </label>
  )
}
