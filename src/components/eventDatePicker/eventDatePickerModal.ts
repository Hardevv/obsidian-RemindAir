import type ObsidianNotifierPlugin from "main"
import { Modal, setIcon } from "obsidian"
import { formatLocalDateTime } from "src/utils/dates"
import { PLUGIN_NAME } from "src/utils/constants"
import {
  COMPACT_EVENT_MINUTES,
  HOURS_IN_DAY,
  HOUR_HEIGHT,
  MINUTES_IN_DAY,
  SLOT_MINUTES,
  addDays,
  addMinutes,
  atMinutes,
  clampMinutes,
  dayColumns,
  dayKey,
  dayOverlap,
  daysHeaderLabel,
  durationMinutes,
  formatHourLabel,
  formatTime,
  isSameDay,
  layoutRanges,
  minutesAtPointer,
  minutesFromMidnight,
  monthCells,
  monthLabel,
  moveToDay,
  parseDayKey,
  rangeKey,
  scrollOffsetFor,
  sameDayInMonth,
  snapDown,
  snapUp,
  startOfDay,
  timeRangeLabel,
  weekdayLabel,
} from "./grid"
import { mergeEvents, type PickerEvent, type PickerEventSource, type PickerRange } from "./eventSources"

export type EventDatePickerAction = "confirm" | "copy-link"

export interface EventDatePickerResult {
  title: string
  start: string
  end: string
}

export interface EventDatePickerOptions {
  /** Fixed title, usually the selection. When missing the modal asks for a name first. */
  title?: string | null
  initialStart?: Date
  dayCount?: number
  eventSource?: PickerEventSource
  onSubmit: (result: EventDatePickerResult, action: EventDatePickerAction) => unknown
}

const DEFAULT_DURATION_MINUTES = 30
const START_LEAD_MINUTES = 15
const NARROW_DAY_COUNT = 3
const WIDE_DAY_COUNT = 7
const NARROW_WIDTH = 700

const cls = (suffix: string): string => `${PLUGIN_NAME}-event-picker__${suffix}`

interface Column {
  date: Date
  el: HTMLElement
}

export class EventDatePickerModal extends Modal {
  private plugin: ObsidianNotifierPlugin
  private options: EventDatePickerOptions
  private titleMode: boolean
  private title: string
  private mode: "month" | "days" = "month"
  private monthAnchor: Date
  private anchorDate: Date
  private focusedDay: Date
  private from: Date
  private to: Date
  private dragging = false
  private dragAnchor: Date | null = null
  private dragColumn: Column | null = null
  private columns: Column[] = []
  private cleanups: (() => void)[] = []
  private titleInput: HTMLInputElement | null = null
  private monthEl!: HTMLElement
  private daysEl!: HTMLElement
  private footerEl!: HTMLElement
  private hintEl!: HTMLElement
  private scrollEl!: HTMLElement
  private nowEl: HTMLElement | null = null
  private scrollTop = 0
  private nowTimer: number | null = null
  private events: PickerEvent[] = []
  private fetched = new Map<string, PickerEvent[]>()
  private pending = new Set<string>()
  private closed = false
  private eventsDirty = false

  constructor(plugin: ObsidianNotifierPlugin, options: EventDatePickerOptions) {
    super(plugin.app)
    this.plugin = plugin
    this.options = options
    this.titleMode = !options.title
    this.title = options.title ?? ""

    const initial = options.initialStart ?? new Date()
    // Default to a half hour slot that starts in a quarter of an hour.
    const startMinutes = Math.min(
      snapUp(minutesFromMidnight(initial)) + START_LEAD_MINUTES,
      MINUTES_IN_DAY - DEFAULT_DURATION_MINUTES,
    )
    this.from = atMinutes(startOfDay(initial), startMinutes)
    this.to = addMinutes(this.from, DEFAULT_DURATION_MINUTES)
    this.anchorDate = startOfDay(initial)
    this.focusedDay = this.anchorDate
    this.monthAnchor = new Date(initial.getFullYear(), initial.getMonth(), 1)

    this.modalEl.addClass(`${PLUGIN_NAME}-event-picker-modal`)
    this.titleEl.textContent = "New calendar event"
  }

