import type ObsidianNotifierPlugin from "main"
import { setIcon, setTooltip } from "obsidian"
import { timeRangeLabel } from "src/components/eventDatePicker/grid"
import { editEvent } from "src/google/eventFrontmatter"
import { readEventNote, type EventNote } from "src/google/eventsSync"

export const EVENT_LINK_CLASS = "RemindAir-event-link"
export const EVENT_LINK_ICON_CLASS = "RemindAir-event-link-icon"
export const EVENT_LINK_HREF_ATTR = "data-remindair-href"
export const EVENT_LINK_TOOLTIP_CLASS = "RemindAir-event-link-tooltip"
const EVENT_LINK_FLAG = "remindairLink"
const DEFAULT_TOOLTIP_DELAY_MS = 200

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** A date only value is a day, not an instant, so it is parsed locally instead of as UTC. */
export const parseEventDate = (value: string): Date | null => {
  if (!value) return null

  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-").map(Number)

    return new Date(year, month - 1, day)
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const eventLinkLabel = (note: EventNote, time24: boolean): string => {
  const start = parseEventDate(note.start)
  if (!start) return ""

  const date = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
  if (DATE_ONLY.test(note.start)) return `${date}, all day`

  const end = parseEventDate(note.end)
  if (!end) return date

  return `${date}, ${timeRangeLabel(start, end, time24)}`
}

/** Obsidian waits a full second by default, which feels sluggish on a link. */
export const tooltipDelay = (plugin: ObsidianNotifierPlugin): number => {
  const delay = plugin.settings.googleCalendar?.eventLinkTooltipDelayMs

  return typeof delay === "number" && Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_TOOLTIP_DELAY_MS
}

export const eventLinkTooltip = (note: EventNote, time24: boolean): string => eventLinkLabel(note, time24)

const applyTooltip = (plugin: ObsidianNotifierPlugin, element: HTMLElement, note: EventNote, time24: boolean): void => {
  setTooltip(element, eventLinkTooltip(note, time24), {
    delay: tooltipDelay(plugin),
    placement: "top",
    classes: [EVENT_LINK_TOOLTIP_CLASS],
  })
}

/** Resolves a link the way Obsidian does, then asks the same helper the sync uses. */
export const resolveEventLink = (plugin: ObsidianNotifierPlugin, href: string, sourcePath: string): EventNote | null => {
  const target = plugin.app.metadataCache.getFirstLinkpathDest(href, sourcePath)
  if (!target) return null

  return readEventNote(plugin, target)
}

export const openEventNote = (plugin: ObsidianNotifierPlugin, note: EventNote): void => {
  void editEvent(plugin, note)
}

export const createEventLinkIcon = (plugin: ObsidianNotifierPlugin, note: EventNote, time24: boolean): HTMLElement => {
  const icon = document.createElement("span")
  icon.className = EVENT_LINK_ICON_CLASS
  icon.setAttribute("aria-hidden", "true")
  setIcon(icon, "calendar-clock")
  applyTooltip(plugin, icon, note, time24)
  icon.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    openEventNote(plugin, note)
  })

  return icon
}

/** Reading view decoration: an icon next to the link and the date on hover. */
export const decorateEventLinks = (plugin: ObsidianNotifierPlugin, root: HTMLElement, sourcePath: string): void => {
  const time24 = plugin.settings.timeFormat !== "12h"

  for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a.internal-link"))) {
    if (link.dataset[EVENT_LINK_FLAG] === "event") continue

    const href = link.getAttribute("data-href")
    if (!href) continue

    const note = resolveEventLink(plugin, href, sourcePath)
    if (!note) continue

    link.dataset[EVENT_LINK_FLAG] = "event"
    link.setAttribute(EVENT_LINK_HREF_ATTR, href)
    link.classList.add(EVENT_LINK_CLASS)
    // The tooltip lives on the icon only, so it never fights the native hover preview of the link.
    link.insertAdjacentElement("afterend", createEventLinkIcon(plugin, note, time24))
  }
}
