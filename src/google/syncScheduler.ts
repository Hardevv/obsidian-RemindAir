import type ObsidianNotifierPlugin from "main"
import { Notice } from "obsidian"
import { syncCalendarEvents } from "src/google/eventsSync"
import { PLUGIN_NAME } from "src/utils/constants"

export const SYNC_HEARTBEAT_ACTIVE_MS = 15 * 1000
export const SYNC_HEARTBEAT_IDLE_MS = 60 * 1000
export const MIN_AUTO_SYNC_SECONDS = 15
export const SYNC_RETRY_BASE_MS = 5 * 60 * 1000
export const SYNC_RETRY_MAX_MS = 60 * 60 * 1000
export const SYNC_STARTUP_DELAY_MS = 3 * 1000
// Rapid window switching should not turn into one request per focus.
export const FORCED_SYNC_MIN_GAP_MS = 10 * 1000

export interface SyncGateInput {
  connected: boolean
  autoSyncSeconds: number
  lastSyncAt: number
  now: number
  windowActive: boolean
  retryAt: number
  force?: boolean
}

export const autoSyncIntervalMs = (seconds: number): number => Math.max(seconds, MIN_AUTO_SYNC_SECONDS) * 1000

export const shouldSyncNow = ({
  connected,
  autoSyncSeconds,
  lastSyncAt,
  now,
  windowActive,
  retryAt,
  force = false,
}: SyncGateInput): boolean => {
  if (!connected || autoSyncSeconds <= 0) return false
  if (now < retryAt) return false
  // A window in the background is not worth a request, the focus handler catches up.
  if (!windowActive) return false

  return force || now - lastSyncAt >= autoSyncIntervalMs(autoSyncSeconds)
}

const isWindowActive = (): boolean => {
  if (typeof document === "undefined") return true

  return !document.hidden && document.hasFocus()
}

export const startCalendarSync = (plugin: ObsidianNotifierPlugin): void => {
  let failures = 0
  let retryAt = 0
  let timer: number | undefined
  let running = false
  let stopped = false
  let lastForcedAt = 0
  let lastError: string | null = null

  const reportError = (message: string): void => {
    if (message === lastError) return

    lastError = message
    new Notice(`${PLUGIN_NAME}: calendar sync failed. ${message}`)
  }

  const run = async (force: boolean): Promise<void> => {
    const now = Date.now()

    if (force && now - lastForcedAt < FORCED_SYNC_MIN_GAP_MS) return

    if (
      !shouldSyncNow({
        connected: plugin.settings.googleAuth !== null,
        autoSyncSeconds: plugin.settings.googleCalendar.autoSyncSeconds,
        lastSyncAt: plugin.settings.calendarSync.lastSyncAt,
        now,
        windowActive: isWindowActive(),
        retryAt,
        force,
      })
    ) {
      return
    }

    if (force) lastForcedAt = now

    try {
      const result = await syncCalendarEvents(plugin)
      failures = 0
      retryAt = 0

      if (result.errors.length > 0) {
        console.warn(`${PLUGIN_NAME}: calendar sync finished with errors`, result.errors)
        reportError(result.errors.join("; "))
      } else {
        lastError = null
      }
    } catch (error) {
      failures++
      retryAt = Date.now() + Math.min(SYNC_RETRY_BASE_MS * 2 ** (failures - 1), SYNC_RETRY_MAX_MS)
      console.warn(`${PLUGIN_NAME}: calendar sync failed`, error)
      reportError(error instanceof Error ? error.message : "Unknown error.")
    }
  }

  const tick = async (force: boolean): Promise<void> => {
    if (running) return
    running = true

    try {
      await run(force)
    } finally {
      running = false
      schedule()
    }
  }

  // The heartbeat slows down while the window is in the background, so an idle Obsidian does not wake up for nothing.
  const schedule = (): void => {
    if (stopped || timer !== undefined) return

    timer = window.setTimeout(
      () => {
        timer = undefined
        void tick(false)
      },
      isWindowActive() ? SYNC_HEARTBEAT_ACTIVE_MS : SYNC_HEARTBEAT_IDLE_MS,
    )
  }

  const wake = (force: boolean): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }

    void tick(force)
  }

  plugin.registerDomEvent(window, "focus", () => wake(true))
  plugin.registerDomEvent(window, "online", () => wake(true))

  plugin.app.workspace.onLayoutReady(() => {
    const startup = window.setTimeout(() => void tick(false), SYNC_STARTUP_DELAY_MS)
    plugin.register(() => window.clearTimeout(startup))
  })

  plugin.register(() => {
    stopped = true
    if (timer !== undefined) window.clearTimeout(timer)
  })

  schedule()
}
