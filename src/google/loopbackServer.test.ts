import { describe, expect, it } from "vitest"
import { startLoopbackServer } from "./loopbackServer"

describe("startLoopbackServer", () => {
  it("resolves the authorization code from the callback", async () => {
    const server = await startLoopbackServer("expected-state")

    const response = await fetch(`${server.redirectUri}/?code=auth-code&state=expected-state`)

    expect(response.status).toBe(200)
    await expect(server.waitForCode).resolves.toBe("auth-code")
    server.close()
  })

  it("rejects a callback with a mismatched state", async () => {
    const server = await startLoopbackServer("expected-state")
    const result = expect(server.waitForCode).rejects.toThrow("Invalid Google sign-in response.")

    const response = await fetch(`${server.redirectUri}/?code=auth-code&state=wrong`)

    expect(response.status).toBe(400)
    await result
    server.close()
  })

  it("rejects a callback with an error", async () => {
    const server = await startLoopbackServer("expected-state")
    const result = expect(server.waitForCode).rejects.toThrow("Google sign-in was cancelled.")

    const response = await fetch(`${server.redirectUri}/?error=access_denied&state=expected-state`)

    expect(response.status).toBe(400)
    await result
    server.close()
  })
})
