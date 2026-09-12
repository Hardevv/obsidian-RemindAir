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
  taskListName: string
}

export interface CalendarSyncState {
  syncTokens: Record<string, string>
  lastSyncAt: number
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
