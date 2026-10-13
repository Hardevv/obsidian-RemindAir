import { RangeSetBuilder } from "@codemirror/state"
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view"
import type ObsidianNotifierPlugin from "main"
import { editorLivePreviewField } from "obsidian"
import { createEventLinkIcon, EVENT_LINK_CLASS, EVENT_LINK_HREF_ATTR, eventLinkLabel, resolveEventLink } from "src/components/eventLinks/eventLink"
import type { EventNote } from "src/google/eventsSync"

const WIKI_LINK = /\[\[([^[\]]+)\]\]/g

export const linkTarget = (inner: string): string => inner.split("|")[0].split("#")[0].trim()

export class EventLinkIconWidget extends WidgetType {
  private readonly label: string

  constructor(
    private readonly plugin: ObsidianNotifierPlugin,
    private readonly note: EventNote,
    private readonly time24: boolean,
  ) {
    super()
    this.label = eventLinkLabel(note, time24)
  }

  eq(other: EventLinkIconWidget): boolean {
    return other.note.file.path === this.note.file.path && other.label === this.label
  }

  toDOM(): HTMLElement {
    return createEventLinkIcon(this.plugin, this.note, this.time24)
  }

  ignoreEvent(): boolean {
    return true
  }
}

const buildDecorations = (view: EditorView, plugin: ObsidianNotifierPlugin): DecorationSet => {
  if (!view.state.field(editorLivePreviewField, false)) return Decoration.none

  const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? ""
  const time24 = plugin.settings.timeFormat !== "12h"
  const builder = new RangeSetBuilder<Decoration>()

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)

    for (const match of text.matchAll(WIKI_LINK)) {
      const href = linkTarget(match[1])
      if (!href) continue

      const note = resolveEventLink(plugin, href, sourcePath)
      if (!note) continue

      const start = from + match.index!
      const end = start + match[0].length

      builder.add(start, end, Decoration.mark({ class: EVENT_LINK_CLASS, attributes: { [EVENT_LINK_HREF_ATTR]: href } }))
      builder.add(end, end, Decoration.widget({ widget: new EventLinkIconWidget(plugin, note, time24), side: 1 }))
    }
  }

  return builder.finish()
}

export const buildEventLinkExtension = (plugin: ObsidianNotifierPlugin) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, plugin)
      }

      update(update: ViewUpdate): void {
        if (!update.docChanged && !update.viewportChanged && !update.focusChanged) return
        this.decorations = buildDecorations(update.view, plugin)
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  )
