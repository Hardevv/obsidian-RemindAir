import { REMINDER_REGEXP } from "consts";
import { DateTimePicker } from "datetimePickerModal";
import ObsidianNotifierPlugin from "main";
import { Editor, MarkdownView } from "obsidian";
import { toLocalDateTimeValue } from "utils";

export const openReminderEditor = (plugin: ObsidianNotifierPlugin, reminderId: string, currentDate: string): void => {
  const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
  new DateTimePicker(
    plugin,
    async (date) => {
      if (!editor) return;

      replaceReminderById(editor, reminderId, date);
    },
    currentDate,
    () => {
      if (editor) {
        replaceReminderById(editor, reminderId, null);
      }
    },
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

/** for `hours` you can use negative numbers to decrease hours */
export const addHoursToReminder = (plugin: ObsidianNotifierPlugin, lineNumber: number, hours: number) => {
  const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
  if (!editor) return;
  const line = editor.getLine(lineNumber);
  const [, date, id] = line.matchAll(REMINDER_REGEXP).next().value ?? [];
  const newDate = new Date(date);
  newDate.setHours(newDate.getHours() + hours);

  const newReminderText = `🔔 ${toLocalDateTimeValue(newDate)} ^r-${id}`;

  const newLine = editor.getLine(lineNumber).replace(REMINDER_REGEXP, newReminderText).trim();
  editor.setLine(lineNumber, newLine);
};
