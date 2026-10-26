import React, { useEffect, useState } from 'react'

const FEEDBACK_API = 'https://feedback.chrissabato.com/api.php'
const APP_SLUG = 'stadium-sound'

const TITLE_MAX = 200
const BODY_MIN = 10
const BODY_MAX = 10000

type FeedbackType = 'bug' | 'feature' | 'question' | 'other'
type Status = 'loading-token' | 'idle' | 'submitting' | 'success' | 'error'

interface Props {
  open: boolean
  onClose: () => void
}

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: 'Bug report',
  feature: 'Feature request',
  question: 'Question',
  other: 'Other'
}

export function FeedbackModal({ open, onClose }: Props) {
  const [type, setType] = useState<FeedbackType>('bug')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot, kept empty by real users
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setStatus('loading-token')
    setError('')
    setFieldErrors({})
    fetch(`${FEEDBACK_API}?action=config&app=${APP_SLUG}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || 'Could not reach the feedback service')
        setToken(data.token)
        setStatus('idle')
      })
      .catch((err) => {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Could not reach the feedback service')
      })
  }, [open])

  useEffect(() => {
    if (status !== 'success') return
    const t = setTimeout(onClose, 2000)
    return () => clearTimeout(t)
  }, [status, onClose])

  if (!open) return null

  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  const bodyTooShort = trimmedBody.length > 0 && trimmedBody.length < BODY_MIN
  const canSubmit =
    !!token && trimmedTitle.length > 0 && trimmedTitle.length <= TITLE_MAX && trimmedBody.length <= BODY_MAX

  async function submit(currentToken: string): Promise<void> {
    const [appVersion, platform] = await Promise.all([
      window.electronAPI.app.getVersion(),
      window.electronAPI.app.getPlatform()
    ])

    const res = await fetch(FEEDBACK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: APP_SLUG,
        token: currentToken,
        type,
        title: trimmedTitle,
        body: trimmedBody || undefined,
        email: email.trim() || undefined,
        app_version: appVersion,
        meta: { platform },
        website
      })
    })

    const data = await res.json().catch(() => ({ ok: false }))

    if (data.ok) {
      setStatus('success')
      return
    }

    if (res.status === 422 && data.errors) {
      setFieldErrors(data.errors)
      setStatus('error')
      setError('Please fix the highlighted fields')
      return
    }

    if (res.status === 400 && data.token) {
      // Token expired or submitted too fast — retry once with the fresh token.
      setToken(data.token)
      return submit(data.token)
    }

    throw new Error(data.error || `Request failed (${res.status})`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setStatus('submitting')
    setError('')
    setFieldErrors({})
    try {
      await submit(token)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const submitting = status === 'submitting' || status === 'loading-token'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        width: 480,
        maxWidth: '90vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid #334155',
          flexShrink: 0
        }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Send Feedback</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {status === 'success' ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#f1f5f9' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Thanks — we got it</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Your feedback was submitted</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              padding: 24,
              overflowY: 'auto',
              minHeight: 0
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Type</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as FeedbackType)}
                  disabled={submitting}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    color: '#f1f5f9',
                    padding: '6px 10px',
                    fontSize: 13
                  }}
                >
                  {(Object.keys(TYPE_LABELS) as FeedbackType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Summary</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{trimmedTitle.length}/{TITLE_MAX}</span>
                </div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  disabled={submitting}
                  placeholder="One line summary"
                  style={{
                    background: '#0f172a',
                    border: `1px solid ${fieldErrors.title ? '#f87171' : '#334155'}`,
                    borderRadius: 4,
                    color: '#f1f5f9',
                    padding: '6px 10px',
                    fontSize: 13
                  }}
                />
                {fieldErrors.title && (
                  <span style={{ fontSize: 11, color: '#f87171' }}>{fieldErrors.title}</span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Details</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{trimmedBody.length}/{BODY_MAX}</span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                  disabled={submitting}
                  placeholder="What's on your mind?"
                  rows={6}
                  style={{
                    background: '#0f172a',
                    border: `1px solid ${bodyTooShort || fieldErrors.body ? '#f87171' : '#334155'}`,
                    borderRadius: 4,
                    color: '#f1f5f9',
                    padding: '8px 10px',
                    fontSize: 13,
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
                {fieldErrors.body && (
                  <span style={{ fontSize: 11, color: '#f87171' }}>{fieldErrors.body}</span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Email (optional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  placeholder="you@example.com — if you'd like a reply"
                  style={{
                    background: '#0f172a',
                    border: `1px solid ${fieldErrors.email ? '#f87171' : '#334155'}`,
                    borderRadius: 4,
                    color: '#f1f5f9',
                    padding: '6px 10px',
                    fontSize: 13
                  }}
                />
                {fieldErrors.email && (
                  <span style={{ fontSize: 11, color: '#f87171' }}>{fieldErrors.email}</span>
                )}
              </div>

              {/* Honeypot — hidden from real users, bots that fill it get silently dropped */}
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
                aria-hidden="true"
              />

              {status === 'error' && (
                <div style={{
                  background: '#0f172a',
                  border: '1px solid #f87171',
                  borderRadius: 4,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#f87171'
                }}>
                  {Object.keys(fieldErrors).length > 0
                    ? error
                    : <>Couldn't send feedback: {error}. Your message is still here — try again.</>}
                </div>
              )}
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '16px 24px',
              borderTop: '1px solid #334155',
              flexShrink: 0
            }}>
              <button
                type="button"
                onClick={onClose}
                disabled={status === 'submitting'}
                style={{
                  padding: '7px 20px',
                  background: 'none',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: '#94a3b8',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: status === 'submitting' ? 'default' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                style={{
                  padding: '7px 20px',
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: submitting ? 'default' : 'pointer',
                  opacity: canSubmit ? 1 : 0.6
                }}
              >
                {status === 'submitting' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
