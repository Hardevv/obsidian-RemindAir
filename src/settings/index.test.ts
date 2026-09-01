import { describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import {
  DEFAULT_GCAL_SETTINGS,
  DEFAULT_SETTINGS,
  normalizeGCalSettings,
  normalizeGoogleAuth,
  registerSettings,
  Settings,
} from "src/settings"

describe("registerSettings", () => {
  it("adds the settings tab to the plugin", () => {
    const addSettingTab = vi.fn()
    const plugin = { app: {}, addSettingTab } as unknown as ObsidianNotifierPlugin

    registerSettings(plugin)

    expect(addSettingTab).toHaveBeenCalledTimes(1)
  })

  it("passes a Settings instance bound to the plugin", () => {
    const addSettingTab = vi.fn()
    const plugin = { app: {}, addSettingTab } as unknown as ObsidianNotifierPlugin

    registerSettings(plugin)

    const tab = addSettingTab.mock.calls[0][0]
    expect(tab).toBeInstanceOf(Settings)
    expect(tab.plugin).toBe(plugin)
  })
})

describe("settings re-exports", () => {
  it("exposes the defaults and the normalizer", () => {
    expect(DEFAULT_SETTINGS).toBeDefined()
    expect(DEFAULT_GCAL_SETTINGS).toBeDefined()
    expect(normalizeGCalSettings).toBeTypeOf("function")
    expect(normalizeGoogleAuth).toBeTypeOf("function")
  })
})
