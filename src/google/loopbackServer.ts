import type { IncomingMessage, ServerResponse } from "http"
import type { AddressInfo } from "net"

export interface LoopbackServer {
  redirectUri: string
  waitForCode: Promise<string>
  close: () => void
}

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

const respond = (response: ServerResponse, status: number, message: string): void => {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" })
  response.end(`<!doctype html><html><body><p>${message}</p></body></html>`)
}

export const startLoopbackServer = async (state: string): Promise<LoopbackServer> => {
  const { createServer } = await import("http")

  let resolveCode!: (code: string) => void
  let rejectCode!: (error: Error) => void
  const waitForCode = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  let settled = false
  const lifecycle: { closed: boolean; timeout?: ReturnType<typeof setTimeout> } = { closed: false }

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (settled) {
      respond(response, 409, "Sign-in was already handled.")
      return
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const error = url.searchParams.get("error")
    const code = url.searchParams.get("code")
    const receivedState = url.searchParams.get("state")

    if (error) {
      settled = true
      respond(response, 400, "Google sign-in was cancelled. You can close this window.")
      rejectCode(new Error("Google sign-in was cancelled."))
      return
    }

    if (!code || receivedState !== state) {
      settled = true
      respond(response, 400, "Invalid sign-in response. You can close this window.")
      rejectCode(new Error("Invalid Google sign-in response."))
      return
    }

    settled = true
    respond(response, 200, "Google account connected. You can close this window.")
    resolveCode(code)
  })

  const close = (): void => {
    if (lifecycle.closed) return

    lifecycle.closed = true
    if (lifecycle.timeout) clearTimeout(lifecycle.timeout)
    server.close()
  }

  lifecycle.timeout = setTimeout(() => {
    if (settled) return

    settled = true
    rejectCode(new Error("Google sign-in timed out."))
    close()
  }, SIGN_IN_TIMEOUT_MS)

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
  } catch (error) {
    close()
    throw error
  }

  const { port } = server.address() as AddressInfo

  return {
    redirectUri: `http://127.0.0.1:${port}`,
    waitForCode,
    close,
  }
}
