import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import type { GCalSettings } from "src/types"
import { Notice, Setting } from "tests/mocks/obsidian"

const credentials = vi.hoisted(() => ({ configured: true }))

vi.mock("src/utils/gcalCredentials", () => ({
  get isGoogleOAuthConfigured() {
    return credentials.configured
  },
}))

const account = vi.hoisted(() => ({
  connected: false,
  connectGoogleAccount: vi.fn(),
  disconnectGoogleAccount: vi.fn(),
}))

vi.mock("src/settings/googleAccount", () => ({
  isGoogleAccountConnected: () => account.connected,
  connectGoogleAccount: account.connectGoogleAccount,
  disconnectGoogleAccount: account.disconnectGoogleAccount,
}))

import { displayGoogleCalendarSettings } from "./googleCalendarSettings"

const DEFAULT_GCAL: GCalSettings = {
  accountEmail: "",
  pullCalendars: "primary",
  pullDays: 60,
  autoSyncMinutes: 0,
  addObsidianLink: true,
  taskListName: "@default",
}

const createPlugin = (overrides: Partial<GCalSettings> = {}) => {
  const saveSettings = vi.fn(async () => {})
  const plugin = {
    settings: { googleCalendar: { ...DEFAULT_GCAL, ...overrides } },
    saveSettings,
  } as unknown as ObsidianNotifierPlugin

  return { plugin, saveSettings }
}

const render = (plugin: ObsidianNotifierPlugin) => {
  const containerEl = document.createElement("div")
  displayGoogleCalendarSettings(containerEl, plugin)

  return { containerEl, settings: Setting.instances }
}

const byName = (name: string) => Setting.instances.find((setting) => setting.name === name)

