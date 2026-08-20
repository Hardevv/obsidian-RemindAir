// Injected at build time from .env by esbuild.config.mjs.
export const DEV_OPEN_SETTINGS = (process.env.DEV_OPEN_SETTINGS ?? "").toLowerCase() === "true";
