export type ApiErrorBody = { error?: unknown };
/** Creates the shared cookie-authenticated JSON API request function used by the web client. */
export function createApiClient(apiBase: string, fetcher?: typeof fetch) {
  let base = apiBase;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await (fetcher ?? fetch)(`${base}${path}`, {
      ...init, credentials: "include",
      headers: { "content-type": "application/json", ...init.headers },
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body &&
        typeof (body as ApiErrorBody).error === "string"
        ? (body as { error: string }).error : "The request failed.";
      throw new Error(message);
    }
    return body as T;
  };
}
