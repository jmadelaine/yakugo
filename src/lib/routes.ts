/** Branch names contain slashes, so they travel as one encoded path segment. */
export function changePath(branch: string, suffix = ''): string {
  return `/change/${encodeURIComponent(branch)}${suffix}`
}
