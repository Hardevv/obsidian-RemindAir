import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import type { GoogleCalendarEvent } from "src/google/calendar"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import type { GCalSettings } from "src/types"

const google = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(),
  fetchCalendarEvents: vi.fn(),
  fetchCalendarList: vi.fn(),
}))

vi.mock("src/settings/googleAccount", () => ({ getGoogleAccessToken: google.getGoogleAccessToken }))
vi.mock("src/google/calendar", () => ({
  fetchCalendarEvents: google.fetchCalendarEvents,
  fetchCalendarList: google.fetchCalendarList,
}))

import { buildEventNote, eventFileName, parseCalendarNames, sanitizeFileName, syncCalendarEvents } from "src/google/eventsSync"

interface FakeFile {
  path: string
  stat: { mtime: number }
  frontmatter?: Record<string, unknown>
}

const createVault = (initialFiles: FakeFile[] = []) => {
  const files = [...initialFiles]
  const folders: string[] = []
  const created: { path: string; content: string }[] = []
  const modified: { file: FakeFile; content: string }[] = []

  const vault = {
    getAbstractFileByPath: vi.fn((path: string) => {
      if (folders.includes(path)) return {}

      return files.find((file) => file.path === path) ?? null
    }),
    getMarkdownFiles: vi.fn(() => files),
    createFolder: vi.fn(async (path: string) => {
      folders.push(path)
      return {}
    }),
    create: vi.fn(async (path: string, content: string) => {
      const file: FakeFile = { path, stat: { mtime: 0 } }
      files.push(file)
      created.push({ path, content })

      return file
    }),
    modify: vi.fn(async (file: FakeFile, content: string) => {
      modified.push({ file, content })
    }),
  }

  const metadataCache = {
    getFileCache: vi.fn((file: FakeFile) => (file.frontmatter ? { frontmatter: file.frontmatter } : {})),
  }

  return { vault, metadataCache, files, folders, created, modified }
}

const createPlugin = (overrides: Partial<GCalSettings> = {}, initialFiles: FakeFile[] = []) => {
  const vault = createVault(initialFiles)
  const plugin = {
    settings: { googleCalendar: { ...DEFAULT_GCAL_SETTINGS, ...overrides } },
    app: { vault: vault.vault, metadataCache: vault.metadataCache },
  } as unknown as ObsidianNotifierPlugin

  return { plugin, ...vault }
}

