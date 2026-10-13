import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { setTooltip } from "obsidian"

const api = vi.hoisted(() => ({ editEvent: vi.fn(), readEventNote: vi.fn() }))

vi.mock("src/google/eventFrontmatter", () => ({ editEvent: api.editEvent }))
vi.mock("src/google/eventsSync", () => ({ readEventNote: api.readEventNote }))

import {
  createEventLinkIcon,
  decorateEventLinks,
  EVENT_LINK_CLASS,
  EVENT_LINK_ICON_CLASS,
  EVENT_LINK_TOOLTIP_CLASS,
  eventLinkLabel,
  eventLinkTooltip,
  parseEventDate,
  resolveEventLink,
  tooltipDelay,
} from "src/components/eventLinks/eventLink"

const note = (overrides: Record<string, unknown> = {}) => ({
  file: { path: "Calendar/2026-11-02 10-00 │ Client meeting.md" },
  title: "Client meeting",
  start: "2026-11-02T10:00:00",
  end: "2026-11-02T11:00:00",
  ...overrides,
})

const createPlugin = (tooltipDelayMs = 200) => {
  const getFirstLinkpathDest = vi.fn((href: string) => (href === "Calendar/Client meeting" ? { path: "event.md" } : null))
  const plugin = {
    settings: { timeFormat: "24h", googleCalendar: { eventLinkTooltipDelayMs: tooltipDelayMs } },
    app: { metadataCache: { getFirstLinkpathDest } },
  } as unknown as ObsidianNotifierPlugin

  return { plugin, getFirstLinkpathDest }
}

const createLink = (href = "Calendar/Client meeting"): HTMLAnchorElement => {
  const link = document.createElement("a")
  link.className = "internal-link"
  link.setAttribute("data-href", href)
  link.textContent = "Client meeting"

  return link
}

describe("parseEventDate", () => {
  it("reads a date only value in the local timezone", () => {
    const date = parseEventDate("2026-11-02")

    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(10)
    expect(date?.getDate()).toBe(2)
  })

  it("reads a full timestamp and rejects junk", () => {
    expect(parseEventDate("2026-11-02T10:00:00")?.getHours()).toBe(10)
    expect(parseEventDate("")).toBeNull()
    expect(parseEventDate("not a date")).toBeNull()
  })
})

const DAY = new Date(2026, 10, 2).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })

describe("eventLinkLabel", () => {
  it("shows the day and the range", () => {
    expect(eventLinkLabel(note() as never, true)).toBe(`${DAY}, 10:00 → 11:00`)
  })

  it("shows only the day when there is no end", () => {
    expect(eventLinkLabel(note({ end: "" }) as never, true)).toBe(DAY)
  })

  it("marks an all day event", () => {
    expect(eventLinkLabel(note({ start: "2026-11-02", end: "2026-11-03" }) as never, true)).toBe(`${DAY}, all day`)
  })

  it("follows the 12 hour setting", () => {
    expect(eventLinkLabel(note() as never, false)).toContain("10:00 AM")
  })
})

describe("eventLinkTooltip", () => {
  it("shows the date and the range without the title", () => {
    expect(eventLinkTooltip(note() as never, true)).toBe(`${DAY}, 10:00 → 11:00`)
  })
})

describe("tooltipDelay", () => {
  it("uses the configured delay and falls back to a fifth of a second", () => {
    expect(tooltipDelay(createPlugin(50).plugin)).toBe(50)
    expect(tooltipDelay(createPlugin(0).plugin)).toBe(0)
    expect(tooltipDelay({ settings: { googleCalendar: {} } } as never)).toBe(200)
    expect(tooltipDelay({ settings: {} } as never)).toBe(200)
  })
})

