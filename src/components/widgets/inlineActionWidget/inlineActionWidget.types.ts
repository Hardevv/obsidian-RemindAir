import type ObsidianNotifierPlugin from "main"

export interface HoveredLine {
  lineNumber: number
  hasReminder: boolean
  from: number
  to: number
}

export interface InlineAction {
  icon: string
  text?: string
  cb: (plugin: ObsidianNotifierPlugin, lineNumber?: number) => void
}
