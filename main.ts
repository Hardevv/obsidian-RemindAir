import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS } from "consts";
import { registerCommands } from "commands";
import { buildReminderWidgetExtension } from "reminderWidget";
import { hoverLineExtension } from "quickReminderExtension";
import { Settings } from "settings";
import "flatpickr/dist/flatpickr.min.css";

export default class ObsidianNotifierPlugin extends Plugin {
  settings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new Settings(this.app, this));
    this.registerEditorExtension(buildReminderWidgetExtension(this));
    this.registerEditorExtension(hoverLineExtension);

    registerCommands(this);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
