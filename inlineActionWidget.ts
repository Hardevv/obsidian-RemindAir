import { StateEffect } from "@codemirror/state";
import { EditorView, ViewPlugin, Decoration, DecorationSet, WidgetType, ViewUpdate } from "@codemirror/view";
import { setReminderFunc } from "commands";
import { PLUGIN_NAME } from "consts";
import { addHoursToReminder } from "core";
import ObsidianNotifierPlugin from "main";
import { setIcon } from "obsidian";
import { getClampedPosition } from "utils";

interface HoveredLine {
  lineNumber: number;
  hasReminder: boolean;
  from: number;
  to: number;
}

const classNames = {
  wrapper: `${PLUGIN_NAME}_inline-actions-wrapper`,
  actionButton: `${PLUGIN_NAME}_inline-button-action`,
};

const actions = {
  hasReminder: [
    {
      actionId: `${PLUGIN_NAME}_add1h`,
      icon: "clock",
      text: "+1h",
      cb: (plugin: ObsidianNotifierPlugin, lineNumber?: number) => {
        if (lineNumber) addHoursToReminder(plugin, lineNumber, 1);
      },
    },
    {
      actionId: `${PLUGIN_NAME}_add1h`,
      icon: "clock",
      text: "-1h",
      cb: (plugin: ObsidianNotifierPlugin, lineNumber?: number) => {
        if (lineNumber) addHoursToReminder(plugin, lineNumber, -1);
      },
    },
  ],
  noReminder: [
    {
      actionId: `${PLUGIN_NAME}_add-reminder`,
      icon: "bell-plus",
      text: undefined,
      cb: (plugin: ObsidianNotifierPlugin, lineNumber?: number) => {
        if (lineNumber) setReminderFunc(plugin, lineNumber);
      },
    },
  ],
};

const createActionButton = (icon: string, cb: () => void, text?: string) => {
  const btn = createEl("button", { cls: classNames.actionButton });
  btn.addEventListener("click", cb);
  setIcon(btn, icon);
  if (text) btn.appendChild(createEl("span", { text, cls: `${PLUGIN_NAME}_inline-button-text` }));
  return btn;
};

const inlineActions = (plugin: ObsidianNotifierPlugin, hoveredLine: HoveredLine | null) => {
  const wrapper = createEl("div", { cls: classNames.wrapper });
  if (!hoveredLine) return wrapper;

  if (hoveredLine.hasReminder)
    actions.hasReminder.forEach(({ actionId, icon, text, cb }) => {
      wrapper.appendChild(createActionButton(icon, () => cb(plugin, hoveredLine?.lineNumber - 1), text));
    });
  else
    actions.noReminder.forEach(({ actionId, icon, text, cb }) => {
      wrapper.appendChild(createActionButton(icon, () => cb(plugin, hoveredLine?.lineNumber - 1), text));
    });

  return wrapper;
};

class HoverWidget extends WidgetType {
  constructor(
    private plugin: ObsidianNotifierPlugin,
    private hoveredLine: HoveredLine | null = null,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    return inlineActions(this.plugin, this.hoveredLine);
  }
}

const refreshInlineActionsEffect = StateEffect.define<null>();

export const buildHoverLineExtension = (plugin: ObsidianNotifierPlugin) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      hoveredLine: HoveredLine | null = null;

      constructor(private view: EditorView) {
        this.view.dom.addEventListener("mousemove", this.onMouseMove);
        this.view.dom.addEventListener("mouseleave", this.onMouseLeave);
      }

      onMouseMove = (e: MouseEvent) => {
        const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) return;

        const { number: lineNumber, text, from, to } = this.view.state.doc.lineAt(pos);
        if (lineNumber === this.hoveredLine?.lineNumber) return;

        this.hoveredLine = { lineNumber, hasReminder: text.includes("🔔 "), from, to };
        this.updateDecorations();
      };

      onMouseLeave = () => {
        this.hoveredLine = null;
        this.updateDecorations();
      };

      update(update: ViewUpdate) {
        if (update.docChanged && this.hoveredLine) {
          const doc = update.state.doc;
          const mappedFrom = update.changes.mapPos(this.hoveredLine.from, 1);
          const safePos = getClampedPosition(mappedFrom, doc.length);
          const line = doc.lineAt(safePos);

          this.hoveredLine = {
            lineNumber: line.number,
            from: line.from,
            to: line.to,
            hasReminder: line.text.includes("🔔 "),
          };
        }

        if (update.docChanged || update.viewportChanged || update.focusChanged || update.selectionSet) {
          this.updateDecorations(false);
        }
      }

      updateDecorations(shouldDispatch = true) {
        if (this.hoveredLine === null) this.decorations = Decoration.none;
        else {
          const docLength = this.view.state.doc.length;
          const safeTo = getClampedPosition(this.hoveredLine.to, docLength);
          this.decorations = Decoration.set([Decoration.widget({ widget: new HoverWidget(plugin, this.hoveredLine), side: 1 }).range(safeTo)]);
        }

        if (shouldDispatch) this.view.dispatch({ effects: refreshInlineActionsEffect.of(null) });
      }

      destroy() {
        this.view.dom.removeEventListener("mousemove", this.onMouseMove);
        this.view.dom.removeEventListener("mouseleave", this.onMouseLeave);
      }
    },
    { decorations: (v) => v.decorations },
  );