describe("resolveEventLink", () => {
  beforeEach(() => {
    api.readEventNote.mockReset()
    api.editEvent.mockReset()
  })

  it("resolves through the metadata cache and keeps only real events", () => {
    const { plugin, getFirstLinkpathDest } = createPlugin()
    api.readEventNote.mockReturnValue(note())

    expect(resolveEventLink(plugin, "Calendar/Client meeting", "Notes/Plan.md")).toEqual(note())
    expect(getFirstLinkpathDest).toHaveBeenCalledWith("Calendar/Client meeting", "Notes/Plan.md")
  })

  it("returns null when the link points nowhere", () => {
    const { plugin } = createPlugin()
    api.readEventNote.mockReturnValue(note())

    expect(resolveEventLink(plugin, "Other note", "Notes/Plan.md")).toBeNull()
  })
})

describe("decorateEventLinks", () => {
  beforeEach(() => {
    api.readEventNote.mockReset()
    api.editEvent.mockReset()
    vi.clearAllMocks()
  })

  it("adds the icon to a link that points at an event", () => {
    const { plugin } = createPlugin()
    api.readEventNote.mockReturnValue(note())
    const root = document.createElement("div")
    const link = createLink()
    root.append(link)

    decorateEventLinks(plugin, root, "Notes/Plan.md")

    expect(link.classList.contains(EVENT_LINK_CLASS)).toBe(true)
    expect(link.nextElementSibling?.classList.contains(EVENT_LINK_ICON_CLASS)).toBe(true)
  })

  it("leaves the tooltip off the link, so the hover preview keeps working", () => {
    const { plugin } = createPlugin()
    api.readEventNote.mockReturnValue(note())
    const root = document.createElement("div")
    const link = createLink()
    root.append(link)

    decorateEventLinks(plugin, root, "Notes/Plan.md")

    expect(setTooltip).not.toHaveBeenCalledWith(link, expect.anything(), expect.anything())
    expect(setTooltip).toHaveBeenCalledWith(link.nextElementSibling, `${DAY}, 10:00 → 11:00`, {
      delay: 200,
      placement: "top",
      classes: [EVENT_LINK_TOOLTIP_CLASS],
    })
  })

  it("leaves a normal note alone", () => {
    const { plugin } = createPlugin()
    api.readEventNote.mockReturnValue(null)
    const root = document.createElement("div")
    const link = createLink()
    root.append(link)

    decorateEventLinks(plugin, root, "Notes/Plan.md")

    expect(link.classList.contains(EVENT_LINK_CLASS)).toBe(false)
    expect(link.nextElementSibling).toBeNull()
  })

  it("ignores links without a target", () => {
    const { plugin } = createPlugin()
    api.readEventNote.mockReturnValue(note())
    const root = document.createElement("div")
    const external = document.createElement("a")
    external.className = "external-link"
    const broken = createLink()
    broken.removeAttribute("data-href")
    root.append(external, broken)

    decorateEventLinks(plugin, root, "Notes/Plan.md")

    expect(root.querySelectorAll(`.${EVENT_LINK_ICON_CLASS}`)).toHaveLength(0)
  })

  it("does not add a second icon when the block is rendered again", () => {
    const { plugin } = createPlugin()
    api.readEventNote.mockReturnValue(note())
    const root = document.createElement("div")
    const link = createLink()
    root.append(link)

    decorateEventLinks(plugin, root, "Notes/Plan.md")
    decorateEventLinks(plugin, root, "Notes/Plan.md")

    expect(root.querySelectorAll(`.${EVENT_LINK_ICON_CLASS}`)).toHaveLength(1)
  })
})

describe("createEventLinkIcon", () => {
  beforeEach(() => {
    api.editEvent.mockReset()
  })

  it("opens the picker when the icon is clicked", () => {
    const { plugin } = createPlugin()
    const icon = createEventLinkIcon(plugin, note() as never, true)

    icon.click()

    expect(api.editEvent).toHaveBeenCalledWith(plugin, note())
  })

  it("carries the same tooltip as the link", () => {
    const { plugin } = createPlugin(150)
    const icon = createEventLinkIcon(plugin, note() as never, true)

    expect(setTooltip).toHaveBeenCalledWith(icon, `${DAY}, 10:00 → 11:00`, {
      delay: 150,
      placement: "top",
      classes: [EVENT_LINK_TOOLTIP_CLASS],
    })
  })
})
