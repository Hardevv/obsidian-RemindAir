import type ObsidianNotifierPlugin from "main";

export const isGoogleAccountConnected = (plugin: ObsidianNotifierPlugin): boolean => plugin.settings.googleCalendar.accountEmail.length > 0;
