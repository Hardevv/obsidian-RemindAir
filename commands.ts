import { PLUGIN_NAME } from "consts";
import { openReminderEditorAtCursor } from "core";
import { DateTimePicker } from "datetimePickerModal";
import ObsidianNotifierPlugin from "main";
import { MarkdownView } from "obsidian";

const setReminder = (plugin: ObsidianNotifierPlugin) => {
  plugin.addCommand({
    id: `${PLUGIN_NAME}_set-reminder`,
    name: "🔔 Remind me! - set reminder for this line",
    callback: () => {
      new DateTimePicker(plugin.app, async (date) => {
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        if (!editor) return;

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        editor.replaceRange(
          `${line} 🔔 ${date} ^r-${plugin.settings.idCounter}`,
          { line: cursor.line, ch: 0 },
          { line: cursor.line, ch: line.length },
        );
        plugin.settings.idCounter++;
        await plugin.saveSettings();
      }).open();
    },
  });
};

const editReminderInLine = (plugin: ObsidianNotifierPlugin) => {
  plugin.addCommand({
    id: `${PLUGIN_NAME}_edit-reminder-at-cursor`,
    name: "🔔 Edit reminder! - edit reminder in this line",
    callback: () => {
      openReminderEditorAtCursor(plugin);
    },
  });
};

export const registerCommands = (plugin: ObsidianNotifierPlugin) => {
  setReminder(plugin);
  editReminderInLine(plugin);
};
