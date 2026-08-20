import type ObsidianNotifierPlugin from "main";
import { Setting } from "obsidian";
import { isGoogleAccountConnected } from "src/settings/googleAccount";
import { PLUGIN_NAME } from "src/utils/constants";
import { isGoogleOAuthConfigured } from "src/utils/gcalCredentials";

export const displayGoogleCalendarSettings = (containerEl: HTMLElement, plugin: ObsidianNotifierPlugin): void => {
  new Setting(containerEl).setName("Google Calendar").setHeading();
  containerEl.createDiv({
    cls: `${PLUGIN_NAME}-gcal-note`,
    text: "Configuration only. Connecting to Google and syncing notes is not implemented yet.",
  });

  if (!isGoogleOAuthConfigured) {
    containerEl.createDiv({
      cls: `${PLUGIN_NAME}-gcal-note`,
      text: "OAuth client is missing in this build (GOOGLE_CLIENT_ID in .env).",
    });
  }

  const gcal = plugin.settings.googleCalendar;
  const isConnected = isGoogleAccountConnected(plugin);

  new Setting(containerEl)
    .setName("Google account")
    .setDesc(isConnected ? gcal.accountEmail : "Not connected.")
    .addButton((button) => button.setButtonText("Connect").setCta().setDisabled(true));

  if (!isConnected) {
    containerEl.createDiv({
      cls: `${PLUGIN_NAME}-gcal-note`,
      text: "Connect your Google account to configure calendars, tasks and syncing.",
    });
    return;
  }

  new Setting(containerEl)
    .setName("Calendars to list")
    .setDesc("Comma-separated Google calendar names, e.g. primary, Work. Calendars used by notes are added automatically.")
    .addText((text) =>
      text.setValue(gcal.pullCalendars).onChange(async (value) => {
        gcal.pullCalendars = value;
        await plugin.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName("Days ahead")
    .setDesc("How many days of events to fetch for the event list.")
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "1";
      text.setValue(String(gcal.pullDays)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        gcal.pullDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName("Auto sync")
    .setDesc("How often to sync, in minutes. 0 disables automatic syncing.")
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.setValue(String(gcal.autoSyncMinutes)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        gcal.autoSyncMinutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName("Google task list")
    .setDesc("Google Tasks list name or @default. Applies to notes with isTask: true.")
    .addText((text) =>
      text
        .setPlaceholder("@default")
        .setValue(gcal.taskListName)
        .onChange(async (value) => {
          gcal.taskListName = value.trim() || "@default";
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Add note link")
    .setDesc(
      "Adds a clickable link to the note in the Google Calendar event description. The link is stripped from the note body when pulling.",
    )
    .addToggle((toggle) =>
      toggle.setValue(gcal.addObsidianLink).onChange(async (value) => {
        gcal.addObsidianLink = value;
        await plugin.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName("Force pull from Google")
    .setDesc("Overwrites notes with the Google version even when the note is newer.")
    .addButton((button) => button.setButtonText("Pull").setDisabled(true));

  new Setting(containerEl)
    .setName("Force push to Google")
    .setDesc("Overwrites Google events and tasks with the note version even when Google is newer.")
    .addButton((button) => button.setButtonText("Push").setDisabled(true));

  new Setting(containerEl)
    .setName("Sync now")
    .setDesc("Runs a one-off sync of notes and the event list.")
    .addButton((button) => button.setButtonText("Sync").setDisabled(true));

  const help = containerEl.createDiv({ cls: `${PLUGIN_NAME}-gcal-help` });
  help.createEl("p", {
    text: "A note is an event when its frontmatter has a calendarName property. The value is a Google calendar name or primary.",
  });
  help.createEl("pre", {
    text: [
      "---",
      "calendarName: primary",
      "title: Client meeting",
      "start: 2026-11-02T10:00:00",
      "end: 2026-11-02T11:00:00",
      "location: Office",
      "---",
      "Event description (the note body).",
    ].join("\n"),
  });
  help.createEl("p", {
    text: "All-day event: pass start and end as dates (YYYY-MM-DD); end is exclusive, as in Google Calendar.",
  });
  help.createEl("p", {
    text: "Conflicts: the newer version wins — the note modification time is compared with the event updated field in Google.",
  });
};
