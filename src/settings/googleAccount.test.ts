import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type ObsidianNotifierPlugin from "main"
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian"
import type { GoogleAuthState, PluginSettings } from "src/types"

const loopback = vi.hoisted(() => ({
  startLoopbackServer: vi.fn(),
}))

vi.mock("src/google/loopbackServer", () => ({ startLoopbackServer: loopback.startLoopbackServer }))

vi.mock("src/utils/gcalCredentials", () => ({
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "client-secret",
  isGoogleOAuthConfigured: true,
}))

import { connectGoogleAccount, disconnectGoogleAccount, getGoogleAccessToken, isGoogleAccountConnected } from "src/settings/googleAccount"

const response = (json: unknown, status = 200): RequestUrlResponse => ({
  status,
  json,
  text: JSON.stringify(json),
  arrayBuffer: new ArrayBuffer(0),
  headers: {},
})

const requestParams = (index: number): RequestUrlParam => vi.mocked(requestUrl).mock.calls[index][0] as RequestUrlParam

const makeIdToken = (email: string): string => {
  const payload = btoa(JSON.stringify({ email })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

  return `header.${payload}.signature`
}

const createServer = () => ({
  redirectUri: "http://127.0.0.1:41234",
  waitForCode: Promise.resolve("auth-code"),
  close: vi.fn(),
})

const createPlugin = (googleAuth: GoogleAuthState | null = null, accountEmail = "") => {
  const saveSettings = vi.fn(async () => {})
  const plugin = {
    settings: {
      idCounter: 0,
      inlineActions: true,
      timeFormat: "24h",
      startWeekFrom: "monday",
      googleAuth,
      googleCalendar: {
        accountEmail,
        pullCalendars: "primary",
        pullDays: 60,
        autoSyncMinutes: 0,
        addObsidianLink: true,
        taskListName: "@default",
      },
    } as PluginSettings,
    saveSettings,
  } as unknown as ObsidianNotifierPlugin

  return { plugin, saveSettings }
}

const authState = (overrides: Partial<GoogleAuthState> = {}): GoogleAuthState => ({
  accessToken: "stored-access-token",
  refreshToken: "stored-refresh-token",
  expiresAt: Date.now() + 3_600_000,
  scope: "openid email",
  ...overrides,
})

describe("isGoogleAccountConnected", () => {
  it("is false when no account email is stored", () => {
    expect(isGoogleAccountConnected(createPlugin(authState()).plugin)).toBe(false)
  })

  it("is false when the email is stored without tokens", () => {
    expect(isGoogleAccountConnected(createPlugin(null, "me@example.com").plugin)).toBe(false)
  })

  it("is true when the email and the tokens are stored", () => {
    expect(isGoogleAccountConnected(createPlugin(authState(), "me@example.com").plugin)).toBe(true)
  })
})

describe("connectGoogleAccount", () => {
  let server: ReturnType<typeof createServer>

  beforeEach(() => {
    vi.clearAllMocks()
    server = createServer()
    loopback.startLoopbackServer.mockResolvedValue(server)
    vi.spyOn(window, "open").mockImplementation(() => null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("opens the Google consent page with PKCE", async () => {
    const { plugin } = createPlugin()
    vi.mocked(requestUrl).mockResolvedValue(
      response({ access_token: "at", refresh_token: "rt", expires_in: 3600, id_token: makeIdToken("me@example.com") }),
    )

    await connectGoogleAccount(plugin)

    const authUrl = new URL(vi.mocked(window.open).mock.calls[0][0] as string)
    expect(authUrl.origin + authUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(authUrl.searchParams.get("client_id")).toBe("client-id.apps.googleusercontent.com")
    expect(authUrl.searchParams.get("redirect_uri")).toBe(server.redirectUri)
    expect(authUrl.searchParams.get("response_type")).toBe("code")
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256")
    expect(authUrl.searchParams.get("access_type")).toBe("offline")
    expect(authUrl.searchParams.get("state")).toBeTruthy()
    expect(authUrl.searchParams.get("code_challenge")).toBeTruthy()
  })

  it("stores the tokens and the account email", async () => {
    const { plugin, saveSettings } = createPlugin()
    vi.mocked(requestUrl).mockResolvedValue(
      response({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: "openid email",
        id_token: makeIdToken("me@example.com"),
      }),
    )

    await connectGoogleAccount(plugin)

    expect(plugin.settings.googleAuth).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      scope: "openid email",
    })
    expect(plugin.settings.googleCalendar.accountEmail).toBe("me@example.com")
    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(server.close).toHaveBeenCalledTimes(1)
  })

  it("exchanges the code with the verifier and the client credentials", async () => {
    const { plugin } = createPlugin()
    vi.mocked(requestUrl).mockResolvedValue(response({ access_token: "at", refresh_token: "rt", id_token: makeIdToken("me@example.com") }))

    await connectGoogleAccount(plugin)

    const body = new URLSearchParams(requestParams(0).body as string)
    expect(body.get("grant_type")).toBe("authorization_code")
    expect(body.get("code")).toBe("auth-code")
    expect(body.get("client_id")).toBe("client-id.apps.googleusercontent.com")
    expect(body.get("client_secret")).toBe("client-secret")
    expect(body.get("code_verifier")).toBeTruthy()
    expect(body.get("redirect_uri")).toBe(server.redirectUri)
  })

  it("reads the email from the userinfo endpoint when the id token has none", async () => {
    const { plugin } = createPlugin()
    vi.mocked(requestUrl)
      .mockResolvedValueOnce(response({ access_token: "at", refresh_token: "rt" }))
      .mockResolvedValueOnce(response({ email: "fallback@example.com" }))

    await connectGoogleAccount(plugin)

    expect(plugin.settings.googleCalendar.accountEmail).toBe("fallback@example.com")
    expect(requestParams(1).url).toBe("https://www.googleapis.com/oauth2/v3/userinfo")
  })

  it("throws when Google rejects the token exchange", async () => {
    const { plugin, saveSettings } = createPlugin()
    vi.mocked(requestUrl).mockResolvedValue(response({ error: "invalid_grant" }, 400))

    await expect(connectGoogleAccount(plugin)).rejects.toThrow("invalid_grant")
    expect(plugin.settings.googleAuth).toBeNull()
    expect(saveSettings).not.toHaveBeenCalled()
    expect(server.close).toHaveBeenCalledTimes(1)
  })
})

describe("disconnectGoogleAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requestUrl).mockResolvedValue(response({}))
  })

  it("revokes the token and clears the local session", async () => {
    const { plugin, saveSettings } = createPlugin(authState(), "me@example.com")

    await disconnectGoogleAccount(plugin)

    expect(requestParams(0).url).toBe("https://oauth2.googleapis.com/revoke")
    expect(new URLSearchParams(requestParams(0).body as string).get("token")).toBe("stored-refresh-token")
    expect(plugin.settings.googleAuth).toBeNull()
    expect(plugin.settings.googleCalendar.accountEmail).toBe("")
    expect(saveSettings).toHaveBeenCalledTimes(1)
  })

  it("clears the local session when Google is unreachable", async () => {
    const { plugin } = createPlugin(authState(), "me@example.com")
    vi.mocked(requestUrl).mockRejectedValue(new Error("offline"))

    await disconnectGoogleAccount(plugin)

    expect(plugin.settings.googleAuth).toBeNull()
    expect(plugin.settings.googleCalendar.accountEmail).toBe("")
  })
})

