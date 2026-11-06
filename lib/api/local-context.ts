/** Single-user local persistence is served only to the loopback app origin. */
export function localPersistenceRequestAllowed(input: Pick<Headers, "get">): boolean {
  const host = input.get("host");
  if (!host || host.includes(",")) return false;
  try {
    const protocol = input.get("x-forwarded-proto") || "http";
    if (!["http", "https"].includes(protocol)) return false;
    const target = new URL(`${protocol}://${host}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
      target.username || target.password || target.pathname !== "/" || target.search || target.hash) return false;
    const site = input.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site)) return false;
    const origin = input.get("origin");
    if (origin) {
      const source = new URL(origin);
      if (source.origin !== target.origin ||
        source.username || source.password || source.pathname !== "/" || source.search || source.hash) return false;
    }
    const forwardedHost = input.get("x-forwarded-host");
    return !forwardedHost || forwardedHost === target.host;
  } catch {
    return false;
  }
}
