import type ObsidianNotifierPlugin from "main";
import { Settings } from "./settingsTab";

export const registerSettings = (plugin: ObsidianNotifierPlugin): void => {
  plugin.addSettingTab(new Settings(plugin));
};

export { Settings } from "./settingsTab";
export { DEFAULT_GCAL_SETTINGS, DEFAULT_SETTINGS, normalizeGCalSettings } from "./defaults";
