import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type ObsidianNotifierPlugin from "main";
import { editorLivePreviewField, MarkdownView, setIcon } from "obsidian";
import { PLUGIN_NAME, REMINDER_REGEXP } from "src/utils/constants";
import { getDateObjectFromReminderString, isDateEqual } from "src/utils/dates";
import { openReminderEditor, replaceReminderById } from "src/utils/reminders";
import type { FormattedReminderDate } from "./reminderWidget.types";

class ReminderWidget extends WidgetType {
  private timeFormat: string;
  constructor(
    private readonly plugin: ObsidianNotifierPlugin,
    private readonly reminderId: string,
    private readonly date: string,
  ) {
    super();
    this.timeFormat = plugin.settings.timeFormat;
  }

  eq(other: ReminderWidget): boolean {
    return this.reminderId === other.reminderId && this.date === other.date && this.timeFormat === other.timeFormat;
  }

  formatDate(date: string): FormattedReminderDate {
    const dateObj = getDateObjectFromReminderString(date) || new Date();

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const isToday = isDateEqual(date, now, true);
    const isInFuture = dateObj.getTime() > now.getTime();
    const isCurrentWeek = dateObj >= startOfWeek && dateObj < endOfWeek;

    const day = isToday
      ? ""
      : isCurrentWeek && isInFuture
        ? dateObj.toLocaleString("default", { weekday: "short" })
        : String(dateObj.getDate()).padStart(2, "0");

    const [h, m, dayPeriod] = dateObj.toLocaleString("en-US", { minute: "2-digit", hour: "2-digit", hour12: true }).split(/[: ]/g);
    const is24hFormat = this.plugin.settings.timeFormat === "24h";
    const hours = is24hFormat ? String(dateObj.getHours()).padStart(2, "0") : h;
    const minutes = is24hFormat ? String(dateObj.getMinutes()).padStart(2, "0") : `${m} ${dayPeriod}`;

    return {
      year: (isCurrentWeek && isInFuture) || isToday ? null : dateObj.getFullYear(),
      month: (isCurrentWeek && isInFuture) || isToday ? null : dateObj.toLocaleString("default", { month: "short" }),
      day,
      hours,
      minutes,
    };
  }

  toDOM(): HTMLElement {
    const wrap = createSpan({ cls: `${PLUGIN_NAME}-reminder-widget` });
    wrap.tabIndex = 0;
    wrap.setAttr("role", "button");
    wrap.setAttr("aria-label", `Edit reminder | Reminder ID: r-${this.reminderId}`);
    const { year, month, day, hours, minutes } = this.formatDate(this.date);
    const dateText = `${year ?? ""} ${month ?? ""} ${day} ${hours}:${minutes}`.trim();
    const isInPast = new Date(this.date).getTime() < Date.now();
    if (isInPast) wrap.addClass(`${PLUGIN_NAME}-reminder-widget-past`);

    wrap.createSpan({ text: "🔔", cls: `${PLUGIN_NAME}-reminder-widget-emoji` });
    wrap.createSpan({ text: dateText, cls: `${PLUGIN_NAME}-reminder-widget-date` });
    const deleteBtn = wrap.createEl("button", { cls: `${PLUGIN_NAME}-reminder-widget-delete-btn` });
    setIcon(deleteBtn, "trash");

    deleteBtn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const editor = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (!editor) return;
      replaceReminderById(editor, this.reminderId, null);
    });

    wrap.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openReminderEditor(this.plugin, this.reminderId, this.date);
    });

    wrap.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" && evt.key !== " ") return;
      evt.preventDefault();
      evt.stopPropagation();
      openReminderEditor(this.plugin, this.reminderId, this.date);
    });

    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const buildReminderDecorations = (view: EditorView, plugin: ObsidianNotifierPlugin): DecorationSet => {
  const isLivePreview = view.state.field(editorLivePreviewField, false);
  if (!isLivePreview) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);

    for (const match of text.matchAll(REMINDER_REGEXP)) {
      const start = from + match.index!;

      builder.add(
        start,
        start + match[0].length,
        Decoration.replace({
          widget: new ReminderWidget(plugin, match[2], match[1]),
          inclusive: false,
        }),
      );
    }
  }

  return builder.finish();
};

export const buildReminderWidgetExtension = (plugin: ObsidianNotifierPlugin) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildReminderDecorations(view, plugin);
      }

      update(update: ViewUpdate): void {
        if (!update.docChanged && !update.viewportChanged && !update.selectionSet && !update.focusChanged) return;
        this.decorations = buildReminderDecorations(update.view, plugin);
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
