import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { Notice } from "tests/mocks/obsidian"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"

const events = vi.hoisted(() => ({ syncCalendarEvents: vi.fn(), fixNoteName: vi.fn() }))

vi.mock("src/google/eventsSync", () => ({
  fixNoteName: events.fixNoteName,
  syncCalendarEvents: events.syncCalendarEvents,
}))

import {
  FORCED_SYNC_MIN_GAP_MS,
  MIN_AUTO_SYNC_SECONDS,
  RENAME_SYNC_DELAY_MS,
  SYNC_HEARTBEAT_ACTIVE_MS,
  SYNC_HEARTBEAT_IDLE_MS,
  SYNC_RETRY_BASE_MS,
  SYNC_STARTUP_DELAY_MS,
  autoSyncIntervalMs,
  shouldSyncNow,
  startCalendarSync,
} from "src/google/syncScheduler"

interface PluginOptions {
  autoSyncSeconds?: number
  connected?: boolean
  lastSyncAt?: number
}

const createPlugin = ({ autoSyncSeconds = 45, connected = true, lastSyncAt = 0 }: PluginOptions = {}) => {
  const register = vi.fn()
  const registerDomEvent = vi.fn()
  const registerEvent = vi.fn()
  const onLayoutReady = vi.fn()
  const renameListener: { current?: (file: { path: string }) => void } = {}

  const plugin = {
    settings: {
      googleAuth: connected ? { accessToken: "token", refreshToken: "", expiresAt: 0, scope: "" } : null,
      googleCalendar: { ...DEFAULT_GCAL_SETTINGS, autoSyncSeconds },
      calendarSync: { syncTokens: {}, lastSyncAt },
    },
    register,
    registerDomEvent,
    registerEvent,
    app: {
      workspace: { onLayoutReady },
      vault: {
        on: vi.fn((_event: string, listener: (file: { path: string }) => void) => {
          renameListener.current = listener

          return {}
        }),
      },
    },
  } as unknown as ObsidianNotifierPlugin

  return { plugin, register, registerDomEvent, registerEvent, onLayoutReady, renameListener }
}

const emptyResult = { created: 0, updated: 0, skipped: 0, deleted: 0, errors: [] }

describe("autoSyncIntervalMs", () => {
  it("clamps the configured seconds to the minimum", () => {
    expect(autoSyncIntervalMs(0)).toBe(MIN_AUTO_SYNC_SECONDS * 1000)
    expect(autoSyncIntervalMs(45)).toBe(45 * 1000)
  })
})

describe("shouldSyncNow", () => {
  const base = {
    connected: true,
    autoSyncSeconds: 45,
    lastSyncAt: 0,
    now: 60 * 60 * 1000,
    windowActive: true,
    retryAt: 0,
  }

  it("runs when the interval passed", () => {
    expect(shouldSyncNow(base)).toBe(true)
  })

  it("waits for the interval", () => {
    expect(shouldSyncNow({ ...base, lastSyncAt: base.now - 10 * 1000 })).toBe(false)
  })

  it("never runs when automatic syncing is disabled", () => {
    expect(shouldSyncNow({ ...base, autoSyncSeconds: 0 })).toBe(false)
    expect(shouldSyncNow({ ...base, autoSyncSeconds: 0, force: true })).toBe(false)
  })

  it("never runs without a connected account", () => {
    expect(shouldSyncNow({ ...base, connected: false })).toBe(false)
  })

  it("skips a background window even when forced", () => {
    expect(shouldSyncNow({ ...base, windowActive: false })).toBe(false)
    expect(shouldSyncNow({ ...base, windowActive: false, force: true })).toBe(false)
  })

  it("respects the retry delay", () => {
    expect(shouldSyncNow({ ...base, retryAt: base.now + 1 })).toBe(false)
  })
})

