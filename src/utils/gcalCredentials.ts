// Values are injected at build time from .env by esbuild.config.mjs.
export const GOOGLE_CLIENT_ID: string = process.env.GOOGLE_CLIENT_ID ?? ""
export const GOOGLE_CLIENT_SECRET: string = process.env.GOOGLE_CLIENT_SECRET ?? ""

export const isGoogleOAuthConfigured = GOOGLE_CLIENT_ID.length > 0
