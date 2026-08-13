import ObsidianNotifierPlugin from "main";
import { PluginSettingTab, Setting } from "obsidian";

export class Settings extends PluginSettingTab {
  plugin: ObsidianNotifierPlugin;

  constructor(plugin: ObsidianNotifierPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian notifier" });

    new Setting(containerEl)
      .setName("Inline actions")
      .setDesc(
        "Inline actions - add one or reduce one hour form hovered line, add new reminder to hovered line. You can hover any line in markdown editor to see available actions. This is an alternative for commands that works on hovered line instead of line on cursor.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.inlineActions).onChange(async (value) => {
          this.plugin.settings.inlineActions = value;
          await this.plugin.saveSettings();
          const pluginId = this.plugin.manifest.id;

          // ugly plugin reload
          // TODO: reload the plugin without disabling it
          const app = this.plugin.app as any;
          await app.plugins.disablePlugin(pluginId);
          await app.plugins.enablePlugin(pluginId);
          setTimeout(() => {
            app.setting.open();
            app.setting.openTabById(pluginId);
          }, 0);
        }),
      );

    new Setting(containerEl)
      .setName("Time format in date time picker")
      .setDesc("You can choose if you want to see the time int 24h format (e.g. 18:00) or 12h format with AM/PM (e.g. 6:00 PM).")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("24h", "24h")
          .addOption("12h", "12h")
          .setValue(this.plugin.settings.timeFormat)
          .onChange(async (value) => {
            this.plugin.settings.timeFormat = value as "24h" | "12h";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Start week from")
      .setDesc("You can choose your preferred start of the week in the date time picker.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("monday", "monday")
          .addOption("sunday", "sunday")
          .setValue(this.plugin.settings.startWeekFrom)
          .onChange(async (value) => {
            this.plugin.settings.startWeekFrom = value as "monday" | "sunday";
            await this.plugin.saveSettings();
          });
      });
  }
}
