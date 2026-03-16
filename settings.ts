import { REMINDER_REGEXP } from "consts";
import ObsidianNotifierPlugin from "main";
import { App, Notice, PluginSettingTab, Setting } from "obsidian";

export class Settings extends PluginSettingTab {
  plugin: ObsidianNotifierPlugin;

  constructor(app: App, plugin: ObsidianNotifierPlugin) {
    super(app, plugin);
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
          const files = this.app.vault.getMarkdownFiles();
          let totalRemoved = 0;

          for (const file of files) {
            const content = await this.app.vault.read(file);
            const matches = content.match(REMINDER_REGEXP);
            if (!matches) continue;

            totalRemoved += matches.length;
            const cleaned = content.replace(REMINDER_REGEXP, "").replace(/[ \t]+$/gm, "");
            await this.app.vault.modify(file, cleaned);
          }

          this.plugin.settings.idCounter = 0;
          await this.plugin.saveSettings();
          reminderCounter.innerHTML = `You've created <strong>${this.plugin.settings.idCounter} reminders</strong> so far, <br>`;
          reminderCounter.appendChild(subtitle);

          //TODO: in case of you add more endpoint in future make a service here and option to override the port
          await fetch("http://localhost:3333/reminders", { method: "DELETE" });

          new Notice(`Removed ${totalRemoved} reminder(s) from ${files.length} file(s).`);
        });
      });
  }
}
