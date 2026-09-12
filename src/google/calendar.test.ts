import { beforeEach, describe, expect, it, vi } from "vitest"
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian"
import {
  DEFAULT_MAX_RESULTS,
  SyncTokenExpiredError,
  createCalendarEvent,
  fetchCalendarEvents,
  fetchCalendarEventsPage,
  fetchCalendarList,
  type GoogleCalendarEvent,
} from "src/google/calendar"

const response = (json: unknown, status = 200): RequestUrlResponse => ({
  status,
  json,
  text: JSON.stringify(json),
  arrayBuffer: new ArrayBuffer(0),
  headers: {},
})

const requestParams = (index = 0): RequestUrlParam => vi.mocked(requestUrl).mock.calls[index][0] as RequestUrlParam

const timeMin = new Date("2026-11-01T00:00:00.000Z")
const timeMax = new Date("2026-11-30T23:59:59.000Z")

describe("fetchCalendarEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requests events for the calendar in the given time range", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [] }))

    await fetchCalendarEvents({ accessToken: "access-token", calendarId: "work@group.calendar.google.com", timeMin, timeMax })

    const url = new URL(requestParams().url)
    expect(url.origin + url.pathname).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/work%40group.calendar.google.com/events",
    )
    expect(url.searchParams.get("timeMin")).toBe("2026-11-01T00:00:00.000Z")
    expect(url.searchParams.get("timeMax")).toBe("2026-11-30T23:59:59.000Z")
    expect(url.searchParams.get("singleEvents")).toBe("false")
    expect(url.searchParams.get("orderBy")).toBeNull()
    expect(url.searchParams.get("maxResults")).toBe(String(DEFAULT_MAX_RESULTS))
  })

  it("sends the access token and allows a custom max results", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [] }))

    await fetchCalendarEvents({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax, maxResults: 10 })

    expect(requestParams().headers).toEqual({ Authorization: ["Bearer", "access-token"].join(" ") })
    expect(new URL(requestParams().url).searchParams.get("maxResults")).toBe("10")
  })

  it("returns the event items", async () => {
    const items: GoogleCalendarEvent[] = [
      {
        id: "event-1",
        summary: "Weekly sync",
        start: { dateTime: "2026-11-11T10:00:00Z" },
        end: { dateTime: "2026-11-11T11:00:00Z" },
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=WE"],
      },
    ]
    vi.mocked(requestUrl).mockResolvedValue(response({ items }))

    await expect(fetchCalendarEvents({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax })).resolves.toEqual(items)
  })

  it("returns an empty list when Google sends no items", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({}))

    await expect(fetchCalendarEvents({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax })).resolves.toEqual([])
  })

  it("throws the Google error message", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ error: { message: "Invalid credentials" } }, 401))

    await expect(fetchCalendarEvents({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax })).rejects.toThrow(
      "Google Calendar request failed: Invalid credentials",
    )
  })

  it("asks to reconnect when the token lacks calendar scopes", async () => {
    vi.mocked(requestUrl).mockResolvedValue(
      response({ error: { message: "Request had insufficient authentication scopes." } }, 403),
    )

    await expect(fetchCalendarEvents({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax })).rejects.toThrow(
      "Google Calendar access is missing. Reconnect your Google account.",
    )
  })

  it("falls back to the status code when Google sends no message", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({}, 500))

    await expect(fetchCalendarEvents({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax })).rejects.toThrow(
      "Google Calendar request failed (500).",
    )
  })
})

