import type ObsidianNotifierPlugin from "main"
import { MarkdownView } from "obsidian"
import { editEvent } from "src/google/eventFrontmatter"
import { readEventNote } from "src/google/eventsSync"

export const EVENT_ACTION_LABEL = "Edit event"
export const EVENT_ACTION_ICON = "calendar-clock"

// The view keeps its header across file switches, so the button has to be tracked per view.
const actions = new WeakMap<MarkdownView, HTMLElement>()

const activeView = (plugin: ObsidianNotifierPlugin): MarkdownView | null =>
  plugin.app.workspace.getActiveViewOfType(MarkdownView)

const removeAction = (view: MarkdownView): void => {
  actions.get(view)?.remove()
  actions.delete(view)
}

const syncAction = (plugin: ObsidianNotifierPlugin): void => {
  const view = activeView(plugin)
  if (!view) return

  const note = readEventNote(plugin, view.file)
  if (!note) {
    removeAction(view)

    return
  }

  if (actions.has(view)) return

  const action = view.addAction(EVENT_ACTION_ICON, EVENT_ACTION_LABEL, () => {
    const current = readEventNote(plugin, activeView(plugin)?.file)
    if (current) void editEvent(plugin, current)
  })
  actions.set(view, action)
}

/** Adds the header button on event notes only, and keeps it honest when the properties change. */
export const registerEventNoteAction = (plugin: ObsidianNotifierPlugin): void => {
  const refresh = (): void => syncAction(plugin)

  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", refresh))
  plugin.registerEvent(plugin.app.workspace.on("file-open", refresh))
  plugin.registerEvent(
    plugin.app.metadataCache.on("changed", (file) => {
      if (activeView(plugin)?.file?.path === file.path) refresh()
    }),
  )
  plugin.app.workspace.onLayoutReady(refresh)
}
