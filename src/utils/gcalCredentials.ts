// Values are injected at build time from .env by esbuild.config.mjs.
export const GOOGLE_CLIENT_ID: string = process.env.GOOGLE_CLIENT_ID ?? ""

// Desktop app clients do not need a secret. Web application clients do, so keep it optional.
export const GOOGLE_CLIENT_SECRET: string = process.env.GOOGLE_CLIENT_SECRET ?? ""

export const isGoogleOAuthConfigured = GOOGLE_CLIENT_ID.length > 0
