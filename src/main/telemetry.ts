import { app } from 'electron'
import os from 'os'
import { loadSettings, saveLastTelemetryPingAt } from './settingsStore'

// Not a real secret — the app ships as a binary that can be inspected regardless.
// This just filters drive-by scanners hitting a guessed workers.dev URL; real
// abuse mitigation lives server-side. Same worker/secret as FeedbackModal.tsx.
const TELEMETRY_URL = 'https://stadium-sound-feedback.chris-sabato.workers.dev/telemetry'
const APP_SHARED_SECRET = '0f4ae4ff315032fb6821e213fe46a7abbdb54c419b885b372166b480a03b1e49'

const PING_INTERVAL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 5000

function collectHardwareInfo() {
  const cpus = os.cpus()
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    totalMemGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    cpuModel: cpus[0]?.model?.trim() || 'unknown',
    cpuCount: cpus.length
  }
}

// Anonymous, opt-out usage ping: install id + app version + basic OS/hardware
// info, nothing about show content. Fails silently — venues are often on
// locked-down or offline networks, so this must never affect startup.
export async function maybeSendTelemetryPing(): Promise<void> {
  const settings = loadSettings()
  if (settings.telemetryOptOut) return
  if (settings.lastTelemetryPingAt && Date.now() - settings.lastTelemetryPingAt < PING_INTERVAL_MS) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SHARED_SECRET },
      body: JSON.stringify({ installId: settings.installId, ...collectHardwareInfo() }),
      signal: controller.signal
    })
    if (res.ok) saveLastTelemetryPingAt(Date.now())
  } catch {
    // Offline/blocked network — silently skip, try again next launch.
  } finally {
    clearTimeout(timeout)
  }
}
