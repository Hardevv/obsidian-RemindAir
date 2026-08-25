import type ObsidianNotifierPlugin from "main"
import { buildHoverLineExtension } from "src/components/widgets/inlineActionWidget/inlineActionWidget"
import { buildReminderWidgetExtension } from "src/components/widgets/reminderWidget/reminderWidget"

export const registerWidgets = (plugin: ObsidianNotifierPlugin): void => {
  plugin.registerEditorExtension(buildReminderWidgetExtension(plugin))
  if (plugin.settings.inlineActions) plugin.registerEditorExtension(buildHoverLineExtension(plugin))
}
