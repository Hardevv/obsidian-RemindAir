import type ObsidianNotifierPlugin from "main"
import {
  decorateEventLinks,
  EVENT_LINK_CLASS,
  EVENT_LINK_HREF_ATTR,
  openEventNote,
  resolveEventLink,
} from "src/components/eventLinks/eventLink"
import { buildEventLinkExtension } from "src/components/eventLinks/eventLinkWidget"

const hasModifier = (event: MouseEvent): boolean => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

const eventLinkFrom = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) return null

  return target.closest<HTMLElement>(`.${EVENT_LINK_CLASS}`)
}

const openLink = (plugin: ObsidianNotifierPlugin, element: HTMLElement): boolean => {
  const href = element.getAttribute(EVENT_LINK_HREF_ATTR)
  if (!href) return false

  const note = resolveEventLink(plugin, href, plugin.app.workspace.getActiveFile()?.path ?? "")
  if (!note) return false

  openEventNote(plugin, note)

  return true
}

/**
 * Event links open the picker instead of navigating. Reading view and live preview need
 * different events: the editor opens a link on mousedown, the preview on click.
 */
export const registerEventLinks = (plugin: ObsidianNotifierPlugin): void => {
  plugin.registerMarkdownPostProcessor((element, context) => decorateEventLinks(plugin, element, context.sourcePath))
  plugin.registerEditorExtension(buildEventLinkExtension(plugin))

  plugin.registerDomEvent(
    document,
    "mousedown",
    (event) => {
      if (event.button !== 0 || hasModifier(event)) return

      const link = eventLinkFrom(event.target)
      if (!link || !link.closest(".cm-content")) return
      if (!openLink(plugin, link)) return

      event.preventDefault()
      event.stopPropagation()
    },
    { capture: true },
  )

  plugin.registerDomEvent(
    document,
    "click",
    (event) => {
      if (event.button !== 0 || hasModifier(event)) return

      const link = eventLinkFrom(event.target)
      if (!link || link.closest(".cm-content")) return
      if (!openLink(plugin, link)) return

      event.preventDefault()
      event.stopPropagation()
    },
    { capture: true },
  )
}
