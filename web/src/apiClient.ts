export type ApiErrorBody = { error?: unknown };

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

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
      throw new ApiRequestError(message, response.status);
    }
    return body as T;
  };
}

/** Default cookie-authenticated JSON request using the configured API base. */
export const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
export const request = createApiClient(API);
