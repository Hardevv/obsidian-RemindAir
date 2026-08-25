import type { App } from "obsidian"

interface SettingsManager {
  open(): void
  openTabById(id: string): void
}

/** Opens the settings modal on the tab of the given plugin. Uses an internal Obsidian API. */
export const openSettingsTab = (app: App, pluginId: string): void => {
  const setting = (app as App & { setting?: SettingsManager }).setting
  if (!setting) return
  setting.open()
  setting.openTabById(pluginId)
}
