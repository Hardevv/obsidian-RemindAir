import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { Notice } from "tests/mocks/obsidian"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import { formatLocalDateTime } from "src/utils/dates"
import { buildEventLink, createEvent, eventDefaults, fillEventFrontmatter } from "src/google/eventFrontmatter"

const picker = vi.hoisted(() => {
  class EventDatePickerModalMock {
    static instances: EventDatePickerModalMock[] = []

    open = vi.fn()

    constructor(
      public plugin: unknown,
      public options: { title?: string | null; onSubmit: (result: unknown, action: string) => unknown },
    ) {
      EventDatePickerModalMock.instances.push(this)
    }
  }

  return { EventDatePickerModalMock }
})

vi.mock("src/components/eventDatePicker/eventDatePickerModal", () => ({ EventDatePickerModal: picker.EventDatePickerModalMock }))

const { EventDatePickerModalMock } = picker

interface FakeFile {
  path: string
  basename: string
}

interface PluginOptions {
  file?: FakeFile | null
  frontmatter?: Record<string, unknown>
  folder?: string
  selection?: string
  existingPaths?: string[]
}

const createPlugin = (options: PluginOptions = {}) => {
  const file = options.file === undefined ? { path: "Calendar/Meeting.md", basename: "Meeting" } : options.file
  const frontmatter = options.frontmatter ?? {}
  const folders: string[] = []
  const files = new Set(options.existingPaths ?? [])
  const created: { path: string; content: string }[] = []
  const renamed: string[] = []

  const processFrontMatter = vi.fn(async (_file: FakeFile, callback: (data: Record<string, unknown>) => void) => {
    callback(frontmatter)
  })

  const vault = {
    getAbstractFileByPath: (path: string) => (files.has(path) || folders.includes(path) ? {} : null),
    createFolder: vi.fn(async (path: string) => {
      folders.push(path)
    }),
    create: vi.fn(async (path: string, content: string) => {
      files.add(path)
      created.push({ path, content })

      return { path }
    }),
  }

  const renameFile = vi.fn(async (target: FakeFile, path: string) => {
    target.path = path
    target.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? ""
    renamed.push(path)
  })

  const editor = {
    getSelection: vi.fn(() => options.selection ?? ""),
    getCursor: vi.fn((which?: string) => (which === "to" ? { line: 2, ch: 4 } : { line: 2, ch: 0 })),
    replaceSelection: vi.fn(),
    replaceRange: vi.fn(),
  }

  const openFile = vi.fn(async () => undefined)

  const plugin = {
    settings: { googleCalendar: { ...DEFAULT_GCAL_SETTINGS, eventsFolder: options.folder ?? "Calendar" } },
    app: {
      workspace: { getActiveFile: () => file, getActiveViewOfType: () => ({ editor }), getLeaf: () => ({ openFile }) },
      fileManager: { processFrontMatter, renameFile },
      vault,
    },
  } as unknown as ObsidianNotifierPlugin

  return { plugin, file, frontmatter, processFrontMatter, created, folders, editor, renamed, openFile }
}

describe("formatLocalDateTime", () => {
  it("pads every part and drops the timezone", () => {
    expect(formatLocalDateTime(new Date(2026, 0, 5, 9, 7, 3))).toBe("2026-01-05T09:07:03")
  })
})

describe("eventDefaults", () => {
  it("starts in fifteen minutes and lasts an hour", () => {
    expect(eventDefaults(new Date(2026, 9, 28, 10, 7, 42))).toEqual({
      start: "2026-10-28T10:22:00",
      end: "2026-10-28T11:22:00",
    })
  })

  it("crosses midnight", () => {
    expect(eventDefaults(new Date(2026, 9, 28, 23, 50, 0))).toEqual({
      start: "2026-10-29T00:05:00",
      end: "2026-10-29T01:05:00",
    })
  })
})

describe("buildEventLink", () => {
  it("drops the extension and keeps the selected text as the alias", () => {
    expect(buildEventLink("Calendar/2026-10-28 │ Meeting.md", "Meeting")).toBe("[[Calendar/2026-10-28 │ Meeting|Meeting]]")
  })

  it("strips characters that would break the link", () => {
    expect(buildEventLink("Calendar/x.md", "a|b[c]")).toBe("[[Calendar/x|a-b-c-]]")
  })
})

