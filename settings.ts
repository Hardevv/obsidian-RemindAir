import { PLUGIN_NAME } from "consts";
import { isGoogleOAuthConfigured } from "gcalCredentials";
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

    this.displayReminderSettings(containerEl);
    this.displayGoogleCalendarSettings(containerEl);
  }

  private displayReminderSettings(containerEl: HTMLElement): void {
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

  private displayGoogleCalendarSettings(containerEl: HTMLElement): void {
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

    const gcal = this.plugin.settings.googleCalendar;

    new Setting(containerEl)
      .setName("Google account")
      .setDesc("Not connected. Sign-in will be added in the next step.")
      .addButton((button) => button.setButtonText("Connect").setCta().setDisabled(true));

    new Setting(containerEl)
      .setName("Time zone")
      .setDesc("E.g. Europe/Warsaw. Leave empty to use the system time zone. Applies to events without an explicit offset.")
      .addText((text) =>
        text
          .setPlaceholder(Intl.DateTimeFormat().resolvedOptions().timeZone)
          .setValue(gcal.timeZone)
          .onChange(async (value) => {
            gcal.timeZone = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Calendars to list")
      .setDesc("Comma-separated Google calendar names, e.g. primary, Work. Calendars used by notes are added automatically.")
      .addText((text) =>
        text.setValue(gcal.pullCalendars).onChange(async (value) => {
          gcal.pullCalendars = value;
          await this.plugin.saveSettings();
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
          await this.plugin.saveSettings();
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
          await this.plugin.saveSettings();
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
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Add note link")
      .setDesc("Adds a clickable link to the note in the Google Calendar event description. The link is stripped from the note body when pulling.")
      .addToggle((toggle) =>
        toggle.setValue(gcal.addObsidianLink).onChange(async (value) => {
          gcal.addObsidianLink = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("HTTPS redirect for the link")
      .setDesc(
        "Optional redirector URL, e.g. https://your-worker.workers.dev/open. Google Calendar does not make obsidian:// clickable; an HTTPS link does. Empty means obsidian://.",
      )
      .addText((text) =>
        text
          .setPlaceholder("https://…/open")
          .setValue(gcal.linkBaseUrl)
          .onChange(async (value) => {
            gcal.linkBaseUrl = value.trim();
            await this.plugin.saveSettings();
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
  }
}
