import type ObsidianNotifierPlugin from "main"
import { Notice, Platform, Setting, type ButtonComponent } from "obsidian"
import { syncCalendarEvents } from "src/google/eventsSync"
import { GOOGLE_REQUIRED_SCOPES, hasGoogleScopes } from "src/google/oauth"
import { connectGoogleAccount, disconnectGoogleAccount, isGoogleAccountConnected } from "src/settings/googleAccount"
import { PLUGIN_NAME } from "src/utils/constants"
import { isGoogleOAuthConfigured } from "src/utils/gcalCredentials"

export const displayGoogleCalendarSettings = (containerEl: HTMLElement, plugin: ObsidianNotifierPlugin): void => {
  const root = containerEl.createDiv()
  const render = (): void => {
    root.empty()
    renderGoogleCalendarSettings(root, plugin, render)
  }

  render()
}

const renderGoogleCalendarSettings = (containerEl: HTMLElement, plugin: ObsidianNotifierPlugin, rerender: () => void): void => {
  new Setting(containerEl).setName("Google Calendar").setHeading()
  containerEl.createDiv({
    cls: `${PLUGIN_NAME}-gcal-note`,
    text: "Sign in with Google to connect your account. Events are pulled into the events folder.",
  })

  if (!isGoogleOAuthConfigured) {
    containerEl.createDiv({
      cls: `${PLUGIN_NAME}-gcal-note`,
      text: "OAuth client is missing in this build (GOOGLE_CLIENT_ID in .env).",
    })
  }

  const gcal = plugin.settings.googleCalendar
  const isConnected = isGoogleAccountConnected(plugin)
  const missingScopes = isConnected && !hasGoogleScopes(plugin.settings.googleAuth?.scope ?? "", GOOGLE_REQUIRED_SCOPES)

  if (!isConnected) {
    if (!Platform.isDesktopApp) {
      new Setting(containerEl).setName("Google account").setDesc("Not connected.")
      containerEl.createDiv({
        cls: `${PLUGIN_NAME}-gcal-note`,
        text: "Google sign-in is available in the desktop app only. Connect your account on desktop.",
      })
      return
    }

    new Setting(containerEl)
      .setName("Google account")
      .setDesc("Not connected.")
      .addButton((button) => {
        button.setButtonText("Connect").setCta().setDisabled(!isGoogleOAuthConfigured)
        button.onClick(() => handleConnect(plugin, button, rerender))
      })

    return
  }

  new Setting(containerEl)
    .setName("Google account")
    .setDesc(gcal.accountEmail)
    .addButton((button) =>
      button.setButtonText("Reconnect").onClick(() => handleConnect(plugin, button, rerender, "Reconnect")),
    )
    .addButton((button) =>
      button
        .setButtonText("Disconnect")
        .setWarning()
        .onClick(async () => {
          try {
            await disconnectGoogleAccount(plugin)
            new Notice("Google account disconnected.")
            rerender()
          } catch (error) {
            new Notice(error instanceof Error ? error.message : "Could not disconnect the Google account.")
          }
        }),
    )

  if (missingScopes) {
    const granted = plugin.settings.googleAuth?.scope || "none"
    containerEl.createDiv({
      cls: `${PLUGIN_NAME}-gcal-note`,
      text: `This account is missing Calendar and Tasks permissions. Click Reconnect and accept the new permissions. Granted scopes: ${granted}`,
    })
  }

  new Setting(containerEl)
    .setName("Calendars to list")
    .setDesc("Comma-separated Google calendar names, e.g. primary, Work. Calendars used by notes are added automatically.")
    .addText((text) =>
      text.setValue(gcal.pullCalendars).onChange(async (value) => {
        gcal.pullCalendars = value
        await plugin.saveSettings()
      }),
    )

  new Setting(containerEl)
    .setName("Events folder")
    .setDesc("Vault folder where each Google Calendar event is saved as a note.")
    .addText((text) =>
      text
        .setPlaceholder("Calendar")
        .setValue(gcal.eventsFolder)
        .onChange(async (value) => {
          gcal.eventsFolder = value.trim()
          await plugin.saveSettings()
        }),
    )

  new Setting(containerEl)
    .setName("Days ahead")
    .setDesc("How many days of events to fetch for the event list.")
    .addText((text) => {
      text.inputEl.type = "number"
      text.inputEl.min = "1"
      text.setValue(String(gcal.pullDays)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10)
        gcal.pullDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 60
        await plugin.saveSettings()
      })
    })

  new Setting(containerEl)
    .setName("Auto sync")
    .setDesc(
      "How often to sync, in seconds, while Obsidian is open. Switching back to the Obsidian window syncs right away. 0 disables automatic syncing, the minimum is 15.",
    )
    .addText((text) => {
      text.inputEl.type = "number"
      text.inputEl.min = "0"
      text.setValue(String(gcal.autoSyncSeconds)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10)
        gcal.autoSyncSeconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
        await plugin.saveSettings()
      })
    })

  new Setting(containerEl)
    .setName("Google task list")
    .setDesc("Google Tasks list name or @default. Applies to notes with isTask: true.")
    .addText((text) =>
      text
        .setPlaceholder("@default")
        .setValue(gcal.taskListName)
        .onChange(async (value) => {
          gcal.taskListName = value.trim() || "@default"
          await plugin.saveSettings()
        }),
    )

  new Setting(containerEl)
    .setName("Add note link")
    .setDesc(
      "Adds a clickable link to the note in the Google Calendar event description. The link is stripped from the note body when pulling.",
    )
    .addToggle((toggle) =>
      toggle.setValue(gcal.addObsidianLink).onChange(async (value) => {
        gcal.addObsidianLink = value
        await plugin.saveSettings()
      }),
    )

  new Setting(containerEl)
    .setName("Delete events with notes")
    .setDesc("Deleting a note in the events folder deletes its event in Google Calendar. Google keeps deleted events in the trash for 30 days.")
    .addToggle((toggle) =>
      toggle.setValue(gcal.deleteEventsWithNotes).onChange(async (value) => {
        gcal.deleteEventsWithNotes = value
        await plugin.saveSettings()
      }),
    )

  new Setting(containerEl)
    .setName("Force pull from Google")
    .setDesc("Overwrites notes with the Google version even when the note is newer.")
    .addButton((button) => button.setButtonText("Pull").setDisabled(true))

  new Setting(containerEl)
    .setName("Force push to Google")
    .setDesc("Overwrites Google events and tasks with the note version even when Google is newer.")
    .addButton((button) => button.setButtonText("Push").setDisabled(true))

  new Setting(containerEl)
    .setName("Sync now")
    .setDesc(
      `Pulls Google Calendar events into the events folder. Last sync: ${describeLastSync(plugin.settings.calendarSync.lastSyncAt)}.`,
    )
    .addButton((button) => {
      button.setButtonText("Sync").onClick(() => handleSync(plugin, button))
    })

  const help = containerEl.createDiv({ cls: `${PLUGIN_NAME}-gcal-help` })
  help.createEl("p", {
    text: "A note in the events folder with a start is an event, titled after its file name. googleCalendarId picks the calendar, and the first calendar from the list is used when it is missing.",
  })
  help.createEl("pre", {
    text: [
      "---",
      "start: 2026-11-02T10:00:00",
      "end: 2026-11-02T11:00:00",
      "location: Office",
      "---",
      "Event description (the note body).",
    ].join("\n"),
  })
  help.createEl("p", {
    text: "All-day event: pass start and end as dates (YYYY-MM-DD); end is exclusive, as in Google Calendar. Pulled all-day events get allDay: true.",
  })
  help.createEl("p", {
    text: "The plugin keeps its own bookkeeping in a single remindair property. Do not edit it by hand, deleting it makes the note look like a new event.",
  })
  help.createEl("p", {
    text: "The file name is the event title, everything after the date prefix. Rename a note to rename the event, the push follows a couple of seconds later. A date edited in the file name is put back from start.",
  })
  help.createEl("p", {
    text: "Conflicts: pulling overwrites a note only when the Google event is newer than the note. Pushing sends the note only when its content differs from what was sent last time.",
  })
  help.createEl("p", {
    text: "end defaults to an hour after start, or the next day for all-day events. A note written while offline is pushed on the next sync that can reach Google.",
  })
}

