import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"

const noteApi = vi.hoisted(() => ({ readEventNote: vi.fn(), editEvent: vi.fn() }))

vi.mock("src/google/eventsSync", () => ({ readEventNote: noteApi.readEventNote }))
vi.mock("src/google/eventFrontmatter", () => ({ editEvent: noteApi.editEvent }))

import { EVENT_ACTION_ICON, EVENT_ACTION_LABEL, registerEventNoteAction } from "src/eventNoteAction"

interface FakeView {
  file: { path: string } | null
  addAction: ReturnType<typeof vi.fn>
}

const createPlugin = (view: FakeView | null) => {
  const listeners: Record<string, (...args: unknown[]) => void> = {}
  const registerEvent = vi.fn()
  const onLayoutReady = vi.fn((callback: () => void) => callback())

  const plugin = {
    registerEvent,
    app: {
      workspace: {
        getActiveViewOfType: vi.fn(() => view),
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          listeners[event] = callback

          return { event }
        }),
        onLayoutReady,
      },
      metadataCache: {
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          listeners[`metadata:${event}`] = callback

          return { event }
        }),
      },
    },
  } as unknown as ObsidianNotifierPlugin

  return { plugin, listeners, registerEvent, onLayoutReady }
}

const createView = (path = "Calendar/2026-11-02 10-00 │ Client meeting.md"): FakeView => {
  const button = document.createElement("div")
  const addAction = vi.fn(() => button)

  return { file: { path }, addAction }
}

const eventNote = (path = "Calendar/2026-11-02 10-00 │ Client meeting.md") => ({
  file: { path },
  title: "Client meeting",
  start: "2026-11-02T10:00:00",
  end: "2026-11-02T11:00:00",
})

describe("registerEventNoteAction", () => {
  beforeEach(() => {
    noteApi.readEventNote.mockReset()
    noteApi.editEvent.mockReset()
  })

  it("adds the header button on an event note", () => {
    const view = createView()
    const { plugin } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(eventNote())

    registerEventNoteAction(plugin)

    expect(view.addAction).toHaveBeenCalledWith(EVENT_ACTION_ICON, EVENT_ACTION_LABEL, expect.any(Function))
  })

  it("does not add the button twice when the note is refreshed", () => {
    const view = createView()
    const { plugin, listeners } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(eventNote())

    registerEventNoteAction(plugin)
    listeners["file-open"]?.()
    listeners["active-leaf-change"]?.()

    expect(view.addAction).toHaveBeenCalledTimes(1)
  })

  it("leaves a normal note alone", () => {
    const view = createView("Notes/Meeting.md")
    const { plugin } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(null)

    registerEventNoteAction(plugin)

    expect(view.addAction).not.toHaveBeenCalled()
  })

  it("removes the button when the note stops being an event", () => {
    const view = createView()
    const { plugin, listeners } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(eventNote())

    registerEventNoteAction(plugin)
    const button = view.addAction.mock.results[0]?.value as HTMLElement
    const remove = vi.spyOn(button, "remove")

    noteApi.readEventNote.mockReturnValue(null)
    listeners["file-open"]?.()

    expect(remove).toHaveBeenCalled()
  })

  it("opens the editor for the note that is active at the click", () => {
    const view = createView()
    const { plugin } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(eventNote())

    registerEventNoteAction(plugin)
    const callback = view.addAction.mock.calls[0]?.[2] as () => void
    callback()

    expect(noteApi.editEvent).toHaveBeenCalledWith(plugin, eventNote())
  })

  it("does nothing on a click after the note stopped being an event", () => {
    const view = createView()
    const { plugin } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(eventNote())

    registerEventNoteAction(plugin)
    const callback = view.addAction.mock.calls[0]?.[2] as () => void

    noteApi.readEventNote.mockReturnValue(null)
    callback()

    expect(noteApi.editEvent).not.toHaveBeenCalled()
  })

  it("refreshes when the properties of the open note change", () => {
    const view = createView()
    const { plugin, listeners } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(null)

    registerEventNoteAction(plugin)
    noteApi.readEventNote.mockReturnValue(eventNote())
    listeners["metadata:changed"]?.({ path: "Calendar/2026-11-02 10-00 │ Client meeting.md" })

    expect(view.addAction).toHaveBeenCalledTimes(1)
  })

  it("ignores metadata changes of other notes", () => {
    const view = createView()
    const { plugin, listeners } = createPlugin(view)
    noteApi.readEventNote.mockReturnValue(eventNote())

    registerEventNoteAction(plugin)
    listeners["metadata:changed"]?.({ path: "Notes/Other.md" })

    expect(view.addAction).toHaveBeenCalledTimes(1)
  })

  it("does nothing without an open markdown view", () => {
    const { plugin } = createPlugin(null)

    registerEventNoteAction(plugin)

    expect(noteApi.readEventNote).not.toHaveBeenCalled()
  })
})
