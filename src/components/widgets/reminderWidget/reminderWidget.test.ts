import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"

vi.mock("src/utils/reminders", () => ({
  openReminderEditor: vi.fn(),
  replaceReminderById: vi.fn(),
}))

import { buildReminderWidgetExtension, ReminderWidget } from "./reminderWidget"
import { PLUGIN_NAME } from "src/utils/constants"
import { openReminderEditor, replaceReminderById } from "src/utils/reminders"

const createEditor = () => ({ id: "editor" })

const createPlugin = (timeFormat: "24h" | "12h" = "24h", editor = createEditor()) => {
  const getActiveViewOfType = vi.fn(() => ({ editor }))
  const plugin = {
    settings: { timeFormat },
    app: { workspace: { getActiveViewOfType } },
  } as unknown as ObsidianNotifierPlugin

  return { plugin, editor }
}

const createWidget = (date: string, timeFormat: "24h" | "12h" = "24h", id = "3-a") => {
  const { plugin, editor } = createPlugin(timeFormat)
  const widget = new ReminderWidget(plugin, id, date)

  return { widget, plugin, editor }
}

describe("ReminderWidget", () => {
  describe("toDOM", () => {
    it("renders the emoji, the date and a delete button", () => {
      const { widget } = createWidget("2026-11-02T10:30")
      const el = widget.toDOM()

      expect(el.classList.contains(`${PLUGIN_NAME}-reminder-widget`)).toBe(true)
      expect(el.querySelector(`.${PLUGIN_NAME}-reminder-widget-emoji`)?.textContent).toBe("🔔")
      expect(el.querySelector(`.${PLUGIN_NAME}-reminder-widget-date`)?.textContent).toContain("10:30")
      expect(el.querySelector(`.${PLUGIN_NAME}-reminder-widget-delete-btn`)).not.toBeNull()
    })

    it("exposes the widget as an accessible button", () => {
      const { widget } = createWidget("2026-11-02T10:30", "24h", "7-q")
      const el = widget.toDOM()

      expect(el.getAttribute("role")).toBe("button")
      expect(el.tabIndex).toBe(0)
      expect(el.getAttribute("aria-label")).toContain("r-7-q")
    })

    it("marks past reminders", () => {
      const { widget } = createWidget("2020-01-01T10:00")

      expect(widget.toDOM().classList.contains(`${PLUGIN_NAME}-reminder-widget-past`)).toBe(true)
    })

    it("does not mark future reminders as past", () => {
      const { widget } = createWidget("2999-01-01T10:00")

      expect(widget.toDOM().classList.contains(`${PLUGIN_NAME}-reminder-widget-past`)).toBe(false)
    })

    it("opens the editor when clicked", () => {
      const { widget, plugin } = createWidget("2026-11-02T10:30", "24h", "3-a")

      widget.toDOM().dispatchEvent(new Event("click"))

      expect(openReminderEditor).toHaveBeenCalledWith(plugin, "3-a", "2026-11-02T10:30")
    })

    it("opens the editor on Enter and Space", () => {
      const { widget, plugin } = createWidget("2026-11-02T10:30", "24h", "3-a")
      const el = widget.toDOM()

      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
      el.dispatchEvent(new KeyboardEvent("keydown", { key: " " }))

      expect(openReminderEditor).toHaveBeenCalledTimes(2)
      expect(openReminderEditor).toHaveBeenCalledWith(plugin, "3-a", "2026-11-02T10:30")
    })

    it("ignores other keys", () => {
      const { widget } = createWidget("2026-11-02T10:30")

      widget.toDOM().dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))

      expect(openReminderEditor).not.toHaveBeenCalled()
    })

    it("removes the reminder from the delete button without opening the editor", () => {
      const { widget, editor } = createWidget("2026-11-02T10:30", "24h", "3-a")
      const el = widget.toDOM()
      const deleteBtn = el.querySelector(`.${PLUGIN_NAME}-reminder-widget-delete-btn`)

      deleteBtn?.dispatchEvent(new Event("click", { bubbles: true }))

      expect(replaceReminderById).toHaveBeenCalledWith(editor, "3-a", null)
      expect(openReminderEditor).not.toHaveBeenCalled()
    })
  })

  describe("eq", () => {
    it("is true for the same reminder and format", () => {
      const { widget } = createWidget("2026-11-02T10:30")
      const other = new ReminderWidget(createPlugin("24h").plugin, "3-a", "2026-11-02T10:30")

      expect(widget.eq(other)).toBe(true)
    })

    it("is false for a different id, date or format", () => {
      const { widget } = createWidget("2026-11-02T10:30")
      const plugin = createPlugin("24h").plugin

      expect(widget.eq(new ReminderWidget(plugin, "4-b", "2026-11-02T10:30"))).toBe(false)
      expect(widget.eq(new ReminderWidget(plugin, "3-a", "2026-11-02T11:30"))).toBe(false)
      expect(widget.eq(new ReminderWidget(createPlugin("12h").plugin, "3-a", "2026-11-02T10:30"))).toBe(false)
    })
  })

  it("ignores widget events", () => {
    const { widget } = createWidget("2026-11-02T10:30")

    expect(widget.ignoreEvent()).toBe(true)
  })

  describe("formatDate", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 10, 2, 12, 0))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("hides the date parts for today", () => {
      const { widget } = createWidget("2026-11-02T10:30")

      expect(widget.formatDate("2026-11-02T10:30")).toEqual({ year: null, month: null, day: "", hours: "10", minutes: "30" })
    })

    it("shows the weekday for a future day in the current week", () => {
      const { widget } = createWidget("2026-11-04T10:30")
      const result = widget.formatDate("2026-11-04T10:30")

      expect(result.year).toBeNull()
      expect(result.month).toBeNull()
      expect(result.day).toBe(new Date(2026, 10, 4).toLocaleString("default", { weekday: "short" }))
    })

    it("shows day, month and year outside the current week", () => {
      const { widget } = createWidget("2026-12-15T10:30")
      const result = widget.formatDate("2026-12-15T10:30")

      expect(result.day).toBe("15")
      expect(result.month).toBe(new Date(2026, 11, 15).toLocaleString("default", { month: "short" }))
      expect(result.year).toBe(2026)
    })

    it("uses 24h time by default", () => {
      const { widget } = createWidget("2026-11-02T14:05")

      expect(widget.formatDate("2026-11-02T14:05")).toMatchObject({ hours: "14", minutes: "05" })
    })

    it("uses 12h time with the day period when configured", () => {
      const { widget } = createWidget("2026-11-02T14:05", "12h")

      expect(widget.formatDate("2026-11-02T14:05")).toMatchObject({ hours: "02", minutes: "05 PM" })
    })
  })
})

describe("buildReminderWidgetExtension", () => {
  it("returns a CodeMirror view plugin", () => {
    const { plugin } = createPlugin()
    const extension = buildReminderWidgetExtension(plugin)

    expect(extension).toBeDefined()
    expect(extension.extension).toBeDefined()
  })
})