describe("fetchCalendarEventsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("asks Google for deleted events on a full pull", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [] }))

    await fetchCalendarEventsPage({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax })

    const url = new URL(requestParams().url)
    expect(url.searchParams.get("showDeleted")).toBe("true")
    expect(url.searchParams.get("syncToken")).toBeNull()
  })

  it("sends the sync token without a time range", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [], nextSyncToken: "token-2" }))

    const page = await fetchCalendarEventsPage({
      accessToken: "access-token",
      calendarId: "primary",
      timeMin,
      timeMax,
      syncToken: "token-1",
    })

    const url = new URL(requestParams().url)
    expect(url.searchParams.get("syncToken")).toBe("token-1")
    expect(url.searchParams.get("timeMin")).toBeNull()
    expect(url.searchParams.get("timeMax")).toBeNull()
    expect(page.nextSyncToken).toBe("token-2")
  })

  it("follows next page tokens", async () => {
    vi.mocked(requestUrl)
      .mockResolvedValueOnce(response({ items: [{ id: "a", start: {}, end: {} }], nextPageToken: "page-2" }))
      .mockResolvedValueOnce(response({ items: [{ id: "b", start: {}, end: {} }], nextSyncToken: "token-1" }))

    const page = await fetchCalendarEventsPage({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax })

    expect(page.events.map((item) => item.id)).toEqual(["a", "b"])
    expect(page.nextSyncToken).toBe("token-1")
    expect(new URL(requestParams(1).url).searchParams.get("pageToken")).toBe("page-2")
  })

  it("reports an expired sync token", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ error: { message: "Sync token is no longer valid" } }, 410))

    await expect(
      fetchCalendarEventsPage({ accessToken: "access-token", calendarId: "primary", timeMin, timeMax, syncToken: "old" }),
    ).rejects.toBeInstanceOf(SyncTokenExpiredError)
  })
})

describe("fetchCalendarList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requests the calendar list with the access token", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [] }))

    await fetchCalendarList("access-token")

    const url = new URL(requestParams().url)
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/calendar/v3/users/me/calendarList")
    expect(url.searchParams.get("maxResults")).toBe("250")
    expect(requestParams().headers).toEqual({ Authorization: ["Bearer", "access-token"].join(" ") })
  })

  it("returns the calendar entries", async () => {
    const items = [{ id: "primary", summary: "Me", primary: true }]
    vi.mocked(requestUrl).mockResolvedValue(response({ items }))

    await expect(fetchCalendarList("access-token")).resolves.toEqual(items)
  })

  it("throws the Google error message", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ error: { message: "Invalid credentials" } }, 401))

    await expect(fetchCalendarList("access-token")).rejects.toThrow("Google Calendar request failed: Invalid credentials")
  })
})

describe("createCalendarEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const event = {
    summary: "Client meeting",
    description: "Notes",
    start: { dateTime: "2026-11-02T10:00:00Z" },
    end: { dateTime: "2026-11-02T11:00:00Z" },
  }

  it("posts the event to the calendar", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ id: "event-1", ...event }))

    await createCalendarEvent({ accessToken: "access-token", calendarId: "primary", event })

    const params = requestParams()
    const url = new URL(params.url)
    expect(params.method).toBe("POST")
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    expect(params.contentType).toBe("application/json")
    expect(params.headers).toEqual({ Authorization: ["Bearer", "access-token"].join(" ") })
    expect(JSON.parse(params.body as string)).toEqual(event)
  })

  it("passes send updates when given", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ id: "event-1", ...event }))

    await createCalendarEvent({ accessToken: "access-token", calendarId: "primary", event, sendUpdates: "all" })

    expect(new URL(requestParams().url).searchParams.get("sendUpdates")).toBe("all")
  })

  it("returns the created event", async () => {
    const created = { id: "event-1", htmlLink: "https://calendar.google.com/event", ...event }
    vi.mocked(requestUrl).mockResolvedValue(response(created))

    await expect(createCalendarEvent({ accessToken: "access-token", calendarId: "primary", event })).resolves.toEqual(created)
  })

  it("throws the Google error message", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ error: { message: "Insufficient permissions" } }, 403))

    await expect(createCalendarEvent({ accessToken: "access-token", calendarId: "primary", event })).rejects.toThrow(
      "Google Calendar request failed: Insufficient permissions",
    )
  })
})
