import type { GCalSettings, PluginSettings } from "src/types";

export const DEFAULT_GCAL_SETTINGS: GCalSettings = {
  accountEmail: "",
  pullCalendars: "primary",
  pullDays: 60,
  autoSyncMinutes: 0,
  addObsidianLink: true,
  taskListName: "@default",
};

export const DEFAULT_SETTINGS: PluginSettings = {
  idCounter: 0,
  inlineActions: true,
  timeFormat: "24h",
  startWeekFrom: "monday",
  googleCalendar: DEFAULT_GCAL_SETTINGS,
};

export function normalizeGCalSettings(stored?: Partial<GCalSettings> | null): GCalSettings {
  return {
    accountEmail: stored?.accountEmail ?? DEFAULT_GCAL_SETTINGS.accountEmail,
    pullCalendars: stored?.pullCalendars ?? DEFAULT_GCAL_SETTINGS.pullCalendars,
    pullDays: stored?.pullDays ?? DEFAULT_GCAL_SETTINGS.pullDays,
    autoSyncMinutes: stored?.autoSyncMinutes ?? DEFAULT_GCAL_SETTINGS.autoSyncMinutes,
    addObsidianLink: stored?.addObsidianLink ?? DEFAULT_GCAL_SETTINGS.addObsidianLink,
    taskListName: stored?.taskListName ?? DEFAULT_GCAL_SETTINGS.taskListName,
  };
}
