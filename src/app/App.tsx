import { useEffect, useState, type JSX } from 'react'
import { api, type PullRequestSummary } from '@/lib/api'

export function App(): JSX.Element {
  const [prs, setPrs] = useState<PullRequestSummary[] | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    api.prs.mine()
      .then((data) => { if (!cancelled) setPrs(data) })
      .catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: 'crimson' }}>
        Failed to load PRs: {error}
      </div>
    )
  }

  if (!prs) {
    return <div style={{ padding: 24, fontFamily: 'system-ui' }}>Loading…</div>
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ margin: 0 }}>My open PRs</h1>
      <p style={{ color: '#666', marginTop: 4 }}>{prs.length} open</p>
      <ul style={{ paddingLeft: 16 }}>
        {prs.map((pr) => (
          <li key={pr.id} style={{ marginBottom: 8 }}>
            <a href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a>{' '}
            {pr.title}{' '}
            <span style={{ color: '#888' }}>· {pr.repo}</span>
            {pr.isDraft && <span style={{ color: '#aaa' }}> · draft</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
