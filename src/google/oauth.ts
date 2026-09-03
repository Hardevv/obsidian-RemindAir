import { base64UrlDecode, base64UrlEncode } from "src/utils/base64"
import { randomString } from "src/utils/random"

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
}

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks.readonly"
export const GOOGLE_SCOPES = ["openid", "email", "profile", GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE]

const TOKEN_EXPIRY_MARGIN_MS = 60_000

export const createCodeVerifier = (): string => randomString(64)

export const createState = (): string => randomString(32)

export const createCodeChallenge = async (verifier: string): Promise<string> => {
  const { createHash } = await import("crypto")

  return base64UrlEncode(new Uint8Array(createHash("sha256").update(verifier).digest()))
}

export interface AuthUrlOptions {
  clientId: string
  redirectUri: string
  codeChallenge: string
  state: string
}

export const buildAuthUrl = ({ clientId, redirectUri, codeChallenge, state }: AuthUrlOptions): string => {
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent")

  return url.toString()
}

export const parseTokenResponse = (response: unknown, now = Date.now(), previousRefreshToken = ""): OAuthTokens => {
  const data = (response ?? {}) as Record<string, unknown>
  const accessToken = typeof data.access_token === "string" ? data.access_token : ""
  if (!accessToken) throw new Error("Google did not return an access token.")

  const expiresIn = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600
  const refreshToken = typeof data.refresh_token === "string" && data.refresh_token.length > 0 ? data.refresh_token : previousRefreshToken

  return {
    accessToken,
    refreshToken,
    expiresAt: now + expiresIn * 1000,
    scope: typeof data.scope === "string" ? data.scope : "",
  }
}

export const decodeIdTokenEmail = (idToken?: string): string => {
  if (!idToken) return ""

  const payload = idToken.split(".")[1]
  if (!payload) return ""

  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as { email?: unknown }

    return typeof claims.email === "string" ? claims.email : ""
  } catch {
    return ""
  }
}

export const isTokenExpired = (tokens: Pick<OAuthTokens, "expiresAt">, now = Date.now()): boolean =>
  tokens.expiresAt <= now + TOKEN_EXPIRY_MARGIN_MS
