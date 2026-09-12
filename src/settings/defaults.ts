import type { CalendarSyncState, GCalSettings, GoogleAuthState, PluginSettings } from "src/types"

export const DEFAULT_GCAL_SETTINGS: GCalSettings = {
  accountEmail: "",
  pullCalendars: "primary",
  pullDays: 60,
  eventsFolder: "Calendar",
  autoSyncSeconds: 45,
  addObsidianLink: true,
  taskListName: "@default",
}

export const DEFAULT_CALENDAR_SYNC_STATE: CalendarSyncState = {
  syncTokens: {},
  lastSyncAt: 0,
}

export const DEFAULT_SETTINGS: PluginSettings = {
  idCounter: 0,
  inlineActions: true,
  timeFormat: "24h",
  startWeekFrom: "monday",
  googleCalendar: DEFAULT_GCAL_SETTINGS,
  googleAuth: null,
  calendarSync: DEFAULT_CALENDAR_SYNC_STATE,
}

type StoredGCalSettings = Partial<GCalSettings> & { autoSyncMinutes?: number }

export function normalizeGCalSettings(stored?: StoredGCalSettings | null): GCalSettings {
  // The old minutes field was never wired to a timer, so a stored 0 only means "never configured".
  const legacySeconds =
    typeof stored?.autoSyncMinutes === "number" && stored.autoSyncMinutes > 0 ? stored.autoSyncMinutes * 60 : undefined

  return {
    accountEmail: stored?.accountEmail ?? DEFAULT_GCAL_SETTINGS.accountEmail,
    pullCalendars: stored?.pullCalendars ?? DEFAULT_GCAL_SETTINGS.pullCalendars,
    pullDays: stored?.pullDays ?? DEFAULT_GCAL_SETTINGS.pullDays,
    eventsFolder: stored?.eventsFolder ?? DEFAULT_GCAL_SETTINGS.eventsFolder,
    autoSyncSeconds: stored?.autoSyncSeconds ?? legacySeconds ?? DEFAULT_GCAL_SETTINGS.autoSyncSeconds,
    addObsidianLink: stored?.addObsidianLink ?? DEFAULT_GCAL_SETTINGS.addObsidianLink,
    taskListName: stored?.taskListName ?? DEFAULT_GCAL_SETTINGS.taskListName,
  }
}

export const normalizeCalendarSync = (stored?: Partial<CalendarSyncState> | null): CalendarSyncState => {
  const tokens = stored?.syncTokens

  return {
    syncTokens: tokens && typeof tokens === "object" ? { ...tokens } : {},
    lastSyncAt: typeof stored?.lastSyncAt === "number" ? stored.lastSyncAt : 0,
  }
}

export const normalizeGoogleAuth = (stored?: Partial<GoogleAuthState> | null): GoogleAuthState | null => {
  if (!stored || typeof stored.accessToken !== "string" || stored.accessToken.length === 0) return null

  return {
    accessToken: stored.accessToken,
    refreshToken: typeof stored.refreshToken === "string" ? stored.refreshToken : "",
    expiresAt: typeof stored.expiresAt === "number" ? stored.expiresAt : 0,
    scope: typeof stored.scope === "string" ? stored.scope : "",
  }
}
