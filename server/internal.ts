/**
 * Calls the REST handlers in-process, so MCP tools and the AI setup use exactly the same
 * validation and audit trail as the web app.
 */
import { handleApi } from "./api";

export class ApiCallError extends Error {}

export async function callApi<T>(
  actor: string,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, unknown>,
): Promise<T> {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const req = new Request(`http://irtrack.local/api${path}${qs}`, {
    method,
    headers: { "content-type": "application/json", "x-irtrack-actor": encodeURIComponent(actor) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handleApi(req, path);
  const data = (await res.json()) as T;
  if (!res.ok)
    throw new ApiCallError((data as { error?: string } | null)?.error ?? `API error ${res.status}`);
  return data;
}
