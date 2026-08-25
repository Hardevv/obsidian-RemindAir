import { setIcon } from "obsidian"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActionButton } from "src/atoms/actionButton"
import { PLUGIN_NAME } from "src/utils/constants"

const mockedSetIcon = vi.mocked(setIcon)

describe("createActionButton", () => {
  beforeEach(() => {
    mockedSetIcon.mockClear()
  })

  it("creates a button with the plugin action class", () => {
    const button = createActionButton("clock", () => {})

    expect(button.tagName).toBe("BUTTON")
    expect(button.classList.contains(`${PLUGIN_NAME}_inline-button-action`)).toBe(true)
  })

  it("renders the requested icon via setIcon", () => {
    const button = createActionButton("bell-plus", () => {})

    expect(mockedSetIcon).toHaveBeenCalledTimes(1)
    expect(mockedSetIcon).toHaveBeenCalledWith(button, "bell-plus")
  })

  it("calls onClick on both click and pointerdown", () => {
    const onClick = vi.fn()
    const button = createActionButton("clock", onClick)

    button.dispatchEvent(new Event("click"))
    expect(onClick).toHaveBeenCalledTimes(1)

    button.dispatchEvent(new Event("pointerdown"))
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it("does not add a label span when text is omitted", () => {
    const button = createActionButton("clock", () => {})

    expect(button.querySelector("span")).toBeNull()
  })

  it("does not add a label span when text is empty", () => {
    const button = createActionButton("clock", () => {}, "")

    expect(button.querySelector("span")).toBeNull()
  })

  it("adds a label span with text and class when text is provided", () => {
    const button = createActionButton("clock", () => {}, "+1h")
    const span = button.querySelector("span")

    expect(span).not.toBeNull()
    expect(span?.textContent).toBe("+1h")
    expect(span?.classList.contains(`${PLUGIN_NAME}_inline-button-text`)).toBe(true)
  })

  it("keeps the button clickable after adding a label", () => {
    const onClick = vi.fn()
    const button = createActionButton("clock", onClick, "-1h")

    button.dispatchEvent(new Event("click"))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
