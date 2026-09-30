import { Plugin } from "obsidian"
import { registerCommands } from "src/commands"
import { startCalendarSync } from "src/google/syncScheduler"
import { DEFAULT_SETTINGS, normalizeCalendarSync, normalizeGCalSettings, normalizeGoogleAuth, registerSettings } from "src/settings"
import type { PluginSettings } from "src/types"
import { registerWidgets } from "src/widgets"
import "flatpickr/dist/flatpickr.min.css"

export default class ObsidianNotifierPlugin extends Plugin {
  settings = DEFAULT_SETTINGS

  async onload(): Promise<void> {
    await this.loadSettings()
    registerSettings(this)
    registerWidgets(this)
    registerCommands(this)
    startCalendarSync(this)
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginSettings> | null
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      googleCalendar: normalizeGCalSettings(data?.googleCalendar),
      googleAuth: normalizeGoogleAuth(data?.googleAuth),
      calendarSync: normalizeCalendarSync(data?.calendarSync),
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }
}
