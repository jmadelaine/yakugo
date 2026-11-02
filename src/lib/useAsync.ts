import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  /** Stays set while a reload is in flight so the page does not flash empty. */
  data: T | undefined
  error: Error | undefined
  loading: boolean
  reload: () => void
}

interface Result<T> {
  key: string
  data?: T
  error?: Error
}

/** Runs `load` on mount and whenever `deps` change. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [result, setResult] = useState<Result<T>>()
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)
  const key = `${JSON.stringify(deps)}:${version}`

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let cancelled = false
    loadRef.current().then(
      (data) => {
        if (!cancelled) setResult({ key, data })
      },
      (reason: unknown) => {
        if (!cancelled) setResult({ key, error: reason instanceof Error ? reason : new Error(String(reason)) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const loading = result?.key !== key
  return { data: result?.data, error: loading ? undefined : result?.error, loading, reload }
}
