export interface Env {
  GITHUB_TOKEN: string
  APP_SHARED_SECRET: string
}

const GITHUB_REPO = 'chrissabato/stadium-sound'
const MESSAGE_MIN = 10
const MESSAGE_MAX = 4000
const EMAIL_MAX = 254
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CATEGORIES = ['bug', 'feature', 'general'] as const
type Category = (typeof CATEGORIES)[number]

interface FeedbackPayload {
  message: string
  category?: Category
  email?: string
  appVersion?: string
  platform?: string
  website?: string // honeypot — must stay empty
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  })
}

function categoryLabel(category: Category): string {
  switch (category) {
    case 'bug':
      return 'Bug report'
    case 'feature':
      return 'Feature request'
    default:
      return 'General feedback'
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (url.pathname !== '/submit' || request.method !== 'POST') {
      return json({ ok: false, error: 'Not found' }, 404)
    }

    if (request.headers.get('X-App-Secret') !== env.APP_SHARED_SECRET) {
      return json({ ok: false, error: 'Unauthorized' }, 401)
    }

    let payload: FeedbackPayload
    try {
      payload = await request.json()
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    // Honeypot: bots that fill every field get a fake success, no issue filed.
    if (payload.website) {
      return json({ ok: true })
    }

    const message = typeof payload.message === 'string' ? payload.message.trim() : ''
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
      return json(
        { ok: false, error: `message must be between ${MESSAGE_MIN} and ${MESSAGE_MAX} characters` },
        400
      )
    }

    const category: Category = CATEGORIES.includes(payload.category as Category)
      ? (payload.category as Category)
      : 'general'

    let email = ''
    if (typeof payload.email === 'string' && payload.email.trim()) {
      email = payload.email.trim().slice(0, EMAIL_MAX)
      if (!EMAIL_RE.test(email)) {
        return json({ ok: false, error: 'email is not valid' }, 400)
      }
    }

    const appVersion = typeof payload.appVersion === 'string' ? payload.appVersion.slice(0, 50) : 'unknown'
    const platform = typeof payload.platform === 'string' ? payload.platform.slice(0, 50) : 'unknown'

    const titleSnippet = message.length > 60 ? `${message.slice(0, 60)}…` : message
    const title = `[Feedback] ${categoryLabel(category)} — ${titleSnippet}`

    const bodyLines = [
      message,
      '',
      '---',
      `**Category:** ${categoryLabel(category)}`,
      `**App version:** ${appVersion}`,
      `**Platform:** ${platform}`,
      email ? `**Contact email:** ${email}` : undefined,
      `**Submitted:** ${new Date().toISOString()} via the in-app feedback form`
    ].filter((line): line is string => line !== undefined)

    const ghResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'stadium-sound-feedback-worker'
      },
      body: JSON.stringify({
        title,
        body: bodyLines.join('\n'),
        labels: ['feedback']
      })
    })

    if (!ghResponse.ok) {
      return json({ ok: false, error: `GitHub API error (${ghResponse.status})` }, 502)
    }

    return json({ ok: true })
  }
}
