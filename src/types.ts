export interface GoogleAuthState {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
}

export interface GCalSettings {
  accountEmail: string
  pullCalendars: string
  pullDays: number
  eventsFolder: string
  autoSyncSeconds: number
  addObsidianLink: boolean
  deleteEventsWithNotes: boolean
  taskListName: string
  /** How long the date tooltip waits on an event link, in milliseconds. */
  eventLinkTooltipDelayMs: number
}

export interface SyncedNote {
  eventId: string
  calendarId: string
}

export interface CalendarSyncState {
  syncTokens: Record<string, string>
  lastSyncAt: number
  /** Path to event, so a deleted note can still be matched with its event. */
  notes: Record<string, SyncedNote>
  /** Deletions that still have to reach Google. */
  pendingDeletes: SyncedNote[]
}

export interface PluginSettings {
  idCounter: number
  inlineActions: boolean
  timeFormat: "24h" | "12h"
  startWeekFrom: "monday" | "sunday"
  googleCalendar: GCalSettings
  googleAuth: GoogleAuthState | null
  calendarSync: CalendarSyncState
}
