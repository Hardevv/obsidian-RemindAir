import { beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"

const extensions = vi.hoisted(() => ({
  reminder: { name: "reminder-widget" },
  hover: { name: "hover-line-widget" },
}))

vi.mock("src/components/widgets/reminderWidget/reminderWidget", () => ({
  buildReminderWidgetExtension: vi.fn(() => extensions.reminder),
}))

vi.mock("src/components/widgets/inlineActionWidget/inlineActionWidget", () => ({
  buildHoverLineExtension: vi.fn(() => extensions.hover),
}))

import { buildHoverLineExtension } from "src/components/widgets/inlineActionWidget/inlineActionWidget"
import { buildReminderWidgetExtension } from "src/components/widgets/reminderWidget/reminderWidget"
import { registerWidgets } from "src/widgets"

const createPlugin = (inlineActions?: boolean) => {
  const registerEditorExtension = vi.fn()
  const plugin = { settings: { inlineActions }, registerEditorExtension } as unknown as ObsidianNotifierPlugin

  return { plugin, registerEditorExtension }
}

describe("registerWidgets", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("always registers the reminder widget extension", () => {
    const { plugin, registerEditorExtension } = createPlugin(false)

    registerWidgets(plugin)

    expect(buildReminderWidgetExtension).toHaveBeenCalledTimes(1)
    expect(buildReminderWidgetExtension).toHaveBeenCalledWith(plugin)
    expect(registerEditorExtension).toHaveBeenCalledWith(extensions.reminder)
  })

  it("does not register inline actions when they are disabled", () => {
    const { plugin, registerEditorExtension } = createPlugin(false)

    registerWidgets(plugin)

    expect(buildHoverLineExtension).not.toHaveBeenCalled()
    expect(registerEditorExtension).toHaveBeenCalledTimes(1)
  })

  it("registers inline actions when they are enabled", () => {
    const { plugin, registerEditorExtension } = createPlugin(true)

    registerWidgets(plugin)

    expect(buildHoverLineExtension).toHaveBeenCalledTimes(1)
    expect(buildHoverLineExtension).toHaveBeenCalledWith(plugin)
    expect(registerEditorExtension).toHaveBeenCalledWith(extensions.hover)
  })

  it("treats a missing inlineActions setting as disabled", () => {
    const { plugin, registerEditorExtension } = createPlugin(undefined)

    registerWidgets(plugin)

    expect(buildHoverLineExtension).not.toHaveBeenCalled()
    expect(registerEditorExtension).toHaveBeenCalledTimes(1)
  })

  it("builds each extension exactly once per registration", () => {
    const { plugin } = createPlugin(true)

    registerWidgets(plugin)

    expect(buildReminderWidgetExtension).toHaveBeenCalledTimes(1)
    expect(buildHoverLineExtension).toHaveBeenCalledTimes(1)
  })

  it("returns nothing", () => {
    const { plugin } = createPlugin(true)

    expect(registerWidgets(plugin)).toBeUndefined()
  })

  it("registers the reminder widget before the inline actions", () => {
    const { plugin, registerEditorExtension } = createPlugin(true)

    registerWidgets(plugin)

    expect(registerEditorExtension).toHaveBeenCalledTimes(2)
    expect(registerEditorExtension).toHaveBeenNthCalledWith(1, extensions.reminder)
    expect(registerEditorExtension).toHaveBeenNthCalledWith(2, extensions.hover)
  })
})
