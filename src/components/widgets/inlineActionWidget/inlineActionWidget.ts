import { Decoration, type DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import type ObsidianNotifierPlugin from "main";
import { Platform } from "obsidian";
import { createActionButton } from "src/atoms/actionButton";
import { setReminderFunc } from "src/commands";
import { PLUGIN_NAME } from "src/utils/constants";
import { getClampedPosition } from "src/utils/positions";
import { addHoursToReminder } from "src/utils/reminders";
import type { HoveredLine, InlineAction } from "./inlineActionWidget.types";

const classNames = {
  wrapper: `${PLUGIN_NAME}_inline-actions-wrapper`,
};

const actions: { hasReminder: InlineAction[]; noReminder: InlineAction[] } = {
  hasReminder: [
    {
      icon: "clock",
      text: "+1h",
      cb: (plugin, lineNumber) => {
        if (lineNumber) addHoursToReminder(plugin, lineNumber, 1);
      },
    },
    {
      icon: "clock",
      text: "-1h",
      cb: (plugin, lineNumber) => {
        if (lineNumber) addHoursToReminder(plugin, lineNumber, -1);
      },
    },
  ],
  noReminder: [
    {
      icon: "bell-plus",
      text: undefined,
      cb: (plugin, lineNumber) => {
        if (lineNumber) setReminderFunc(plugin, lineNumber);
      },
    },
  ],
};

const inlineActions = (plugin: ObsidianNotifierPlugin, hoveredLine: HoveredLine | null) => {
  const wrapper = createEl("div", { cls: classNames.wrapper });
  if (!hoveredLine) return wrapper;

  const lineActions = hoveredLine.hasReminder ? actions.hasReminder : actions.noReminder;

  lineActions.forEach(({ icon, text, cb }) => {
    wrapper.appendChild(createActionButton(icon, () => cb(plugin, hoveredLine.lineNumber - 1), text));
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

export const buildHoverLineExtension = (plugin: ObsidianNotifierPlugin) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      hoveredLine: HoveredLine | null = null;
      private readonly isMobile = Platform.isMobile;

      constructor(private view: EditorView) {
        if (this.isMobile) return;
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
        const doc = update.state.doc;
        const mappedFrom = this.hoveredLine?.from ? update.changes.mapPos(this.hoveredLine.from, 1) : 0;
        const oldPos = update.startState.selection.main.head;
        const newPos = update.state.selection.main.head;
        const safePos = getClampedPosition(this.isMobile ? newPos : mappedFrom, doc.length);
        const line = doc.lineAt(safePos);

        const setHoveredLine = () => {
          this.hoveredLine = {
            lineNumber: line.number,
            from: line.from,
            to: line.to,
            hasReminder: line.text.includes("🔔 "),
          };
        };

        if (this.isMobile && oldPos !== newPos) setHoveredLine();
        if (update.docChanged && this.hoveredLine) setHoveredLine();

        if (update.docChanged || update.viewportChanged || update.focusChanged || update.selectionSet) {
          this.updateDecorations(false); // do not dispatch inside update() because update is already being dispatched.
        }
      }

      updateDecorations(shouldDispatch = true) {
        if (this.hoveredLine === null) this.decorations = Decoration.none;
        else {
          const docLength = this.view.state.doc.length;
          const safeTo = getClampedPosition(this.hoveredLine.to, docLength);
          this.decorations = Decoration.set([
            Decoration.widget({ widget: new HoverWidget(plugin, this.hoveredLine), side: 1 }).range(safeTo),
          ]);
        }

        if (shouldDispatch) this.view.dispatch({});
      }

      destroy() {
        if (this.isMobile) return;
        this.view.dom.removeEventListener("mousemove", this.onMouseMove);
        this.view.dom.removeEventListener("mouseleave", this.onMouseLeave);
      }
    },
    { decorations: (v) => v.decorations },
  );
