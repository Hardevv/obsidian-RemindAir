import type { Editor } from "obsidian"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { PLUGIN_NAME } from "src/utils/constants"

const picker = vi.hoisted(() => {
  class DateTimePickerMock {
    static instances: DateTimePickerMock[] = []

    plugin: unknown
    onSubmit: (date: string) => void
    date: string | Date | null
    onDelete: (() => void) | null
    open = vi.fn()

    constructor(
      plugin: unknown,
      onSubmit: (date: string) => void,
      date: string | Date | null = null,
      onDelete: (() => void) | null = null,
    ) {
      this.plugin = plugin
      this.onSubmit = onSubmit
      this.date = date
      this.onDelete = onDelete
      DateTimePickerMock.instances.push(this)
    }
  }

  return { DateTimePickerMock }
})

vi.mock("src/components/dateTimePickerModal/dateTimePickerModal", () => ({ DateTimePicker: picker.DateTimePickerMock }))
vi.mock("src/utils/ids", () => ({ getRandomIdSuffix: () => "z" }))
vi.mock("src/utils/reminders", () => ({ openReminderEditorAtCursor: vi.fn() }))

import { registerCommands, setReminderFunc } from "src/commands"
import { openReminderEditorAtCursor } from "src/utils/reminders"

const { DateTimePickerMock } = picker

interface FakeEditor {
  getCursor: ReturnType<typeof vi.fn>
  getLine: ReturnType<typeof vi.fn>
  replaceRange: ReturnType<typeof vi.fn>
}

const createEditor = (lines: string[], cursor = { line: 0, ch: 0 }): Editor => {
  const editor: FakeEditor = {
    getCursor: vi.fn(() => cursor),
    getLine: vi.fn((lineNumber: number) => lines[lineNumber]),
    replaceRange: vi.fn(),
  }

  return editor as unknown as Editor
}

const createPlugin = (editor?: Editor) => {
  const getActiveViewOfType = vi.fn(() => (editor ? { editor } : null))
  const addCommand = vi.fn()
  const saveSettings = vi.fn(async () => {})

  const plugin = {
    app: { workspace: { getActiveViewOfType, getActiveFile: () => null }, fileManager: { processFrontMatter: vi.fn() } },
    settings: { idCounter: 7, googleCalendar: {} },
    addCommand,
    saveSettings,
  } as unknown as ObsidianNotifierPlugin

  return { plugin, addCommand, saveSettings }
}

describe("setReminderFunc", () => {
  beforeEach(() => {
    DateTimePickerMock.instances = []
    vi.clearAllMocks()
  })

  it("opens the date time picker", () => {
    const editor = createEditor(["Buy milk"])
    const { plugin } = createPlugin(editor)

    setReminderFunc(plugin)

    expect(DateTimePickerMock.instances).toHaveLength(1)
    expect(DateTimePickerMock.instances[0].plugin).toBe(plugin)
    expect(DateTimePickerMock.instances[0].open).toHaveBeenCalledTimes(1)
  })

  it("appends a reminder to the cursor line, bumps the counter and saves", async () => {
    const editor = createEditor(["Buy milk"])
    const { plugin, saveSettings } = createPlugin(editor)

    setReminderFunc(plugin)
    await DateTimePickerMock.instances[0].onSubmit("2026-11-02T10:00")

    expect(editor.replaceRange).toHaveBeenCalledWith(
      "Buy milk 🔔 2026-11-02T10:00 ^r-7-z",
      { line: 0, ch: 0 },
      { line: 0, ch: "Buy milk".length },
    )
    expect(plugin.settings.idCounter).toBe(8)
    expect(saveSettings).toHaveBeenCalledTimes(1)
  })

  it("uses the given line number instead of the cursor line", async () => {
    const editor = createEditor(["first", "second", "third"])
    const { plugin } = createPlugin(editor)

    setReminderFunc(plugin, 2)
    await DateTimePickerMock.instances[0].onSubmit("2026-11-02T10:00")

    expect(editor.replaceRange).toHaveBeenCalledWith(
      "third 🔔 2026-11-02T10:00 ^r-7-z",
      { line: 2, ch: 0 },
      { line: 2, ch: "third".length },
    )
  })

  it("does nothing when there is no active markdown editor", async () => {
    const { plugin, saveSettings } = createPlugin()

    setReminderFunc(plugin)
    await DateTimePickerMock.instances[0].onSubmit("2026-11-02T10:00")

    expect(plugin.settings.idCounter).toBe(7)
    expect(saveSettings).not.toHaveBeenCalled()
  })
})

describe("registerCommands", () => {
  beforeEach(() => {
    DateTimePickerMock.instances = []
    vi.clearAllMocks()
  })

  it("registers every command", () => {
    const { plugin, addCommand } = createPlugin()

    registerCommands(plugin)

    expect(addCommand).toHaveBeenCalledTimes(3)
    expect(addCommand.mock.calls.map(([command]) => command.id)).toEqual([
      `${PLUGIN_NAME}_set-reminder`,
      `${PLUGIN_NAME}_edit-reminder-at-cursor`,
      `${PLUGIN_NAME}_create-event-properties`,
    ])
  })

  it("uses readable names for the commands", () => {
    const { plugin, addCommand } = createPlugin()

    registerCommands(plugin)

    expect(addCommand.mock.calls.map(([command]) => command.name)).toEqual([
      "🔔 Remind me! - set reminder for this line",
      "🔔 Edit reminder! - edit reminder in this line",
      "Create calendar event - from the selection or this note",
    ])
  })

  it("opens the picker from the set reminder command", () => {
    const editor = createEditor(["Buy milk"])
    const { plugin, addCommand } = createPlugin(editor)

    registerCommands(plugin)
    const setReminderCommand = addCommand.mock.calls[0][0]
    setReminderCommand.callback()

    expect(DateTimePickerMock.instances).toHaveLength(1)
  })

  it("edits the reminder at the cursor from the edit command", () => {
    const { plugin, addCommand } = createPlugin()

    registerCommands(plugin)
    const editCommand = addCommand.mock.calls[1][0]
    editCommand.callback()

    expect(openReminderEditorAtCursor).toHaveBeenCalledTimes(1)
    expect(openReminderEditorAtCursor).toHaveBeenCalledWith(plugin)
  })
})
