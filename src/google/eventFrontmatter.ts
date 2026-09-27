import type ObsidianNotifierPlugin from "main"
import { MarkdownView, Notice, type Editor, type EditorPosition, type TFile } from "obsidian"
import { EventDatePickerModal, type EventDatePickerResult } from "src/components/eventDatePicker/eventDatePickerModal"
import { createEventSource } from "src/components/eventDatePicker/eventSources"
import { ensureFolder, noteBaseName, parseNoteName, uniqueNotePath } from "src/google/eventsSync"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import { PLUGIN_NAME } from "src/utils/constants"
import { formatLocalDateTime } from "src/utils/dates"

export const EVENT_LEAD_MINUTES = 15
export const EVENT_DURATION_MINUTES = 60

export const eventDefaults = (now: Date): { start: string; end: string } => {
  const start = new Date(now.getTime() + EVENT_LEAD_MINUTES * 60 * 1000)
  start.setSeconds(0, 0)
  const end = new Date(start.getTime() + EVENT_DURATION_MINUTES * 60 * 1000)

  return { start: formatLocalDateTime(start), end: formatLocalDateTime(end) }
}

const eventsFolder = (plugin: ObsidianNotifierPlugin): string =>
  (plugin.settings.googleCalendar.eventsFolder || DEFAULT_GCAL_SETTINGS.eventsFolder).replace(/^\/+|\/+$/g, "")

const linkAlias = (title: string): string => title.replace(/[[\]|]/g, "-").trim() || "event"

export const buildEventLink = (path: string, title: string): string => `[[${path.replace(/\.md$/, "")}|${linkAlias(title)}]]`

const noteContent = (start: string, end: string): string =>
  ["---", `start: ${JSON.stringify(start)}`, `end: ${JSON.stringify(end)}`, "---", ""].join("\n")

/** The file name carries the date, so a note filled outside the sync gets the prefix right away. */
const renameToStart = async (plugin: ObsidianNotifierPlugin, file: TFile, start: string): Promise<void> => {
  const title = parseNoteName(file.basename).title
  if (!title) return

  const folder = file.path.split("/").slice(0, -1).join("/")
  const target = uniqueNotePath(plugin.app.vault, folder, noteBaseName(start, title), file.path)
  if (target !== file.path) await plugin.app.fileManager.renameFile(file, target)
}

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

  if (context.editor && context.range) {
    context.editor.replaceRange(link, context.range.from, context.range.to)
  } else {
    await plugin.app.workspace.getLeaf(false).openFile(file)
  }

  if (!context.copyLink) {
    new Notice(`${PLUGIN_NAME}: event created. It is pushed to Google on the next sync.`)

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
  }).open()

  return true
}

export const fillEventFrontmatter = async (plugin: ObsidianNotifierPlugin): Promise<void> => {
  const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null
  if (editor?.getSelection().trim()) {
    await createEvent(plugin)

    return
  }

  const file: TFile | null = plugin.app.workspace.getActiveFile()
  if (!file) {
    new Notice(`${PLUGIN_NAME}: open a note first.`)
    return
  }

  const folder = eventsFolder(plugin)
  const { start, end } = eventDefaults(new Date())

  let resolvedStart = start

  await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
    frontmatter.start = frontmatter.start || start
    frontmatter.end = frontmatter.end || end
    resolvedStart = String(frontmatter.start ?? start)
  })

  await renameToStart(plugin, file, resolvedStart)

  if (folder && !file.path.startsWith(`${folder}/`)) {
    new Notice(`${PLUGIN_NAME}: event properties filled. Move the note into ${folder} so it can be synced.`)

    return
  }

  new Notice(`${PLUGIN_NAME}: event properties filled. The event is created on the next sync.`)
}