  onOpen(): void {
    this.closed = false
    this.render()

    // Without a focused day the arrows go to the document and never reach the grid.
    if (this.titleInput) this.titleInput.focus()
    else if (this.calendarVisible) this.syncMonthFocus()
  }

  onClose(): void {
    this.closed = true
    this.runCleanups()
    this.contentEl.empty()
  }

  private get time24(): boolean {
    return this.plugin.settings.timeFormat !== "12h"
  }

  private get weekStartsOn(): 0 | 1 {
    return this.plugin.settings.startWeekFrom === "sunday" ? 0 : 1
  }

  private get dayCount(): number {
    if (this.options.dayCount) return this.options.dayCount

    return window.innerWidth < NARROW_WIDTH ? NARROW_DAY_COUNT : WIDE_DAY_COUNT
  }

  private get calendarVisible(): boolean {
    return !this.titleMode || this.title.trim().length > 0
  }

  private render(): void {
    this.runCleanups()
    this.contentEl.empty()

    const root = this.contentEl.createDiv({
      cls: `${PLUGIN_NAME}-event-picker ${this.mode === "month" ? "is-month" : "is-days"}`,
    })
    root.style.setProperty("--remindair-hour-height", `${HOUR_HEIGHT}px`)

    if (this.titleMode) this.renderTitle(root)

    this.hintEl = root.createDiv({ cls: cls("hint"), text: "Type a name to pick a date." })
    this.monthEl = root.createDiv({ cls: cls("month") })
    this.daysEl = root.createDiv({ cls: cls("days") })
    this.footerEl = root.createDiv({ cls: cls("footer") })

    this.events = this.currentEvents()
    this.renderMonth()
    this.renderDays()
    this.renderFooter()
    this.syncVisibility()
    this.loadEvents()

    // One listener for the whole modal, so a mode change cannot leave two of them behind.
    const onKeydown = (event: KeyboardEvent) => {
      if (this.mode === "month") this.onMonthKeydown(event)
      else this.onDaysKeydown(event)
    }
    document.addEventListener("keydown", onKeydown)
    this.cleanups.push(() => document.removeEventListener("keydown", onKeydown))
  }

  private renderTitle(root: HTMLElement): void {
    const field = root.createDiv({ cls: cls("title-field") })
    const input = field.createEl("input", {
      cls: cls("title-input"),
      type: "text",
      placeholder: "Event name",
    })

    input.value = this.title
    input.addEventListener("input", () => {
      this.title = input.value
      this.syncVisibility()
      if (this.mode === "days") this.renderOverlays()
    })
    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" && this.calendarVisible) {
        event.preventDefault()
        this.syncMonthFocus()

        return
      }

      if (event.key !== "Enter") return
      event.preventDefault()
      if (!this.calendarVisible) return

