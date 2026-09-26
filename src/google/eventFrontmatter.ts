import type ObsidianNotifierPlugin from "main"
import { MarkdownView, Notice, type TFile } from "obsidian"
import { ensureFolder, noteBaseName, parseNoteName, uniqueNotePath } from "src/google/eventsSync"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import { PLUGIN_NAME } from "src/utils/constants"

export const EVENT_LEAD_MINUTES = 15
export const EVENT_DURATION_MINUTES = 60

const pad = (value: number): string => String(value).padStart(2, "0")

export const formatLocalDateTime = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

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

/** Creates an event note from the selected text and links it in place. Returns false when there is no selection. */
export const createEventFromSelection = async (plugin: ObsidianNotifierPlugin): Promise<boolean> => {
  const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor
  const selection = editor?.getSelection().trim()
  if (!editor || !selection) return false

  const title = selection.replace(/\s+/g, " ")
  const { start, end } = eventDefaults(new Date())
  const folder = eventsFolder(plugin)
  const vault = plugin.app.vault

  await ensureFolder(vault, folder)

  const path = uniqueNotePath(vault, folder, noteBaseName(start, title))

  await vault.create(path, noteContent(start, end))
  editor.replaceSelection(buildEventLink(path, title))

  new Notice(`${PLUGIN_NAME}: event note created. It is pushed to Google on the next sync.`)

  return true
}

/** The file name carries the date, so a note filled outside the sync gets the prefix right away. */
const renameToStart = async (plugin: ObsidianNotifierPlugin, file: TFile, start: string): Promise<void> => {
  const title = parseNoteName(file.basename).title
  if (!title) return

  const folder = file.path.split("/").slice(0, -1).join("/")
  const target = uniqueNotePath(plugin.app.vault, folder, noteBaseName(start, title), file.path)
  if (target !== file.path) await plugin.app.fileManager.renameFile(file, target)
}

/**
 * Creates an event note. With a selection the note takes its title and is linked in place,
 * without one the note is created empty and opened so the title can be typed.
 */
export const createEvent = async (plugin: ObsidianNotifierPlugin): Promise<boolean> => {
  if (await createEventFromSelection(plugin)) return true

  const { start, end } = eventDefaults(new Date())
  const folder = eventsFolder(plugin)
  const vault = plugin.app.vault

  await ensureFolder(vault, folder)

  const path = uniqueNotePath(vault, folder, noteBaseName(start, ""))
  const file = await vault.create(path, noteContent(start, end))

  await plugin.app.workspace.getLeaf(false).openFile(file)
  new Notice(`${PLUGIN_NAME}: event note created. Rename it to set the title.`)

  return true
}

export const fillEventFrontmatter = async (plugin: ObsidianNotifierPlugin): Promise<void> => {
  if (await createEventFromSelection(plugin)) return

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
