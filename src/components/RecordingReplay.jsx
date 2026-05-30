import { useEffect, useState } from 'react'
import { getToken } from '../lib/auth/api.js'

/**
 * Plays interview recordings that require Bearer auth (local API stream).
 * Presigned S3 URLs are used directly on the <video> element.
 */
export default function RecordingReplay({ recordingUrl, mergeStatus }) {
  const [src, setSrc] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const isDirectUrl =
    recordingUrl?.startsWith('http://') ||
    recordingUrl?.startsWith('https://') ||
    recordingUrl?.startsWith('blob:')

  useEffect(() => {
    if (!recordingUrl) {
      setSrc(null)
      setError(null)
      return
    }

    if (isDirectUrl) {
      setSrc(recordingUrl)
      setError(null)
      return
    }

    const token = getToken()
    if (!token) {
      setError('Sign in required to play recording')
      return
    }

    let revoked = false
    setLoading(true)
    setError(null)

    fetch(recordingUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Recording not ready' : 'Could not load recording')
        return res.blob()
      })
      .then((blob) => {
        if (revoked) return
        setSrc(URL.createObjectURL(blob))
      })
      .catch((err) => {
        if (!revoked) setError(err.message)
      })
      .finally(() => {
        if (!revoked) setLoading(false)
      })

    return () => {
      revoked = true
    }
  }, [recordingUrl, isDirectUrl])

  useEffect(() => {
    return () => {
      if (src?.startsWith('blob:')) URL.revokeObjectURL(src)
    }
  }, [src])

  if (!recordingUrl) {
    if (mergeStatus === 'processing') {
      return (
        <p style={{ fontSize: 13, color: '#5a6485', margin: 0 }}>
          Recording is being processed…
        </p>
      )
    }
    if (mergeStatus === 'failed') {
      return (
        <p style={{ fontSize: 13, color: '#ff5a6e', margin: 0 }}>
          Recording merge failed — transcript and scores are still available.
        </p>
      )
    }
    return null
  }

  if (loading) {
    return <p style={{ fontSize: 13, color: '#5a6485', margin: 0 }}>Loading recording…</p>
  }

  if (error) {
    return <p style={{ fontSize: 13, color: '#ff5a6e', margin: 0 }}>{error}</p>
  }

  if (!src) return null

  return (
    <video
      controls
      src={src}
      style={{
        width: '100%',
        maxHeight: 320,
        borderRadius: 12,
        background: '#000',
        marginBottom: 14,
      }}
    />
  )
}
