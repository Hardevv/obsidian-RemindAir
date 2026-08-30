import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { Setting } from "tests/mocks/obsidian"
import { displayReminderSettings } from "./reminderSettings"

const createPlugin = (overrides: Partial<Record<string, unknown>> = {}) => {
  const disablePlugin = vi.fn(async () => {})
  const enablePlugin = vi.fn(async () => {})
  const open = vi.fn()
  const openTabById = vi.fn()
  const saveSettings = vi.fn(async () => {})

  const plugin = {
    app: { plugins: { disablePlugin, enablePlugin }, setting: { open, openTabById } },
    manifest: { id: "obsidian-notifier" },
    settings: { inlineActions: true, timeFormat: "24h", startWeekFrom: "monday", ...overrides },
    saveSettings,
  } as unknown as ObsidianNotifierPlugin

  return { plugin, disablePlugin, enablePlugin, open, openTabById, saveSettings }
}

const render = (plugin: ObsidianNotifierPlugin) => {
  const containerEl = document.createElement("div")
  displayReminderSettings(containerEl, plugin)

  return Setting.instances
}

const byName = (name: string) => Setting.instances.find((setting) => setting.name === name)

describe("displayReminderSettings", () => {
  beforeEach(() => {
    Setting.instances = []
    vi.clearAllMocks()
  })

  it("renders the three reminder settings", () => {
    const { plugin } = createPlugin()

    const settings = render(plugin)

    expect(settings.map((setting) => setting.name)).toEqual(["Inline actions", "Time format in date time picker", "Start week from"])
  })

  it("reflects the current inline actions value", () => {
    const { plugin } = createPlugin({ inlineActions: false })

    render(plugin)

    expect(byName("Inline actions")?.toggles[0].value).toBe(false)
  })

  it("saves and reloads the plugin after toggling inline actions", async () => {
    vi.useFakeTimers()
    const { plugin, disablePlugin, enablePlugin, open, openTabById, saveSettings } = createPlugin()

    render(plugin)
    await byName("Inline actions")?.toggles[0].onChangeCb?.(false)
    vi.runAllTimers()

    expect(plugin.settings.inlineActions).toBe(false)
    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(disablePlugin).toHaveBeenCalledWith("obsidian-notifier")
    expect(enablePlugin).toHaveBeenCalledWith("obsidian-notifier")
    expect(open).toHaveBeenCalledTimes(1)
    expect(openTabById).toHaveBeenCalledWith("obsidian-notifier")

    vi.useRealTimers()
  })

  it("renders the time format dropdown", () => {
    const { plugin } = createPlugin({ timeFormat: "12h" })

    render(plugin)
    const dropdown = byName("Time format in date time picker")?.dropdowns[0]

    expect(dropdown?.options).toEqual([
      ["24h", "24h"],
      ["12h", "12h"],
    ])
    expect(dropdown?.value).toBe("12h")
  })

  it("saves the selected time format", async () => {
    const { plugin, saveSettings } = createPlugin()

    render(plugin)
    await byName("Time format in date time picker")?.dropdowns[0].onChangeCb?.("12h")

    expect(plugin.settings.timeFormat).toBe("12h")
    expect(saveSettings).toHaveBeenCalledTimes(1)
  })

  it("renders the start of week dropdown", () => {
    const { plugin } = createPlugin({ startWeekFrom: "sunday" })

    render(plugin)
    const dropdown = byName("Start week from")?.dropdowns[0]

    expect(dropdown?.options).toEqual([
      ["monday", "monday"],
      ["sunday", "sunday"],
    ])
    expect(dropdown?.value).toBe("sunday")
  })

  it("saves the selected start of week", async () => {
    const { plugin, saveSettings } = createPlugin()

    render(plugin)
    await byName("Start week from")?.dropdowns[0].onChangeCb?.("sunday")

    expect(plugin.settings.startWeekFrom).toBe("sunday")
    expect(saveSettings).toHaveBeenCalledTimes(1)
  })
})
