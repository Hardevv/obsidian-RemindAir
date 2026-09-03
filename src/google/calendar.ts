import { requestUrl } from "obsidian"

export const GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3"
export const DEFAULT_MAX_RESULTS = 250

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
  recurringEventId?: string
}

export interface FetchCalendarEventsOptions {
  accessToken: string
  calendarId: string
  timeMin: Date
  timeMax: Date
  maxResults?: number
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

const calendarErrorMessage = (status: number, json: unknown): string => {
  const message = (json as { error?: { message?: unknown } } | undefined)?.error?.message

  return typeof message === "string" ? `Google Calendar request failed: ${message}` : `Google Calendar request failed (${status}).`
}

export const fetchCalendarEvents = async ({
  accessToken,
  calendarId,
  timeMin,
  timeMax,
  maxResults = DEFAULT_MAX_RESULTS,
}: FetchCalendarEventsOptions): Promise<GoogleCalendarEvent[]> => {
  const url = new URL(`${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set("timeMin", timeMin.toISOString())
  url.searchParams.set("timeMax", timeMax.toISOString())
  url.searchParams.set("singleEvents", "true")
  url.searchParams.set("orderBy", "startTime")
  url.searchParams.set("maxResults", String(maxResults))

  const response = await requestUrl({
    url: url.toString(),
    headers: { Authorization: `Bearer ${accessToken}` },
    throw: false,
  })

  if (response.status >= 400) throw new Error(calendarErrorMessage(response.status, response.json))

  const items = (response.json as { items?: unknown } | undefined)?.items

  return Array.isArray(items) ? (items as GoogleCalendarEvent[]) : []
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
