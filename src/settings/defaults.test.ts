import { describe, expect, it } from "vitest"
import type { CalendarSyncState, GCalSettings, GoogleAuthState } from "src/types"
import {
  DEFAULT_CALENDAR_SYNC_STATE,
  DEFAULT_GCAL_SETTINGS,
  DEFAULT_SETTINGS,
  normalizeCalendarSync,
  normalizeGCalSettings,
  normalizeGoogleAuth,
} from "src/settings/defaults"

describe("DEFAULT_GCAL_SETTINGS", () => {
  it("starts disconnected with sensible defaults", () => {
    expect(DEFAULT_GCAL_SETTINGS).toEqual({
      accountEmail: "",
      pullCalendars: "primary",
      pullDays: 60,
      eventsFolder: "Calendar",
      autoSyncSeconds: 45,
      addObsidianLink: true,
      deleteEventsWithNotes: true,
      taskListName: "@default",
    })
  })
})

describe("DEFAULT_SETTINGS", () => {
  it("uses the reminder defaults", () => {
    expect(DEFAULT_SETTINGS.idCounter).toBe(0)
    expect(DEFAULT_SETTINGS.inlineActions).toBe(true)
    expect(DEFAULT_SETTINGS.timeFormat).toBe("24h")
    expect(DEFAULT_SETTINGS.startWeekFrom).toBe("monday")
  })

  it("reuses the default google calendar settings", () => {
    expect(DEFAULT_SETTINGS.googleCalendar).toBe(DEFAULT_GCAL_SETTINGS)
  })

  it("starts without a google session", () => {
    expect(DEFAULT_SETTINGS.googleAuth).toBeNull()
  })

  it("starts without calendar sync state", () => {
    expect(DEFAULT_SETTINGS.calendarSync).toBe(DEFAULT_CALENDAR_SYNC_STATE)
    expect(DEFAULT_CALENDAR_SYNC_STATE).toEqual({ syncTokens: {}, lastSyncAt: 0, notes: {}, pendingDeletes: [] })
  })
})

describe("normalizeCalendarSync", () => {
  it("returns the defaults for missing data", () => {
    expect(normalizeCalendarSync(undefined)).toEqual(DEFAULT_CALENDAR_SYNC_STATE)
    expect(normalizeCalendarSync(null)).toEqual(DEFAULT_CALENDAR_SYNC_STATE)
  })

  it("keeps the stored tokens and timestamp", () => {
    const stored: CalendarSyncState = {
      syncTokens: { primary: "token-1" },
      lastSyncAt: 1_700_000_000_000,
      notes: {},
      pendingDeletes: [],
    }

    expect(normalizeCalendarSync(stored)).toEqual(stored)
  })

  it("copies the tokens so the stored object is not shared", () => {
    const stored: CalendarSyncState = { syncTokens: { primary: "token-1" }, lastSyncAt: 0, notes: {}, pendingDeletes: [] }
    const result = normalizeCalendarSync(stored)

    result.syncTokens.work = "token-2"

    expect(stored.syncTokens).toEqual({ primary: "token-1" })
  })

  it("drops a malformed token map", () => {
    expect(normalizeCalendarSync({ syncTokens: "nope" as unknown as Record<string, string> })).toEqual({
      syncTokens: {},
      lastSyncAt: 0,
      notes: {},
      pendingDeletes: [],
    })
  })
})

describe("normalizeGCalSettings", () => {
  it("returns the defaults for missing data", () => {
    expect(normalizeGCalSettings(undefined)).toEqual(DEFAULT_GCAL_SETTINGS)
    expect(normalizeGCalSettings(null)).toEqual(DEFAULT_GCAL_SETTINGS)
  })

  it("keeps the stored values", () => {
    const stored: GCalSettings = {
      accountEmail: "me@example.com",
      pullCalendars: "primary, Work",
      pullDays: 7,
      eventsFolder: "Calendar/Events",
      autoSyncSeconds: 900,
      addObsidianLink: false,
      deleteEventsWithNotes: false,
      taskListName: "Tasks",
    }

    expect(normalizeGCalSettings(stored)).toEqual(stored)
  })

  it("fills only the missing keys", () => {
    const result = normalizeGCalSettings({ pullDays: 30 })

    expect(result.pullDays).toBe(30)
    expect(result.pullCalendars).toBe(DEFAULT_GCAL_SETTINGS.pullCalendars)
    expect(result.eventsFolder).toBe(DEFAULT_GCAL_SETTINGS.eventsFolder)
    expect(result.accountEmail).toBe(DEFAULT_GCAL_SETTINGS.accountEmail)
  })

  it("keeps falsy but valid values", () => {
    const result = normalizeGCalSettings({ pullDays: 0, autoSyncSeconds: 0, addObsidianLink: false, accountEmail: "" })

    expect(result.pullDays).toBe(0)
    expect(result.autoSyncSeconds).toBe(0)
    expect(result.addObsidianLink).toBe(false)
    expect(result.accountEmail).toBe("")
  })

  it("converts the legacy auto sync minutes into seconds", () => {
    const legacy = { autoSyncMinutes: 15 } as unknown as Partial<GCalSettings>

    expect(normalizeGCalSettings(legacy).autoSyncSeconds).toBe(900)
  })

  it("treats a legacy zero as unconfigured and uses the default", () => {
    const legacy = { autoSyncMinutes: 0 } as unknown as Partial<GCalSettings>

    expect(normalizeGCalSettings(legacy).autoSyncSeconds).toBe(DEFAULT_GCAL_SETTINGS.autoSyncSeconds)
  })

  it("prefers the seconds setting over the legacy minutes", () => {
    const stored = { autoSyncSeconds: 45, autoSyncMinutes: 15 } as unknown as Partial<GCalSettings>

    expect(normalizeGCalSettings(stored).autoSyncSeconds).toBe(45)
  })

  it("drops keys that are no longer supported", () => {
    const legacy = {
      clientId: "123.apps.googleusercontent.com",
      clientSecret: "secret",
      timeZone: "Europe/Warsaw",
      linkBaseUrl: "https://example.com/open",
    } as unknown as Partial<GCalSettings>

    const result = normalizeGCalSettings(legacy) as unknown as Record<string, unknown>

    expect(result).not.toHaveProperty("clientId")
    expect(result).not.toHaveProperty("clientSecret")
    expect(result).not.toHaveProperty("timeZone")
    expect(result).not.toHaveProperty("linkBaseUrl")
  })
})

describe("normalizeGoogleAuth", () => {
  const stored: GoogleAuthState = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: 1_700_000_000_000,
    scope: "openid email",
  }

  it("returns null for missing data", () => {
    expect(normalizeGoogleAuth(undefined)).toBeNull()
    expect(normalizeGoogleAuth(null)).toBeNull()
  })

  it("keeps a stored session", () => {
    expect(normalizeGoogleAuth(stored)).toEqual(stored)
  })

  it("drops a session without an access token", () => {
    expect(normalizeGoogleAuth({ ...stored, accessToken: "" })).toBeNull()
  })

  it("fills the missing fields", () => {
    expect(normalizeGoogleAuth({ accessToken: "access-token" })).toEqual({
      accessToken: "access-token",
      refreshToken: "",
      expiresAt: 0,
      scope: "",
    })
  })
})
