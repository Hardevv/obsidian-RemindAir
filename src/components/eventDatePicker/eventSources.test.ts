import { describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { createEventSource, eventsFromGoogle, eventsFromNotes, mergeEvents, parseLocalDateTime, toPickerEvent } from "./eventSources"

const getGoogleAccessToken = vi.hoisted(() => vi.fn(async (): Promise<string | null> => "token"))
const fetchCalendarEventsPage = vi.hoisted(() => vi.fn())

vi.mock("src/settings/googleAccount", () => ({ getGoogleAccessToken }))
vi.mock("src/google/calendar", () => ({ fetchCalendarEventsPage }))

interface FakeFile {
  path: string
  basename: string
}

const createPlugin = (
  options: { files?: FakeFile[]; frontmatter?: Record<string, Record<string, unknown>>; syncTokens?: string[] } = {},
) => {
  const files = options.files ?? []
  const frontmatter = options.frontmatter ?? {}
  const cache = {
    getFileCache: (file: FakeFile) => (frontmatter[file.path] ? { frontmatter: frontmatter[file.path] } : null),
  }

  return {
    settings: {
      googleCalendar: { eventsFolder: "Calendar", pullCalendars: "primary" },
      calendarSync: { syncTokens: Object.fromEntries((options.syncTokens ?? []).map((id) => [id, "t"])) },
    },
    app: { vault: { getMarkdownFiles: () => files }, metadataCache: cache },
  } as unknown as ObsidianNotifierPlugin
}

const range = { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) }

describe("parseLocalDateTime", () => {
  it("reads the local date time shape", () => {
    const date = parseLocalDateTime("2026-11-02T10:00:00")

    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getHours()).toBe(10)
  })

  it("keeps a date only value on the same day", () => {
    const date = parseLocalDateTime("2026-11-02")

    expect(date?.getDate()).toBe(2)
    expect(date?.getHours()).toBe(0)
  })

  it("accepts a date object from the frontmatter", () => {
    expect(parseLocalDateTime(new Date(2026, 10, 2, 10))?.getHours()).toBe(10)
  })

  it("rejects empty and broken values", () => {
    expect(parseLocalDateTime(undefined)).toBeNull()
    expect(parseLocalDateTime("  ")).toBeNull()
    expect(parseLocalDateTime("not a date")).toBeNull()
  })
})

describe("eventsFromNotes", () => {
  const files = [
    { path: "Calendar/2026-10-28 10-00 │ Meeting.md", basename: "2026-10-28 10-00 │ Meeting" },
    { path: "Calendar/2026-12-24 10-00 │ Late.md", basename: "2026-12-24 10-00 │ Late" },
    { path: "Inbox/2026-10-28 10-00 │ Elsewhere.md", basename: "2026-10-28 10-00 │ Elsewhere" },
  ]

  const frontmatter = {
    "Calendar/2026-10-28 10-00 │ Meeting.md": {
      start: "2026-10-28T10:00:00",
      end: "2026-10-28T10:30:00",
      remindair: { eventId: "abc" },
    },
    "Calendar/2026-12-24 10-00 │ Late.md": { start: "2026-12-24T10:00:00", end: "2026-12-24T11:00:00" },
    "Inbox/2026-10-28 10-00 │ Elsewhere.md": { start: "2026-10-28T10:00:00" },
  }

  it("reads the notes inside the range and the events folder", () => {
    const plugin = createPlugin({ files, frontmatter })
    const events = eventsFromNotes(plugin, range)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ title: "Meeting", allDay: false, eventId: "abc" })
    expect(events[0].end.getMinutes()).toBe(30)
  })

  it("falls back to an hour when the note has no end", () => {
    const plugin = createPlugin({
      files: [{ path: "Calendar/a.md", basename: "2026-10-28 10-00 │ Solo" }],
      frontmatter: { "Calendar/a.md": { start: "2026-10-28T10:00:00" } },
    })

    expect(eventsFromNotes(plugin, range)[0].end.getHours()).toBe(11)
  })

  it("marks all day notes", () => {
    const plugin = createPlugin({
      files: [{ path: "Calendar/b.md", basename: "2026-10-28 │ Trip" }],
      frontmatter: { "Calendar/b.md": { start: "2026-10-28", allDay: true } },
    })

    expect(eventsFromNotes(plugin, range)[0]).toMatchObject({ title: "Trip", allDay: true })
  })

  it("skips notes without a start", () => {
    const plugin = createPlugin({
      files: [{ path: "Calendar/c.md", basename: "2026-10-28 │ Draft" }],
      frontmatter: { "Calendar/c.md": {} },
    })

    expect(eventsFromNotes(plugin, range)).toEqual([])
  })
})