describe("displayGoogleCalendarSettings", () => {
  beforeEach(() => {
    Setting.instances = []
    Notice.instances = []
    credentials.configured = true
    account.connected = false
    vi.clearAllMocks()
    account.connectGoogleAccount.mockResolvedValue(undefined)
    account.disconnectGoogleAccount.mockResolvedValue(undefined)
  })

  it("renders the section heading and the sign-in note", () => {
    const { plugin } = createPlugin()
    const { containerEl, settings } = render(plugin)

    expect(settings[0].name).toBe("Google Calendar")
    expect(settings[0].heading).toBe(true)
    expect(containerEl.textContent).toContain("Sign in with Google")
  })

  it("warns when the OAuth client is missing from the build", () => {
    credentials.configured = false
    const { plugin } = createPlugin()

    const { containerEl } = render(plugin)

    expect(containerEl.textContent).toContain("OAuth client is missing")
  })

  it("does not warn when the OAuth client is configured", () => {
    const { plugin } = createPlugin()

    const { containerEl } = render(plugin)

    expect(containerEl.textContent).not.toContain("OAuth client is missing")
  })

  describe("disconnected account", () => {
    it("shows only the account row", () => {
      const { plugin } = createPlugin()

      const { settings } = render(plugin)

      expect(settings.map((setting) => setting.name)).toEqual(["Google Calendar", "Google account"])
      expect(byName("Google account")?.desc).toBe("Not connected.")
    })

    it("renders an enabled connect button", () => {
      const { plugin } = createPlugin()

      render(plugin)
      const button = byName("Google account")?.buttons[0]

      expect(button?.text).toBe("Connect")
      expect(button?.cta).toBe(true)
      expect(button?.disabled).toBe(false)
    })

    it("disables the connect button when the OAuth client is missing", () => {
      credentials.configured = false
      const { plugin } = createPlugin()

      render(plugin)

      expect(byName("Google account")?.buttons[0].disabled).toBe(true)
    })

    it("starts the sign-in flow from the connect button", async () => {
      const { plugin } = createPlugin()

      render(plugin)
      await byName("Google account")?.buttons[0].onClickCb?.()

      expect(account.connectGoogleAccount).toHaveBeenCalledWith(plugin)
      expect(Notice.instances[Notice.instances.length - 1]?.message).toBe("Google account connected.")
    })

    it("shows the sign-in error and re-enables the button", async () => {
      const { plugin } = createPlugin()
      account.connectGoogleAccount.mockRejectedValue(new Error("Google sign-in failed."))

      render(plugin)
      const button = byName("Google account")?.buttons[0]
      await button?.onClickCb?.()

      expect(Notice.instances[Notice.instances.length - 1]?.message).toBe("Google sign-in failed.")
      expect(button?.text).toBe("Connect")
      expect(button?.disabled).toBe(false)
    })

    it("hides the sync settings and the help block", () => {
      const { plugin } = createPlugin()

      const { containerEl } = render(plugin)

      expect(byName("Calendars to list")).toBeUndefined()
      expect(byName("Sync now")).toBeUndefined()
      expect(containerEl.querySelector(".RemindAir-gcal-help")).toBeNull()
    })
  })

  describe("connected account", () => {
    const connected = { accountEmail: "me@example.com" }

    beforeEach(() => {
      account.connected = true
    })

    it("shows the account email and the disconnect button", () => {
      const { plugin } = createPlugin(connected)

      render(plugin)

      expect(byName("Google account")?.desc).toBe("me@example.com")
      expect(byName("Google account")?.buttons[0].text).toBe("Disconnect")
      expect(byName("Google account")?.buttons[0].warning).toBe(true)
    })

    it("disconnects the account from the disconnect button", async () => {
      const { plugin } = createPlugin(connected)

      render(plugin)
      await byName("Google account")?.buttons[0].onClickCb?.()

      expect(account.disconnectGoogleAccount).toHaveBeenCalledWith(plugin)
      expect(Notice.instances[Notice.instances.length - 1]?.message).toBe("Google account disconnected.")
    })

    it("renders all sync settings", () => {
      const { plugin } = createPlugin(connected)

      render(plugin)

      expect(Setting.instances.map((setting) => setting.name)).toEqual([
        "Google Calendar",
        "Google account",
        "Calendars to list",
        "Days ahead",
        "Auto sync",
        "Google task list",
        "Add note link",
        "Force pull from Google",
        "Force push to Google",
        "Sync now",
      ])
    })

    it("renders the frontmatter help block", () => {
      const { plugin } = createPlugin(connected)

      const { containerEl } = render(plugin)

      expect(containerEl.querySelector(".RemindAir-gcal-help")).not.toBeNull()
      expect(containerEl.textContent).toContain("calendarName")
    })

    it("renders disabled force pull, force push and sync buttons", () => {
      const { plugin } = createPlugin(connected)

      render(plugin)

      for (const name of ["Force pull from Google", "Force push to Google", "Sync now"]) {
        const button = byName(name)?.buttons[0]
        expect(button?.disabled).toBe(true)
      }
    })

    it("saves the calendars to list", async () => {
      const { plugin, saveSettings } = createPlugin(connected)

      render(plugin)
      await byName("Calendars to list")?.texts[0].onChangeCb?.("primary, Work")

      expect(plugin.settings.googleCalendar.pullCalendars).toBe("primary, Work")
      expect(saveSettings).toHaveBeenCalledTimes(1)
    })

    it("saves a valid number of days ahead", async () => {
      const { plugin } = createPlugin(connected)

      render(plugin)
      await byName("Days ahead")?.texts[0].onChangeCb?.("30")

      expect(plugin.settings.googleCalendar.pullDays).toBe(30)
    })

    it("falls back to 60 days for invalid input", async () => {
      const { plugin } = createPlugin({ ...connected, pullDays: 30 })

      render(plugin)
      await byName("Days ahead")?.texts[0].onChangeCb?.("abc")

      expect(plugin.settings.googleCalendar.pullDays).toBe(60)
    })

    it("saves a valid auto sync interval", async () => {
      const { plugin } = createPlugin(connected)

      render(plugin)
      await byName("Auto sync")?.texts[0].onChangeCb?.("15")

      expect(plugin.settings.googleCalendar.autoSyncMinutes).toBe(15)
    })

    it("falls back to 0 for invalid auto sync input", async () => {
      const { plugin } = createPlugin({ ...connected, autoSyncMinutes: 15 })

      render(plugin)
      await byName("Auto sync")?.texts[0].onChangeCb?.("-5")

      expect(plugin.settings.googleCalendar.autoSyncMinutes).toBe(0)
    })

    it("falls back to @default for an empty task list name", async () => {
      const { plugin } = createPlugin({ ...connected, taskListName: "Tasks" })

      render(plugin)
      await byName("Google task list")?.texts[0].onChangeCb?.("  ")

      expect(plugin.settings.googleCalendar.taskListName).toBe("@default")
    })

    it("saves the task list name", async () => {
      const { plugin } = createPlugin(connected)

      render(plugin)
      await byName("Google task list")?.texts[0].onChangeCb?.("Work")

      expect(plugin.settings.googleCalendar.taskListName).toBe("Work")
    })

    it("saves the note link toggle", async () => {
      const { plugin, saveSettings } = createPlugin(connected)

      render(plugin)
      await byName("Add note link")?.toggles[0].onChangeCb?.(false)

      expect(plugin.settings.googleCalendar.addObsidianLink).toBe(false)
      expect(saveSettings).toHaveBeenCalledTimes(1)
    })
  })
})
