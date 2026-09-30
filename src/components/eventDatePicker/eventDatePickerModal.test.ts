import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { EventDatePickerModal, type EventDatePickerOptions } from "./eventDatePickerModal"
import type { PickerEvent } from "./eventSources"

const PREFIX = ".RemindAir-event-picker"

const createPlugin = (settings: Record<string, unknown> = {}) =>
  ({ app: {}, settings: { timeFormat: "24h", startWeekFrom: "monday", ...settings } }) as unknown as ObsidianNotifierPlugin

const createModal = (options: Partial<EventDatePickerOptions> = {}) => {
  const onSubmit = vi.fn()
  const modal = new EventDatePickerModal(createPlugin(), {
    initialStart: new Date(2026, 9, 28, 10, 7),
    onSubmit,
    ...options,
  })

  return { modal, onSubmit }
}

const openModal = (options: Partial<EventDatePickerOptions> = {}) => {
  const created = createModal(options)
  // Focus only works for nodes that are in the document, and Obsidian mounts the modal before onOpen.
  document.body.appendChild(created.modal.containerEl)
  created.modal.open()

  return created
}

const dayButton = (modal: EventDatePickerModal, key: string): HTMLElement => {
  const button = modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__day[data-date="${key}"]`)
  if (!button) throw new Error(`no day button for ${key}`)

  return button
}

const columns = (modal: EventDatePickerModal): HTMLElement[] =>
  Array.from(modal.contentEl.querySelectorAll<HTMLElement>(`${PREFIX}__column`))

const press = (element: HTMLElement, type: string, clientY: number): void => {
  element.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }))
}

const selectionTime = (modal: EventDatePickerModal): string =>
  modal.contentEl.querySelector(`${PREFIX}__selection-time`)?.textContent ?? ""

const selectionTitle = (modal: EventDatePickerModal): string =>
  modal.contentEl.querySelector(`${PREFIX}__selection-title`)?.textContent ?? ""

const eventAt = (start: string, end: string, title = "Meeting", allDay = false): PickerEvent => ({
  id: `${title}:${start}`,
  title,
  start: new Date(start),
  end: new Date(end),
  allDay,
})

const source = (events: PickerEvent[] = [], load: () => Promise<PickerEvent[]> = async () => []) => ({
  cached: vi.fn(() => events),
  load: vi.fn(load),
})

const pressKey = (element: HTMLElement, key: string): void => {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
}

const focusedDay = (): string | null => (document.activeElement as HTMLElement | null)?.dataset?.date ?? null

const scrollBox = (modal: EventDatePickerModal): HTMLElement | null => modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__scroll`)

const nowLine = (modal: EventDatePickerModal, index: number): HTMLElement | null => columns(modal)[index].querySelector(`${PREFIX}__now`)

const nowTop = (element: HTMLElement): number => Number.parseFloat(element.style.top)

const dots = (modal: EventDatePickerModal, key: string): number => dayButton(modal, key).querySelectorAll(`${PREFIX}__dot`).length

const confirmButton = (modal: EventDatePickerModal): HTMLElement => {
  const button = modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__submit.mod-cta`)
  if (!button) throw new Error("no confirm button")

  return button
}

const copyButton = (modal: EventDatePickerModal): HTMLElement => {
  const button = modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__submit.mod-secondary`)
  if (!button) throw new Error("no copy button")

  return button
}

const scrollPositions = new WeakMap<Element, number>()
const scrollTopDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")

