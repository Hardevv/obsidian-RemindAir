import type ObsidianNotifierPlugin from "main"
import { MarkdownView, Notice, normalizePath, type Editor, type EditorPosition } from "obsidian"
import { EventDatePickerModal, type EventDatePickerResult } from "src/components/eventDatePicker/eventDatePickerModal"
import { createEventSource } from "src/components/eventDatePicker/eventSources"
import { ensureFolder, noteBaseName, uniqueNotePath } from "src/google/eventsSync"
import { requestCalendarPush } from "src/google/syncScheduler"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import { PLUGIN_NAME } from "src/utils/constants"

const eventsFolder = (plugin: ObsidianNotifierPlugin): string =>
  (plugin.settings.googleCalendar.eventsFolder || DEFAULT_GCAL_SETTINGS.eventsFolder).replace(/^\/+|\/+$/g, "")

const linkAlias = (title: string): string => title.replace(/[[\]|]/g, "-").trim() || "event"

const eventNotePath = (plugin: ObsidianNotifierPlugin, start: string, title: string): string => {
  const folder = eventsFolder(plugin)
  const base = `${noteBaseName(start, title)}.md`

  return normalizePath(folder ? `${folder}/${base}` : base)
}

export const buildEventLink = (path: string, title: string): string => `[[${path.replace(/\.md$/, "")}|${linkAlias(title)}]]`

const noteContent = (start: string, end: string): string =>
  ["---", `start: ${JSON.stringify(start)}`, `end: ${JSON.stringify(end)}`, "---", ""].join("\n")

interface CreateEventContext {
  editor: Editor | null
  range: { from: EditorPosition; to: EditorPosition } | null
  copyLink: boolean
}

const writeToClipboard = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value)

    return true
  } catch {
    return false
  }
}

const createEventNote = async (
  plugin: ObsidianNotifierPlugin,
  result: EventDatePickerResult,
  context: CreateEventContext,
): Promise<void> => {
  const folder = eventsFolder(plugin)
  const vault = plugin.app.vault

  await ensureFolder(vault, folder)

  const path = uniqueNotePath(vault, folder, noteBaseName(result.start, result.title))
  const file = await vault.create(path, noteContent(result.start, result.end))
  const link = buildEventLink(path, result.title)

  // The picker already settled the dates, so the note will not be edited again in a moment.
  requestCalendarPush(plugin)

  if (context.editor && context.range) {
    context.editor.replaceRange(link, context.range.from, context.range.to)
  } else {
    await plugin.app.workspace.getLeaf(false).openFile(file)
  }

  if (!context.copyLink) {
    new Notice(
      plugin.settings.googleAuth
        ? `${PLUGIN_NAME}: event created, sending it to Google.`
        : `${PLUGIN_NAME}: event created. It is pushed to Google on the next sync.`,
    )

    return
  }

  const copied = await writeToClipboard(link)
  new Notice(
    copied ? `${PLUGIN_NAME}: event created and the link is copied.` : `${PLUGIN_NAME}: event created, but the link could not be copied.`,
  )
}

/**
 * Opens the date picker. A selection becomes the title and the created note is linked in place,
 * without one the modal asks for the name and offers to copy the link instead.
 */
export const createEvent = async (plugin: ObsidianNotifierPlugin): Promise<boolean> => {
  const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null
  const selection = editor?.getSelection().trim() ?? ""
  const range = editor && selection ? { from: editor.getCursor("from"), to: editor.getCursor("to") } : null

  new EventDatePickerModal(plugin, {
    title: selection || null,
    eventSource: createEventSource(plugin),
    onSubmit: (result, action) => createEventNote(plugin, result, { editor, range, copyLink: action === "copy-link" }),
    validate: (result) =>
      plugin.app.vault.getAbstractFileByPath(eventNotePath(plugin, result.start, result.title))
        ? `An event called "${result.title}" already starts at that time.`
        : null,
  }).open()

  return true
}

