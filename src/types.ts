export interface GCalSettings {
  timeZone: string;
  pullCalendars: string;
  pullDays: number;
  autoSyncMinutes: number;
  addObsidianLink: boolean;
  linkBaseUrl: string;
  taskListName: string;
}

export interface PluginSettings {
  idCounter: number;
  inlineActions: boolean;
  timeFormat: "24h" | "12h";
  startWeekFrom: "monday" | "sunday";
  googleCalendar: GCalSettings;
}
