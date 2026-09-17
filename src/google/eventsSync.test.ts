import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import type { GoogleCalendarEvent } from "src/google/calendar"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import type { GCalSettings } from "src/types"

const google = vi.hoisted(() => {
  class SyncTokenExpiredError extends Error {}

  return {
    SyncTokenExpiredError,
    getGoogleAccessToken: vi.fn(),
    fetchCalendarEventsPage: vi.fn(),
    fetchCalendarList: vi.fn(),
    createCalendarEvent: vi.fn(),
    updateCalendarEvent: vi.fn(),
  }
})

vi.mock("src/settings/googleAccount", () => ({ getGoogleAccessToken: google.getGoogleAccessToken }))
vi.mock("src/google/calendar", () => ({
  SyncTokenExpiredError: google.SyncTokenExpiredError,
  fetchCalendarEventsPage: google.fetchCalendarEventsPage,
  fetchCalendarList: google.fetchCalendarList,
  createCalendarEvent: google.createCalendarEvent,
  updateCalendarEvent: google.updateCalendarEvent,
}))

import {
  buildEventNote,
  eventFileName,
  parseCalendarNames,
  payloadKey,
  sanitizeFileName,
  syncCalendarEvents,
} from "src/google/eventsSync"

interface FakeFile {
  path: string
  stat: { mtime: number }
  frontmatter?: Record<string, unknown>
  content?: string
}

const createVault = (initialFiles: FakeFile[] = []) => {
  const files = [...initialFiles]
  const folders: string[] = []
  const created: { path: string; content: string }[] = []
  const modified: { file: FakeFile; content: string }[] = []
  const trashed: FakeFile[] = []

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
    read: vi.fn(async (file: FakeFile) => file.content ?? ""),
    getName: vi.fn(() => "Vault"),
    create: vi.fn(async (path: string, content: string) => {
      const file: FakeFile = { path, stat: { mtime: 0 }, content }
      files.push(file)
      created.push({ path, content })

      return file
    }),
    modify: vi.fn(async (file: FakeFile, content: string) => {
      file.content = content
      modified.push({ file, content })
    }),
    trash: vi.fn(async (file: FakeFile) => {
      const index = files.indexOf(file)
      if (index >= 0) files.splice(index, 1)
      trashed.push(file)
    }),
  }

  const metadataCache = {
    getFileCache: vi.fn((file: FakeFile) => (file.frontmatter ? { frontmatter: file.frontmatter } : {})),
  }

  return { vault, metadataCache, files, folders, created, modified, trashed }
}

const createPlugin = (overrides: Partial<GCalSettings> = {}, initialFiles: FakeFile[] = []) => {
  const vault = createVault(initialFiles)
  const plugin = {
    settings: {
      googleCalendar: { ...DEFAULT_GCAL_SETTINGS, ...overrides },
      googleAuth: null,
      calendarSync: { syncTokens: {}, lastSyncAt: 0 },
    },
    app: { vault: vault.vault, metadataCache: vault.metadataCache },
    saveSettings: vi.fn(async () => undefined),
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

  it("strips the obsidian link from the description", () => {
    const note = buildEventNote(
      event({ description: "Notes\n\nobsidian://open?vault=Vault&file=Calendar%2FMeeting" }),
      "primary",
      "primary",
    )

    expect(note).not.toContain("obsidian://open")
    expect(note.endsWith("Notes\n")).toBe(true)
  })

  it("keeps all-day dates as dates and marks them as all day", () => {
    const note = buildEventNote(event({ start: { date: "2026-11-11" }, end: { date: "2026-11-12" } }), "primary", "primary")

    expect(note).toContain('start: "2026-11-11"')
    expect(note).toContain('end: "2026-11-12"')
    expect(note).toContain("allDay: true")
  })

  it("does not mark timed events as all day", () => {
    const note = buildEventNote(event(), "primary", "primary")

    expect(note).not.toContain("allDay")
  })
})

