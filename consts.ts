export const PLUGIN_NAME = "obsidian-notifier";
export const REMINDER_REGEXP = /🔔\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\s+\^r-(\d+-[0-9a-zA-Z])/g;
export const ID_LETTERS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface GCalSettings {
  clientId: string;
  clientSecret: string;
  timeZone: string;
  pullCalendars: string;
  pullDays: number;
  autoSyncMinutes: number;
  addObsidianLink: boolean;
  linkBaseUrl: string;
  taskListName: string;
}

export const DEFAULT_GCAL_SETTINGS: GCalSettings = {
  clientId: "",
  clientSecret: "",
  timeZone: "",
  pullCalendars: "primary",
  pullDays: 60,
  autoSyncMinutes: 0,
  addObsidianLink: true,
  linkBaseUrl: "",
  taskListName: "@default",
};

export const DEFAULT_SETTINGS: PluginSettings = {
  idCounter: 0,
  inlineActions: true,
  timeFormat: "24h",
  startWeekFrom: "monday",
  googleCalendar: DEFAULT_GCAL_SETTINGS,
};

export interface PluginSettings {
  idCounter: number;
  inlineActions: boolean;
  timeFormat: "24h" | "12h";
  startWeekFrom: "monday" | "sunday";
  googleCalendar: GCalSettings;
}
