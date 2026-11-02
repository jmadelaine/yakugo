export function Status({ loading, error }: { loading?: boolean; error?: Error }) {
  if (error) {
    return (
      <div className="banner error" role="alert">
        {error.message}
      </div>
    )
  }
  if (loading) {
    return (
      <div className="status" role="status">
        {'Loading…'}
      </div>
    )
  }
  return null
}
