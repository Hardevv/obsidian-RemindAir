import { PLUGIN_NAME } from "consts";
import { openReminderEditorAtCursor, removeReminderFormLine } from "core";
import { DateTimePicker } from "datetimePickerModal";
import ObsidianNotifierPlugin from "main";
import { MarkdownView } from "obsidian";
import { getRandomIdSuffix } from "utils";

export const setReminderFunc = (plugin: ObsidianNotifierPlugin, lineNumber?: number) => {
  new DateTimePicker(plugin.app, async (date) => {
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) return;

    const cursor = editor.getCursor();
    const targetLineNumber = lineNumber || cursor.line;
    const line = editor.getLine(targetLineNumber);

    editor.replaceRange(
      `${line} 🔔 ${date} ^r-${plugin.settings.idCounter}-${getRandomIdSuffix()}`,
      { line: targetLineNumber, ch: 0 },
      { line: targetLineNumber, ch: line.length },
    );
    plugin.settings.idCounter++;
    await plugin.saveSettings();
  }).open();
};

const setReminder = (plugin: ObsidianNotifierPlugin) => {
  plugin.addCommand({
    id: `${PLUGIN_NAME}_set-reminder`,
    name: "🔔 Remind me! - set reminder for this line",
    callback: () => setReminderFunc(plugin),
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