describe("getGoogleAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null without a stored session", async () => {
    const { plugin } = createPlugin()

    await expect(getGoogleAccessToken(plugin)).resolves.toBeNull()
    expect(requestUrl).not.toHaveBeenCalled()
  })

  it("returns the stored token while it is valid", async () => {
    const { plugin } = createPlugin(authState())

    await expect(getGoogleAccessToken(plugin)).resolves.toBe("stored-access-token")
    expect(requestUrl).not.toHaveBeenCalled()
  })

  it("refreshes an expired token", async () => {
    const { plugin, saveSettings } = createPlugin(authState({ expiresAt: 0 }))
    vi.mocked(requestUrl).mockResolvedValue(response({ access_token: "new-token", expires_in: 3600 }))

    await expect(getGoogleAccessToken(plugin)).resolves.toBe("new-token")
    expect(plugin.settings.googleAuth).toMatchObject({
      accessToken: "new-token",
      refreshToken: "stored-refresh-token",
    })
    expect(saveSettings).toHaveBeenCalledTimes(1)
  })

  it("returns null for an expired token without a refresh token", async () => {
    const { plugin } = createPlugin(authState({ expiresAt: 0, refreshToken: "" }))

    await expect(getGoogleAccessToken(plugin)).resolves.toBeNull()
    expect(requestUrl).not.toHaveBeenCalled()
  })
})