describe("createEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 28, 10, 7, 42))
    Notice.instances = []
    EventDatePickerModalMock.instances = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const lastPicker = () => {
    const instance = EventDatePickerModalMock.instances.at(-1)
    if (!instance) throw new Error("the picker was not opened")

    return instance
  }

  const submit = (title: string, action = "confirm") =>
    lastPicker().options.onSubmit({ title, start: "2026-11-02T10:00:00", end: "2026-11-02T10:15:00" }, action)

  it("opens the picker with the selection as the title", async () => {
    const { plugin } = createPlugin({ selection: "  Meeting with Bart  " })

    await expect(createEvent(plugin)).resolves.toBe(true)

    expect(lastPicker().options.title).toBe("Meeting with Bart")
    expect(lastPicker().open).toHaveBeenCalledTimes(1)
  })

  it("opens the picker without a title when nothing is selected", async () => {
    const { plugin } = createPlugin({ selection: "   " })

    await createEvent(plugin)

    expect(lastPicker().options.title).toBeNull()
  })

  it("creates the note on submit and links it over the selection", async () => {
    const { plugin, created, editor, openFile } = createPlugin({ selection: "Meeting with Bart" })

    await createEvent(plugin)
    await submit("Meeting with Bart")

    expect(created).toEqual([
      {
        path: "Calendar/2026-11-02 10-00 │ Meeting with Bart.md",
        content: '---\nstart: "2026-11-02T10:00:00"\nend: "2026-11-02T10:15:00"\n---\n',
      },
    ])
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "[[Calendar/2026-11-02 10-00 │ Meeting with Bart|Meeting with Bart]]",
      { line: 2, ch: 0 },
      { line: 2, ch: 4 },
    )
    expect(openFile).not.toHaveBeenCalled()
    expect(Notice.instances.at(-1)?.message).toContain("pushed to Google on the next sync")
  })

  it("opens the new note when there is no selection to link", async () => {
    const { plugin, created, editor, openFile } = createPlugin({ selection: "" })

    await createEvent(plugin)
    await submit("Dentist")

    expect(created[0].path).toBe("Calendar/2026-11-02 10-00 │ Dentist.md")
    expect(editor.replaceRange).not.toHaveBeenCalled()
    expect(openFile).toHaveBeenCalledTimes(1)
  })

  it("copies the link when the picker asks for it", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const { plugin } = createPlugin({ selection: "" })

    await createEvent(plugin)
    await submit("Dentist", "copy-link")

    expect(writeText).toHaveBeenCalledWith("[[Calendar/2026-11-02 10-00 │ Dentist|Dentist]]")
    expect(Notice.instances.at(-1)?.message).toContain("copied")
  })

  it("still creates the note when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(async () => {
          throw new Error("no clipboard")
        }),
      },
      configurable: true,
    })
    const { plugin, created } = createPlugin({ selection: "" })

    await createEvent(plugin)
    await submit("Dentist", "copy-link")

    expect(created).toHaveLength(1)
    expect(Notice.instances.at(-1)?.message).toContain("could not be copied")
  })
})

describe("fillEventFrontmatter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 28, 10, 7, 42))
    Notice.instances = []
    EventDatePickerModalMock.instances = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("opens the picker instead of touching the note when there is a selection", async () => {
    const { plugin, created, processFrontMatter } = createPlugin({ selection: "Meeting with Bart" })

    await fillEventFrontmatter(plugin)

    expect(created).toHaveLength(0)
    expect(processFrontMatter).not.toHaveBeenCalled()
    expect(EventDatePickerModalMock.instances).toHaveLength(1)
    expect(EventDatePickerModalMock.instances[0].options.title).toBe("Meeting with Bart")
  })

  it("fills the title from the file name and the default times", async () => {
    const { plugin, frontmatter, renamed } = createPlugin()

    await fillEventFrontmatter(plugin)

    expect(frontmatter).toEqual({
      start: "2026-10-28T10:22:00",
      end: "2026-10-28T11:22:00",
    })
    expect(renamed).toEqual(["Calendar/2026-10-28 10-22 │ Meeting.md"])
  })

  it("keeps the values that are already there", async () => {
    const { plugin, frontmatter, renamed } = createPlugin({
      frontmatter: { start: "2026-11-02T10:00:00", end: "2026-11-02T11:00:00" },
    })

    await fillEventFrontmatter(plugin)

    expect(frontmatter).toEqual({
      start: "2026-11-02T10:00:00",
      end: "2026-11-02T11:00:00",
    })
    expect(renamed).toEqual(["Calendar/2026-11-02 10-00 │ Meeting.md"])
  })

  it("tells the user when the note is outside the events folder", async () => {
    const { plugin } = createPlugin({ file: { path: "Inbox/Idea.md", basename: "Idea" } })

    await fillEventFrontmatter(plugin)

    expect(Notice.instances.at(-1)?.message).toContain("Move the note into Calendar")
  })

  it("confirms when the note is in the events folder", async () => {
    const { plugin } = createPlugin()

    await fillEventFrontmatter(plugin)

    expect(Notice.instances.at(-1)?.message).toContain("created on the next sync")
  })

  it("does nothing without an active note", async () => {
    const { plugin, processFrontMatter } = createPlugin({ file: null })

    await fillEventFrontmatter(plugin)

    expect(processFrontMatter).not.toHaveBeenCalled()
    expect(Notice.instances.at(-1)?.message).toContain("open a note first")
  })
})
