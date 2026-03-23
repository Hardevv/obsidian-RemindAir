import { REMINDER_REGEXP } from "consts";
import { DateTimePicker } from "datetimePickerModal";
import ObsidianNotifierPlugin from "main";
import { Editor, MarkdownView } from "obsidian";

export const openReminderEditor = (plugin: ObsidianNotifierPlugin, reminderId: string, currentDate: string): void => {
  new DateTimePicker(
    plugin.app,
    async (date) => {
      const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (!editor) return;

      const wasUpdated = replaceReminderById(editor, reminderId, date);
      if (!wasUpdated) return;
    },
    currentDate,
  ).open();
};

/** `newData: null` will remove reminder */
export const replaceReminderById = (editor: Editor, reminderId: string, newDate: string | null): boolean => {
  for (const match of editor.getValue().matchAll(REMINDER_REGEXP)) {
    if (match[2] !== reminderId) continue;

    const from = editor.offsetToPos(match.index!);
    const to = editor.offsetToPos(match.index! + match[0].length);
    const replaceWith = newDate ? `🔔 ${newDate} ^r-${reminderId}` : "";
    editor.replaceRange(replaceWith, from, to);
    return true;
  }

  return false;
};

export const openReminderEditorAtCursor = (plugin: ObsidianNotifierPlugin): void => {
  const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
  if (!editor) return;

  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);

  for (const match of line.matchAll(REMINDER_REGEXP)) {
    const date = match[1];
    const id = match[2];
    openReminderEditor(plugin, id, date);
    return;
  }
};
