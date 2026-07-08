import React, { useEffect, useState } from 'react'

// Not a real secret — the app ships as a binary that can be inspected regardless.
// This just filters drive-by scanners hitting a guessed workers.dev URL; real
// abuse mitigation lives server-side (honeypot field + Cloudflare rate limiting).
const FEEDBACK_WORKER_URL = 'https://stadium-sound-feedback.chris-sabato.workers.dev'
const APP_SHARED_SECRET = '0f4ae4ff315032fb6821e213fe46a7abbdb54c419b885b372166b480a03b1e49'

const MESSAGE_MIN = 10
const MESSAGE_MAX = 4000

type Category = 'bug' | 'feature' | 'general'
type Status = 'idle' | 'submitting' | 'success' | 'error'

interface Props {
  open: boolean
  onClose: () => void
}

export function FeedbackModal({ open, onClose }: Props) {
  const [category, setCategory] = useState<Category>('general')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot, kept empty by real users
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStatus('idle')
    setError('')
  }, [open])

  useEffect(() => {
    if (status !== 'success') return
    const t = setTimeout(onClose, 2000)
    return () => clearTimeout(t)
  }, [status, onClose])

  if (!open) return null

  const trimmed = message.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < MESSAGE_MIN

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (trimmed.length < MESSAGE_MIN || trimmed.length > MESSAGE_MAX) return

    setStatus('submitting')
    setError('')
    try {
      const [appVersion, platform] = await Promise.all([
        window.electronAPI.app.getVersion(),
        window.electronAPI.app.getPlatform()
      ])

      const res = await fetch(`${FEEDBACK_WORKER_URL}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SHARED_SECRET },
        body: JSON.stringify({
          message: trimmed,
          category,
          email: email.trim() || undefined,
          website,
          appVersion,
          platform
        })
      })

      const data = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Request failed (${res.status})`)
      }
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const submitting = status === 'submitting'

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
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
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
                  <option value="general">General feedback</option>
                  <option value="bug">Bug report</option>
                  <option value="feature">Feature request</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Message</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{trimmed.length}/{MESSAGE_MAX}</span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                  disabled={submitting}
                  placeholder="What's on your mind?"
                  rows={6}
                  style={{
                    background: '#0f172a',
                    border: `1px solid ${tooShort ? '#f87171' : '#334155'}`,
                    borderRadius: 4,
                    color: '#f1f5f9',
                    padding: '8px 10px',
                    fontSize: 13,
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
                {tooShort && (
                  <span style={{ fontSize: 11, color: '#f87171' }}>
                    A few more details would help ({MESSAGE_MIN} characters minimum)
                  </span>
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
                    border: '1px solid #334155',
                    borderRadius: 4,
                    color: '#f1f5f9',
                    padding: '6px 10px',
                    fontSize: 13
                  }}
                />
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
                  Couldn't send feedback: {error}. Your message is still here — try again.
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
                disabled={submitting}
                style={{
                  padding: '7px 20px',
                  background: 'none',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: '#94a3b8',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: submitting ? 'default' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || trimmed.length < MESSAGE_MIN || trimmed.length > MESSAGE_MAX}
                style={{
                  padding: '7px 20px',
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: submitting ? 'default' : 'pointer',
                  opacity: trimmed.length < MESSAGE_MIN ? 0.6 : 1
                }}
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