const describeLastSync = (lastSyncAt: number): string =>
  lastSyncAt > 0 ? new Date(lastSyncAt).toLocaleString() : "never"

const handleConnect = async (
  plugin: ObsidianNotifierPlugin,
  button: ButtonComponent,
  rerender: () => void,
  label = "Connect",
): Promise<void> => {
  button.setDisabled(true).setButtonText("Connecting...")

  try {
    await connectGoogleAccount(plugin)
    new Notice("Google account connected.")
    rerender()
  } catch (error) {
    new Notice(error instanceof Error ? error.message : "Could not connect the Google account.")
    button.setDisabled(false).setButtonText(label)
  }
}

const handleSync = async (plugin: ObsidianNotifierPlugin, button: ButtonComponent): Promise<void> => {
  button.setDisabled(true).setButtonText("Syncing...")

  try {
    const result = await syncCalendarEvents(plugin)
    new Notice(
      `Google Calendar sync: ${result.pushed} pushed, ${result.created} created, ${result.updated} updated, ${result.deleted} deleted, ${result.skipped} skipped.`,
    )
    if (result.errors.length > 0) new Notice(`Some calendars failed: ${result.errors.join("; ")}`)
  } catch (error) {
    new Notice(error instanceof Error ? error.message : "Could not sync Google Calendar events.")
  } finally {
    button.setDisabled(false).setButtonText("Sync")
  }
}
