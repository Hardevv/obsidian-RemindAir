import { requestUrl } from "obsidian"

export const GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3"
export const DEFAULT_MAX_RESULTS = 500

export interface GoogleEventDateTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

export interface GoogleCalendarEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start: GoogleEventDateTime
  end: GoogleEventDateTime
  updated?: string
  htmlLink?: string
  recurrence?: string[]
  recurringEventId?: string
  originalStartTime?: GoogleEventDateTime
}

export interface FetchCalendarEventsOptions {
  accessToken: string
  calendarId: string
  timeMin: Date
  timeMax: Date
  maxResults?: number
}

export interface FetchCalendarEventsPageOptions extends FetchCalendarEventsOptions {
  syncToken?: string
  /** Expands recurring events into single instances. Off by default so the sync keeps the series. */
  singleEvents?: boolean
}

export interface CalendarEventsPage {
  events: GoogleCalendarEvent[]
  nextSyncToken?: string
}

export class SyncTokenExpiredError extends Error {
  constructor() {
    super("The Google Calendar sync token expired.")
    this.name = "SyncTokenExpiredError"
  }
}

export interface GoogleEventInput {
  summary?: string
  description?: string
  location?: string
  start: GoogleEventDateTime
  end: GoogleEventDateTime
}

export interface CreateCalendarEventOptions {
  accessToken: string
  calendarId: string
  event: GoogleEventInput
  sendUpdates?: "all" | "externalOnly" | "none"
}

export interface GoogleCalendarListEntry {
  id: string
  summary?: string
  summaryOverride?: string
  primary?: boolean
}

const calendarErrorMessage = (status: number, json: unknown): string => {
  const message = (json as { error?: { message?: unknown } } | undefined)?.error?.message

  if (typeof message === "string") {
    if (status === 403 && /insufficient authentication scopes/i.test(message)) {
      return "Google Calendar access is missing. Reconnect your Google account."
    }

    return `Google Calendar request failed: ${message}`
  }

  return `Google Calendar request failed (${status}).`
}

export const fetchCalendarEventsPage = async ({
  accessToken,
  calendarId,
  timeMin,
  timeMax,
  maxResults = DEFAULT_MAX_RESULTS,
  syncToken,
  singleEvents = false,
}: FetchCalendarEventsPageOptions): Promise<CalendarEventsPage> => {
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined

  do {
    const url = new URL(`${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`)
    url.searchParams.set("singleEvents", String(singleEvents))
    url.searchParams.set("maxResults", String(maxResults))

    if (syncToken) {
      // Google rejects timeMin, timeMax and orderBy when a sync token is present.
      url.searchParams.set("syncToken", syncToken)
    } else {
      url.searchParams.set("timeMin", timeMin.toISOString())
      url.searchParams.set("timeMax", timeMax.toISOString())
      url.searchParams.set("showDeleted", "true")
    }

    if (pageToken) url.searchParams.set("pageToken", pageToken)

    const response = await requestUrl({
      url: url.toString(),
      headers: { Authorization: `Bearer ${accessToken}` },
      throw: false,
    })

    if (response.status === 410) throw new SyncTokenExpiredError()
    if (response.status >= 400) throw new Error(calendarErrorMessage(response.status, response.json))

    const body = (response.json ?? {}) as { items?: unknown; nextPageToken?: unknown; nextSyncToken?: unknown }

    if (Array.isArray(body.items)) events.push(...(body.items as GoogleCalendarEvent[]))
    if (typeof body.nextSyncToken === "string") nextSyncToken = body.nextSyncToken
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : undefined
  } while (pageToken)

  return { events, nextSyncToken }
}

export const fetchCalendarEvents = async (options: FetchCalendarEventsOptions): Promise<GoogleCalendarEvent[]> =>
  (await fetchCalendarEventsPage(options)).events

export interface UpdateCalendarEventOptions {
  accessToken: string
  calendarId: string
  eventId: string
  event: GoogleEventInput
  sendUpdates?: "all" | "externalOnly" | "none"
}

export const updateCalendarEvent = async ({
  accessToken,
  calendarId,
  eventId,
  event,
  sendUpdates,
}: UpdateCalendarEventOptions): Promise<GoogleCalendarEvent> => {
  const url = new URL(`${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
  if (sendUpdates) url.searchParams.set("sendUpdates", sendUpdates)

  const response = await requestUrl({
    url: url.toString(),
    method: "PATCH",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(event),
    throw: false,
  })

  if (response.status >= 400) throw new Error(calendarErrorMessage(response.status, response.json))

  return (response.json ?? {}) as GoogleCalendarEvent
}

export interface DeleteCalendarEventOptions {
  accessToken: string
  calendarId: string
  eventId: string
  sendUpdates?: "all" | "externalOnly" | "none"
}

export const deleteCalendarEvent = async ({
  accessToken,
  calendarId,
  eventId,
  sendUpdates,
}: DeleteCalendarEventOptions): Promise<void> => {
  const url = new URL(`${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
  if (sendUpdates) url.searchParams.set("sendUpdates", sendUpdates)

  const response = await requestUrl({
    url: url.toString(),
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    throw: false,
  })

  // The event is already gone, which is what the caller wanted.
  if (response.status === 404 || response.status === 410) return
  if (response.status >= 400) throw new Error(calendarErrorMessage(response.status, response.json))
}

export const fetchCalendarList = async (accessToken: string): Promise<GoogleCalendarListEntry[]> => {
  const url = new URL(`${GOOGLE_CALENDAR_API_URL}/users/me/calendarList`)
  url.searchParams.set("maxResults", "250")

  const response = await requestUrl({
    url: url.toString(),
    headers: { Authorization: `Bearer ${accessToken}` },
    throw: false,
  })

  if (response.status >= 400) throw new Error(calendarErrorMessage(response.status, response.json))

  const items = (response.json as { items?: unknown } | undefined)?.items

  return Array.isArray(items) ? (items as GoogleCalendarListEntry[]) : []
}

export const createCalendarEvent = async ({
  accessToken,
  calendarId,
  event,
  sendUpdates,
}: CreateCalendarEventOptions): Promise<GoogleCalendarEvent> => {
  const url = new URL(`${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`)
  if (sendUpdates) url.searchParams.set("sendUpdates", sendUpdates)

  const response = await requestUrl({
    url: url.toString(),
    method: "POST",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(event),
    throw: false,
  })

  if (response.status >= 400) throw new Error(calendarErrorMessage(response.status, response.json))

  return (response.json ?? {}) as GoogleCalendarEvent
}
