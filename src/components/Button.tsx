import { Children, Fragment, isValidElement, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router'

const BUTTON_VARIANT = { DEFAULT: 'default', PRIMARY: 'primary', DANGER: 'danger', GHOST: 'ghost' } as const
export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT]

const BUTTON_SIZE = { MD: 'md', SM: 'sm' } as const
export type ButtonSize = (typeof BUTTON_SIZE)[keyof typeof BUTTON_SIZE]

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * Square button holding only an icon. Inferred when the children contain no
   * text, so it rarely needs to be set; pass `aria-label` or `title` for a name.
   */
  iconOnly?: boolean
  className?: string
  children?: ReactNode
}

type NativeButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined
    href?: undefined
    ref?: Ref<HTMLButtonElement>
  }
type LinkProps = CommonProps & { to: string; href?: undefined; target?: string; rel?: string; title?: string }
type AnchorProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'> & { href: string; to?: undefined }

export type ButtonProps = NativeButtonProps | LinkProps | AnchorProps

function classes({
  variant = BUTTON_VARIANT.DEFAULT,
  size = BUTTON_SIZE.MD,
  iconOnly,
  className,
}: CommonProps): string {
  return [
    'button',
    variant !== BUTTON_VARIANT.DEFAULT && variant,
    size === BUTTON_SIZE.SM && 'small',
    iconOnly && 'icon',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

/** True when the children hold only elements (icons) and no text, looking inside fragments. */
function hasOnlyElements(children: ReactNode): boolean {
  const items = Children.toArray(children)
  if (items.length === 0) return false
  return items.every((child) => {
    if (!isValidElement(child)) return false
    if (child.type === Fragment) return hasOnlyElements((child.props as { children?: ReactNode }).children)
    return true
  })
}

/**
 * The one button style for the app. Renders a router `Link` with `to`, an
 * anchor with `href`, otherwise a native button (type "button" unless given).
 */
export function Button(props: ButtonProps) {
  const { variant, size, iconOnly = hasOnlyElements(props.children), className, children, ...rest } = props
  const cls = classes({ variant, size, iconOnly, className })

  if (rest.to !== undefined) {
    const { to, ...linkRest } = rest
    return (
      <Link to={to} className={cls} {...linkRest}>
        {children}
      </Link>
    )
  }
  if (rest.href !== undefined) {
    const { href, ...anchorRest } = rest as AnchorProps
    return (
      <a href={href} className={cls} {...anchorRest}>
        {children}
      </a>
    )
  }
  const { type = 'button', ...buttonRest } = rest as NativeButtonProps
  return (
    <button type={type} className={cls} {...buttonRest}>
      {children}
    </button>
  )
}
