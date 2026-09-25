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
    deleteCalendarEvent: vi.fn(),
  }
})

vi.mock("src/settings/googleAccount", () => ({ getGoogleAccessToken: google.getGoogleAccessToken }))
vi.mock("src/google/calendar", () => ({
  SyncTokenExpiredError: google.SyncTokenExpiredError,
  fetchCalendarEventsPage: google.fetchCalendarEventsPage,
  fetchCalendarList: google.fetchCalendarList,
  createCalendarEvent: google.createCalendarEvent,
  updateCalendarEvent: google.updateCalendarEvent,
  deleteCalendarEvent: google.deleteCalendarEvent,
}))

import {
  buildEventNote,
  eventFileName,
  fixNoteName,
  isSyncTrash,
  queueNoteDeletion,
  noteBaseName,
  parseCalendarNames,
  parseNoteName,
  payloadKey,
  sanitizeFileName,
  syncCalendarEvents,
} from "src/google/eventsSync"

const metadataOf = (content: string): Record<string, unknown> => {
  const line = content.split("\n").find((item) => item.startsWith("remindair: "))
  if (!line) throw new Error("the note has no remindair property")

  return JSON.parse(JSON.parse(line.slice("remindair: ".length)) as string) as Record<string, unknown>
}

interface FakeFile {
  path: string
  basename?: string
  stat: { mtime: number }
  frontmatter?: Record<string, unknown>
  content?: string
}

const withBasename = (file: FakeFile): FakeFile => {
  file.basename = file.path.split("/").pop()?.replace(/\.md$/, "") ?? ""

  return file
}

