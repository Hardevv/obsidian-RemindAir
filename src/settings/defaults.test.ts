import { describe, expect, it } from "vitest"
import type { GCalSettings } from "src/types"
import { DEFAULT_GCAL_SETTINGS, DEFAULT_SETTINGS, normalizeGCalSettings } from "src/settings/defaults"

describe("DEFAULT_GCAL_SETTINGS", () => {
  it("starts disconnected with sensible defaults", () => {
    expect(DEFAULT_GCAL_SETTINGS).toEqual({
      accountEmail: "",
      pullCalendars: "primary",
      pullDays: 60,
      autoSyncMinutes: 0,
      addObsidianLink: true,
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
      autoSyncMinutes: 15,
      addObsidianLink: false,
      taskListName: "Tasks",
    }

    expect(normalizeGCalSettings(stored)).toEqual(stored)
  })

  it("fills only the missing keys", () => {
    const result = normalizeGCalSettings({ pullDays: 30 })

    expect(result.pullDays).toBe(30)
    expect(result.pullCalendars).toBe(DEFAULT_GCAL_SETTINGS.pullCalendars)
    expect(result.accountEmail).toBe(DEFAULT_GCAL_SETTINGS.accountEmail)
  })

  it("keeps falsy but valid values", () => {
    const result = normalizeGCalSettings({ pullDays: 0, autoSyncMinutes: 0, addObsidianLink: false, accountEmail: "" })

    expect(result.pullDays).toBe(0)
    expect(result.autoSyncMinutes).toBe(0)
    expect(result.addObsidianLink).toBe(false)
    expect(result.accountEmail).toBe("")
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
