import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { PLUGIN_NAME } from "src/utils/constants"

interface FlatpickrInstance {
  calendarContainer: HTMLElement
  input: HTMLInputElement
  parseDate: ReturnType<typeof vi.fn>
}

const flatpickrMock = vi.hoisted(() => {
  const state = {
    instance: null as FlatpickrInstance | null,
    flatpickr: null as unknown as ReturnType<typeof vi.fn>,
  }

  state.flatpickr = vi.fn(() => {
    const calendarContainer = document.createElement("div")
    const time = document.createElement("div")
    const hour = document.createElement("input")
    const minute = document.createElement("input")

    time.className = "flatpickr-time"
    hour.className = "flatpickr-hour"
    minute.className = "flatpickr-minute"
    time.append(hour, minute)
    calendarContainer.appendChild(time)
    document.body.appendChild(calendarContainer)

    const instance: FlatpickrInstance = {
      calendarContainer,
      input: document.createElement("input"),
      parseDate: vi.fn(() => new Date(2026, 10, 2, 10, 30)),
    }
    state.instance = instance

    return instance
  })

  return state
})

vi.mock("flatpickr", () => ({ default: flatpickrMock.flatpickr }))

import { DateTimePicker } from "./dateTimePickerModal"

const createPlugin = (overrides: Record<string, unknown> = {}) =>
  ({ app: {}, settings: { timeFormat: "24h", startWeekFrom: "monday", ...overrides } }) as unknown as ObsidianNotifierPlugin

const createPicker = (options: { date?: string | null; onDelete?: (() => void) | null; settings?: Record<string, unknown> } = {}) => {
  const onSubmit = vi.fn()
  const picker = new DateTimePicker(createPlugin(options.settings), onSubmit, options.date ?? null, options.onDelete ?? null)

  return { picker, onSubmit }
}

const currentInstance = () => {
  if (!flatpickrMock.instance) throw new Error("flatpickr was not called")
  return flatpickrMock.instance
}

const openPicker = (picker: DateTimePicker) => {
  picker.open()
  return currentInstance()
}

describe("DateTimePicker", () => {
  beforeEach(() => {
    flatpickrMock.flatpickr.mockClear()
    flatpickrMock.instance = null
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("marks the modal and sets its title", () => {
    const { picker } = createPicker()

    expect(picker.modalEl.classList.contains(`${PLUGIN_NAME}-date-time-picker-modal`)).toBe(true)
    expect(picker.titleEl.textContent).toBe("Select reminder date & time")
  })

  it("creates the date input and configures flatpickr for 24h and monday", () => {
    const { picker } = createPicker()

    openPicker(picker)

    expect(picker.contentEl.querySelector(`.${PLUGIN_NAME}-date-time-input`)).not.toBeNull()
    const options = flatpickrMock.flatpickr.mock.calls[0][1]
    expect(options).toMatchObject({
      time_24hr: true,
      enableTime: true,
      inline: true,
      dateFormat: "Y-m-d H:i",
      allowInput: true,
      locale: { firstDayOfWeek: 1 },
    })
  })

  it("configures flatpickr for 12h and sunday", () => {
    const { picker } = createPicker({ settings: { timeFormat: "12h", startWeekFrom: "sunday" } })

    openPicker(picker)

    const options = flatpickrMock.flatpickr.mock.calls[0][1]
    expect(options.time_24hr).toBe(false)
    expect(options.locale).toEqual({ firstDayOfWeek: 0 })
  })

  it("defaults to 15 minutes from now when no date is given", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 2, 12, 0))
    const { picker } = createPicker()

    openPicker(picker)

    expect(flatpickrMock.flatpickr.mock.calls[0][1].defaultDate).toEqual(new Date(2026, 10, 2, 12, 15))
  })

  it("uses the given date as the default", () => {
    const { picker } = createPicker({ date: "2026-11-02T10:30" })

    openPicker(picker)

    expect(flatpickrMock.flatpickr.mock.calls[0][1].defaultDate).toEqual(new Date(2026, 10, 2, 10, 30))
  })

  it("marks weekend days", () => {
    const { picker } = createPicker()

    openPicker(picker)
    const onDayCreate = flatpickrMock.flatpickr.mock.calls[0][1].onDayCreate

    const saturday = { dateObj: new Date(2026, 10, 7), classList: { add: vi.fn() } }
    const monday = { dateObj: new Date(2026, 10, 9), classList: { add: vi.fn() } }
    onDayCreate(null, null, null, saturday)
    onDayCreate(null, null, null, monday)

    expect(saturday.classList.add).toHaveBeenCalledWith("weekend")
    expect(monday.classList.add).not.toHaveBeenCalled()
  })

  it("submits the selected date and closes", () => {
    vi.useFakeTimers()
    const { picker, onSubmit } = createPicker()
    const instance = openPicker(picker)
    instance.input.value = "2026-11-02 10:30"

    picker.contentEl.querySelector<HTMLButtonElement>(`.${PLUGIN_NAME}_datetime-picker-modal-confirm-button`)?.click()
    vi.runAllTimers()

    expect(onSubmit).toHaveBeenCalledWith("2026-11-02T10:30")
    expect(picker.contentEl.children).toHaveLength(0)
  })

  it("submits when Enter is pressed in the minutes input", () => {
    vi.useFakeTimers()
    const { picker, onSubmit } = createPicker()
    const instance = openPicker(picker)
    instance.input.value = "2026-11-02 10:30"

    const minuteInput = instance.calendarContainer.querySelector<HTMLInputElement>(".flatpickr-minute")
    minuteInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }))
    vi.runAllTimers()

    expect(onSubmit).toHaveBeenCalledWith("2026-11-02T10:30")
  })

  it("moves focus to minutes when Enter is pressed in the hours input", () => {
    const { picker } = createPicker()
    const instance = openPicker(picker)
    const hourInput = instance.calendarContainer.querySelector<HTMLInputElement>(".flatpickr-hour")
    const minuteInput = instance.calendarContainer.querySelector<HTMLInputElement>(".flatpickr-minute")

    hourInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }))

    expect(document.activeElement).toBe(minuteInput)
  })

  it("does not render a delete button without a delete handler", () => {
    const { picker } = createPicker()

    openPicker(picker)

    expect(picker.contentEl.querySelector(`.${PLUGIN_NAME}_datetime-picker-modal-trash-button`)).toBeNull()
  })

  it("calls the delete handler and closes", () => {
    const onDelete = vi.fn()
    const { picker, onSubmit } = createPicker({ onDelete })
    openPicker(picker)

    picker.contentEl.querySelector<HTMLButtonElement>(`.${PLUGIN_NAME}_datetime-picker-modal-trash-button`)?.click()

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(picker.contentEl.children).toHaveLength(0)
  })

  it("clears the content when closed", () => {
    const { picker } = createPicker()
    openPicker(picker)

    picker.close()

    expect(picker.contentEl.children).toHaveLength(0)
  })
})
