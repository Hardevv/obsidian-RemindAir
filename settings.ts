import { REMINDER_REGEXP } from "consts";
import ObsidianNotifierPlugin from "main";
import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";

class ConfirmModal extends Modal {
  constructor(
    plugin: ObsidianNotifierPlugin,
    private readonly onConfirm: () => Promise<void> | void,
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.setTitle("Remove all reminders?");
    this.setContent("This action will remove all reminders from your vault and backend. This cannot be undone.");

    const btnWrapper = contentEl.createDiv({ cls: "modal-button-container" });
    const confirmRemove = btnWrapper.createEl("button", { text: "Remove all reminders", cls: "mod-warning" });
    confirmRemove.addEventListener("click", async () => {
      await this.onConfirm();
      this.close();
    });

    const cancel = btnWrapper.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

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
    const reminderCounter = containerEl.createEl("div");
    reminderCounter.innerHTML = `You've created <strong>${this.plugin.settings.idCounter} reminders</strong> so far, <br>`;
    const subtitle = createEl("div");
    subtitle.innerHTML = `Don't forget that <a href="https://buymeacoffee.com/hardevv" target="_blank"> you can buy me a coffee</a> :) <hr>`;
    reminderCounter.appendChild(subtitle);
    reminderCounter.style.fontSize = "20px";
    subtitle.style.fontSize = "14px";

    new Setting(containerEl)
      .setName("Safety cleanup - reset")
      .setDesc(
        "This will remove all reminders from your vault and backend instance. Use it if you want to start fresh or if something goes wrong. It will not reset your counter.",
      )
      .addButton((btn) => {
        btn.setButtonText("Remove all reminders").onClick(async () => {
          new ConfirmModal(this.plugin, async () => {
            const files = this.app.vault.getMarkdownFiles();
            let totalRemoved = 0;

            for (const file of files) {
              const content = await this.app.vault.read(file);
              const matches = content.match(REMINDER_REGEXP);
              if (!matches) continue;

              totalRemoved += matches.length;
              const cleaned = content.replace(REMINDER_REGEXP, "").replace(/[ \t]+$/gm, "");
              await this.app.vault.modify(file, cleaned);
              await this.plugin.saveSettings();
              reminderCounter.innerHTML = `You've created <strong>${this.plugin.settings.idCounter} reminders</strong> so far, <br>`;
              reminderCounter.appendChild(subtitle);
            }
            this.plugin.settings.lastSafetyCleanup = Date.now();
            new Notice(`Removed ${totalRemoved} reminder(s) from ${files.length} file(s).`);
          }).open();
        });
      });

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
          // TODO: consider making it the same way as it's done for time format
          // this.timeFormat = plugin.settings.timeFormat;
          // update(update: ViewUpdate): void {
          //   if (!update.docChanged && !update.viewportChanged && !update.selectionSet && !update.focusChanged) return;
          //   this.decorations = buildReminderDecorations(update.view, plugin);
          // }
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
}
