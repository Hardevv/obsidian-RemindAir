import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { Notice } from "tests/mocks/obsidian"
import { DEFAULT_GCAL_SETTINGS } from "src/settings/defaults"
import { formatLocalDateTime } from "src/utils/dates"
import { buildEventLink, createEvent } from "src/google/eventFrontmatter"

const picker = vi.hoisted(() => {
  class EventDatePickerModalMock {
    static instances: EventDatePickerModalMock[] = []

    open = vi.fn()

    constructor(
      public plugin: unknown,
      public options: {
        title?: string | null
        onSubmit: (result: unknown, action: string) => unknown
        validate?: (result: { title: string; start: string; end: string }) => string | null
      },
    ) {
      EventDatePickerModalMock.instances.push(this)
    }
  }

  return { EventDatePickerModalMock }
})

vi.mock("src/components/eventDatePicker/eventDatePickerModal", () => ({ EventDatePickerModal: picker.EventDatePickerModalMock }))

const scheduler = vi.hoisted(() => ({ requestCalendarPush: vi.fn() }))

vi.mock("src/google/syncScheduler", () => ({ requestCalendarPush: scheduler.requestCalendarPush }))

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
  connected?: boolean
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
    settings: {
      googleAuth: options.connected ? { accessToken: "token", refreshToken: "", expiresAt: 0, scope: "" } : null,
      googleCalendar: { ...DEFAULT_GCAL_SETTINGS, eventsFolder: options.folder ?? "Calendar" },
    },
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
    scheduler.requestCalendarPush.mockClear()
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

  it("blocks a result that would land on an existing note", async () => {
    const { plugin } = createPlugin({ existingPaths: ["Calendar/2026-10-28 10-30 │ Dentist.md"] })

    await createEvent(plugin)

    const validate = lastPicker().options.validate
    if (!validate) throw new Error("no validator")

    expect(validate({ title: "Dentist", start: "2026-10-28T10:30:00", end: "2026-10-28T11:00:00" })).toContain("already starts")
    expect(validate({ title: "Dentist", start: "2026-10-28T12:00:00", end: "2026-10-28T12:30:00" })).toBeNull()
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

  it("pushes the new event right away instead of waiting for the next sync", async () => {
    const { plugin } = createPlugin({ selection: "Meeting with Bart", connected: true })

    await createEvent(plugin)
    await submit("Meeting with Bart")

    expect(scheduler.requestCalendarPush).toHaveBeenCalledWith(plugin)
    expect(Notice.instances.at(-1)?.message).toContain("sending it to Google")
  })

  it("does not promise a push when the account is disconnected", async () => {
    const { plugin } = createPlugin({ selection: "Meeting with Bart" })

    await createEvent(plugin)
    await submit("Meeting with Bart")

    expect(Notice.instances.at(-1)?.message).toContain("next sync")
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
