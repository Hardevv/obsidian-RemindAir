import { describe, expect, it } from "vitest"
import { base64UrlDecode, base64UrlEncode } from "src/utils/base64"

describe("base64UrlEncode", () => {
  it("uses the url-safe alphabet without padding", () => {
    const encoded = base64UrlEncode(new Uint8Array([251, 255, 190]))

    expect(encoded).toBe("-_--")
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it("round-trips with the decoder", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252])

    expect(base64UrlDecode(base64UrlEncode(bytes))).toBe(String.fromCharCode(...bytes))
  })
})

describe("base64UrlDecode", () => {
  it("decodes a value without padding", () => {
    expect(base64UrlDecode("YWJj")).toBe("abc")
  })
})
