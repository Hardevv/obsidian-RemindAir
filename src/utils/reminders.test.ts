import type { Editor } from "obsidian"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { REMINDER_REGEXP } from "src/utils/constants"
import { addHoursToReminder, openReminderEditor, openReminderEditorAtCursor, replaceReminderById } from "src/utils/reminders"

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

const { DateTimePickerMock } = picker

interface FakeEditor {
  text: string
  getValue: () => string
  offsetToPos: (offset: number) => { line: number; ch: number }
  replaceRange: ReturnType<typeof vi.fn>
  getCursor: () => { line: number; ch: number }
  getLine: (line: number) => string
  setLine: ReturnType<typeof vi.fn>
}

const createEditor = (text: string, cursor = { line: 0, ch: 0 }): Editor => {
  const lines = text.split("\n")

  const offsetToPos = (offset: number) => {
    let remaining = offset
    for (let line = 0; line < lines.length; line++) {
      const lineLength = lines[line].length + 1
      if (remaining < lineLength) return { line, ch: remaining }
      remaining -= lineLength
    }
    return { line: lines.length - 1, ch: lines[lines.length - 1].length }
  }

  const editor: FakeEditor = {
    text,
    getValue: () => editor.text,
    offsetToPos,
    replaceRange: vi.fn(),
    getCursor: () => cursor,
    getLine: (line: number) => lines[line],
    setLine: vi.fn(),
  }

  return editor as unknown as Editor
}

const createPlugin = (editor?: Editor) => {
  const getActiveViewOfType = vi.fn(() => (editor ? { editor } : null))
  const plugin = { app: { workspace: { getActiveViewOfType } } } as unknown as ObsidianNotifierPlugin

  return { plugin, getActiveViewOfType }
}

const reminderMatch = (text: string) => {
  const match = [...text.matchAll(REMINDER_REGEXP)][0]
  if (!match) throw new Error(`No reminder in: ${text}`)
  return match
}

describe("replaceReminderById", () => {
  it("replaces the reminder with the new date and keeps its id", () => {
    const text = "Buy milk 🔔 2026-11-02T10:00 ^r-3-a"
    const editor = createEditor(text)
    const match = reminderMatch(text)

    const replaced = replaceReminderById(editor, "3-a", "2026-11-03T09:30")

    expect(replaced).toBe(true)
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "🔔 2026-11-03T09:30 ^r-3-a",
      { line: 0, ch: match.index },
      { line: 0, ch: match.index! + match[0].length },
    )
  })

  it("removes the reminder when the new date is null", () => {
    const text = "Buy milk 🔔 2026-11-02T10:00 ^r-3-a"
    const editor = createEditor(text)

    const replaced = replaceReminderById(editor, "3-a", null)

    expect(replaced).toBe(true)
    expect(editor.replaceRange).toHaveBeenCalledWith("", expect.anything(), expect.anything())
  })

  it("returns false and does nothing when the id is missing", () => {
    const editor = createEditor("Buy milk 🔔 2026-11-02T10:00 ^r-3-a")

    const replaced = replaceReminderById(editor, "9-z", "2026-11-03T09:30")

    expect(replaced).toBe(false)
    expect(editor.replaceRange).not.toHaveBeenCalled()
  })

  it("replaces only the matching reminder when a line has several", () => {
    const text = "First 🔔 2026-11-02T10:00 ^r-1-a and second 🔔 2026-11-05T12:00 ^r-2-b"
    const editor = createEditor(text)
    const match = [...text.matchAll(REMINDER_REGEXP)][1]

    replaceReminderById(editor, "2-b", "2026-11-06T08:00")

    expect(editor.replaceRange).toHaveBeenCalledTimes(1)
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "🔔 2026-11-06T08:00 ^r-2-b",
      { line: 0, ch: match.index },
      { line: 0, ch: match.index! + match[0].length },
    )
  })
})