      if (this.mode === "month") this.openDay(this.focusedDay)
      else this.submit("confirm")
    })

    this.titleInput = input
  }

  private syncVisibility(): void {
    const visible = this.calendarVisible

    this.hintEl.hidden = visible
    this.monthEl.hidden = !visible || this.mode !== "month"
    this.daysEl.hidden = !visible || this.mode !== "days"
    this.footerEl.hidden = !visible
  }

  private renderMonth(): void {
    this.monthEl.empty()

    const header = this.monthEl.createDiv({ cls: cls("month-header") })
    const nav = header.createDiv({ cls: cls("month-nav") })
    this.iconButton(nav, "chevron-left", "Previous month", () => this.shiftMonth(-1))
    nav.createSpan({ cls: cls("month-label"), text: monthLabel(this.monthAnchor) })
    this.iconButton(nav, "chevron-right", "Next month", () => this.shiftMonth(1))

    const grid = this.monthEl.createDiv({ cls: cls("month-grid") })
    const cells = monthCells(this.monthAnchor, this.weekStartsOn)

    for (const cell of cells.slice(0, 7)) {
      grid.createDiv({ cls: cls("weekday"), text: weekdayLabel(cell.date) })
    }

    const today = new Date()
    for (const cell of cells) {
      const button = grid.createEl("button", { cls: cls("day"), attr: { "data-date": dayKey(cell.date) } })
      button.textContent = String(cell.date.getDate())
      button.tabIndex = isSameDay(cell.date, this.focusedDay) ? 0 : -1

      if (!cell.inMonth) button.addClass("is-outside")
      if (isSameDay(cell.date, today)) button.addClass("is-today")
      if (isSameDay(cell.date, this.anchorDate)) button.addClass("is-selected")
      if (cell.date.getDay() === 0 || cell.date.getDay() === 6) button.addClass("is-weekend")

      const dayEvents = this.eventsOn(cell.date)
      const dots = button.createDiv({ cls: cls("dots") })
      for (let index = 0; index < Math.min(dayEvents.length, 3); index++) dots.createSpan({ cls: cls("dot") })
      if (dayEvents.length > 0) button.setAttr("aria-label", `${button.textContent}, ${dayEvents.length} events`)

      button.addEventListener("click", () => this.openDay(cell.date))
    }

    // Roving tabindex keeps a single stop in the grid, and the arrows move that stop.
    const reachable = grid.querySelector<HTMLElement>(`.${cls("day")}[tabindex="0"]`)
    if (!reachable) {
      const fallback = grid.querySelector<HTMLElement>(`.${cls("day")}:not(.is-outside)`)
      if (fallback) fallback.tabIndex = 0
    }

  }

  private onDaysKeydown(event: KeyboardEvent): void {
    if (this.closed || !this.modalEl.isConnected) return
    if (this.mode !== "days" || !this.calendarVisible) return
    if (event.key !== "Enter") return
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, button, a")) return

    event.preventDefault()
    this.submit("confirm")
  }

  private onMonthKeydown(event: KeyboardEvent): void {
    if (this.closed || !this.modalEl.isConnected) return
    if (this.mode !== "month" || !this.calendarVisible) return
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea")) return

    const key = event.target instanceof HTMLElement ? event.target.dataset.date : undefined
    const current = (key ? parseDayKey(key) : null) ?? this.focusedDay

    const weekOffset = (current.getDay() - this.weekStartsOn + 7) % 7
    let next: Date

    switch (event.key) {
      case "ArrowLeft":
        next = addDays(current, -1)
        break
      case "ArrowRight":
        next = addDays(current, 1)
        break
      case "ArrowUp":
        next = addDays(current, -7)
        break
      case "ArrowDown":
        next = addDays(current, 7)
        break
      case "Home":
        next = addDays(current, -weekOffset)
        break
      case "End":
        next = addDays(current, 6 - weekOffset)
        break
      case "PageUp":
        next = sameDayInMonth(current, current.getFullYear(), current.getMonth() - 1)
        break
      case "PageDown":
        next = sameDayInMonth(current, current.getFullYear(), current.getMonth() + 1)
        break
      case "Enter":
        // A focused day button handles Enter on its own, this covers the rest of the view.
        if (event.target instanceof HTMLElement && event.target.closest("button")) return
        event.preventDefault()
        this.openDay(current)

        return
      default:
        return
    }

    event.preventDefault()
    this.focusDay(next)
  }

  private focusDay(day: Date): void {
    this.focusedDay = startOfDay(day)

    const sameMonth =
      this.focusedDay.getFullYear() === this.monthAnchor.getFullYear() && this.focusedDay.getMonth() === this.monthAnchor.getMonth()

    if (!sameMonth) {
      this.monthAnchor = new Date(this.focusedDay.getFullYear(), this.focusedDay.getMonth(), 1)
      this.render()
    }

    this.syncMonthFocus()
  }

  private syncMonthFocus(): void {
    for (const button of Array.from(this.monthEl.querySelectorAll<HTMLElement>(`.${cls("day")}`))) {
      button.tabIndex = button.dataset.date === dayKey(this.focusedDay) ? 0 : -1
    }

    this.monthEl.querySelector<HTMLElement>(`.${cls("day")}[tabindex="0"]`)?.focus()
  }

  private renderDays(): void {
    this.daysEl.empty()
    this.nowEl = null

    const days = dayColumns(this.anchorDate, this.dayCount, this.weekStartsOn)
    const header = this.daysEl.createDiv({ cls: cls("days-header") })

    const left = header.createDiv({ cls: `${cls("days-side")} is-left` })
    const back = left.createEl("button", { cls: cls("back"), text: "Month" })
    back.addEventListener("click", () => {
      this.mode = "month"
      this.render()
      this.syncMonthFocus()
    })

    const nav = header.createDiv({ cls: cls("days-nav") })
    this.iconButton(nav, "chevron-left", "Previous days", () => this.shiftDays(-this.dayCount))
    nav.createSpan({ cls: cls("days-label"), text: daysHeaderLabel(days) })
    this.iconButton(nav, "chevron-right", "Next days", () => this.shiftDays(this.dayCount))

    header.createDiv({ cls: `${cls("days-side")} is-right` })

    this.scrollEl = this.daysEl.createDiv({ cls: cls("scroll") })

    const onScroll = () => {
      this.scrollTop = this.scrollEl.scrollTop
    }
    this.scrollEl.addEventListener("scroll", onScroll)
    this.cleanups.push(() => this.scrollEl.removeEventListener("scroll", onScroll))

    const inner = this.scrollEl.createDiv({ cls: cls("days-inner") })

    // The header lives inside the scroller so the scrollbar cannot shift it against the columns.
    const head = inner.createDiv({ cls: cls("columns-head") })
    const headRow = head.createDiv({ cls: cls("columns-head-row") })
    headRow.createDiv({ cls: cls("gutter-head") })

    const today = new Date()
    const allDay = days.map((day) => this.eventsOn(day).filter((event) => event.allDay))

    for (const day of days) {
      const cell = headRow.createDiv({ cls: cls("day-head") })
      cell.createSpan({ cls: cls("day-head-weekday"), text: weekdayLabel(day) })
      cell.createSpan({ cls: cls("day-head-number"), text: String(day.getDate()) })
      if (isSameDay(day, today)) cell.addClass("is-today")
    }

    // All day events get their own band, so they never look like a timed block.
    if (allDay.some((events) => events.length > 0)) {
      const row = head.createDiv({ cls: `${cls("columns-head-row")} is-allday` })
      row.createDiv({ cls: cls("gutter-head"), text: "all day" })

      for (const events of allDay) {
        const cell = row.createDiv({ cls: cls("allday-cell") })
        for (const event of events) {
          cell.createDiv({ cls: cls("all-day"), text: event.title, attr: { title: event.title } })
        }
      }
    }

    const body = inner.createDiv({ cls: cls("columns-body") })

    const gutter = body.createDiv({ cls: cls("gutter") })
    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      gutter.createDiv({ cls: cls("hour"), text: formatHourLabel(hour, this.time24) })
    }

    const grid = body.createDiv({ cls: cls("columns") })
    grid.style.height = `${HOUR_HEIGHT * HOURS_IN_DAY}px`

    this.columns = days.map((date, index) => {
      const el = grid.createDiv({ cls: cls("column"), attr: { "data-day-index": String(index) } })

      return { date, el }
    })

    this.renderColumnEvents()
    this.renderNow()
    this.renderOverlays()
    this.bindPointer(grid)

    // Restore after the columns exist, otherwise the element has no height to scroll yet.
    this.scrollEl.scrollTop = this.scrollTop

    if (this.mode === "days") this.startNowTimer()
  }

  private renderFooter(): void {
    this.footerEl.empty()

    const actions = this.footerEl.createDiv({ cls: cls("actions") })

    const cancel = actions.createEl("button", { cls: cls("cancel"), text: "Cancel" })
    cancel.addEventListener("click", () => this.close())

    // The month view only picks the day, so it cannot confirm an event yet.
    if (this.mode === "month") {
      const next = actions.createEl("button", { cls: `${cls("next")} mod-cta`, text: "Next" })
      next.addEventListener("click", () => this.openDay(this.anchorDate))

      return
    }

    if (this.titleMode) {
      const copy = actions.createEl("button", { cls: `${cls("submit")} mod-secondary`, text: "Confirm & copy link" })
      copy.addEventListener("click", () => this.submit("copy-link"))
    }

    const confirm = actions.createEl("button", { cls: `${cls("submit")} mod-cta`, text: "Confirm" })
    confirm.addEventListener("click", () => this.submit("confirm"))
  }

  private renderOverlays(): void {
    for (const column of this.columns) {
      column.el.querySelectorAll(`.${cls("selection")}`).forEach((node) => node.remove())

      const overlap = dayOverlap(this.from, this.to, column.date)
      if (!overlap) continue

      const block = column.el.createDiv({ cls: cls("selection") })
      block.style.top = `${(overlap.start / MINUTES_IN_DAY) * 100}%`
      block.style.height = `${((overlap.end - overlap.start) / MINUTES_IN_DAY) * 100}%`

      if (isSameDay(column.date, this.from)) block.addClass("is-start")
      if (isSameDay(column.date, this.to)) block.addClass("is-end")

      block.createSpan({ cls: cls("selection-time"), text: timeRangeLabel(this.from, this.to, this.time24) })
      const title = block.createSpan({ cls: cls("selection-title"), text: this.title.trim() || "New event" })
      if (!this.title.trim()) title.addClass("is-placeholder")
    }
  }

  private renderColumnEvents(): void {
    for (const column of this.columns) {
      column.el.querySelectorAll(`.${cls("event")}`).forEach((node) => node.remove())

      const placed = this.eventsOn(column.date)
        .filter((event) => !event.allDay)
        .map((event) => ({ event, overlap: dayOverlap(event.start, event.end, column.date) }))
        .filter((entry): entry is { event: PickerEvent; overlap: { start: number; end: number } } => entry.overlap !== null)

      const layout = layoutRanges(placed.map((entry) => entry.overlap))

      placed.forEach(({ event, overlap }, index) => {
        const { lane, lanes } = layout[index]
        const block = column.el.createDiv({ cls: cls("event"), attr: { title: event.title } })
        const minutes = overlap.end - overlap.start

        block.style.top = `${(overlap.start / MINUTES_IN_DAY) * 100}%`
        block.style.height = `${Math.max(2, (minutes / MINUTES_IN_DAY) * 100)}%`
        block.style.left = `${(lane / lanes) * 100}%`
        block.style.width = `${(1 / lanes) * 100}%`

        // Short blocks have room for one line only, so the time sits next to the title.
        if (minutes < COMPACT_EVENT_MINUTES) block.addClass("is-compact")

        block.createSpan({ cls: cls("event-time"), text: formatTime(atMinutes(column.date, overlap.start), this.time24) })
        block.createSpan({ cls: cls("event-title"), text: event.title })
      })
    }
  }

  /** A red line on the today column, the way calendar apps show the current time. */
  private renderNow(): void {
    const now = new Date()
    const column = this.columns.find((entry) => isSameDay(entry.date, now))
    if (!column) return

    this.nowEl = column.el.createDiv({ cls: cls("now") })
    this.nowEl.createDiv({ cls: cls("now-dot") })
    this.updateNow()
  }

  private updateNow(): void {
    if (!this.nowEl) return

    const minutes = minutesFromMidnight(new Date())
    this.nowEl.style.top = `${(minutes / MINUTES_IN_DAY) * 100}%`
  }

  private startNowTimer(): void {
    this.stopNowTimer()
    this.nowTimer = window.setInterval(() => this.updateNow(), 30000)
    this.cleanups.push(() => this.stopNowTimer())
  }

  private stopNowTimer(): void {
    if (this.nowTimer === null) return

    window.clearInterval(this.nowTimer)
    this.nowTimer = null
  }

  private eventsOn(day: Date): PickerEvent[] {
    return this.events.filter((event) => dayOverlap(event.start, event.end, day) !== null)
  }

  private visibleRange(): PickerRange {
    const days =
      this.mode === "month"
        ? monthCells(this.monthAnchor, this.weekStartsOn).map((cell) => cell.date)
        : dayColumns(this.anchorDate, this.dayCount, this.weekStartsOn)

    return { start: startOfDay(days[0]), end: addDays(startOfDay(days[days.length - 1]), 1) }
  }

  private currentEvents(): PickerEvent[] {
    const source = this.options.eventSource
    if (!source) return []

    const range = this.visibleRange()
    const loaded = this.fetched.get(rangeKey(range.start, range.end)) ?? []

    return mergeEvents(source.cached(range), loaded)
  }

  private loadEvents(): void {
    const source = this.options.eventSource
    if (!source) return

    const range = this.visibleRange()
    const key = rangeKey(range.start, range.end)
    if (this.fetched.has(key) || this.pending.has(key)) return

    this.pending.add(key)
    void source
      .load(range)
      .then((events) => {
        this.pending.delete(key)
        this.fetched.set(key, events)
        if (this.closed) return

        if (this.dragging) {
          this.eventsDirty = true

          return
        }

        this.render()
      })
      .catch(() => {
        this.pending.delete(key)
      })
  }

  private bindPointer(grid: HTMLElement): void {
    const down = (event: PointerEvent) => this.onPointerDown(event)
    const move = (event: PointerEvent) => this.onPointerMove(event)
    const up = () => this.onPointerUp()

    grid.addEventListener("pointerdown", down)
    grid.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)

    this.cleanups.push(() => {
      grid.removeEventListener("pointerdown", down)
      grid.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    })
  }

  private runCleanups(): void {
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups = []
  }

  private onPointerDown(event: PointerEvent): void {
    const column = this.columnAt(event.target)
    if (!column) return

    event.preventDefault()

    const minutes = this.pointerMinutes(column, event.clientY)
    this.dragAnchor = atMinutes(column.date, minutes)
    this.dragColumn = column
    this.dragging = true
    this.from = this.dragAnchor
    this.to = addMinutes(this.from, DEFAULT_DURATION_MINUTES)

    this.renderOverlays()
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.dragAnchor) return

    const column = this.columnAt(event.target) ?? this.dragColumn
    if (!column) return

    event.preventDefault()

    const point = atMinutes(column.date, this.pointerMinutes(column, event.clientY))
    const anchor = this.dragAnchor

    this.from = point < anchor ? point : anchor
    this.to = addMinutes(point < anchor ? anchor : point, SLOT_MINUTES)

    this.renderOverlays()
  }

  private onPointerUp(): void {
    if (!this.dragging) return

    this.dragging = false
    this.dragAnchor = null
    this.dragColumn = null

    if (!this.eventsDirty) return

    this.eventsDirty = false
    this.render()
  }

  private pointerMinutes(column: Column, clientY: number): number {
    const top = column.el.getBoundingClientRect().top
    const raw = minutesAtPointer(clientY, top)

    return clampMinutes(snapDown(raw))
  }

  private columnAt(target: EventTarget | null): Column | null {
    if (!(target instanceof Element)) return null

    const el = target.closest<HTMLElement>(`.${cls("column")}`)
    if (!el) return null

    return this.columns[Number(el.dataset.dayIndex)] ?? null
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const button = parent.createEl("button", { cls: `${cls("nav")} clickable-icon`, attr: { "aria-label": label } })
    setIcon(button, icon)
    button.addEventListener("click", onClick)
  }

  private shiftMonth(delta: number): void {
    const year = this.monthAnchor.getFullYear()
    const month = this.monthAnchor.getMonth() + delta

    this.monthAnchor = new Date(year, month, 1)
    this.focusedDay = sameDayInMonth(this.focusedDay, year, month)
    this.render()
    this.syncMonthFocus()
  }

  private shiftDays(delta: number): void {
    this.anchorDate = addDays(this.anchorDate, delta)
    this.render()
  }

  private openDay(day: Date): void {
    this.anchorDate = startOfDay(day)
    this.focusedDay = this.anchorDate
    this.from = moveToDay(this.from, this.anchorDate)
    this.to = addMinutes(this.from, this.duration)
    this.mode = "days"
    this.render()
    this.scrollToSelection()
  }

  private get duration(): number {
    return Math.max(SLOT_MINUTES, durationMinutes(this.from, this.to))
  }

  private scrollToSelection(): void {
    this.scrollTop = scrollOffsetFor(this.from)
    this.scrollEl.scrollTop = this.scrollTop
  }

  private submit(action: EventDatePickerAction): void {
    const title = this.title.trim() || "Untitled event"
    const end = this.to.getTime() > this.from.getTime() ? this.to : addMinutes(this.from, DEFAULT_DURATION_MINUTES)

    void this.options.onSubmit({ title, start: formatLocalDateTime(this.from), end: formatLocalDateTime(end) }, action)
    this.close()
  }
}
