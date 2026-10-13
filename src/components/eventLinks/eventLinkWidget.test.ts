import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { setIcon, setTooltip } from "obsidian"

const api = vi.hoisted(() => ({ editEvent: vi.fn() }))

vi.mock("src/google/eventFrontmatter", () => ({ editEvent: api.editEvent }))

import { EVENT_LINK_ICON_CLASS } from "src/components/eventLinks/eventLink"
import { EventLinkIconWidget, linkTarget } from "src/components/eventLinks/eventLinkWidget"

const createPlugin = (timeFormat = "24h") =>
  ({ settings: { timeFormat, googleCalendar: { eventLinkTooltipDelayMs: 200 } } }) as unknown as ObsidianNotifierPlugin

const note = {
  file: { path: "Calendar/2026-11-02 10-00 │ Client meeting.md" },
  title: "Client meeting",
  start: "2026-11-02T10:00:00",
  end: "2026-11-02T11:00:00",
} as never

describe("linkTarget", () => {
  it("keeps the path and drops the alias and the heading", () => {
    expect(linkTarget("Calendar/Client meeting")).toBe("Calendar/Client meeting")
    expect(linkTarget("Calendar/Client meeting|Meeting")).toBe("Calendar/Client meeting")
    expect(linkTarget("Calendar/Client meeting#Notes")).toBe("Calendar/Client meeting")
    expect(linkTarget("  Calendar/Client meeting  ")).toBe("Calendar/Client meeting")
  })
})

describe("EventLinkIconWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the calendar icon", () => {
    const element = new EventLinkIconWidget(createPlugin(), note, true).toDOM()

    expect(element.classList.contains(EVENT_LINK_ICON_CLASS)).toBe(true)
    expect(setIcon).toHaveBeenCalledWith(element, "calendar-clock")
    expect(setTooltip).toHaveBeenCalledWith(
      element,
      expect.stringContaining("10:00 → 11:00"),
      expect.objectContaining({ delay: 200, placement: "top" }),
    )
  })

  it("is equal for the same note and label", () => {
    const plugin = createPlugin()
    const widget = new EventLinkIconWidget(plugin, note, true)

    expect(widget.eq(new EventLinkIconWidget(plugin, note, true))).toBe(true)
    expect(widget.eq(new EventLinkIconWidget(plugin, note, false))).toBe(false)
  })

  it("opens the picker on click and swallows the event", () => {
    const plugin = createPlugin()
    const element = new EventLinkIconWidget(plugin, note, true).toDOM()
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })

    element.dispatchEvent(event)

    expect(api.editEvent).toHaveBeenCalledWith(plugin, note)
    expect(event.defaultPrevented).toBe(true)
  })

  it("lets the editor handle its own events", () => {
    expect(new EventLinkIconWidget(createPlugin(), note, true).ignoreEvent()).toBe(true)
  })
})