describe("toPickerEvent", () => {
  it("maps a google event", () => {
    const event = toPickerEvent(
      {
        id: "abc",
        summary: "  Meeting  ",
        start: { dateTime: "2026-10-28T10:00:00" },
        end: { dateTime: "2026-10-28T10:30:00" },
      },
      "primary",
    )

    expect(event).toMatchObject({ id: "google:primary:abc", eventId: "abc", title: "Meeting", allDay: false })
  })

  it("keeps an all day event on its own day", () => {
    const event = toPickerEvent({ id: "x", summary: "Trip", start: { date: "2026-10-28" }, end: { date: "2026-10-29" } }, "primary")

    expect(event?.allDay).toBe(true)
    expect(event?.start.getDate()).toBe(28)
    expect(event?.end.getDate()).toBe(29)
  })

  it("drops cancelled events", () => {
    expect(
      toPickerEvent(
        { id: "x", status: "cancelled", start: { dateTime: "2026-10-28T10:00:00" }, end: { dateTime: "2026-10-28T11:00:00" } },
        "primary",
      ),
    ).toBeNull()
  })

  it("names an untitled event", () => {
    const event = toPickerEvent(
      { id: "x", start: { dateTime: "2026-10-28T10:00:00" }, end: { dateTime: "2026-10-28T11:00:00" } },
      "primary",
    )

    expect(event?.title).toBe("Untitled event")
  })
})

describe("mergeEvents", () => {
  it("drops the note copy once the google event is known", () => {
    const note = {
      id: "note:a",
      eventId: "abc",
      title: "Meeting",
      start: new Date(2026, 9, 28, 10),
      end: new Date(2026, 9, 28, 10, 30),
      allDay: false,
    }
    const google = { ...note, id: "google:primary:abc" }

    expect(mergeEvents([note], [google]).map((event) => event.id)).toEqual(["google:primary:abc"])
  })

  it("keeps a note that was never pushed", () => {
    const note = {
      id: "note:a",
      title: "Draft",
      start: new Date(2026, 9, 28, 10),
      end: new Date(2026, 9, 28, 10, 30),
      allDay: false,
    }

    expect(mergeEvents([note], [])).toEqual([note])
  })

  it("sorts by start", () => {
    const later = { id: "b", title: "B", start: new Date(2026, 9, 28, 12), end: new Date(2026, 9, 28, 13), allDay: false }
    const earlier = { id: "a", title: "A", start: new Date(2026, 9, 28, 9), end: new Date(2026, 9, 28, 10), allDay: false }

    expect(mergeEvents([later], [earlier]).map((event) => event.title)).toEqual(["A", "B"])
  })
})

describe("eventsFromGoogle", () => {
  it("returns nothing without a token", async () => {
    getGoogleAccessToken.mockResolvedValueOnce(null)

    expect(await eventsFromGoogle(createPlugin(), range)).toEqual([])
  })

  it("expands recurrences and reads every synced calendar", async () => {
    fetchCalendarEventsPage.mockResolvedValue({
      events: [{ id: "a", summary: "Meeting", start: { dateTime: "2026-10-28T10:00:00" }, end: { dateTime: "2026-10-28T11:00:00" } }],
    })

    const plugin = createPlugin({ syncTokens: ["primary", "team"] })
    const events = await eventsFromGoogle(plugin, range)

    expect(fetchCalendarEventsPage).toHaveBeenCalledTimes(2)
    expect(fetchCalendarEventsPage.mock.calls[0][0]).toMatchObject({ singleEvents: true })
    expect(events).toHaveLength(2)
  })

  it("ignores a calendar that fails", async () => {
    fetchCalendarEventsPage.mockReset()
    fetchCalendarEventsPage.mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce({
      events: [{ id: "b", summary: "Meeting", start: { dateTime: "2026-10-28T10:00:00" }, end: { dateTime: "2026-10-28T11:00:00" } }],
    })

    expect(await eventsFromGoogle(createPlugin({ syncTokens: ["primary", "team"] }), range)).toHaveLength(1)
  })
})

describe("createEventSource", () => {
  it("reads notes without the network", async () => {
    fetchCalendarEventsPage.mockReset()
    const plugin = createPlugin({
      files: [{ path: "Calendar/a.md", basename: "2026-10-28 10-00 │ Solo" }],
      frontmatter: { "Calendar/a.md": { start: "2026-10-28T10:00:00" } },
    })
    const source = createEventSource(plugin)

    expect(source.cached(range)).toHaveLength(1)
    expect(fetchCalendarEventsPage).not.toHaveBeenCalled()
  })

  it("caches the google result per range", async () => {
    fetchCalendarEventsPage.mockReset()
    fetchCalendarEventsPage.mockResolvedValue({ events: [] })
    const source = createEventSource(createPlugin({ syncTokens: ["primary"] }))

    await source.load(range)
    await source.load(range)

    expect(fetchCalendarEventsPage).toHaveBeenCalledTimes(1)
  })
})
