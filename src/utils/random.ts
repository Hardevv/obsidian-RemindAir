import { base64UrlEncode } from "./base64"

export const randomString = (size: number): string => {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)

  return base64UrlEncode(bytes)
}