describe("syncCalendarEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    google.getGoogleAccessToken.mockResolvedValue("access-token")
    google.fetchCalendarList.mockResolvedValue([{ id: "primary", summary: "Me", primary: true }])
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [event()], nextSyncToken: "token-1" })
    google.createCalendarEvent.mockResolvedValue({ id: "created-1", updated: "2026-10-28T10:00:00.000Z" })
    google.updateCalendarEvent.mockResolvedValue({ id: "event-1", updated: "2026-10-28T10:00:00.000Z" })
  })

  it("creates a note for each event in the events folder", async () => {
    const { plugin, created, folders } = createPlugin()

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ pushed: 0, created: 1, updated: 0, skipped: 0, deleted: 0, errors: [] })
    expect(folders).toContain("Calendar")
    expect(created).toHaveLength(1)
    expect(created[0].path).toBe("Calendar/2026-11-02 Client meeting.md")
    expect(created[0].content).toContain('googleEventId: "event-1"')
  })

  it("resolves calendar names from the calendar list", async () => {
    google.fetchCalendarList.mockResolvedValue([{ id: "work@group.calendar.google.com", summary: "Work" }])
    const { plugin, created } = createPlugin({ pullCalendars: "Work" })

    await syncCalendarEvents(plugin)

    expect(google.fetchCalendarEventsPage).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "work@group.calendar.google.com" }),
    )
    expect(created[0].content).toContain('calendarName: "Work"')
  })

  it("uses the configured entry as a calendar id when it cannot be resolved", async () => {
    google.fetchCalendarList.mockResolvedValue([])
    const { plugin } = createPlugin({ pullCalendars: "custom-id" })

    await syncCalendarEvents(plugin)

    expect(google.fetchCalendarEventsPage).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "custom-id" }))
  })

  it("updates an existing note when the Google event is newer", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { googleEventId: "event-1" },
    }
    const { plugin, modified } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ pushed: 0, created: 0, updated: 1, skipped: 0, deleted: 0, errors: [] })
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

    expect(result).toEqual({ pushed: 0, created: 0, updated: 0, skipped: 1, deleted: 0, errors: [] })
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
    google.fetchCalendarEventsPage.mockRejectedValue(new Error("Google Calendar request failed: nope"))
    const { plugin } = createPlugin()

    const result = await syncCalendarEvents(plugin)

    expect(result.created).toBe(0)
    expect(result.errors).toEqual(["primary: Google Calendar request failed: nope"])
  })

  it("skips cancelled events", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [event({ status: "cancelled" })] })
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
    expect(google.fetchCalendarEventsPage).not.toHaveBeenCalled()
  })

  it("throws when no calendars are configured", async () => {
    const { plugin } = createPlugin({ pullCalendars: " , " })

    await expect(syncCalendarEvents(plugin)).rejects.toThrow("Add at least one calendar to sync.")
    expect(google.fetchCalendarEventsPage).not.toHaveBeenCalled()
  })

  it("stores the sync token and the last sync time", async () => {
    const { plugin } = createPlugin()

    await syncCalendarEvents(plugin)

    expect(plugin.settings.calendarSync.syncTokens).toEqual({ primary: "token-1" })
    expect(plugin.settings.calendarSync.lastSyncAt).toBeGreaterThan(0)
    expect(plugin.saveSettings).toHaveBeenCalled()
  })

  it("sends the stored sync token on the next run", async () => {
    const { plugin } = createPlugin()
    plugin.settings.calendarSync.syncTokens = { primary: "token-1" }

    await syncCalendarEvents(plugin)

    expect(google.fetchCalendarEventsPage).toHaveBeenCalledWith(expect.objectContaining({ syncToken: "token-1" }))
  })

  it("deletes the note when Google reports a cancelled event", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { googleEventId: "event-1" },
    }
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [event({ status: "cancelled" })] })
    const { plugin, trashed } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ pushed: 0, created: 0, updated: 0, skipped: 0, deleted: 1, errors: [] })
    expect(trashed).toEqual([file])
  })

  it("falls back to a full pull when the sync token expired", async () => {
    const { plugin } = createPlugin()
    plugin.settings.calendarSync.syncTokens = { primary: "stale" }
    google.fetchCalendarEventsPage
      .mockRejectedValueOnce(new google.SyncTokenExpiredError())
      .mockResolvedValueOnce({ events: [event()], nextSyncToken: "token-2" })

    const result = await syncCalendarEvents(plugin)

    expect(result.created).toBe(1)
    expect(google.fetchCalendarEventsPage).toHaveBeenCalledTimes(2)
    expect(google.fetchCalendarEventsPage.mock.calls[1][0].syncToken).toBeUndefined()
    expect(plugin.settings.calendarSync.syncTokens).toEqual({ primary: "token-2" })
  })

  it("shares one run between concurrent calls", async () => {
    const { plugin, created } = createPlugin()

    const [first, second] = await Promise.all([syncCalendarEvents(plugin), syncCalendarEvents(plugin)])

    expect(first).toEqual(second)
    expect(google.fetchCalendarEventsPage).toHaveBeenCalledTimes(1)
    expect(created).toHaveLength(1)
  })

