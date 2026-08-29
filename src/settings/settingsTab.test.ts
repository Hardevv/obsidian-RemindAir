import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"

vi.mock("src/components/settings/reminderSettings", () => ({ displayReminderSettings: vi.fn() }))
vi.mock("src/components/settings/googleCalendarSettings", () => ({ displayGoogleCalendarSettings: vi.fn() }))

import { displayGoogleCalendarSettings } from "src/components/settings/googleCalendarSettings"
import { displayReminderSettings } from "src/components/settings/reminderSettings"
import { Settings } from "src/settings/settingsTab"

const createPlugin = () => ({ app: {} }) as unknown as ObsidianNotifierPlugin

const createSettings = () => {
  const plugin = createPlugin()
  const settings = new Settings(plugin)
  const containerEl = document.createElement("div")
  settings.containerEl = containerEl

  return { plugin, settings, containerEl }
}

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps the plugin reference", () => {
    const { plugin, settings } = createSettings()

    expect(settings.plugin).toBe(plugin)
  })

  it("renders the plugin heading", () => {
    const { settings, containerEl } = createSettings()

    settings.display()

    expect(containerEl.querySelector("h2")?.textContent).toBe("RemindAir")
  })

  it("clears the container before rendering", () => {
    const { settings, containerEl } = createSettings()
    containerEl.innerHTML = "<p>stale content</p>"

    settings.display()

    expect(containerEl.querySelector("p")).toBeNull()
  })

  it("renders the reminder and google calendar sections", () => {
    const { plugin, settings, containerEl } = createSettings()

    settings.display()

    expect(displayReminderSettings).toHaveBeenCalledWith(containerEl, plugin)
    expect(displayGoogleCalendarSettings).toHaveBeenCalledWith(containerEl, plugin)
  })

  it("renders the reminder section first", () => {
    const { settings } = createSettings()

    settings.display()

    expect(vi.mocked(displayReminderSettings).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(displayGoogleCalendarSettings).mock.invocationCallOrder[0],
    )
  })
})