describe("startCalendarSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-28T10:00:00.000Z"))
    vi.spyOn(document, "hasFocus").mockReturnValue(true)
    Notice.instances = []
    events.fixNoteName.mockResolvedValue(true)
    events.syncCalendarEvents.mockImplementation(async (plugin: ObsidianNotifierPlugin) => {
      plugin.settings.calendarSync.lastSyncAt = Date.now()

      return emptyResult
    })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("registers the window events, the startup sync and the cleanup", () => {
    const { plugin, register, registerDomEvent, registerEvent, onLayoutReady } = createPlugin()

    startCalendarSync(plugin)

    expect(registerDomEvent.mock.calls.map((call) => call[1])).toEqual(["focus", "online"])
    expect(onLayoutReady).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalled()
    expect(registerEvent).toHaveBeenCalled()
  })

  it("puts the name back as soon as a note is renamed", () => {
    const { plugin, renameListener } = createPlugin()

    startCalendarSync(plugin)
    renameListener.current?.({ path: "Calendar/2026-12-24 10-00 · Client meeting.md" })

    expect(events.fixNoteName).toHaveBeenCalledWith(plugin, { path: "Calendar/2026-12-24 10-00 · Client meeting.md" })
  })

  it("pushes the new title once the rename settles", async () => {
    const { plugin, renameListener } = createPlugin()

    startCalendarSync(plugin)
    renameListener.current?.({ path: "Calendar/2026-11-02 10-00 · Sprint review.md" })
    await vi.advanceTimersByTimeAsync(RENAME_SYNC_DELAY_MS)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it("collapses a burst of renames into one push", async () => {
    const { plugin, renameListener } = createPlugin()

    startCalendarSync(plugin)
    renameListener.current?.({ path: "Calendar/a.md" })
    await vi.advanceTimersByTimeAsync(RENAME_SYNC_DELAY_MS / 2)
    renameListener.current?.({ path: "Calendar/b.md" })
    await vi.advanceTimersByTimeAsync(RENAME_SYNC_DELAY_MS)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it("ignores a renamed file that is not a note", () => {
    const { plugin, renameListener } = createPlugin()

    startCalendarSync(plugin)
    renameListener.current?.({ path: "Calendar/photo.png" })

    expect(events.fixNoteName).not.toHaveBeenCalled()
  })

  it("syncs on the heartbeat when the interval passed", async () => {
    const { plugin } = createPlugin()

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS)

    expect(events.syncCalendarEvents).toHaveBeenCalledWith(plugin)
  })

  it("syncs every 45 seconds by default", async () => {
    const { plugin } = createPlugin()

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(45 * 1000)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(45 * 1000)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("does nothing when automatic syncing is disabled", async () => {
    const { plugin } = createPlugin({ autoSyncSeconds: 0 })

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS * 3)

    expect(events.syncCalendarEvents).not.toHaveBeenCalled()
  })

  it("does nothing when the account is disconnected", async () => {
    const { plugin } = createPlugin({ connected: false })

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS)

    expect(events.syncCalendarEvents).not.toHaveBeenCalled()
  })

  it("does nothing while the window is in the background", async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false)
    const { plugin } = createPlugin()

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_IDLE_MS * 5)

    expect(events.syncCalendarEvents).not.toHaveBeenCalled()
  })

  it("syncs right away when the window gets focus", async () => {
    const { plugin, registerDomEvent } = createPlugin()

    startCalendarSync(plugin)
    const focus = registerDomEvent.mock.calls[0][2] as () => void
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)

    // Still inside the 45 second interval, focus forces the sync anyway.
    focus()
    await vi.advanceTimersByTimeAsync(0)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("catches up when the window gets focus after a break", async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false)
    const { plugin, registerDomEvent } = createPlugin()

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_IDLE_MS * 2)
    expect(events.syncCalendarEvents).not.toHaveBeenCalled()

    vi.mocked(document.hasFocus).mockReturnValue(true)
    registerDomEvent.mock.calls[0][2]()
    await vi.advanceTimersByTimeAsync(0)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it("ignores a second focus right after the first one", async () => {
    const { plugin, registerDomEvent } = createPlugin()

    startCalendarSync(plugin)
    const focus = registerDomEvent.mock.calls[0][2] as () => void
    focus()
    await vi.advanceTimersByTimeAsync(0)
    focus()
    await vi.advanceTimersByTimeAsync(FORCED_SYNC_MIN_GAP_MS / 2)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it("runs a postponed forced sync once the throttle expires", async () => {
    const { plugin, registerDomEvent } = createPlugin()

    startCalendarSync(plugin)
    const focus = registerDomEvent.mock.calls[0][2] as () => void
    focus()
    await vi.advanceTimersByTimeAsync(0)
    focus()
    await vi.advanceTimersByTimeAsync(FORCED_SYNC_MIN_GAP_MS)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("pushes a rename even when a focus sync just ran", async () => {
    const { plugin, registerDomEvent, renameListener } = createPlugin()

    startCalendarSync(plugin)
    const focus = registerDomEvent.mock.calls[0][2] as () => void
    focus()
    await vi.advanceTimersByTimeAsync(0)
    renameListener.current?.({ path: "Calendar/2026-11-02 10-00 · Sprint review.md" })
    await vi.advanceTimersByTimeAsync(FORCED_SYNC_MIN_GAP_MS + RENAME_SYNC_DELAY_MS)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("waits for the interval between two heartbeat runs", async () => {
    const { plugin } = createPlugin()

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(45 * 1000)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("syncs after the startup delay", async () => {
    const { plugin, onLayoutReady } = createPlugin()

    startCalendarSync(plugin)
    onLayoutReady.mock.calls[0][0]()
    await vi.advanceTimersByTimeAsync(SYNC_STARTUP_DELAY_MS)

    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it("backs off after a failure", async () => {
    const { plugin } = createPlugin()
    events.syncCalendarEvents.mockRejectedValueOnce(new Error("network down"))

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SYNC_HEARTBEAT_ACTIVE_MS * 2)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SYNC_RETRY_BASE_MS)
    expect(events.syncCalendarEvents).toHaveBeenCalledTimes(2)
  })

  it("reports a failed automatic sync once", async () => {
    const { plugin } = createPlugin()
    events.syncCalendarEvents.mockRejectedValue(new Error("Google Calendar API is disabled."))

    startCalendarSync(plugin)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

    expect(Notice.instances.map((notice) => notice.message)).toEqual(["RemindAir: calendar sync failed. Google Calendar API is disabled."])
  })

  it("stops the heartbeat on unload", async () => {
    const { plugin, register } = createPlugin()

    startCalendarSync(plugin)
    const cleanup = register.mock.calls[register.mock.calls.length - 1][0] as () => void
    cleanup()

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(events.syncCalendarEvents).not.toHaveBeenCalled()
  })
})