const event = (overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent => ({
  id: "event-1",
  summary: "Client meeting",
  description: "Notes",
  location: "Office",
  start: { dateTime: "2026-11-02T10:00:00+01:00" },
  end: { dateTime: "2026-11-02T11:00:00+01:00" },
  updated: "2026-10-20T10:00:00.000Z",
  ...overrides,
})

describe("parseCalendarNames", () => {
  it("splits, trims and drops empty entries", () => {
    expect(parseCalendarNames(" primary, Work ,, ")).toEqual(["primary", "Work"])
  })
})

describe("sanitizeFileName", () => {
  it("replaces characters that are not allowed in file names", () => {
    expect(sanitizeFileName("a/b:c")).toBe("a-b-c")
  })

  it("returns an empty string for blank input", () => {
    expect(sanitizeFileName("   ")).toBe("")
  })
})

describe("eventFileName", () => {
  it("prefixes the title with the start date", () => {
    expect(eventFileName(event())).toBe("2026-11-02 Client meeting")
  })

  it("supports all-day events and missing titles", () => {
    expect(eventFileName(event({ summary: "", start: { date: "2026-11-11" } }))).toBe("2026-11-11 Untitled event")
  })
})

describe("buildEventNote", () => {
  it("writes the event metadata and the description", () => {
    const note = buildEventNote(event({ recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=WE"] }), "Work", "work-id")

    expect(note).toContain('calendarName: "Work"')
    expect(note).toContain('googleCalendarId: "work-id"')
    expect(note).toContain('googleEventId: "event-1"')
    expect(note).toContain('title: "Client meeting"')
    expect(note).toContain('start: "2026-11-02T10:00:00+01:00"')
    expect(note).toContain('end: "2026-11-02T11:00:00+01:00"')
    expect(note).toContain('location: "Office"')
    expect(note).toContain('googleUpdated: "2026-10-20T10:00:00.000Z"')
    expect(note).toContain('recurrence:\n  - "RRULE:FREQ=WEEKLY;BYDAY=WE"')
    expect(note.endsWith("Notes\n")).toBe(true)
  })

  it("keeps all-day dates as dates", () => {
    const note = buildEventNote(event({ start: { date: "2026-11-11" }, end: { date: "2026-11-12" } }), "primary", "primary")

    expect(note).toContain('start: "2026-11-11"')
    expect(note).toContain('end: "2026-11-12"')
  })
})

describe("syncCalendarEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    google.getGoogleAccessToken.mockResolvedValue("access-token")
    google.fetchCalendarList.mockResolvedValue([{ id: "primary", summary: "Me", primary: true }])
    google.fetchCalendarEvents.mockResolvedValue([event()])
  })

  it("creates a note for each event in the events folder", async () => {
    const { plugin, created, folders } = createPlugin()

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] })
    expect(folders).toContain("Calendar")
    expect(created).toHaveLength(1)
    expect(created[0].path).toBe("Calendar/2026-11-02 Client meeting.md")
    expect(created[0].content).toContain('googleEventId: "event-1"')
  })

  it("resolves calendar names from the calendar list", async () => {
    google.fetchCalendarList.mockResolvedValue([{ id: "work@group.calendar.google.com", summary: "Work" }])
    const { plugin, created } = createPlugin({ pullCalendars: "Work" })

    await syncCalendarEvents(plugin)

    expect(google.fetchCalendarEvents).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "work@group.calendar.google.com" }),
    )
    expect(created[0].content).toContain('calendarName: "Work"')
  })

  it("uses the configured entry as a calendar id when it cannot be resolved", async () => {
    google.fetchCalendarList.mockResolvedValue([])
    const { plugin } = createPlugin({ pullCalendars: "custom-id" })

    await syncCalendarEvents(plugin)

    expect(google.fetchCalendarEvents).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "custom-id" }))
  })

  it("updates an existing note when the Google event is newer", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { googleEventId: "event-1" },
    }
    const { plugin, modified } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, errors: [] })
    expect(modified).toHaveLength(1)
    expect(modified[0].file).toBe(file)
  })

  it("skips an existing note when it is newer than the Google event", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 Client meeting.md",
      stat: { mtime: Date.parse("2026-11-01T00:00:00.000Z") },
      frontmatter: { googleEventId: "event-1" },
    }
    const { plugin, modified } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1, errors: [] })
    expect(modified).toHaveLength(0)
  })

  it("ignores notes from other folders", async () => {
    const file: FakeFile = {
      path: "Other/2026-11-02 Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { googleEventId: "event-1" },
    }
    const { plugin, created, modified } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result.created).toBe(1)
    expect(created).toHaveLength(1)
    expect(modified).toHaveLength(0)
  })

  it("collects calendar errors without stopping the sync", async () => {
    google.fetchCalendarEvents.mockRejectedValue(new Error("Google Calendar request failed: nope"))
    const { plugin } = createPlugin()

    const result = await syncCalendarEvents(plugin)

    expect(result.created).toBe(0)
    expect(result.errors).toEqual(["primary: Google Calendar request failed: nope"])
  })

  it("skips cancelled events", async () => {
    google.fetchCalendarEvents.mockResolvedValue([event({ status: "cancelled" })])
    const { plugin, created } = createPlugin()

    const result = await syncCalendarEvents(plugin)

    expect(result.created).toBe(0)
    expect(created).toHaveLength(0)
  })

  it("falls back to the default folder for an empty setting", async () => {
    const { plugin, folders } = createPlugin({ eventsFolder: "" })

    await syncCalendarEvents(plugin)

    expect(folders).toContain("Calendar")
  })

  it("creates nested folders", async () => {
    const { plugin, folders } = createPlugin({ eventsFolder: "Calendar/Events" })

    await syncCalendarEvents(plugin)

    expect(folders).toEqual(["Calendar", "Calendar/Events"])
  })

  it("throws when the account is not connected", async () => {
    google.getGoogleAccessToken.mockResolvedValue(null)
    const { plugin } = createPlugin()

    await expect(syncCalendarEvents(plugin)).rejects.toThrow("Connect your Google account first.")
    expect(google.fetchCalendarEvents).not.toHaveBeenCalled()
  })

  it("throws when no calendars are configured", async () => {
    const { plugin } = createPlugin({ pullCalendars: " , " })

    await expect(syncCalendarEvents(plugin)).rejects.toThrow("Add at least one calendar to sync.")
    expect(google.fetchCalendarEvents).not.toHaveBeenCalled()
  })
})
