import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"

const api = vi.hoisted(() => ({ editEvent: vi.fn(), readEventNote: vi.fn(), buildExtension: vi.fn(() => "extension") }))

vi.mock("src/google/eventFrontmatter", () => ({ editEvent: api.editEvent }))
vi.mock("src/google/eventsSync", () => ({ readEventNote: api.readEventNote }))
vi.mock("src/components/eventLinks/eventLinkWidget", () => ({ buildEventLinkExtension: api.buildExtension }))

import { EVENT_LINK_CLASS, EVENT_LINK_HREF_ATTR } from "src/components/eventLinks/eventLink"
import { registerEventLinks } from "src/eventLinks"

const note = {
  file: { path: "Calendar/2026-11-02 10-00 │ Client meeting.md" },
  title: "Client meeting",
  start: "2026-11-02T10:00:00",
  end: "2026-11-02T11:00:00",
}

const registered: { target: Document; type: string; callback: (event: MouseEvent) => void }[] = []

const createPlugin = () => {
  const listeners: { type: string; callback: (event: MouseEvent) => void }[] = []
  const registerMarkdownPostProcessor = vi.fn()
  const registerEditorExtension = vi.fn()
  const getFirstLinkpathDest = vi.fn((href: string) => (href === "Calendar/Client meeting" ? { path: "event.md" } : null))

  const plugin = {
    settings: { timeFormat: "24h" },
    app: {
      metadataCache: { getFirstLinkpathDest },
      workspace: { getActiveFile: () => ({ path: "Notes/Plan.md" }) },
    },
    registerMarkdownPostProcessor,
    registerEditorExtension,
    registerDomEvent: vi.fn((target: Document, type: string, callback: (event: MouseEvent) => void) => {
      listeners.push({ type, callback })
      registered.push({ target, type, callback })
      target.addEventListener(type, callback, { capture: true })
    }),
  } as unknown as ObsidianNotifierPlugin

  return { plugin, listeners, registerMarkdownPostProcessor, registerEditorExtension }
}

const createLink = (options: { live?: boolean } = {}): HTMLAnchorElement => {
  const wrapper = document.createElement("div")
  if (options.live) wrapper.className = "cm-content"

  const link = document.createElement("a")
  link.className = `internal-link ${EVENT_LINK_CLASS}`
  link.setAttribute(EVENT_LINK_HREF_ATTR, "Calendar/Client meeting")
  wrapper.append(link)
  document.body.append(wrapper)

  return link
}

const fire = (target: HTMLElement, type: string, init: MouseEventInit = {}): MouseEvent => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })
  target.dispatchEvent(event)

  return event
}

describe("registerEventLinks", () => {
  beforeEach(() => {
    api.editEvent.mockReset()
    api.readEventNote.mockReset()
    api.readEventNote.mockReturnValue(note)
    document.body.innerHTML = ""
  })

  afterEach(() => {
    for (const { target, type, callback } of registered) target.removeEventListener(type, callback, { capture: true })
    registered.length = 0
    document.body.innerHTML = ""
  })

  it("registers the post processor, the editor extension and both click listeners", () => {
    const { plugin, listeners, registerMarkdownPostProcessor, registerEditorExtension } = createPlugin()

    registerEventLinks(plugin)

    expect(registerMarkdownPostProcessor).toHaveBeenCalledTimes(1)
    expect(registerEditorExtension).toHaveBeenCalledWith("extension")
    expect(listeners.map((listener) => listener.type)).toEqual(["mousedown", "click"])
  })

  it("opens the picker on a mousedown in live preview", () => {
    const { plugin } = createPlugin()
    registerEventLinks(plugin)
    const link = createLink({ live: true })

    const event = fire(link, "mousedown")

    expect(api.editEvent).toHaveBeenCalledWith(plugin, note)
    expect(event.defaultPrevented).toBe(true)
  })

  it("opens the picker on a click in reading view", () => {
    const { plugin } = createPlugin()
    registerEventLinks(plugin)
    const link = createLink()

    const event = fire(link, "click")

    expect(api.editEvent).toHaveBeenCalledWith(plugin, note)
    expect(event.defaultPrevented).toBe(true)
  })

  it("leaves a click in reading view alone when it comes from the editor", () => {
    const { plugin } = createPlugin()
    registerEventLinks(plugin)
    const link = createLink({ live: true })

    fire(link, "click")

    expect(api.editEvent).not.toHaveBeenCalled()
  })

  it("lets the modifier clicks through", () => {
    const { plugin } = createPlugin()
    registerEventLinks(plugin)
    const link = createLink({ live: true })

    const event = fire(link, "mousedown", { metaKey: true })

    expect(api.editEvent).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it("ignores links that are not event links", () => {
    const { plugin } = createPlugin()
    registerEventLinks(plugin)
    const plain = document.createElement("a")
    plain.className = "internal-link"
    document.body.append(plain)

    fire(plain, "mousedown")

    expect(api.editEvent).not.toHaveBeenCalled()
  })

  it("falls back to the normal navigation when the note stopped being an event", () => {
    const { plugin } = createPlugin()
    api.readEventNote.mockReturnValue(null)
    registerEventLinks(plugin)
    const link = createLink({ live: true })

    const event = fire(link, "mousedown")

    expect(api.editEvent).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
