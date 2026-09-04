import { describe, expect, it } from "vitest"
import {
  buildAuthUrl,
  createCodeChallenge,
  createCodeVerifier,
  createState,
  decodeIdTokenEmail,
  hasGoogleScopes,
  isTokenExpired,
  parseTokenResponse,
} from "./oauth"

const makeIdToken = (claims: Record<string, unknown>): string => {
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

  return `header.${payload}.signature`
}

describe("createCodeVerifier", () => {
  it("returns a url-safe string with a valid length", () => {
    expect(createCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
  })

  it("returns a new value each time", () => {
    expect(createCodeVerifier()).not.toBe(createCodeVerifier())
  })
})

describe("createState", () => {
  it("returns a url-safe string", () => {
    expect(createState()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe("createCodeChallenge", () => {
  it("matches the RFC 7636 example", async () => {
    await expect(createCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    )
  })
})

describe("buildAuthUrl", () => {
  const url = new URL(
    buildAuthUrl({
      clientId: "client-id",
      redirectUri: "http://127.0.0.1:41234",
      codeChallenge: "challenge",
      state: "state",
    }),
  )

  it("points at the Google consent page", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
  })

  it("sends the authorization code request with PKCE", () => {
    expect(url.searchParams.get("client_id")).toBe("client-id")
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:41234")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")).toBe(
      "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks.readonly",
    )
    expect(url.searchParams.get("state")).toBe("state")
    expect(url.searchParams.get("code_challenge")).toBe("challenge")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
  })

  it("asks for a refresh token", () => {
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("prompt")).toBe("consent")
  })
})

describe("parseTokenResponse", () => {
  const now = 1_700_000_000_000

  it("maps the token response", () => {
    expect(parseTokenResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid" }, now)).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: now + 3_600_000,
      scope: "openid",
    })
  })

  it("keeps the previous refresh token when Google does not return a new one", () => {
    expect(parseTokenResponse({ access_token: "at" }, now, "old-rt").refreshToken).toBe("old-rt")
  })

  it("keeps the previous scope when Google does not return a new one", () => {
    expect(parseTokenResponse({ access_token: "at" }, now, "old-rt", "openid calendar").scope).toBe("openid calendar")
  })

  it("falls back to an hour when the expiry is missing", () => {
    expect(parseTokenResponse({ access_token: "at" }, now).expiresAt).toBe(now + 3_600_000)
  })

  it("throws when the access token is missing", () => {
    expect(() => parseTokenResponse({}, now)).toThrow("Google did not return an access token.")
  })
})

describe("hasGoogleScopes", () => {
  it("is true when all required scopes are granted", () => {
    expect(hasGoogleScopes("openid email https://www.googleapis.com/auth/calendar.readonly", ["openid", "email"])).toBe(true)
  })

  it("is false when a required scope is missing", () => {
    expect(hasGoogleScopes("openid email", ["openid", "https://www.googleapis.com/auth/calendar.readonly"])).toBe(false)
  })
})

describe("decodeIdTokenEmail", () => {
  it("reads the email claim", () => {
    expect(decodeIdTokenEmail(makeIdToken({ email: "me@example.com" }))).toBe("me@example.com")
  })

  it("returns an empty string for missing or broken tokens", () => {
    expect(decodeIdTokenEmail(undefined)).toBe("")
    expect(decodeIdTokenEmail("broken")).toBe("")
    expect(decodeIdTokenEmail(makeIdToken({ sub: "123" }))).toBe("")
  })
})

describe("isTokenExpired", () => {
  const now = 1_700_000_000_000

  it("is false with more than a minute left", () => {
    expect(isTokenExpired({ expiresAt: now + 120_000 }, now)).toBe(false)
  })

  it("is true within the expiry margin", () => {
    expect(isTokenExpired({ expiresAt: now + 30_000 }, now)).toBe(true)
    expect(isTokenExpired({ expiresAt: now }, now)).toBe(true)
  })
})
