import ObsidianNotifierPlugin from "main";
import { App, PluginSettingTab } from "obsidian";

export class Settings extends PluginSettingTab {
  plugin: ObsidianNotifierPlugin;

  constructor(app: App, plugin: ObsidianNotifierPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian notifier" });
    const reminderCounter = containerEl.createEl("div");
    reminderCounter.innerHTML = `You've created <strong>${this.plugin.settings.idCounter} reminders</strong> so far, <br>`;
    const subtitle = createEl("div");
    subtitle.innerHTML = `Don't forget that <a href="https://buymeacoffee.com/hardevv" target="_blank"> you can buy me a coffee</a> :) <hr>`;
    reminderCounter.appendChild(subtitle);
    reminderCounter.style.fontSize = "20px";
    subtitle.style.fontSize = "14px";
  }
}
