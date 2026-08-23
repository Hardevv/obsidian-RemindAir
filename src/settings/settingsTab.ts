import type ObsidianNotifierPlugin from "main";
import { PluginSettingTab } from "obsidian";
import { displayGoogleCalendarSettings } from "src/components/settings/googleCalendarSettings";
import { displayReminderSettings } from "src/components/settings/reminderSettings";

export class Settings extends PluginSettingTab {
  plugin: ObsidianNotifierPlugin;

  constructor(plugin: ObsidianNotifierPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "RemindAir" });

    displayReminderSettings(containerEl, this.plugin);
    displayGoogleCalendarSettings(containerEl, this.plugin);
  }
}
