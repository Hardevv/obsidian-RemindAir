import { describe, expect, it } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { isGoogleAccountConnected } from "src/settings/googleAccount"

const createPlugin = (accountEmail: string) => ({ settings: { googleCalendar: { accountEmail } } }) as unknown as ObsidianNotifierPlugin

describe("isGoogleAccountConnected", () => {
  it("is false when no account email is stored", () => {
    expect(isGoogleAccountConnected(createPlugin(""))).toBe(false)
  })

  it("is true when an account email is stored", () => {
    expect(isGoogleAccountConnected(createPlugin("me@example.com"))).toBe(true)
  })
})
