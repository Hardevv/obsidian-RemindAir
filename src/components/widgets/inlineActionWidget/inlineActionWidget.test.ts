import { setIcon } from "obsidian"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"

vi.mock("src/commands", () => ({ setReminderFunc: vi.fn() }))
vi.mock("src/utils/reminders", () => ({ addHoursToReminder: vi.fn() }))

import { setReminderFunc } from "src/commands"
import { PLUGIN_NAME } from "src/utils/constants"
import { addHoursToReminder } from "src/utils/reminders"
import { buildHoverLineExtension, HoverWidget } from "./inlineActionWidget"
import type { HoveredLine } from "./inlineActionWidget.types"

const mockedSetIcon = vi.mocked(setIcon)

const createPlugin = () => ({ settings: {} }) as unknown as ObsidianNotifierPlugin

const createHoveredLine = (overrides: Partial<HoveredLine> = {}): HoveredLine => ({
  lineNumber: 3,
  hasReminder: false,
  from: 0,
  to: 10,
  ...overrides,
})

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>(`.${PLUGIN_NAME}_inline-button-action`))

describe("HoverWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders an empty wrapper without a hovered line", () => {
    const el = new HoverWidget(createPlugin(), null).toDOM()

    expect(el.classList.contains(`${PLUGIN_NAME}_inline-actions-wrapper`)).toBe(true)
    expect(buttons(el)).toHaveLength(0)
  })

  it("renders +1h and -1h actions for a line with a reminder", () => {
    const el = new HoverWidget(createPlugin(), createHoveredLine({ hasReminder: true })).toDOM()
    const rendered = buttons(el)

    expect(rendered).toHaveLength(2)
    expect(rendered.map((button) => button.textContent)).toEqual(["+1h", "-1h"])
    expect(rendered.map((button) => button.querySelector("span")?.className)).toEqual([
      `${PLUGIN_NAME}_inline-button-text`,
      `${PLUGIN_NAME}_inline-button-text`,
    ])
  })

  it("renders a single add action for a line without a reminder", () => {
    const el = new HoverWidget(createPlugin(), createHoveredLine({ hasReminder: false })).toDOM()
    const rendered = buttons(el)

    expect(rendered).toHaveLength(1)
    expect(rendered[0].querySelector("span")).toBeNull()
    expect(mockedSetIcon).toHaveBeenCalledWith(rendered[0], "bell-plus")
  })

  it("adds an hour when +1h is clicked", () => {
    const plugin = createPlugin()
    const el = new HoverWidget(plugin, createHoveredLine({ hasReminder: true })).toDOM()

    buttons(el)[0].dispatchEvent(new Event("click"))

    expect(addHoursToReminder).toHaveBeenCalledWith(plugin, 2, 1)
  })

  it("subtracts an hour when -1h is clicked", () => {
    const plugin = createPlugin()
    const el = new HoverWidget(plugin, createHoveredLine({ hasReminder: true })).toDOM()

    buttons(el)[1].dispatchEvent(new Event("click"))

    expect(addHoursToReminder).toHaveBeenCalledWith(plugin, 2, -1)
  })

  it("starts the reminder editor for the hovered line", () => {
    const plugin = createPlugin()
    const el = new HoverWidget(plugin, createHoveredLine({ hasReminder: false })).toDOM()

    buttons(el)[0].dispatchEvent(new Event("click"))

    expect(setReminderFunc).toHaveBeenCalledWith(plugin, 2)
  })

  it("does not call any action before a button is pressed", () => {
    new HoverWidget(createPlugin(), createHoveredLine({ hasReminder: true })).toDOM()

    expect(addHoursToReminder).not.toHaveBeenCalled()
    expect(setReminderFunc).not.toHaveBeenCalled()
  })
})

describe("buildHoverLineExtension", () => {
  it("returns a CodeMirror view plugin", () => {
    const extension = buildHoverLineExtension(createPlugin())

    expect(extension).toBeDefined()
    expect(extension.extension).toBeDefined()
  })
})
