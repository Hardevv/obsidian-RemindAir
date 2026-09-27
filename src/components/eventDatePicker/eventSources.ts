import type ObsidianNotifierPlugin from "main"
import { fetchCalendarEventsPage, type GoogleCalendarEvent } from "src/google/calendar"
import { calendarEventsFolder, parseCalendarNames, parseNoteMetadata, parseNoteName } from "src/google/eventsSync"
import { getGoogleAccessToken } from "src/settings/googleAccount"
import { rangeKey } from "./grid"

export interface PickerEvent {
  id: string
  /** Google id, used to drop the note copy once the real event is loaded. */
  eventId?: string
  title: string
  start: Date
  end: Date
  allDay: boolean
}

export interface PickerRange {
  start: Date
  end: Date
}

export interface PickerEventSource {
  /** Notes are already in memory, so this is synchronous and works offline. */
  cached: (range: PickerRange) => PickerEvent[]
  load: (range: PickerRange) => Promise<PickerEvent[]>
}

const FALLBACK_DURATION_MINUTES = 60
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export const parseLocalDateTime = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== "string" || !value.trim()) return null

  const trimmed = value.trim()
  const dateOnly = DATE_ONLY.exec(trimmed)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))

  const date = new Date(trimmed)

  return Number.isNaN(date.getTime()) ? null : date
}

const withFallbackEnd = (start: Date, end: Date | null): Date =>
  end && end.getTime() > start.getTime() ? end : new Date(start.getTime() + FALLBACK_DURATION_MINUTES * 60000)

const overlaps = (start: Date, end: Date, range: PickerRange): boolean =>
  end.getTime() > range.start.getTime() && start.getTime() < range.end.getTime()

export const eventsFromNotes = (plugin: ObsidianNotifierPlugin, range: PickerRange): PickerEvent[] => {
  const folder = calendarEventsFolder(plugin.settings.googleCalendar)
  const cache = plugin.app.metadataCache
  const events: PickerEvent[] = []

  for (const file of plugin.app.vault.getMarkdownFiles()) {
    if (folder && !file.path.startsWith(`${folder}/`)) continue

    const frontmatter = cache?.getFileCache?.(file)?.frontmatter
    const start = parseLocalDateTime(frontmatter?.start)
    if (!start) continue

    const end = withFallbackEnd(start, parseLocalDateTime(frontmatter?.end))
    if (!overlaps(start, end, range)) continue

    events.push({
      id: `note:${file.path}`,
      eventId: parseNoteMetadata(frontmatter)?.eventId,
      title: parseNoteName(file.basename).title || "Untitled event",
      start,
      end,
      allDay: Boolean(frontmatter?.allDay),
    })
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export const toPickerEvent = (event: GoogleCalendarEvent, calendarId: string): PickerEvent | null => {
  if (event.status === "cancelled") return null

  const allDay = Boolean(event.start.date)
  const start = parseLocalDateTime(event.start.dateTime ?? event.start.date)
  if (!start) return null

  const end = withFallbackEnd(start, parseLocalDateTime(event.end?.dateTime ?? event.end?.date))

  return {
    id: `google:${calendarId}:${event.id}`,
    eventId: event.id,
    title: event.summary?.trim() || "Untitled event",
    start,
    end,
    allDay,
  }
}

export const mergeEvents = (notes: PickerEvent[], google: PickerEvent[]): PickerEvent[] => {
  const known = new Set(google.map((event) => event.eventId).filter(Boolean))
  const pending = notes.filter((event) => !event.eventId || !known.has(event.eventId))

  return [...pending, ...google].sort((a, b) => a.start.getTime() - b.start.getTime())
}

const calendarIds = (plugin: ObsidianNotifierPlugin): string[] => {
  const synced = Object.keys(plugin.settings.calendarSync?.syncTokens ?? {})
  if (synced.length > 0) return synced

  return parseCalendarNames(plugin.settings.googleCalendar.pullCalendars)
}

export const eventsFromGoogle = async (plugin: ObsidianNotifierPlugin, range: PickerRange): Promise<PickerEvent[]> => {
  const accessToken = await getGoogleAccessToken(plugin)
  if (!accessToken) return []

  const events: PickerEvent[] = []

  for (const calendarId of calendarIds(plugin)) {
    try {
      const page = await fetchCalendarEventsPage({
        accessToken,
        calendarId,
        timeMin: range.start,
        timeMax: range.end,
        singleEvents: true,
      })

      for (const event of page.events) {
        const mapped = toPickerEvent(event, calendarId)
        if (mapped) events.push(mapped)
      }
    } catch {
      // One unreadable calendar must not break the picker, the notes still show.
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export const createEventSource = (plugin: ObsidianNotifierPlugin): PickerEventSource => {
  const cache = new Map<string, PickerEvent[]>()

  return {
    cached: (range) => eventsFromNotes(plugin, range),
    load: async (range) => {
      const key = rangeKey(range.start, range.end)
      const hit = cache.get(key)
      if (hit) return hit

      const events = await eventsFromGoogle(plugin, range)
      cache.set(key, events)

      return events
    },
  }
}
