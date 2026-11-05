import type { Repositories } from "../ports";
import { currentActor } from "@/auth/actor";

/** REST adapter for the IRTrack server (server/), served from the same origin under /api. Endpoints follow docs/api-contract.md. */
const BASE = "/api";

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-IRTrack-Actor": encodeURIComponent(currentActor().name),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const msg = await res.json().then(
      (j: { error?: string }) => j.error,
      () => undefined,
    );
    throw new Error(msg ?? `API ${method} ${path} failed with ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
const qs = (o: object) =>
  "?" +
  new URLSearchParams(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

export const apiRepositories: Repositories = {
  incidents: {
    list: (q) => http("GET", `/incidents${qs(q)}`),
    get: (id) => http("GET", `/incidents/${encodeURIComponent(id)}`),
    create: (i) => http("POST", "/incidents", i),
    update: (id, patch, summary, highlight) =>
      http("PATCH", `/incidents/${id}`, { patch, summary, highlight }),
    activate: (id, a) => http("POST", `/incidents/${id}/activations`, a),
    reapplyRules: (id) => http("POST", `/incidents/${id}/deadlines/reapply`),
    track: (ref) => http("GET", `/public/track/${encodeURIComponent(ref)}`),
  },
  analytics: { dashboard: (f) => http("GET", `/analytics/dashboard${qs(f)}`) },
  contacts: {
    list: (o) => http("GET", `/contacts${qs(o ?? {})}`),
    save: (id, c) => (id ? http("PUT", `/contacts/${id}`, c) : http("POST", "/contacts", c)),
    archive: (id, archived) => http("POST", `/contacts/${id}/archive`, { archived }),
    move: (id, dir) => http("POST", `/contacts/${id}/move`, { dir }),
    verify: (id) => http("POST", `/contacts/${id}/verify`),
    importCsv: (csv) => http("POST", "/contacts/import", { csv }),
  },
  roles: {
    list: () => http("GET", "/roles"),
    save: (r) => http("PUT", `/roles/${r.id}`, r),
    raci: (p) => http("GET", `/raci${qs({ processId: p })}`),
    setRaci: (a) => http("PUT", `/raci/${a.id}`, a),
  },
  processes: {
    list: () => http("GET", "/processes"),
    save: (p) => http("PUT", `/processes/${p.id}`, p),
  },
  guidance: {
    list: () => http("GET", "/guidance"),
    get: (id) => http("GET", `/guidance/${encodeURIComponent(id)}`),
    saveDraft: (id, c) => http("PUT", `/guidance/${id}/draft`, c),
    setStatus: (id, v, s) => http("POST", `/guidance/${id}/versions/${v}/status`, { status: s }),
    restore: (id, v) => http("POST", `/guidance/${id}/versions/${v}/restore`),
  },
  rules: {
    list: () => http("GET", "/reporting-rules"),
    save: (r) => http("PUT", `/reporting-rules/${r.id}`, r),
  },
  sources: {
    list: () => http("GET", "/sources"),
    preview: (id) => http("GET", `/sources/${id}/preview`),
    runImport: (id) => http("POST", `/sources/${id}/import`),
  },
  settings: {
    get: () => http("GET", "/settings"),
    save: (s, v) => http("PUT", `/settings/${String(s)}`, v),
    setSecret: (k, v) => http("PUT", `/settings/secrets/${k}`, { value: v }),
    testConnection: () => http("POST", "/settings/database/test"),
  },
  audit: { list: (l) => http("GET", `/audit${qs({ limit: l })}`) },
  system: { info: () => http("GET", "/system/info") },
  templates: {
    list: (kind) => http("GET", `/templates/${kind}`),
    apply: (kind, ids) => http("POST", `/templates/${kind}/apply`, { ids }),
    playbooks: () => http("GET", "/templates/playbooks"),
    masterData: () => http("GET", "/templates/master-data"),
  },
  setup: {
    status: () => http("GET", "/setup"),
    complete: (skipped) => http("POST", "/setup/complete", { skipped: !!skipped }),
    loadDemo: () => http("POST", "/setup/demo"),
  },
  ai: {
    providers: () => http("GET", "/ai/providers"),
    models: (provider) => http("GET", `/ai/providers/${provider}/models`),
    analyze: async ({ provider, model, text, files }) => {
      // Files go as-is (multipart); the server decides how each one reaches the AI.
      const form = new FormData();
      form.set("provider", provider);
      form.set("model", model);
      form.set("text", text);
      for (const f of files) form.append("files", f, f.name);
      const res = await fetch(`${BASE}/ai/setup/analyze`, {
        method: "POST",
        body: form,
        headers: { "X-IRTrack-Actor": encodeURIComponent(currentActor().name) },
        credentials: "include",
      });
      if (!res.ok) {
        const msg = await res.json().then(
          (j: { error?: string }) => j.error,
          () => undefined,
        );
        throw new Error(msg ?? `Analysis could not start (${res.status})`);
      }
      return res.json();
    },
    job: (id) => http("GET", `/ai/jobs/${encodeURIComponent(id)}`),
    apply: (proposal) => http("POST", "/ai/setup/apply", proposal),
  },
  assistant: {
    config: () => http("GET", "/assistant/config"),
    message: (input) => http("POST", "/assistant/message", input),
    decide: (input) => http("POST", "/assistant/decision", input),
  },
};