const createVault = (initialFiles: FakeFile[] = []) => {
  const files = [...initialFiles]
  const folders: string[] = []
  const created: { path: string; content: string }[] = []
  const modified: { file: FakeFile; content: string }[] = []
  const trashed: FakeFile[] = []
  const renamed: { file: FakeFile; path: string }[] = []

  const vault = {
    getAbstractFileByPath: vi.fn((path: string) => {
      if (folders.includes(path)) return {}

      return files.find((file) => file.path === path) ?? null
    }),
    getMarkdownFiles: vi.fn(() => files.map(withBasename)),
    createFolder: vi.fn(async (path: string) => {
      folders.push(path)
      return {}
    }),
    read: vi.fn(async (file: FakeFile) => file.content ?? ""),
    getName: vi.fn(() => "Vault"),
    create: vi.fn(async (path: string, content: string) => {
      const file: FakeFile = withBasename({ path, stat: { mtime: 0 }, content })
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

  const fileManager = {
    renameFile: vi.fn(async (file: FakeFile, path: string) => {
      file.path = path
      withBasename(file)
      renamed.push({ file, path })
    }),
  }

  return { vault, metadataCache, fileManager, files, folders, created, modified, trashed, renamed }
}

const createPlugin = (overrides: Partial<GCalSettings> = {}, initialFiles: FakeFile[] = []) => {
  const vault = createVault(initialFiles)
  const plugin = {
    settings: {
      googleCalendar: { ...DEFAULT_GCAL_SETTINGS, ...overrides },
      googleAuth: null,
      calendarSync: { syncTokens: {}, lastSyncAt: 0, notes: {}, pendingDeletes: [] },
    },
    app: { vault: vault.vault, metadataCache: vault.metadataCache, fileManager: vault.fileManager },
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
    expect(eventFileName(event())).toBe("2026-11-02 10-00 │ Client meeting")
  })

  it("supports all-day events and missing titles", () => {
    expect(eventFileName(event({ summary: "", start: { date: "2026-11-11" } }))).toBe("2026-11-11 │ Untitled event")
  })
})

describe("noteBaseName", () => {
  it("adds the date and the time for timed events", () => {
    expect(noteBaseName("2026-11-02T10:00:00+01:00", "Client meeting")).toBe("2026-11-02 10-00 │ Client meeting")
  })

  it("keeps only the date for all-day events", () => {
    expect(noteBaseName("2026-11-02", "Client meeting")).toBe("2026-11-02 │ Client meeting")
  })

  it("falls back to the title without a start and to a placeholder without a title", () => {
    expect(noteBaseName("", "Client meeting")).toBe("Client meeting")
    expect(noteBaseName("2026-11-02", "  ")).toBe("2026-11-02 │ Untitled event")
  })
})

describe("parseNoteName", () => {
  it("splits the date prefix from the title", () => {
    expect(parseNoteName("2026-11-02 10-00 │ Client meeting")).toEqual({ prefix: "2026-11-02 10-00", title: "Client meeting" })
    expect(parseNoteName("2026-11-02 │ Client meeting")).toEqual({ prefix: "2026-11-02", title: "Client meeting" })
  })

  it("still reads the separators used by older names", () => {
    expect(parseNoteName("2026-11-02 10-00 Client meeting")).toEqual({ prefix: "2026-11-02 10-00", title: "Client meeting" })
    expect(parseNoteName("2026-11-02 10-00 · Client meeting")).toEqual({ prefix: "2026-11-02 10-00", title: "Client meeting" })
    expect(parseNoteName("2026-11-02 10-00 | Client meeting")).toEqual({ prefix: "2026-11-02 10-00", title: "Client meeting" })
  })

  it("keeps a name without a prefix as the title", () => {
    expect(parseNoteName("Client meeting")).toEqual({ prefix: "", title: "Client meeting" })
  })

  it("survives a title that looks like a date", () => {
    expect(parseNoteName("2026-11-02 10-00 │ 2026-12-24")).toEqual({ prefix: "2026-11-02 10-00", title: "2026-12-24" })
  })
})

describe("queueNoteDeletion", () => {
  const plugin = () => {
    const created = createPlugin()

    created.plugin.settings.calendarSync.notes = {
      "Calendar/2026-11-02 10-00 │ Client meeting.md": { eventId: "event-1", calendarId: "primary" },
    }

    return created
  }

  it("queues the event and forgets the note", async () => {
    const { plugin: instance } = plugin()

    await expect(queueNoteDeletion(instance, "Calendar/2026-11-02 10-00 │ Client meeting.md")).resolves.toBe(true)

    expect(instance.settings.calendarSync.pendingDeletes).toEqual([{ eventId: "event-1", calendarId: "primary" }])
    expect(instance.settings.calendarSync.notes).toEqual({})
    expect(instance.saveSettings).toHaveBeenCalled()
  })

  it("queues the same event once", async () => {
    const { plugin: instance } = plugin()
    const path = "Calendar/2026-11-02 10-00 │ Client meeting.md"

    await queueNoteDeletion(instance, path)
    instance.settings.calendarSync.notes[path] = { eventId: "event-1", calendarId: "primary" }
    await queueNoteDeletion(instance, path)

    expect(instance.settings.calendarSync.pendingDeletes).toHaveLength(1)
  })

  it("does nothing for an unknown note or a disabled setting", async () => {
    const { plugin: instance } = plugin()
    instance.settings.googleCalendar.deleteEventsWithNotes = false

    await expect(queueNoteDeletion(instance, "Calendar/2026-11-02 10-00 │ Client meeting.md")).resolves.toBe(false)
    await expect(queueNoteDeletion(instance, "Calendar/unknown.md")).resolves.toBe(false)

    expect(instance.settings.calendarSync.pendingDeletes).toEqual([])
  })
})

describe("fixNoteName", () => {
  const note = (path: string, frontmatter: Record<string, unknown>): FakeFile =>
    withBasename({ path, stat: { mtime: 0 }, frontmatter, content: "" })

  it("puts the date prefix back from start", async () => {
    const file = note("Calendar/2026-12-24 10-00 │ Client meeting.md", { start: "2026-11-02T10:00:00+01:00" })
    const { plugin, renamed } = createPlugin({}, [file])

    await expect(fixNoteName(plugin, file as never)).resolves.toBe(true)

    expect(renamed[0]?.path).toBe("Calendar/2026-11-02 10-00 │ Client meeting.md")
  })

  it("keeps the title the user typed", async () => {
    const file = note("Calendar/2026-11-02 10-00 │ Sprint review.md", { start: "2026-11-02T10:00:00+01:00" })
    const { plugin, renamed } = createPlugin({}, [file])

    await fixNoteName(plugin, file as never)

    expect(renamed).toHaveLength(0)
  })

  it("adds the separator to an old name", async () => {
    const file = note("Calendar/2026-11-02 10-00 Client meeting.md", { start: "2026-11-02T10:00:00+01:00" })
    const { plugin, renamed } = createPlugin({}, [file])

    await fixNoteName(plugin, file as never)

    expect(renamed[0]?.path).toBe("Calendar/2026-11-02 10-00 │ Client meeting.md")
  })

  it("ignores notes outside the folder and notes without a start", async () => {
    const outside = note("Other/2026-12-24 10-00 │ Client meeting.md", { start: "2026-11-02T10:00:00+01:00" })
    const noStart = note("Calendar/2026-12-24 10-00 │ Client meeting.md", {})
    const { plugin, renamed } = createPlugin({}, [outside, noStart])

    await expect(fixNoteName(plugin, outside as never)).resolves.toBe(false)
    await expect(fixNoteName(plugin, noStart as never)).resolves.toBe(false)
    expect(renamed).toHaveLength(0)
  })
})

describe("buildEventNote", () => {
  it("writes the event metadata and the description", () => {
    const note = buildEventNote(event({ recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=WE"] }), "Work", "work-id")

    expect(note).not.toContain("title:")
    expect(note).toContain('start: "2026-11-02T10:00:00+01:00"')
    expect(note).toContain('end: "2026-11-02T11:00:00+01:00"')
    expect(note).toContain('location: "Office"')
    expect(note.endsWith("Notes\n")).toBe(true)

    const metadata = metadataOf(note)
    expect(metadata.title).toBe("Client meeting")
    expect(metadata.calendarName).toBe("Work")
    expect(metadata.calendarId).toBe("work-id")
    expect(metadata.eventId).toBe("event-1")
    expect(metadata.updated).toBe("2026-10-20T10:00:00.000Z")
    expect(metadata.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=WE"])
    expect(metadata.hash).toEqual(expect.any(String))
    expect(note).not.toContain("googleEventId")
    expect(note).not.toContain("syncedHash")
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
    google.deleteCalendarEvent.mockResolvedValue(undefined)
  })

  it("creates a note for each event in the events folder", async () => {
    const { plugin, created, folders } = createPlugin()

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ pushed: 0, created: 1, updated: 0, skipped: 0, deleted: 0, errors: [] })
    expect(folders).toContain("Calendar")
    expect(created).toHaveLength(1)
    expect(created[0].path).toBe("Calendar/2026-11-02 10-00 │ Client meeting.md")
    expect(metadataOf(created[0].content).eventId).toBe("event-1")
  })

  it("adds a counter when two events share the same name", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [event({ id: "event-1" }), event({ id: "event-2" })] })
    const { plugin, created } = createPlugin()

    await syncCalendarEvents(plugin)

    expect(created.map((item) => item.path)).toEqual([
      "Calendar/2026-11-02 10-00 │ Client meeting.md",
      "Calendar/2026-11-02 10-00 │ Client meeting 2.md",
    ])
  })

  it("resolves calendar names from the calendar list", async () => {
    google.fetchCalendarList.mockResolvedValue([{ id: "work@group.calendar.google.com", summary: "Work" }])
    const { plugin, created } = createPlugin({ pullCalendars: "Work" })

    await syncCalendarEvents(plugin)

    expect(google.fetchCalendarEventsPage).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "work@group.calendar.google.com" }),
    )
    expect(metadataOf(created[0].content).calendarName).toBe("Work")
  })

  it("uses the configured entry as a calendar id when it cannot be resolved", async () => {
    google.fetchCalendarList.mockResolvedValue([])
    const { plugin } = createPlugin({ pullCalendars: "custom-id" })

    await syncCalendarEvents(plugin)

    expect(google.fetchCalendarEventsPage).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "custom-id" }))
  })

  it("updates an existing note when the Google event is newer", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 10-00 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1" }) },
    }
    const { plugin, modified } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ pushed: 0, created: 0, updated: 1, skipped: 0, deleted: 0, errors: [] })
    expect(modified).toHaveLength(1)
    expect(modified[0].file).toBe(file)
  })

  it("skips an existing note when it is newer than the Google event", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 10-00 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-11-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1" }) },
    }
    const { plugin, modified } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result).toEqual({ pushed: 0, created: 0, updated: 0, skipped: 1, deleted: 0, errors: [] })
    expect(modified).toHaveLength(0)
  })

  it("keeps the title the user gave the file name", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 10-00 │ Sprint review.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1", title: "Client meeting" }) },
    }
    const { plugin, modified, renamed } = createPlugin({}, [file])

    const result = await syncCalendarEvents(plugin)

    expect(result.updated).toBe(1)
    expect(modified).toHaveLength(1)
    expect(renamed.map((item) => item.path)).toEqual([])
  })

  it("renames the note when the title changes in Google", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 10-00 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1", title: "Client meeting" }) },
    }
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [event({ summary: "Client meeting v2" })] })
    const { plugin, renamed } = createPlugin({}, [file])

    await syncCalendarEvents(plugin)

    expect(renamed[0]?.path).toBe("Calendar/2026-11-02 10-00 │ Client meeting v2.md")
  })

  it("moves the date prefix when the event is rescheduled in Google", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-12-24 10-00 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1", title: "Client meeting" }) },
    }
    const { plugin, renamed } = createPlugin({}, [file])

    await syncCalendarEvents(plugin)

    expect(renamed[0]?.path).toBe("Calendar/2026-11-02 10-00 │ Client meeting.md")
  })

  it("ignores notes from other folders", async () => {
    const file: FakeFile = {
      path: "Other/2026-11-02 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1" }) },
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

  it("sends the queued deletions and clears them", async () => {
    const { plugin } = createPlugin()
    plugin.settings.calendarSync.pendingDeletes = [{ eventId: "event-1", calendarId: "work" }]

    const result = await syncCalendarEvents(plugin)

    expect(google.deleteCalendarEvent).toHaveBeenCalledWith({ accessToken: "access-token", calendarId: "work", eventId: "event-1" })
    expect(plugin.settings.calendarSync.pendingDeletes).toEqual([])
    expect(result.errors).toEqual([])
  })

  it("keeps a deletion that failed and reports it", async () => {
    google.deleteCalendarEvent.mockRejectedValue(new Error("offline"))
    const { plugin } = createPlugin()
    plugin.settings.calendarSync.pendingDeletes = [{ eventId: "event-1", calendarId: "work" }]

    const result = await syncCalendarEvents(plugin)

    expect(plugin.settings.calendarSync.pendingDeletes).toHaveLength(1)
    expect(result.errors).toEqual(["event-1: offline"])
  })

  it("remembers the notes it knows about", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 10-00 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1", calendarId: "work" }) },
    }
    const { plugin } = createPlugin({}, [file])

    await syncCalendarEvents(plugin)

    expect(plugin.settings.calendarSync.notes).toEqual({
      "Calendar/2026-11-02 10-00 │ Client meeting.md": { eventId: "event-1", calendarId: "work" },
    })
  })

  it("marks a note trashed by the pull, so it is not treated as a user deletion", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 10-00 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1", calendarId: "work" }) },
    }
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [event({ status: "cancelled" })] })
    const { plugin } = createPlugin({}, [file])

    await syncCalendarEvents(plugin)

    expect(isSyncTrash(file.path)).toBe(true)
    expect(plugin.settings.calendarSync.pendingDeletes).toEqual([])
  })

  it("deletes the note when Google reports a cancelled event", async () => {
    const file: FakeFile = {
      path: "Calendar/2026-11-02 10-00 │ Client meeting.md",
      stat: { mtime: Date.parse("2026-10-01T00:00:00.000Z") },
      frontmatter: { remindair: JSON.stringify({ eventId: "event-1" }) },
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

const newEventNote = (
  overrides: Record<string, unknown> = {},
  body = "Notes",
  basename = "2026-11-05 09-00 │ New idea",
): FakeFile => {
  const frontmatter = { start: "2026-11-05T09:00:00+01:00", ...overrides }

  return { path: `Calendar/${basename}.md`, stat: { mtime: 0 }, frontmatter, content: eventNote(frontmatter, body) }
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
        description: "Notes\n\nobsidian://open?vault=Vault&file=Calendar%2F2026-11-05%2009-00%20%E2%94%82%20New%20idea",
        location: undefined,
        start: { dateTime: "2026-11-05T09:00:00+01:00" },
        end: { dateTime: "2026-11-05T09:00:00.000Z" },
      },
    })
    expect(result.pushed).toBe(1)
    expect(metadataOf(modified[0].content)).toMatchObject({
      calendarId: "primary",
      eventId: "created-1",
      updated: "2026-10-28T10:00:00.000Z",
    })
    expect(metadataOf(modified[0].content).hash).toEqual(expect.any(String))
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

  it("skips notes without a start", async () => {
    const files: FakeFile[] = [
      { path: "Calendar/a.md", stat: { mtime: 0 }, frontmatter: {} },
      { path: "Calendar/b.md", stat: { mtime: 0 }, frontmatter: { location: "Office" } },
    ]
    const { plugin } = createPlugin({}, files)

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).not.toHaveBeenCalled()
  })

  it("takes the title from the file name", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [] })
    const { plugin } = createPlugin({}, [newEventNote({}, "Notes", "2026-11-05 09-00 │ Sprint review")])

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ event: expect.objectContaining({ summary: "Sprint review" }) }))
  })

  it("adds the separator to a name from an older version", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [] })
    const { plugin, renamed } = createPlugin({}, [newEventNote({}, "Notes", "2026-11-05 09-00 New idea")])

    await syncCalendarEvents(plugin)

    expect(renamed[0]?.path).toBe("Calendar/2026-11-05 09-00 │ New idea.md")
  })

  it("puts the date prefix back when the file name was changed", async () => {
    google.fetchCalendarEventsPage.mockResolvedValue({ events: [] })
    const { plugin, renamed } = createPlugin({}, [newEventNote({}, "Notes", "2026-12-24 18-00 │ New idea")])

    await syncCalendarEvents(plugin)

    expect(renamed[0]?.path).toBe("Calendar/2026-11-05 09-00 │ New idea.md")
    expect(google.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ event: expect.objectContaining({ summary: "New idea" }) }))
  })

  it("prefers googleCalendarId over the default calendar", async () => {
    google.fetchCalendarList.mockResolvedValue([
      { id: "primary", summary: "Me", primary: true },
      { id: "work@group.calendar.google.com", summary: "Work" },
    ])
    const { plugin } = createPlugin({}, [newEventNote({ googleCalendarId: "Work" })])

    await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "work@group.calendar.google.com" }),
    )
  })

  it("keeps the googleCalendarId the user wrote", async () => {
    google.fetchCalendarList.mockResolvedValue([
      { id: "primary", summary: "Me", primary: true },
      { id: "work@group.calendar.google.com", summary: "Work" },
    ])
    const { plugin, modified } = createPlugin({}, [newEventNote({ googleCalendarId: "Work" })])

    await syncCalendarEvents(plugin)

    expect(modified[0].content).toContain('googleCalendarId: "Work"')
  })

  it("reports a note with a broken metadata property", async () => {
    const { plugin } = createPlugin({}, [newEventNote({ remindair: "not json" })])

    const result = await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).not.toHaveBeenCalled()
    expect(result.errors).toEqual(["Calendar/2026-11-05 09-00 │ New idea.md: the remindair property is not valid JSON."])
  })

  it("skips notes that already have an event id", async () => {
    const { plugin } = createPlugin({}, [newEventNote({ remindair: JSON.stringify({ eventId: "event-1" }) })])

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

  it("keeps a note without an event id when the push fails", async () => {
    google.createCalendarEvent.mockRejectedValue(new Error("Google Calendar request failed: offline"))
    const { plugin, modified } = createPlugin({}, [newEventNote()])

    const result = await syncCalendarEvents(plugin)

    expect(result.pushed).toBe(0)
    expect(result.errors).toEqual(["Calendar/2026-11-05 09-00 │ New idea.md: Google Calendar request failed: offline"])
    expect(modified).toHaveLength(0)
  })

  const existingNote = (
    metadata: Record<string, unknown> = {},
    mtime = Date.parse("2026-11-01T00:00:00.000Z"),
    basename = "2026-11-05 09-00 │ New idea",
  ) => {
    const frontmatter = {
      start: "2026-11-05T09:00:00+01:00",
      remindair: JSON.stringify({ title: "New idea", eventId: "event-1", ...metadata }),
    }

    return {
      path: `Calendar/${basename}.md`,
      stat: { mtime },
      frontmatter,
      content: eventNote(frontmatter),
    } as FakeFile
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
    const { plugin, modified } = createPlugin({}, [existingNote({ hash: "stale" })])

    const result = await syncCalendarEvents(plugin)

    expect(google.updateCalendarEvent).toHaveBeenCalledWith({
      accessToken: "access-token",
      calendarId: "primary",
      eventId: "event-1",
      event: expect.objectContaining({ summary: "New idea" }),
    })
    expect(result.pushed).toBe(1)
    expect(metadataOf(modified[0].content).hash).toBe(currentHash())
  })

  it("sends nothing when the note matches the last push", async () => {
    const { plugin, modified } = createPlugin({}, [existingNote({ hash: currentHash() })])

    await syncCalendarEvents(plugin)

    expect(google.updateCalendarEvent).not.toHaveBeenCalled()
    expect(google.createCalendarEvent).not.toHaveBeenCalled()
    expect(modified).toHaveLength(0)
  })

  it("adopts a note that has no hash instead of overwriting google", async () => {
    const { plugin, modified } = createPlugin({}, [existingNote()])

    await syncCalendarEvents(plugin)

    expect(google.updateCalendarEvent).not.toHaveBeenCalled()
    expect(metadataOf(modified[0].content).hash).toBe(currentHash())
  })

  it("keeps the note when the update fails", async () => {
    google.updateCalendarEvent.mockRejectedValue(new Error("Google Calendar request failed: offline"))
    const { plugin, modified } = createPlugin({}, [existingNote({ hash: "stale" })])

    const result = await syncCalendarEvents(plugin)

    expect(result.pushed).toBe(0)
    expect(result.errors).toEqual(["Calendar/2026-11-05 09-00 │ New idea.md: Google Calendar request failed: offline"])
    expect(modified).toHaveLength(0)
  })

  it("reports an invalid start date", async () => {
    const { plugin } = createPlugin({}, [newEventNote({ start: "tomorrow" })])

    const result = await syncCalendarEvents(plugin)

    expect(google.createCalendarEvent).not.toHaveBeenCalled()
    expect(result.errors).toEqual(["Calendar/2026-11-05 09-00 │ New idea.md: start is not a valid date."])
  })
})

})
