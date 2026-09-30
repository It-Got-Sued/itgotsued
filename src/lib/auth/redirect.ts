/** Only follow same-site relative paths after login, never "//evil.com" or absolute URLs. */
export function safeNext(value: unknown, fallback: string): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
