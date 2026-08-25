import type ObsidianNotifierPlugin from "main"
import { Setting } from "obsidian"

export const displayReminderSettings = (containerEl: HTMLElement, plugin: ObsidianNotifierPlugin): void => {
  new Setting(containerEl)
    .setName("Inline actions")
    .setDesc(
      "Inline actions - add one or reduce one hour form hovered line, add new reminder to hovered line. You can hover any line in markdown editor to see available actions. This is an alternative for commands that works on hovered line instead of line on cursor.",
    )
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.inlineActions).onChange(async (value) => {
        plugin.settings.inlineActions = value
        await plugin.saveSettings()
        const pluginId = plugin.manifest.id

        // ugly plugin reload
        // TODO: reload the plugin without disabling it
        const app = plugin.app as any
        await app.plugins.disablePlugin(pluginId)
        await app.plugins.enablePlugin(pluginId)
        setTimeout(() => {
          app.setting.open()
          app.setting.openTabById(pluginId)
        }, 0)
      }),
    )

  new Setting(containerEl)
    .setName("Time format in date time picker")
    .setDesc("You can choose if you want to see the time int 24h format (e.g. 18:00) or 12h format with AM/PM (e.g. 6:00 PM).")
    .addDropdown((dropdown) => {
      dropdown
        .addOption("24h", "24h")
        .addOption("12h", "12h")
        .setValue(plugin.settings.timeFormat)
        .onChange(async (value) => {
          plugin.settings.timeFormat = value as "24h" | "12h"
          await plugin.saveSettings()
        })
    })

  new Setting(containerEl)
    .setName("Start week from")
    .setDesc("You can choose your preferred start of the week in the date time picker.")
    .addDropdown((dropdown) => {
      dropdown
        .addOption("monday", "monday")
        .addOption("sunday", "sunday")
        .setValue(plugin.settings.startWeekFrom)
        .onChange(async (value) => {
          plugin.settings.startWeekFrom = value as "monday" | "sunday"
          await plugin.saveSettings()
        })
    })
}