const eventNote = (frontmatter: Record<string, unknown>, body = "Notes"): string => {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)

  return `---\n${lines.join("\n")}\n---\n\n${body}\n`
}

const newEventNote = (overrides: Record<string, unknown> = {}, body = "Notes"): FakeFile => {
  const frontmatter = { googleCalendarId: "primary", title: "New idea", start: "2026-11-05T09:00:00+01:00", ...overrides }

  return { path: "Calendar/New idea.md", stat: { mtime: 0 }, frontmatter, content: eventNote(frontmatter, body) }
}

describe("push", () => {
  it("creates a Google event for a note with a calendar, title and start", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [] })
    const { plugin, modified } = createPlugin({}, [newEventNote()])

    const result = await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).toHaveBeenCalledWith({
      accessToken: "access-token",
      calendarId: "primary",
      event: {
        summary: "New idea",
        description: "Notes\n\nobsidian://open?vault=Vault&file=Calendar%2FNew%20idea",
        location: undefined,
        start: { dateTime: "2026-11-05T09:00:00+01:00" },
        end: { dateTime: "2026-11-05T09:00:00.000Z" },
      },
    })
    expect(result.pushed).toBe(1)
    expect(modified[0].content).toContain('googleEventId: "created-1"')
    expect(modified[0].content).toContain('googleUpdated: "2026-10-28T10:00:00.000Z"')
    expect(modified[0].content).toContain("syncedHash:")
  })

  it("does not duplicate the note when the pull returns the created event", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [event({ id: "created-1" })] })
    const { plugin, created } = createPlugin({}, [newEventNote()])

    const result = await syncCalendarEvents(plugin)

    expect(result.pushed).toBe(1)
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(created).toHaveLength(0)
  })

  it("skips notes without a calendar, a title or a start", async () => {
    const files: FakeFile[] = [
      { path: "Calendar/a.md", stat: { mtime: 0 }, frontmatter: { title: "x", start: "2026-11-05" } },
      { path: "Calendar/b.md", stat: { mtime: 0 }, frontmatter: { googleCalendarId: "primary", start: "2026-11-05" } },
      { path: "Calendar/c.md", stat: { mtime: 0 }, frontmatter: { googleCalendarId: "primary", title: "x" } },
    ]
    const { plugin } = createPlugin({}, files)

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).not.toHaveBeenCalled()
  })

  it("skips notes that already have a google event id", async () => {
    const { plugin } = createPlugin({}, [newEventNote({ googleEventId: "event-1" })])

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).not.toHaveBeenCalled()
  })

  it("pushes only notes from the events folder", async () => {
    const file = { ...newEventNote(), path: "Other/New idea.md" }
    const { plugin } = createPlugin({}, [file])

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).not.toHaveBeenCalled()
  })

  it("defaults the end of an all-day event to the next day", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [] })
    const { plugin } = createPlugin({}, [newEventNote({ start: "2026-11-05" })])

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ start: { date: "2026-11-05" }, end: { date: "2026-11-06" } }) }),
    )
  })

  it("omits the obsidian link when the setting is off", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [] })
    const { plugin } = createPlugin({ addObsidianLink: false }, [newEventNote()])

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: expect.objectContaining({ description: "Notes" }) }),
    )
  })

  it("keeps a note without a google event id when the push fails", async () => {
    google.createCalendarEvent.mockRejectedValue(new Error("Google Calendar request failed: offline"))
    const { plugin, modified } = createPlugin({}, [newEventNote()])

    const result = await syncCalendarEvents(plugin)

    expect(result.pushed).toBe(0)
    expect(result.errors).toEqual(["Calendar/New idea.md: Google Calendar request failed: offline"])
    expect(modified).toHaveLength(0)
  })

  const existingNote = (extra: Record<string, unknown> = {}, mtime = Date.parse("2026-11-01T00:00:00.000Z")) => {
    const frontmatter = {
      googleCalendarId: "primary",
      googleEventId: "event-1",
      title: "New idea",
      start: "2026-11-05T09:00:00+01:00",
      ...extra,
    }

    return { path: "Calendar/New idea.md", stat: { mtime }, frontmatter, content: eventNote(frontmatter) } as FakeFile
  }

  const currentHash = (): string =>
    payloadKey({
      summary: "New idea",
      start: "2026-11-05T09:00:00+01:00",
      end: "",
      location: "",
      description: "Notes",
    })

  it("patches the google event when the note changed", async () => {
    const { plugin, modified } = createPlugin({}, [existingNote({ syncedHash: "stale" })])

    const result = await syncCalendarEvents(plugin)

    expect(google.updateCalendarEvent).toHaveBeenCalledWith({
      accessToken: "access-token",
      calendarId: "primary",
      eventId: "event-1",
      event: expect.objectContaining({ summary: "New idea" }),
    })
    expect(result.pushed).toBe(1)
    expect(modified[0].content).toContain(`syncedHash: ${JSON.stringify(currentHash())}`)
  })

  it("sends nothing when the note matches the last push", async () => {
    const { plugin, modified } = createPlugin({}, [existingNote({ syncedHash: currentHash() })])

    await syncCalendarEvents(plugin)

    expect(google.updateCalendarEvent).not.toHaveBeenCalled()
    expect(google.createCalendarEvent).not.toHaveBeenCalled()
    expect(modified).toHaveLength(0)
  })

  it("adopts a note that has no synced hash instead of overwriting google", async () => {
    const { plugin, modified } = createPlugin({}, [existingNote()])

    await syncCalendarEvents(plugin)

    expect(google.updateCalendarEvent).not.toHaveBeenCalled()
    expect(modified[0].content).toContain(`syncedHash: ${JSON.stringify(currentHash())}`)
  })

  it("keeps the note when the update fails", async () => {
    google.updateCalendarEvent.mockRejectedValue(new Error("Google Calendar request failed: offline"))
    const { plugin, modified } = createPlugin({}, [existingNote({ syncedHash: "stale" })])

    const result = await syncCalendarEvents(plugin)

    expect(result.pushed).toBe(0)
    expect(result.errors).toEqual(["Calendar/New idea.md: Google Calendar request failed: offline"])
    expect(modified).toHaveLength(0)
  })

  it("reports an invalid start date", async () => {
    const { plugin } = createPlugin({}, [newEventNote({ start: "tomorrow" })])

    const result = await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).not.toHaveBeenCalled()
    expect(result.errors).toEqual(["Calendar/New idea.md: start is not a valid date."])
  })
})

})