describe("addHoursToReminder", () => {
  beforeEach(() => {
    DateTimePickerMock.instances = []
  })

  it("adds hours to the reminder in the given line", () => {
    const editor = createEditor("Note 🔔 2026-11-02T10:00 ^r-3-a")
    const { plugin } = createPlugin(editor)

    addHoursToReminder(plugin, 0, 1)

    expect(editor.setLine).toHaveBeenCalledWith(0, "Note 🔔 2026-11-02T11:00 ^r-3-a")
  })

  it("subtracts hours for negative values", () => {
    const editor = createEditor("Note 🔔 2026-11-02T10:00 ^r-3-a")
    const { plugin } = createPlugin(editor)

    addHoursToReminder(plugin, 0, -1)

    expect(editor.setLine).toHaveBeenCalledWith(0, "Note 🔔 2026-11-02T09:00 ^r-3-a")
  })

  it("rolls over to the next day", () => {
    const editor = createEditor("🔔 2026-11-02T23:30 ^r-3-a")
    const { plugin } = createPlugin(editor)

    addHoursToReminder(plugin, 0, 1)

    expect(editor.setLine).toHaveBeenCalledWith(0, "🔔 2026-11-03T00:30 ^r-3-a")
  })

  it("edits the requested line only", () => {
    const editor = createEditor("no reminder here\n🔔 2026-11-02T10:00 ^r-3-a")
    const { plugin } = createPlugin(editor)

    addHoursToReminder(plugin, 1, 2)

    expect(editor.setLine).toHaveBeenCalledWith(1, "🔔 2026-11-02T12:00 ^r-3-a")
  })

  it("does nothing without an active markdown editor", () => {
    const { plugin } = createPlugin()

    expect(() => addHoursToReminder(plugin, 0, 1)).not.toThrow()
  })
})

describe("openReminderEditor", () => {
  beforeEach(() => {
    DateTimePickerMock.instances = []
  })

  it("opens the picker with the current reminder date", () => {
    const editor = createEditor("Buy milk 🔔 2026-11-02T10:00 ^r-3-a")
    const { plugin } = createPlugin(editor)

    openReminderEditor(plugin, "3-a", "2026-11-02T10:00")

    expect(DateTimePickerMock.instances).toHaveLength(1)
    const instance = DateTimePickerMock.instances[0]
    expect(instance.plugin).toBe(plugin)
    expect(instance.date).toBe("2026-11-02T10:00")
    expect(instance.open).toHaveBeenCalledTimes(1)
  })

  it("replaces the reminder when a new date is submitted", () => {
    const editor = createEditor("Buy milk 🔔 2026-11-02T10:00 ^r-3-a")
    const { plugin } = createPlugin(editor)

    openReminderEditor(plugin, "3-a", "2026-11-02T10:00")
    DateTimePickerMock.instances[0].onSubmit("2026-12-01T08:00")

    expect(editor.replaceRange).toHaveBeenCalledWith("🔔 2026-12-01T08:00 ^r-3-a", expect.anything(), expect.anything())
  })

  it("removes the reminder when the delete callback runs", () => {
    const editor = createEditor("Buy milk 🔔 2026-11-02T10:00 ^r-3-a")
    const { plugin } = createPlugin(editor)

    openReminderEditor(plugin, "3-a", "2026-11-02T10:00")
    DateTimePickerMock.instances[0].onDelete?.()

    expect(editor.replaceRange).toHaveBeenCalledWith("", expect.anything(), expect.anything())
  })

  it("does not touch the editor when there is no active view", () => {
    const { plugin } = createPlugin()

    openReminderEditor(plugin, "3-a", "2026-11-02T10:00")
    DateTimePickerMock.instances[0].onSubmit("2026-12-01T08:00")
    DateTimePickerMock.instances[0].onDelete?.()

    expect(DateTimePickerMock.instances).toHaveLength(1)
  })
})

describe("openReminderEditorAtCursor", () => {
  beforeEach(() => {
    DateTimePickerMock.instances = []
  })

  it("opens the picker for the reminder under the cursor", () => {
    const text = "first line\n🔔 2026-11-02T10:00 ^r-3-a"
    const editor = createEditor(text, { line: 1, ch: 4 })
    const { plugin } = createPlugin(editor)

    openReminderEditorAtCursor(plugin)

    expect(DateTimePickerMock.instances).toHaveLength(1)
    expect(DateTimePickerMock.instances[0].date).toBe("2026-11-02T10:00")
    expect(DateTimePickerMock.instances[0].onSubmit).toBeTypeOf("function")
  })

  it("does not open the picker when the line has no reminder", () => {
    const editor = createEditor("just text\n🔔 2026-11-02T10:00 ^r-3-a", { line: 0, ch: 0 })
    const { plugin } = createPlugin(editor)

    openReminderEditorAtCursor(plugin)

    expect(DateTimePickerMock.instances).toHaveLength(0)
  })

  it("does nothing without an active markdown editor", () => {
    const { plugin } = createPlugin()

    openReminderEditorAtCursor(plugin)

    expect(DateTimePickerMock.instances).toHaveLength(0)
  })
})
