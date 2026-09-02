import { describe, expect, it } from "vitest"
import { randomString } from "src/utils/random"

describe("randomString", () => {
  it("returns a url-safe string of the requested byte length", () => {
    const value = randomString(64)

    expect(value).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(value.length).toBeGreaterThanOrEqual(64)
  })

  it("returns a new value each time", () => {
    expect(randomString(32)).not.toBe(randomString(32))
  })
})
