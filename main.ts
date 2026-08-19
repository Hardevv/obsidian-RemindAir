import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, normalizeGCalSettings, PluginSettings } from "consts";
import { registerCommands } from "commands";
import { buildReminderWidgetExtension } from "reminderWidget";
import { buildHoverLineExtension } from "inlineActionWidget";
import { Settings } from "settings";
import "flatpickr/dist/flatpickr.min.css";

export default class ObsidianNotifierPlugin extends Plugin {
  settings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new Settings(this));
    this.registerEditorExtension(buildReminderWidgetExtension(this));
    if (this.settings.inlineActions) this.registerEditorExtension(buildHoverLineExtension(this));

    registerCommands(this);
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      googleCalendar: normalizeGCalSettings(data?.googleCalendar),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
