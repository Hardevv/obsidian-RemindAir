import type ObsidianNotifierPlugin from "main"
import { normalizePath, type MetadataCache, type TFile, type Vault } from "obsidian"
import {
  fetchCalendarEvents,
  fetchCalendarList,
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
} from "src/google/calendar"
import { getGoogleAccessToken } from "src/settings/googleAccount"
import { GOOGLE_REQUIRED_SCOPES, hasGoogleScopes } from "src/google/oauth"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"

const MAX_FILE_NAME_LENGTH = 80
const DAY_MS = 24 * 60 * 60 * 1000
const INVALID_FILE_CHARS = /[\\/:*?"<>|#^[\]]/g

export interface EventSyncResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

interface ResolvedCalendar {
  id: string
  name: string
}

export const parseCalendarNames = (value: string): string[] =>
  value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

export const sanitizeFileName = (value: string): string =>
  value
    .replace(INVALID_FILE_CHARS, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim()

const eventStartValue = (event: GoogleCalendarEvent): string => event.start.date ?? event.start.dateTime ?? ""

const eventEndValue = (event: GoogleCalendarEvent): string => event.end.date ?? event.end.dateTime ?? ""

export const eventFileName = (event: GoogleCalendarEvent): string => {
  const title = sanitizeFileName(event.summary ?? "") || "Untitled event"
  const date = eventStartValue(event).slice(0, 10)

  return sanitizeFileName(date ? `${date} ${title}` : title) || `event-${event.id}`
}

const yamlValue = (value: string): string => JSON.stringify(value)

export const buildEventNote = (event: GoogleCalendarEvent, calendarName: string, calendarId: string): string => {
  const lines = [
    "---",
    `calendarName: ${yamlValue(calendarName)}`,
    `googleCalendarId: ${yamlValue(calendarId)}`,
    `googleEventId: ${yamlValue(event.id)}`,
    `title: ${yamlValue(event.summary ?? "")}`,
    `start: ${yamlValue(eventStartValue(event))}`,
    `end: ${yamlValue(eventEndValue(event))}`,
  ]

  if (event.location) lines.push(`location: ${yamlValue(event.location)}`)
  if (event.updated) lines.push(`googleUpdated: ${yamlValue(event.updated)}`)
  if (event.recurringEventId) lines.push(`recurringEventId: ${yamlValue(event.recurringEventId)}`)
  if (event.recurrence?.length) {
    lines.push("recurrence:")
    for (const rule of event.recurrence) lines.push(`  - ${yamlValue(rule)}`)
  }

  lines.push("---", "", event.description ?? "")

  return `${lines.join("\n").trimEnd()}\n`
}

const resolveCalendars = async (accessToken: string, names: string[]): Promise<ResolvedCalendar[]> => {
  let entries: GoogleCalendarListEntry[] = []

  try {
    entries = await fetchCalendarList(accessToken)
  } catch {
    entries = []
  }

  const resolved = names.map((name): ResolvedCalendar => {
    if (name.toLowerCase() === "primary") return { id: "primary", name: "primary" }

    const lower = name.toLowerCase()
    const match = entries.find(
      (entry) =>
        entry.id.toLowerCase() === lower ||
        entry.summary?.toLowerCase() === lower ||
        entry.summaryOverride?.toLowerCase() === lower,
    )

    return { id: match?.id ?? name, name: match?.summaryOverride ?? match?.summary ?? name }
  })

  const seen = new Set<string>()

  return resolved.filter((calendar) => {
    if (seen.has(calendar.id)) return false
    seen.add(calendar.id)

    return true
  })
}

const ensureFolder = async (vault: Vault, folder: string): Promise<void> => {
  if (!folder) return

  let current = ""
  for (const part of folder.split("/")) {
    current = current ? `${current}/${part}` : part
    if (vault.getAbstractFileByPath(current)) continue

    await vault.createFolder(current)
  }
}

const readEventId = (file: TFile, metadataCache: MetadataCache): string | null => {
  const id = metadataCache.getFileCache(file)?.frontmatter?.googleEventId

  return typeof id === "string" && id.length > 0 ? id : null
}

const uniqueFilePath = (vault: Vault, folder: string, event: GoogleCalendarEvent): string => {
  const prefix = folder ? `${folder}/` : ""
  const base = eventFileName(event)
  const first = `${prefix}${base}.md`
  if (!vault.getAbstractFileByPath(first)) return first

  const suffix = sanitizeFileName(event.id).slice(0, 8) || "event"
  let path = `${prefix}${base} (${suffix}).md`
  let counter = 2

  while (vault.getAbstractFileByPath(path)) {
    path = `${prefix}${base} (${suffix} ${counter}).md`
    counter++
  }

  return path
}

export const syncCalendarEvents = async (plugin: ObsidianNotifierPlugin): Promise<EventSyncResult> => {
  const accessToken = await getGoogleAccessToken(plugin)
  if (!accessToken) throw new Error("Connect your Google account first.")

  const auth = plugin.settings.googleAuth
  if (auth && !hasGoogleScopes(auth.scope, GOOGLE_REQUIRED_SCOPES)) {
    throw new Error("This Google account is missing Calendar permissions. Click Reconnect in the settings.")
  }

  const settings = plugin.settings.googleCalendar
  const calendarNames = parseCalendarNames(settings.pullCalendars)
  if (calendarNames.length === 0) throw new Error("Add at least one calendar to sync.")

  const rawFolder = settings.eventsFolder.trim() || DEFAULT_GCAL_SETTINGS.eventsFolder
  const folder = normalizePath(rawFolder).replace(/^\/+|\/+$/g, "")
  const pullDays = settings.pullDays > 0 ? settings.pullDays : DEFAULT_GCAL_SETTINGS.pullDays
  const now = new Date()
  const timeMax = new Date(now.getTime() + pullDays * DAY_MS)

  const calendars = await resolveCalendars(accessToken, calendarNames)
  const vault = plugin.app.vault
  const metadataCache = plugin.app.metadataCache

  await ensureFolder(vault, folder)

  const existing = new Map<string, TFile>()
  const folderPrefix = folder ? `${folder}/` : ""

  for (const file of vault.getMarkdownFiles()) {
    if (!file.path.startsWith(folderPrefix)) continue

    const id = readEventId(file, metadataCache)
    if (id) existing.set(id, file)
  }

  const result: EventSyncResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  for (const calendar of calendars) {
    let events: GoogleCalendarEvent[]

    try {
      events = await fetchCalendarEvents({ accessToken, calendarId: calendar.id, timeMin: now, timeMax })
    } catch (error) {
      result.errors.push(`${calendar.name}: ${error instanceof Error ? error.message : "could not fetch events"}`)
      continue
    }

    for (const event of events) {
      if (!event.id || event.status === "cancelled") continue

      const note = buildEventNote(event, calendar.name, calendar.id)
      const file = existing.get(event.id)

      if (file) {
        const eventUpdated = Date.parse(event.updated ?? "")

        if (Number.isFinite(eventUpdated) && eventUpdated > file.stat.mtime) {
          await vault.modify(file, note)
          result.updated++
        } else {
          result.skipped++
        }

        continue
      }

      const created = await vault.create(uniqueFilePath(vault, folder, event), note)
      existing.set(event.id, created)
      result.created++
    }
  }

  return result
}
