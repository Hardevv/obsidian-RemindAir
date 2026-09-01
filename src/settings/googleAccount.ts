import type ObsidianNotifierPlugin from "main"
import { Platform, requestUrl } from "obsidian"
import {
  buildAuthUrl,
  createCodeChallenge,
  createCodeVerifier,
  createState,
  decodeIdTokenEmail,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  isTokenExpired,
  parseTokenResponse,
} from "src/google/oauth"
import { startLoopbackServer } from "src/google/loopbackServer"
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, isGoogleOAuthConfigured } from "src/utils/gcalCredentials"

export const isGoogleAccountConnected = (plugin: ObsidianNotifierPlugin): boolean =>
  plugin.settings.googleCalendar.accountEmail.length > 0 && plugin.settings.googleAuth !== null

const formBody = (values: Record<string, string>): string => new URLSearchParams(values).toString()

const openExternal = (url: string): void => {
  const nodeRequire = (window as Window & { require?: NodeRequire }).require ?? (globalThis as { require?: NodeRequire }).require
  let electron: { shell?: { openExternal?: (target: string) => Promise<void> } } | undefined

  try {
    electron = nodeRequire?.("electron")
  } catch {
    electron = undefined
  }

  if (electron?.shell?.openExternal) {
    void electron.shell.openExternal(url)
    return
  }

  window.open(url, "_blank")
}

const requestTokens = async (values: Record<string, string>): Promise<Record<string, unknown>> => {
  const response = await requestUrl({
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: formBody(values),
    throw: false,
  })

  if (response.status >= 400) {
    const error = (response.json as { error?: unknown } | undefined)?.error

    throw new Error(typeof error === "string" ? `Google sign-in failed: ${error}.` : "Google sign-in failed.")
  }

  return (response.json ?? {}) as Record<string, unknown>
}

const fetchAccountEmail = async (accessToken: string): Promise<string> => {
  const response = await requestUrl({
    url: GOOGLE_USERINFO_URL,
    headers: { Authorization: `Bearer ${accessToken}` },
    throw: false,
  })

  if (response.status >= 400) throw new Error("Could not read the Google account email.")

  const email = (response.json as { email?: unknown } | undefined)?.email

  return typeof email === "string" ? email : ""
}

const clientCredentials = (): Record<string, string> => ({
  client_id: GOOGLE_CLIENT_ID,
  ...(GOOGLE_CLIENT_SECRET ? { client_secret: GOOGLE_CLIENT_SECRET } : {}),
})

export const connectGoogleAccount = async (plugin: ObsidianNotifierPlugin): Promise<void> => {
  if (!isGoogleOAuthConfigured) throw new Error("Google OAuth client is not configured in this build.")
  if (!Platform.isDesktopApp) throw new Error("Google sign-in is available in the desktop app only.")

  const state = createState()
  const verifier = createCodeVerifier()
  const challenge = await createCodeChallenge(verifier)
  const server = await startLoopbackServer(state)

  try {
    openExternal(buildAuthUrl({ clientId: GOOGLE_CLIENT_ID, redirectUri: server.redirectUri, codeChallenge: challenge, state }))

    const code = await server.waitForCode
    const response = await requestTokens({
      ...clientCredentials(),
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: server.redirectUri,
    })

    const tokens = parseTokenResponse(response)
    const idToken = typeof response.id_token === "string" ? response.id_token : undefined
    const email = decodeIdTokenEmail(idToken) || (await fetchAccountEmail(tokens.accessToken))

    if (!email) throw new Error("Google did not return the account email.")

    plugin.settings.googleAuth = tokens
    plugin.settings.googleCalendar.accountEmail = email
    await plugin.saveSettings()
  } finally {
    server.close()
  }
}

export const disconnectGoogleAccount = async (plugin: ObsidianNotifierPlugin): Promise<void> => {
  const token = plugin.settings.googleAuth?.refreshToken || plugin.settings.googleAuth?.accessToken

  if (token) {
    try {
      await requestUrl({
        url: GOOGLE_REVOKE_URL,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: formBody({ token }),
        throw: false,
      })
    } catch {
      // Best effort: the local session is cleared even when Google is unreachable.
    }
  }

  plugin.settings.googleAuth = null
  plugin.settings.googleCalendar.accountEmail = ""
  await plugin.saveSettings()
}

export const getGoogleAccessToken = async (plugin: ObsidianNotifierPlugin): Promise<string | null> => {
  const auth = plugin.settings.googleAuth
  if (!auth) return null
  if (!isTokenExpired(auth)) return auth.accessToken
  if (!auth.refreshToken) return null

  const response = await requestTokens({
    ...clientCredentials(),
    refresh_token: auth.refreshToken,
    grant_type: "refresh_token",
  })

  const tokens = parseTokenResponse(response, Date.now(), auth.refreshToken)
  plugin.settings.googleAuth = tokens
  await plugin.saveSettings()

  return tokens.accessToken
}
