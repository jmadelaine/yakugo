import { useState } from 'react'

export interface AvatarProps {
  src: string
  /** Login or name; its first letter is shown when there is no image. */
  name: string
  size?: number
}

/** Round user image. Falls back to the user's initial when the image is missing or fails to load. */
export function Avatar({ src, name, size = 32 }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) }
  if (!src || failed) {
    return (
      <span className="avatar avatar-fallback" style={style} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  return <img className="avatar" style={style} src={src} alt="" onError={() => setFailed(true)} />
}
