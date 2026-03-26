import { EditorView, ViewPlugin, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { PLUGIN_NAME } from "consts";
import { setIcon } from "obsidian";

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

enum ActionId {
  Add = `${PLUGIN_NAME}_action_add`,
  Edit = `${PLUGIN_NAME}_action-edit`,
  Remove = `${PLUGIN_NAME}_action-remove`,
}

const inlineActions = (hasReminder: boolean) => {
  const wrapper = createEl("div", { cls: classNames.wrapper });

  const createActionButton = (icon: string, action: ActionId) => {
    const btn = createEl("button", { cls: classNames.actionButton, attr: { "aria-action": action } });
    setIcon(btn, icon);
    return btn;
  };

  if (hasReminder) {
    wrapper.appendChild(createActionButton("edit-2", ActionId.Edit));
    wrapper.appendChild(createActionButton("trash", ActionId.Remove));
  } else wrapper.appendChild(createActionButton("bell-plus", ActionId.Add));

  return wrapper;
};

class HoverWidget extends WidgetType {
  private hasReminder: boolean;

  constructor(hasReminder: boolean = false) {
    super();
    this.hasReminder = hasReminder;
  }

  toDOM(): HTMLElement {
    return inlineActions(this.hasReminder);
  }
}

export const hoverLineExtension = ViewPlugin.fromClass(
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

      if (text.contains("🔔 ")) this.hoveredLine = { lineNumber, hasReminder: true, from, to };
      else this.hoveredLine = { lineNumber, hasReminder: false, from, to };

      this.updateDecorations();
    };

    onMouseLeave = () => {
      this.hoveredLine = null;
      this.updateDecorations();
    };

    updateDecorations() {
      if (this.hoveredLine === null) this.decorations = Decoration.none;
      else {
        const { hasReminder, to } = this.hoveredLine;
        this.decorations = Decoration.set([Decoration.widget({ widget: new HoverWidget(hasReminder), side: 1 }).range(to)]);
      }

      this.view.dispatch({ effects: [] }); // trigger the update
    }

    destroy() {
      this.view.dom.removeEventListener("mousemove", this.onMouseMove);
      this.view.dom.removeEventListener("mouseleave", this.onMouseLeave);
    }
  },
  { decorations: (v) => v.decorations },
);
