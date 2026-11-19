/**
 * Same-origin API proxy for the static Vite app.
 *
 * Configure API_ORIGIN as a private Vercel environment variable, for example:
 * https://arctester.onrender.com
 */
export default async function handler(req: any, res: any): Promise<void> {
  const origin = process.env.API_ORIGIN?.trim().replace(/\/+$/, "");
  if (!origin) {
    res.status(500).json({ error: "API_ORIGIN is not configured." });
    return;
  }

  const incomingUrl = new URL(req.url || "/api", "https://vercel.internal");
  const upstreamPath = incomingUrl.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  const target = new URL(origin + upstreamPath);
  target.search = incomingUrl.search;

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (value == null || ["host", "connection", "content-length"].includes(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }

  let body: Buffer | undefined;
  if (!["GET", "HEAD"].includes(String(req.method || "GET").toUpperCase())) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (chunks.length) body = Buffer.concat(chunks);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    res.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (["connection", "content-length", "content-encoding", "transfer-encoding"].includes(name.toLowerCase())) return;
      res.setHeader(name, value);
    });
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.end(payload);
  } catch (error) {
    console.error("API proxy request failed:", error);
    res.status(502).json({ error: "The API service could not be reached." });
  }
}
