import type ObsidianNotifierPlugin from "main"
import { normalizePath, type MetadataCache, type TFile, type Vault } from "obsidian"
import {
  createCalendarEvent,
  fetchCalendarEventsPage,
  fetchCalendarList,
  SyncTokenExpiredError,
  type CalendarEventsPage,
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
  type GoogleEventDateTime,
  type GoogleEventInput,
  updateCalendarEvent,
} from "src/google/calendar"
import { getGoogleAccessToken } from "src/settings/googleAccount"
import { GOOGLE_REQUIRED_SCOPES, hasGoogleScopes } from "src/google/oauth"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import type { GCalSettings } from "src/types"

const MAX_FILE_NAME_LENGTH = 80
const DAY_MS = 24 * 60 * 60 * 1000
const INVALID_FILE_CHARS = /[\\/:*?"<>|#^[\]]/g

export interface EventSyncResult {
  pushed: number
  created: number
  updated: number
  skipped: number
  deleted: number
  errors: string[]
}

interface ResolvedCalendar {
  id: string
  name: string
}

export const METADATA_KEY = "remindair"

export const LEGACY_KEYS = [
  "title",
  "googleEventId",
  "googleUpdated",
  "syncedHash",
  "calendarName",
  "recurrence",
  "recurringEventId",
]

export interface NoteMetadata {
  title?: string
  calendarId?: string
  calendarName?: string
  eventId?: string
  hash?: string
  updated?: string
  recurringEventId?: string
  recurrence?: string[]
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

export const isAllDayEvent = (event: GoogleCalendarEvent): boolean => Boolean(event.start.date)

const eventEndValue = (event: GoogleCalendarEvent): string => event.end.date ?? event.end.dateTime ?? ""

// A vertical bar lookalike: it reads like | but does not collide with [[note|alias]] links.
export const NAME_SEPARATOR = "│"

// Older names used a middle dot or a plain pipe, they still have to be readable.
const SEPARATORS = `${NAME_SEPARATOR}|·|\\|`
const NAME_PREFIX = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})(?: (\\d{2}-\\d{2}))?\\s*(?:${SEPARATORS})?\\s*(.*)$`)

/** The date and time part of the file name, always derived from start. */
export const namePrefix = (start: string): string => {
  if (!start) return ""

  const stamp = start.includes("T") ? start.slice(0, 16).replace("T", " ") : start.slice(0, 10)

  return sanitizeFileName(stamp)
}

export const parseNoteName = (basename: string): { prefix: string; title: string } => {
  const match = NAME_PREFIX.exec(basename.trim())
  if (!match) return { prefix: "", title: basename.trim() }

  const prefix = match[2] ? `${match[1]} ${match[2]}` : match[1]

  return { prefix, title: match[3].trim() }
}

export const noteBaseName = (start: string, title: string): string => {
  const cleanTitle = sanitizeFileName(title) || "Untitled event"
  const prefix = namePrefix(start)

  return sanitizeFileName(prefix ? `${prefix} ${NAME_SEPARATOR} ${cleanTitle}` : cleanTitle) || cleanTitle
}

export const eventFileName = (event: GoogleCalendarEvent): string =>
  noteBaseName(eventStartValue(event), event.summary ?? "")

const yamlValue = (value: string): string => JSON.stringify(value)

export const hashPayload = (value: string): string => {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(36)
}

interface EventPayload {
  summary: string
  start: string
  end: string
  location: string
  description: string
}

export const payloadKey = (payload: EventPayload): string =>
  hashPayload([payload.summary, payload.start, payload.end, payload.location, payload.description].join("\u0000"))

const eventPayloadKey = (event: GoogleCalendarEvent): string =>
  payloadKey({
    summary: event.summary ?? "",
    start: eventStartValue(event),
    end: eventEndValue(event),
    location: event.location ?? "",
    description: stripObsidianLink(event.description ?? ""),
  })

const safeJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const legacyMetadata = (frontmatter: Record<string, unknown>): NoteMetadata => {
  const metadata: NoteMetadata = {}
  const title = frontmatterText(frontmatter.title)
  const calendarId = frontmatterText(frontmatter.googleCalendarId)
  const eventId = frontmatterText(frontmatter.googleEventId)
  const hash = frontmatterText(frontmatter.syncedHash)
  const updated = frontmatterText(frontmatter.googleUpdated)
  const calendarName = frontmatterText(frontmatter.calendarName)
  const recurringEventId = frontmatterText(frontmatter.recurringEventId)

  if (title) metadata.title = title
  if (calendarId) metadata.calendarId = calendarId
  if (eventId) metadata.eventId = eventId
  if (hash) metadata.hash = hash
  if (updated) metadata.updated = updated
  if (calendarName) metadata.calendarName = calendarName
  if (recurringEventId) metadata.recurringEventId = recurringEventId
  if (Array.isArray(frontmatter.recurrence)) metadata.recurrence = frontmatter.recurrence.map(String)

  return metadata
}

/** Returns null when the property exists but cannot be read, so the note is never treated as new. */
export const parseNoteMetadata = (frontmatter?: Record<string, unknown> | null): NoteMetadata | null => {
  if (!frontmatter) return {}

  const legacy = legacyMetadata(frontmatter)
  const raw = frontmatter[METADATA_KEY]
  if (raw === undefined || raw === null || raw === "") return legacy

  const parsed = typeof raw === "object" ? raw : typeof raw === "string" ? safeJson(raw) : null
  if (!parsed || typeof parsed !== "object") return null

  return { ...legacy, ...(parsed as NoteMetadata) }
}

const serializeMetadata = (metadata: NoteMetadata): string => JSON.stringify(metadata)

export const buildEventNote = (event: GoogleCalendarEvent, calendarName: string, calendarId: string): string => {
  const metadata: NoteMetadata = { title: event.summary ?? "", calendarId, eventId: event.id, hash: eventPayloadKey(event) }
  if (calendarName) metadata.calendarName = calendarName
  if (event.updated) metadata.updated = event.updated
  if (event.recurringEventId) metadata.recurringEventId = event.recurringEventId
  if (event.recurrence?.length) metadata.recurrence = event.recurrence

  const lines = [
    "---",
    `start: ${yamlValue(eventStartValue(event))}`,
    `end: ${yamlValue(eventEndValue(event))}`,
  ]

  if (isAllDayEvent(event)) lines.push("allDay: true")
  if (event.location) lines.push(`location: ${yamlValue(event.location)}`)
  lines.push(`remindair: ${yamlValue(serializeMetadata(metadata))}`)
  lines.push("---", "", stripObsidianLink(event.description ?? ""))

  return `${lines.join("\n").trimEnd()}\n`
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/

export const splitNote = (content: string): { frontmatter: string; body: string } => {
  const normalized = content.replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) return { frontmatter: "", body: normalized }

  const end = normalized.indexOf("\n---", 3)
  if (end < 0) return { frontmatter: "", body: normalized }

  const bodyStart = normalized.indexOf("\n", end + 1)

  return {
    frontmatter: normalized.slice(0, end),
    body: bodyStart < 0 ? "" : normalized.slice(bodyStart + 1).replace(/^\n+/, ""),
  }
}

export const buildObsidianLink = (vaultName: string, path: string): string =>
  `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/, ""))}`

export const stripObsidianLink = (description: string): string =>
  description
    .split("\n")
    .filter((line) => !line.trim().startsWith("obsidian://open?"))
    .join("\n")
    .trimEnd()

const withObsidianLink = (body: string, link: string | null): string => {
  const clean = stripObsidianLink(body)
  if (!link) return clean

  return clean ? `${clean}\n\n${link}` : link
}

const frontmatterText = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)

  return ""
}

const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split("-").map(Number)
  const next = new Date(year, month - 1, day + days)

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
}

const toEventDateTime = (value: string): GoogleEventDateTime | null => {
  if (!value) return null
  if (DATE_ONLY.test(value)) return { date: value }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return { dateTime: HAS_OFFSET.test(value) ? value : parsed.toISOString() }
}

const defaultEnd = (start: GoogleEventDateTime): GoogleEventDateTime => {
  if (start.date) return { date: addDays(start.date, 1) }

  const startMs = Date.parse(start.dateTime ?? "")
  if (Number.isNaN(startMs)) return start

  return { dateTime: new Date(startMs + 60 * 60 * 1000).toISOString() }
}

const stripKeys = (lines: string[], keys: string[]): string[] => {
  const result: string[] = []
  let skipping = false

  for (const line of lines) {
    if (keys.some((key) => new RegExp(`^${key}\\s*:`).test(line))) {
      skipping = true
      continue
    }

    if (skipping && /^\s+-/.test(line)) continue

    skipping = false
    result.push(line)
  }

  return result
}

const setFrontmatter = (content: string, values: Record<string, string>, removeKeys: string[] = []): string => {
  const normalized = content.replace(/\r\n/g, "\n")
  const entries = Object.entries(values)
  const block = entries.map(([key, value]) => `${key}: ${yamlValue(value)}`)

  if (!normalized.startsWith("---\n")) return `---\n${block.join("\n")}\n---\n\n${normalized}`

  const end = normalized.indexOf("\n---", 3)
  if (end < 0) return normalized

  const frontmatter = normalized.slice(4, end)
  const lines = stripKeys(frontmatter.length > 0 ? frontmatter.split("\n") : [], removeKeys)
  const pending = [...entries]

  const updated = lines.map((line) => {
    const index = pending.findIndex(([key]) => new RegExp(`^${key}\\s*:`).test(line))
    if (index < 0) return line

    const [key, value] = pending[index]
    pending.splice(index, 1)

    return `${key}: ${yamlValue(value)}`
  })

  for (const [key, value] of pending) updated.push(`${key}: ${yamlValue(value)}`)

  return `---\n${updated.join("\n")}\n${normalized.slice(end)}`
}

const matchCalendar = (entries: GoogleCalendarListEntry[], value: string): ResolvedCalendar | null => {
  if (value.toLowerCase() === "primary") return { id: "primary", name: "primary" }

  const lower = value.toLowerCase()
  const match = entries.find(
    (entry) =>
      entry.id.toLowerCase() === lower ||
      entry.summary?.toLowerCase() === lower ||
      entry.summaryOverride?.toLowerCase() === lower,
  )

  if (!match) return null

  return { id: match.id, name: match.summaryOverride ?? match.summary ?? match.id }
}

const loadCalendars = async (
  accessToken: string,
  names: string[],
): Promise<{ calendars: ResolvedCalendar[]; entries: GoogleCalendarListEntry[] }> => {
  let entries: GoogleCalendarListEntry[] = []

  try {
    entries = await fetchCalendarList(accessToken)
  } catch {
    entries = []
  }

  const seen = new Set<string>()
  const calendars = names
    .map((name): ResolvedCalendar => matchCalendar(entries, name) ?? { id: name, name })
    .filter((calendar) => {
      if (seen.has(calendar.id)) return false
      seen.add(calendar.id)

      return true
    })

  return { calendars, entries }
}

export const ensureFolder = async (vault: Vault, folder: string): Promise<void> => {
  if (!folder) return

  let current = ""
  for (const part of folder.split("/")) {
    current = current ? `${current}/${part}` : part
    if (vault.getAbstractFileByPath(current)) continue

    await vault.createFolder(current)
  }
}

const readEventId = (file: TFile, metadataCache: MetadataCache): string | null => {
  const metadata = parseNoteMetadata(metadataCache.getFileCache(file)?.frontmatter)

  return metadata?.eventId ?? null
}

const pushNotes = async (
  plugin: ObsidianNotifierPlugin,
  accessToken: string,
  entries: GoogleCalendarListEntry[],
  folder: string,
  defaultCalendarId: string,
): Promise<{ pushed: number; errors: string[]; files: Map<string, TFile> }> => {
  const vault = plugin.app.vault
  const metadataCache = plugin.app.metadataCache
  const fileManager = plugin.app.fileManager
  const settings = plugin.settings.googleCalendar
  const folderPrefix = folder ? `${folder}/` : ""
  const vaultName = vault.getName()
  const result = { pushed: 0, errors: [] as string[], files: new Map<string, TFile>() }

  for (const file of vault.getMarkdownFiles()) {
    if (!file.path.startsWith(folderPrefix)) continue

    const frontmatter = metadataCache.getFileCache(file)?.frontmatter
    if (!frontmatter) continue

    const metadata = parseNoteMetadata(frontmatter)
    if (!metadata) {
      result.errors.push(`${file.path}: the ${METADATA_KEY} property is not valid JSON.`)
      continue
    }

    const startValue = frontmatterText(frontmatter.start)
    if (!startValue) continue

    const start = toEventDateTime(startValue)
    if (!start) {
      result.errors.push(`${file.path}: start is not a valid date.`)
      continue
    }

    const title = parseNoteName(file.basename).title || frontmatterText(frontmatter.title) || "Untitled event"
    const expectedName = noteBaseName(startValue, title)

    // The prefix belongs to start, so a date or time edited in the file name is put back, and old names get the separator.
    if (file.basename !== expectedName) {
      await fileManager.renameFile(file, uniqueNotePath(vault, folder, expectedName, file.path))
    }

    const calendarValue = metadata.calendarId || frontmatterText(frontmatter.googleCalendarId) || defaultCalendarId
    if (!calendarValue) continue

    const content = await vault.read(file)
    const body = stripObsidianLink(splitNote(content).body)
    const location = frontmatterText(frontmatter.location)
    const endValue = frontmatterText(frontmatter.end)
    const syncedHash = payloadKey({ summary: title, start: startValue, end: endValue, location, description: body })

    if (metadata.eventId && metadata.hash === syncedHash) continue

    // Notes written before the hash existed cannot be compared, so they are adopted instead of overwriting Google.
    if (metadata.eventId && !metadata.hash) {
      const adopted: NoteMetadata = { ...metadata, title, hash: syncedHash }
      await vault.modify(file, setFrontmatter(content, { [METADATA_KEY]: serializeMetadata(adopted) }, LEGACY_KEYS))
      continue
    }

    const calendar = matchCalendar(entries, calendarValue) ?? { id: calendarValue, name: calendarValue }
    const link = settings.addObsidianLink ? buildObsidianLink(vaultName, file.path) : null
    const event: GoogleEventInput = {
      summary: title,
      description: withObsidianLink(body, link) || undefined,
      location: location || undefined,
      start,
      end: toEventDateTime(endValue) ?? defaultEnd(start),
    }

    try {
      const saved = metadata.eventId
        ? await updateCalendarEvent({ accessToken, calendarId: calendar.id, eventId: metadata.eventId, event })
        : await createCalendarEvent({ accessToken, calendarId: calendar.id, event })

      if (!saved.id) throw new Error("Google did not return the event.")

      const next: NoteMetadata = { ...metadata, title, calendarId: calendar.id, eventId: saved.id, hash: syncedHash }
      if (saved.updated) next.updated = saved.updated

      await vault.modify(file, setFrontmatter(content, { [METADATA_KEY]: serializeMetadata(next) }, LEGACY_KEYS))
      result.files.set(saved.id, file)
      result.pushed++
    } catch (error) {
      result.errors.push(`${file.path}: ${error instanceof Error ? error.message : "could not send the event"}`)
    }
  }

  return result
}

export const uniqueNotePath = (vault: Vault, folder: string, base: string, ignore?: string): string => {
  const prefix = folder ? `${folder}/` : ""
  const taken = (path: string): boolean => {
    const existing = vault.getAbstractFileByPath(path)
    if (!existing) return false

    return ignore === undefined || existing.path !== ignore
  }

  let path = `${prefix}${base}.md`
  let counter = 2

  while (taken(path)) {
    path = `${prefix}${base} ${counter}.md`
    counter++
  }

  return path
}

export const calendarEventsFolder = (settings: GCalSettings): string =>
  normalizePath(settings.eventsFolder.trim() || DEFAULT_GCAL_SETTINGS.eventsFolder).replace(/^\/+|\/+$/g, "")

/** Renames a note to the name that start dictates, without talking to Google. Returns false for notes that are not events. */
export const fixNoteName = async (plugin: ObsidianNotifierPlugin, file: TFile): Promise<boolean> => {
  const folder = calendarEventsFolder(plugin.settings.googleCalendar)
  if (!folder || !file.path.startsWith(`${folder}/`)) return false

  const start = frontmatterText(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.start)
  if (!start) return false

  const title = parseNoteName(file.basename).title
  if (!title) return false

  const base = noteBaseName(start, title)
  if (file.basename !== base) {
    await plugin.app.fileManager.renameFile(file, uniqueNotePath(plugin.app.vault, folder, base, file.path))
  }

  return true
}

const fetchEventsPage = async (
  accessToken: string,
  calendarId: string,
  syncToken: string | undefined,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEventsPage> => {
  try {
    return await fetchCalendarEventsPage({ accessToken, calendarId, timeMin, timeMax, syncToken })
  } catch (error) {
    // An expired token means the calendar was not synced for too long, so start over from a full pull.
    if (!syncToken || !(error instanceof SyncTokenExpiredError)) throw error

    return fetchCalendarEventsPage({ accessToken, calendarId, timeMin, timeMax })
  }
}

const runSync = async (plugin: ObsidianNotifierPlugin): Promise<EventSyncResult> => {
  const accessToken = await getGoogleAccessToken(plugin)
  if (!accessToken) throw new Error("Connect your Google account first.")

  const auth = plugin.settings.googleAuth
  if (auth && !hasGoogleScopes(auth.scope, GOOGLE_REQUIRED_SCOPES)) {
    throw new Error("This Google account is missing Calendar permissions. Click Reconnect in the settings.")
  }

  const settings = plugin.settings.googleCalendar
  const calendarNames = parseCalendarNames(settings.pullCalendars)
  if (calendarNames.length === 0) throw new Error("Add at least one calendar to sync.")

  const folder = calendarEventsFolder(settings)
  const pullDays = settings.pullDays > 0 ? settings.pullDays : DEFAULT_GCAL_SETTINGS.pullDays
  const now = new Date()
  const timeMax = new Date(now.getTime() + pullDays * DAY_MS)

  const { calendars, entries } = await loadCalendars(accessToken, calendarNames)
  const vault = plugin.app.vault
  const metadataCache = plugin.app.metadataCache

  await ensureFolder(vault, folder)

  const push = await pushNotes(plugin, accessToken, entries, folder, calendars[0]?.id ?? "")

  const existing = new Map<string, TFile>()
  const folderPrefix = folder ? `${folder}/` : ""

  for (const file of vault.getMarkdownFiles()) {
    if (!file.path.startsWith(folderPrefix)) continue

    const id = readEventId(file, metadataCache)
    if (id) existing.set(id, file)
  }

  const result: EventSyncResult = {
    pushed: push.pushed,
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    errors: [...push.errors],
  }
  const syncTokens = plugin.settings.calendarSync.syncTokens

  for (const calendar of calendars) {
    let page: CalendarEventsPage

    try {
      page = await fetchEventsPage(accessToken, calendar.id, syncTokens[calendar.id], now, timeMax)
    } catch (error) {
      result.errors.push(`${calendar.name}: ${error instanceof Error ? error.message : "could not fetch events"}`)
      continue
    }

    if (page.nextSyncToken) syncTokens[calendar.id] = page.nextSyncToken

    for (const event of page.events) {
      if (!event.id) continue

      // The pull may run before Obsidian refreshes the metadata cache for a note pushed a moment ago.
      if (push.files.has(event.id)) {
        result.skipped++
        continue
      }

      const file = existing.get(event.id)

      if (event.status === "cancelled") {
        if (!file) continue

        await vault.trash(file, true)
        existing.delete(event.id)
        result.deleted++
        continue
      }

      const note = buildEventNote(event, calendar.name, calendar.id)

      if (file) {
        const eventUpdated = Date.parse(event.updated ?? "")
        const metadata = parseNoteMetadata(metadataCache.getFileCache(file)?.frontmatter)
        const localTitle = parseNoteName(file.basename).title
        const baseline = metadata?.title ?? ""
        const keepLocalTitle = localTitle.length > 0 && baseline.length > 0 && localTitle !== baseline
        const nextTitle = keepLocalTitle ? localTitle : (event.summary ?? "")

        if (Number.isFinite(eventUpdated) && eventUpdated > file.stat.mtime) {
          await vault.modify(file, note)
          result.updated++
        } else {
          result.skipped++
        }

        const target = uniqueNotePath(vault, folder, noteBaseName(eventStartValue(event), nextTitle), file.path)
        if (file.path !== target) await plugin.app.fileManager.renameFile(file, target)

        continue
      }

      const created = await vault.create(uniqueNotePath(vault, folder, eventFileName(event)), note)
      existing.set(event.id, created)
      result.created++
    }
  }

  plugin.settings.calendarSync.lastSyncAt = Date.now()
  await plugin.saveSettings()

  return result
}

const running = new WeakMap<ObsidianNotifierPlugin, Promise<EventSyncResult>>()

export const syncCalendarEvents = (plugin: ObsidianNotifierPlugin): Promise<EventSyncResult> => {
  const active = running.get(plugin)
  if (active) return active

  const task = runSync(plugin).finally(() => running.delete(plugin))
  running.set(plugin, task)

  return task
}