describe("EventDatePickerModal", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 28, 10, 7, 42))
    // jsdom has no layout, so scrollTop would always read back as zero.
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get(this: Element) {
        return scrollPositions.get(this) ?? 0
      },
      set(this: Element, value: number) {
        scrollPositions.set(this, value)
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
    if (scrollTopDescriptor) Object.defineProperty(Element.prototype, "scrollTop", scrollTopDescriptor)
    else Reflect.deleteProperty(Element.prototype, "scrollTop")
  })

  it("opens on the month of the initial date", () => {
    const { modal } = openModal({ title: "Meeting" })

    expect(modal.contentEl.querySelectorAll(`${PREFIX}__day`)).toHaveLength(35)
    expect(modal.contentEl.querySelector(`${PREFIX}__month-label`)?.textContent).toContain("2026")
    expect(dayButton(modal, "2026-10-28").hasClass("is-selected")).toBe(true)
  })

  it("opens the day grid with enter, without focusing a day first", () => {
    const { modal, onSubmit } = openModal({ title: "Meeting" })

    pressKey(document.body, "Enter")

    expect(onSubmit).not.toHaveBeenCalled()
    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__days`)?.hidden).toBe(false)
    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__month`)?.hidden).toBe(true)
  })

  it("creates the event with two presses of enter", () => {
    const { onSubmit } = openModal({ title: "Meeting" })

    pressKey(document.body, "Enter")
    pressKey(document.body, "Enter")

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({ title: "Meeting", start: "2026-10-28T10:30:00", end: "2026-10-28T11:00:00" }, "confirm")
  })

  it("confirms with enter once the time grid is open", () => {
    const { modal, onSubmit } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    pressKey(document.body, "Enter")

    expect(onSubmit).toHaveBeenCalledWith({ title: "Meeting", start: "2026-10-28T10:30:00", end: "2026-10-28T11:00:00" }, "confirm")
  })

  it("leaves enter on a button to the button itself", () => {
    const { modal, onSubmit } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    pressKey(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__cancel`) as HTMLElement, "Enter")

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("moves to the day grid when enter is pressed in the name field", () => {
    const { modal, onSubmit } = openModal()
    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`) as HTMLInputElement

    input.value = "Dentist"
    input.dispatchEvent(new Event("input"))
    pressKey(input, "Enter")

    expect(onSubmit).not.toHaveBeenCalled()
    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__days`)?.hidden).toBe(false)
  })

  it("switches to the day grid when a date is picked", () => {
    const { modal } = openModal({ title: "Meeting" })

    dayButton(modal, "2026-10-28").click()

    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__month`)?.hidden).toBe(true)
    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__days`)?.hidden).toBe(false)
    expect(columns(modal)).toHaveLength(7)
  })

  it("uses three columns when asked for the narrow layout", () => {
    const { modal } = openModal({ title: "Meeting", dayCount: 3 })

    dayButton(modal, "2026-10-28").click()

    expect(columns(modal)).toHaveLength(3)
  })

  it("sets a thirty minute event from a single click", () => {
    const { modal, onSubmit } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    press(columns(modal)[2], "pointerdown", 600)

    expect(selectionTime(modal)).toContain("10:00 → 10:30")

    confirmButton(modal).click()

    expect(onSubmit).toHaveBeenCalledWith({ title: "Meeting", start: "2026-10-28T10:00:00", end: "2026-10-28T10:30:00" }, "confirm")
  })

  it("opens with half an hour that starts in a quarter of an hour", () => {
    const { modal } = openModal({ title: "Meeting" })

    dayButton(modal, "2026-10-28").click()

    expect(selectionTime(modal)).toBe("10:30 → 11:00")
  })

  it("offers Next instead of Confirm while only the day is picked", () => {
    const { modal, onSubmit } = openModal({ title: "Meeting" })

    const next = modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__next`)
    expect(next?.textContent).toBe("Next")
    expect(modal.contentEl.querySelector(`${PREFIX}__submit`)).toBeNull()

    next?.click()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__days`)?.hidden).toBe(false)
  })

  it("writes the range and the title on the event being created", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    press(columns(modal)[2], "pointerdown", 600)

    expect(selectionTime(modal)).toBe("10:00 → 10:30")
    expect(selectionTitle(modal)).toBe("Meeting")
  })

  it("falls back to a placeholder when there is no title yet", () => {
    const { modal } = openModal({})
    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`) as HTMLInputElement

    input.value = "Meeting"
    input.dispatchEvent(new Event("input"))
    dayButton(modal, "2026-10-28").click()
    press(columns(modal)[2], "pointerdown", 600)

    expect(selectionTitle(modal)).toBe("Meeting")

    input.value = ""
    input.dispatchEvent(new Event("input"))

    expect(selectionTitle(modal)).toBe("New event")
  })

  it("updates the title on the block while typing", () => {
    const { modal } = openModal({})
    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`) as HTMLInputElement

    input.value = "Standup"
    input.dispatchEvent(new Event("input"))
    dayButton(modal, "2026-10-28").click()

    input.value = "Standup with Anna"
    input.dispatchEvent(new Event("input"))

    expect(selectionTitle(modal)).toBe("Standup with Anna")
  })

  it("sets the end of the event by dragging", () => {
    const { modal, onSubmit } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    const column = columns(modal)[2]
    press(column, "pointerdown", 600)
    press(column, "pointermove", 690)
    column.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }))

    expect(selectionTime(modal)).toContain("10:00 → 11:45")

    confirmButton(modal).click()

    expect(onSubmit.mock.calls[0][0]).toMatchObject({ start: "2026-10-28T10:00:00", end: "2026-10-28T11:45:00" })
  })

  it("keeps the earlier hour first when dragging upwards", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    const column = columns(modal)[2]
    press(column, "pointerdown", 690)
    press(column, "pointermove", 600)

    expect(selectionTime(modal)).toContain("10:00 → 11:45")
  })

  it("moves the start to the picked day and keeps the time", () => {
    const { modal, onSubmit } = openModal({ title: "Meeting" })

    dayButton(modal, "2026-10-19").click()
    press(columns(modal)[0], "pointerdown", 480)
    confirmButton(modal).click()

    expect(onSubmit.mock.calls[0][0]).toMatchObject({ start: "2026-10-19T08:00:00", end: "2026-10-19T08:30:00" })
  })

  it("goes back to the month view", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__back`)?.click()

    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__month`)?.hidden).toBe(false)
  })

  it("asks for a name before showing the calendar", () => {
    const { modal } = openModal()

    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__hint`)?.hidden).toBe(false)
    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__month`)?.hidden).toBe(true)

    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`)
    if (!input) throw new Error("no title input")
    input.value = "Dentist"
    input.dispatchEvent(new Event("input"))

    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__month`)?.hidden).toBe(false)
    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__hint`)?.hidden).toBe(true)
  })

  it("hides the calendar again when the name is cleared", () => {
    const { modal } = openModal()
    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`)
    if (!input) throw new Error("no title input")

    input.value = "Dentist"
    input.dispatchEvent(new Event("input"))
    input.value = "   "
    input.dispatchEvent(new Event("input"))

    expect(modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__month`)?.hidden).toBe(true)
  })

  it("passes the typed name and asks for the link copy", () => {
    const { modal, onSubmit } = openModal()

    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`)
    if (!input) throw new Error("no title input")
    input.value = "Dentist"
    input.dispatchEvent(new Event("input"))

    dayButton(modal, "2026-10-28").click()
    copyButton(modal).click()

    expect(onSubmit).toHaveBeenCalledWith({ title: "Dentist", start: "2026-10-28T10:30:00", end: "2026-10-28T11:00:00" }, "copy-link")
  })

  it("closes after a submit", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    confirmButton(modal).click()

    expect(modal.contentEl.children).toHaveLength(0)
  })

  it("does not offer the copy button when the title comes from the selection", () => {
    const { modal } = openModal({ title: "Meeting" })

    expect(modal.contentEl.querySelector(`${PREFIX}__submit.mod-secondary`)).toBeNull()
  })

  it("marks the days that already have events", () => {
    const { modal } = openModal({ title: "Meeting", eventSource: source([eventAt("2026-10-28T10:00", "2026-10-28T11:00")]) })

    expect(dots(modal, "2026-10-28")).toBe(1)
    expect(dots(modal, "2026-10-29")).toBe(0)
  })

  it("shows at most three dots per day", () => {
    const { modal } = openModal({
      title: "Meeting",
      eventSource: source([
        eventAt("2026-10-28T10:00", "2026-10-28T11:00", "A"),
        eventAt("2026-10-28T11:00", "2026-10-28T12:00", "B"),
        eventAt("2026-10-28T12:00", "2026-10-28T13:00", "C"),
        eventAt("2026-10-28T13:00", "2026-10-28T14:00", "D"),
      ]),
    })

    expect(dots(modal, "2026-10-28")).toBe(3)
  })

  it("draws existing events inside the day grid", () => {
    const { modal } = openModal({ title: "Meeting", eventSource: source([eventAt("2026-10-28T10:00", "2026-10-28T11:00")]) })

    dayButton(modal, "2026-10-28").click()

    const blocks = columns(modal)[2].querySelectorAll(`${PREFIX}__event`)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].getAttribute("title")).toBe("Meeting")
  })

  it("labels a block with the time it starts", () => {
    const { modal } = openModal({ title: "Meeting", eventSource: source([eventAt("2026-10-28T10:00", "2026-10-28T11:00")]) })

    dayButton(modal, "2026-10-28").click()

    const block = columns(modal)[2].querySelector<HTMLElement>(`${PREFIX}__event`)
    expect(block?.querySelector(`${PREFIX}__event-time`)?.textContent).toBe("10:00")
    expect(block?.querySelector(`${PREFIX}__event-title`)?.textContent).toBe("Meeting")
  })

  it("keeps the time next to the title on a short block", () => {
    const { modal } = openModal({
      title: "Meeting",
      eventSource: source([eventAt("2026-10-28T10:00", "2026-10-28T10:15")]),
    })

    dayButton(modal, "2026-10-28").click()

    expect(columns(modal)[2].querySelector<HTMLElement>(`${PREFIX}__event`)?.hasClass("is-compact")).toBe(true)
  })

  it("stacks the time above the title on a long block", () => {
    const { modal } = openModal({ title: "Meeting", eventSource: source([eventAt("2026-10-28T10:00", "2026-10-28T11:00")]) })

    dayButton(modal, "2026-10-28").click()

    expect(columns(modal)[2].querySelector<HTMLElement>(`${PREFIX}__event`)?.hasClass("is-compact")).toBe(false)
  })

  it("puts all day events in their own band", () => {
    const { modal } = openModal({
      title: "Meeting",
      eventSource: source([eventAt("2026-10-28T00:00", "2026-10-29T00:00", "Trip", true)]),
    })

    dayButton(modal, "2026-10-28").click()

    const chips = modal.contentEl.querySelectorAll(`${PREFIX}__all-day`)
    expect(chips).toHaveLength(1)
    expect(chips[0].textContent).toBe("Trip")
    expect(chips[0].parentElement?.hasClass("RemindAir-event-picker__allday-cell")).toBe(true)
    expect(columns(modal)[2].querySelector(`${PREFIX}__event`)).toBeNull()
  })

  it("redraws when the google events arrive", async () => {
    const { modal } = openModal({
      title: "Meeting",
      eventSource: source([], async () => [eventAt("2026-10-28T10:00", "2026-10-28T11:00")]),
    })

    expect(dots(modal, "2026-10-28")).toBe(0)

    await vi.waitFor(() => expect(dots(modal, "2026-10-28")).toBe(1))
  })

  it("stays usable when loading the events fails", async () => {
    const { modal } = openModal({
      title: "Meeting",
      eventSource: source([], async () => {
        throw new Error("offline")
      }),
    })

    await vi.waitFor(() => expect(modal.contentEl.querySelector(`${PREFIX}__month`)).not.toBeNull())
  })

  it("keeps a single tab stop on the selected day", () => {
    const { modal } = openModal({ title: "Meeting" })

    expect(dayButton(modal, "2026-10-28").tabIndex).toBe(0)
    expect(dayButton(modal, "2026-10-29").tabIndex).toBe(-1)
  })

  it("moves the focus with the arrow keys", () => {
    const { modal } = openModal({ title: "Meeting" })
    const day = dayButton(modal, "2026-10-28")

    pressKey(day, "ArrowRight")

    expect(focusedDay()).toBe("2026-10-29")
    expect(dayButton(modal, "2026-10-29").tabIndex).toBe(0)
  })

  it("jumps a week with the up and down arrows", () => {
    const { modal } = openModal({ title: "Meeting" })

    pressKey(dayButton(modal, "2026-10-28"), "ArrowDown")
    expect(focusedDay()).toBe("2026-11-04")

    pressKey(dayButton(modal, "2026-11-04"), "ArrowUp")
    expect(focusedDay()).toBe("2026-10-28")
  })

  it("turns the month over when the arrows leave it", () => {
    const { modal } = openModal({ title: "Meeting" })

    pressKey(dayButton(modal, "2026-11-01"), "ArrowRight")

    expect(focusedDay()).toBe("2026-11-02")
    expect(modal.contentEl.querySelector(`${PREFIX}__month-label`)?.textContent).toContain("2026")
    expect(dayButton(modal, "2026-11-02")).toBeTruthy()
  })

  it("goes back to the previous month with the left arrow", () => {
    const { modal } = openModal({ title: "Meeting" })

    pressKey(dayButton(modal, "2026-10-01"), "ArrowLeft")

    expect(focusedDay()).toBe("2026-09-30")
    expect(modal.contentEl.querySelector(`${PREFIX}__month-label`)?.textContent).toContain("September")
  })

  it("changes the month with page up and page down", () => {
    const { modal } = openModal({ title: "Meeting" })

    pressKey(dayButton(modal, "2026-10-28"), "PageDown")
    expect(focusedDay()).toBe("2026-11-28")

    pressKey(dayButton(modal, "2026-11-28"), "PageUp")
    expect(focusedDay()).toBe("2026-10-28")
  })

  it("clamps the day when the next month is shorter", () => {
    const { modal } = openModal({ title: "Meeting" })

    pressKey(dayButton(modal, "2026-10-31"), "PageDown")

    expect(focusedDay()).toBe("2026-11-30")
  })

  it("jumps to the edges of the week with home and end", () => {
    const { modal } = openModal({ title: "Meeting" })

    pressKey(dayButton(modal, "2026-10-28"), "Home")
    expect(focusedDay()).toBe("2026-10-26")

    pressKey(dayButton(modal, "2026-10-28"), "End")
    expect(focusedDay()).toBe("2026-11-01")
  })

  it("ignores keys it does not handle", () => {
    const { modal } = openModal({ title: "Meeting" })

    pressKey(dayButton(modal, "2026-10-28"), "a")

    expect(focusedDay()).toBe("2026-10-28")
  })

  it("focuses the selected day when the modal opens", () => {
    openModal({ title: "Meeting" })

    expect(focusedDay()).toBe("2026-10-28")
  })

  it("does not steal the focus from the name field", () => {
    const { modal } = openModal()
    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`)

    expect(document.activeElement).toBe(input)
  })

  it("drops into the calendar with the down arrow from the name field", () => {
    const { modal } = openModal()
    const input = modal.contentEl.querySelector<HTMLInputElement>(`${PREFIX}__title-input`)
    if (!input) throw new Error("no title input")
    input.value = "Dentist"
    input.dispatchEvent(new Event("input"))

    pressKey(input, "ArrowDown")

    expect(focusedDay()).toBe("2026-10-28")
  })

  it("keeps working when the focus sits on a nav button", () => {
    const { modal } = openModal({ title: "Meeting" })
    const next = modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__nav[aria-label="Next month"]`)

    pressKey(dayButton(modal, "2026-10-28"), "ArrowRight")
    if (!next) throw new Error("no next button")
    pressKey(next, "ArrowRight")

    expect(focusedDay()).toBe("2026-10-30")
  })

  it("draws the current time on the today column only", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    const line = nowLine(modal, 2)
    expect(line).not.toBeNull()
    expect(nowTop(line as HTMLElement)).toBeCloseTo((607 / 1440) * 100, 4)

    expect(columns(modal).filter((column) => column.querySelector(`${PREFIX}__now`) !== null)).toHaveLength(1)
  })

  it("puts a dot at the start of the current time line", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    expect(nowLine(modal, 2)?.querySelector(`${PREFIX}__now-dot`)).not.toBeNull()
  })

  it("moves the line as the clock runs", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    vi.setSystemTime(new Date(2026, 9, 28, 12, 0))
    vi.advanceTimersByTime(30000)

    expect(nowTop(nowLine(modal, 2) as HTMLElement)).toBeCloseTo(50, 4)
  })

  it("has no line when today is not on screen", () => {
    const { modal } = openModal({ title: "Meeting" })

    modal.contentEl.querySelector<HTMLElement>(`${PREFIX}__day[data-date="2026-10-12"]`)?.click()

    expect(modal.contentEl.querySelectorAll(`${PREFIX}__now`)).toHaveLength(0)
  })

  it("stops the clock when the modal closes", () => {
    const { modal } = openModal({ title: "Meeting" })
    dayButton(modal, "2026-10-28").click()

    modal.close()

    expect(vi.getTimerCount()).toBe(0)
  })

  it("scrolls to the hour before the selection", () => {
    const { modal } = openModal({ title: "Meeting" })

    dayButton(modal, "2026-10-28").click()

    expect(scrollBox(modal)?.scrollTop).toBe(540)
  })

  it("keeps the scroll position when the events arrive", async () => {
    let resolveEvents: (events: PickerEvent[]) => void = () => {}
    const load = () => new Promise<PickerEvent[]>((resolve) => (resolveEvents = resolve))
    const { modal } = openModal({ title: "Meeting", eventSource: source([], load) })

    dayButton(modal, "2026-10-28").click()
    const first = scrollBox(modal)
    if (!first) throw new Error("no scroll box")
    first.scrollTop = 300
    first.dispatchEvent(new Event("scroll"))

    resolveEvents([])
    await vi.waitFor(() => expect(scrollBox(modal)).not.toBe(first))

    expect(scrollBox(modal)?.scrollTop).toBe(300)
  })

  it("handles the arrows even when nothing holds the focus", () => {
    openModal({ title: "Meeting" })
    ;(document.activeElement as HTMLElement | null)?.blur()

    pressKey(document.body, "ArrowRight")

    expect(focusedDay()).toBe("2026-10-29")
  })

  it("stops listening once the modal is closed", () => {
    const { modal } = openModal({ title: "Meeting" })
    modal.close()

    pressKey(document.body, "ArrowRight")

    expect(focusedDay()).toBeNull()
  })
})
