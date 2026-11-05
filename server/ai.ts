/**
 * AI-assisted setup: the user gives IRTrack their own documents, an LLM proposes where the
 * information belongs (organization, master data, contacts on the escalation ladder, roles and
 * which templates fit). Nothing is stored until the user reviews and applies the proposal.
 *
 * Providers (configured in .env, no SDKs needed):
 *   ANTHROPIC_API_KEY  [ANTHROPIC_MODEL]
 *   OPENAI_API_KEY     [OPENAI_MODEL]
 *   OPENROUTER_API_KEY [OPENROUTER_MODEL]   model can be chosen on the setup page
 *   OLLAMA_BASE_URL    [OLLAMA_MODEL]       model can be chosen on the setup page
 */
import { LEVELS, type LevelId } from "../src/domain/types";
import type {
  AiApplyResult,
  AiContactProposal,
  AiJob,
  AiModel,
  AiProviderId,
  AiProviderInfo,
  AiSetupProposal,
} from "../src/data/ports";
import { listTemplates } from "./catalog";
import { McpClient } from "./mcpClient";
import { HttpError } from "./errors";
import { prepareFile, UnsupportedFile, type Prepared } from "./extract";

const env = process.env;
const MAX_INPUT_CHARS = 150_000;
const TIMEOUT_MS = 10 * 60_000;

export interface ProviderConfig extends AiProviderInfo {
  key?: string;
  baseUrl?: string;
}

export function providers(): ProviderConfig[] {
  return [
    {
      id: "anthropic",
      label: "Anthropic (Claude)",
      key: env.ANTHROPIC_API_KEY,
      configured: !!env.ANTHROPIC_API_KEY,
      defaultModel: env.ANTHROPIC_MODEL || "claude-opus-5-5",
      chooseModel: false,
    },
    {
      id: "openai",
      label: "OpenAI",
      key: env.OPENAI_API_KEY,
      configured: !!env.OPENAI_API_KEY,
      defaultModel: env.OPENAI_MODEL || "gpt-4.1",
      chooseModel: false,
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      key: env.OPENROUTER_API_KEY,
      configured: !!env.OPENROUTER_API_KEY,
      defaultModel: env.OPENROUTER_MODEL || "",
      chooseModel: true,
    },
    {
      id: "ollama",
      label: "Ollama (local)",
      baseUrl: (env.OLLAMA_BASE_URL || "").replace(/\/+$/, ""),
      configured: !!env.OLLAMA_BASE_URL,
      defaultModel: env.OLLAMA_MODEL || "",
      chooseModel: true,
    },
  ];
}
export const provider = (id: string): ProviderConfig => {
  const p = providers().find((x) => x.id === id);
  if (!p) throw new HttpError(404, `Unknown AI provider ${id}`);
  if (!p.configured)
    throw new HttpError(
      409,
      `${p.label} is not configured. Add its key or URL to the .env file and restart.`,
    );
  return p;
};

/* ---------- model lists ---------- */
async function listModels(p: ProviderConfig): Promise<AiModel[]> {
  if (p.id === "openrouter") {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { authorization: `Bearer ${p.key}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new HttpError(502, `OpenRouter model list failed (${res.status})`);
    const data = (await res.json()) as { data: { id: string; name?: string }[] };
    return data.data
      .map((m) => ({ id: m.id, name: m.name ?? m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (p.id === "ollama") {
    const res = await fetch(`${p.baseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) }).catch(
      () => null,
    );
    if (!res?.ok) throw new HttpError(502, `Ollama is not reachable at ${p.baseUrl}`);
    const data = (await res.json()) as { models: { name: string }[] };
    return data.models.map((m) => ({ id: m.name, name: m.name }));
  }
  return [{ id: p.defaultModel, name: p.defaultModel }];
}

/* ---------- calling the model ---------- */
type Attachment = Extract<Prepared, { kind: "pdf" } | { kind: "image" }>;

/** Sends the prompt plus PDFs/images as native file inputs in each provider's own format. */
async function complete(
  p: ProviderConfig,
  model: string,
  system: string,
  user: string,
  files: Attachment[] = [],
): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const fail = async (res: Response) => {
    const body = await res.text().catch(() => "");
    return new Error(`${p.label} returned ${res.status}: ${body.slice(0, 300)}`);
  };
  if (p.id === "anthropic") {
    const content = [
      ...files.map((f) =>
        f.kind === "pdf"
          ? {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: f.base64 },
              title: f.name,
            }
          : { type: "image", source: { type: "base64", media_type: f.mime, data: f.base64 } },
      ),
      { type: "text", text: user },
    ];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "x-api-key": p.key!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) throw await fail(res);
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      stop_reason?: string;
    };
    if (data.stop_reason === "max_tokens")
      throw new Error("The answer was cut off (too long). Try with less text at once.");
    return data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  if (p.id === "openai" || p.id === "openrouter") {
    const url =
      p.id === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${p.key}`,
        "content-type": "application/json",
        ...(p.id === "openrouter" ? { "x-title": "IRTrack" } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: files.length
              ? [
                  ...files.map((f) =>
                    f.kind === "pdf"
                      ? {
                          type: "file",
                          file: {
                            filename: f.name,
                            file_data: `data:application/pdf;base64,${f.base64}`,
                          },
                        }
                      : {
                          type: "image_url",
                          image_url: { url: `data:${f.mime};base64,${f.base64}` },
                        },
                  ),
                  { type: "text", text: user },
                ]
              : user,
          },
        ],
        // OpenRouter routes to many providers; not all support response_format, so JSON is asked for in the prompt there.
        ...(p.id === "openai" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw await fail(res);
    const data = (await res.json()) as {
      choices: { message: { content: string }; finish_reason?: string }[];
    };
    if (data.choices[0]?.finish_reason === "length")
      throw new Error("The answer was cut off (too long). Try with less text at once.");
    return data.choices[0]?.message.content ?? "";
  }
  // Ollama: no PDF support (rejected before this point); images work with vision models.
  const images = files
    .filter((f): f is Extract<Attachment, { kind: "image" }> => f.kind === "image")
    .map((f) => f.base64);
  const res = await fetch(`${p.baseUrl}/api/chat`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { num_ctx: 32768 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user, ...(images.length ? { images } : {}) },
      ],
    }),
  });
  if (!res.ok) throw await fail(res);
  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
}

function parseJson(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
    throw new Error("The model did not return valid JSON.");
  }
}

/* ---------- prompt ---------- */
const TEMPLATE_KINDS_FOR_AI = ["roles", "rules", "processes", "guidance", "sources"] as const;

function systemPrompt(): string {
  const catalog = Object.fromEntries(
    TEMPLATE_KINDS_FOR_AI.map((k) => [
      k,
      listTemplates(k).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        ...(t.group ? { group: t.group } : {}),
      })),
    ]),
  );
  return `You help set up IRTrack, an incident response management tool, for one organization.
The user gives you the organization's own documents (contact lists, crisis plans, organization descriptions, policies).
Your job: work out where each piece of information belongs in IRTrack and return a proposal. A person reviews it before anything is saved.

Rules:
- Use only facts that are in the documents. Never invent names, phone numbers, email addresses or other details. Use "" when unknown.
- Contacts: people, teams, mailboxes, suppliers and external parties someone may need to call during an incident.
  Link each contact to the roles they fill with "roles": use template role ids from the catalog (e.g. "r-first", "r-privacy", "r-crt")
  or the exact name of an own role in your "roles" list. A contact can fill several roles. The escalation level comes from the roles.
  Suppliers, authorities, regulators and emergency services usually fill no role: use [].
  When you link contacts to template roles, also select those roles under "templates.roles" (or a process that brings them).
  Set "emergency": true only for emergency services and contacts the documents describe as 24/7 emergency lines.
- Roles: only roles that are described in the documents and are not already covered by a template role you select. Give each role the "level" it works at: "standard" = first line (service desk, reception, SOC analyst), "elevated" = specialist lead in one domain, "coordinated" = cross-department coordination (IRT, communications), "critical" = crisis leadership (CRT); "" if not tied to one level.
- Templates: choose from the catalog below only (use the exact ids). Choose what fits the organization and give a short reason based on the documents.
  Processes bring their roles and reporting rules automatically. Choose the GDPR reporting rule only for organizations that handle personal data (almost all), NIS2/Cbw only when the documents suggest the organization is in scope.
- Master data: locations, services/systems, business units, departments and suppliers that are mentioned.
- Notes: important information you found but could not place, and things the user should check. Short sentences.
- Write the proposal in the language of the documents.

Clean values and separate sources (important):
- Every field holds only the value itself, written the way it should appear in IRTrack. Never mention in a field where it came from
  (no "from the notes", "mentioned in the virus report", "according to document X", "came up at …").
- Write descriptive fields as a logical, general instruction. Example: someone who handled a virus report in a note gets
  whenToContact "Malware or virus infections", not "Came up at a virus report in the notes".
- Put the provenance only in the separate "source" fields: the file name and a short literal quote (max 120 characters),
  e.g. "contacts.xlsx — row 4: Youri, SOC". These are only shown to the reviewer and are never saved.

Template catalog:
${JSON.stringify(catalog)}

Return ONLY a JSON object, no other text, with exactly this shape:
{
  "organization": { "name": string, "timezone": string (IANA, e.g. "Europe/Amsterdam"), "source": string },
  "portal": { "title": string, "emergencyNumber": string, "emergencyMessage": string, "source": string },
  "masterData": { "locations": [{"value": string, "source": string}], "services": [...], "businessUnits": [...], "departments": [...], "suppliers": [...] },
  "contacts": [ { "name": string, "type": "person"|"team"|"mailbox"|"supplier"|"external", "role": string, "team": string, "organization": string, "phone": string, "email": string, "availability": string, "whenToContact": string, "outOfHours": string, "roles": string[], "emergency": boolean, "source": string } ],
  "roles": [ { "name": string, "summary": string, "level": "standard"|"elevated"|"coordinated"|"critical"|"", "responsibilities": string[], "source": string } ],
  "templates": { "roles": [{"id": string, "reason": string}], "rules": [...], "processes": [...], "guidance": [...], "sources": [...] },
  "notes": string[]
}`;
}

/* ---------- sanitizing the model output ---------- */
const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 100) =>
  Array.isArray(v) ? [...new Set(v.map((x) => s(x, 200)).filter(Boolean))].slice(0, max) : [];
const CONTACT_TYPES = ["person", "team", "mailbox", "supplier", "external"] as const;
const MD_KEYS = ["locations", "services", "businessUnits", "departments", "suppliers"] as const;

function sanitize(raw: unknown): AiSetupProposal {
  const r = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const md = r.masterData ?? {};
  const contacts: AiContactProposal[] = (Array.isArray(r.contacts) ? r.contacts : [])
    .map((c: Record<string, unknown>) => ({
      name: s(c.name, 200),
      type: (CONTACT_TYPES as readonly string[]).includes(String(c.type))
        ? (c.type as AiContactProposal["type"])
        : "person",
      role: s(c.role, 200),
      team: s(c.team, 200),
      organization: s(c.organization, 200),
      phone: s(c.phone, 50),
      email: s(c.email, 200),
      availability: s(c.availability, 200),
      whenToContact: s(c.whenToContact),
      outOfHours: s(c.outOfHours),
      roles: list(c.roles, 10),
      emergency: c.emergency === true,
      source: s(c.source, 300) || undefined,
    }))
    .filter((c: AiContactProposal) => c.name.length >= 2)
    .slice(0, 300);
  const templates = Object.fromEntries(
    TEMPLATE_KINDS_FOR_AI.map((k) => {
      const known = new Map(listTemplates(k).map((t) => [t.id, t.name]));
      const chosen = (Array.isArray(r.templates?.[k]) ? r.templates[k] : []) as {
        id?: unknown;
        reason?: unknown;
      }[];
      const seen = new Set<string>();
      return [
        k,
        chosen
          .filter(
            (x) => known.has(String(x?.id)) && !seen.has(String(x.id)) && seen.add(String(x.id)),
          )
          .map((x) => ({
            id: String(x.id),
            name: known.get(String(x.id))!,
            reason: s(x.reason, 300),
          })),
      ];
    }),
  ) as AiSetupProposal["templates"];
  // Master data: [{value, source}] from the model (plain strings and a sources map are accepted too).
  const mdSources: NonNullable<NonNullable<AiSetupProposal["sources"]>["masterData"]> = {};
  const mdList = (k: (typeof MD_KEYS)[number]) => {
    const items = Array.isArray(md[k]) ? md[k] : [];
    const values: string[] = [];
    for (const it of items.slice(0, 100)) {
      const value = typeof it === "string" ? s(it, 200) : s(it?.value, 200);
      if (!value || values.includes(value)) continue;
      values.push(value);
      const src =
        typeof it === "string" ? s(r.sources?.masterData?.[k]?.[it], 300) : s(it?.source, 300);
      if (src) (mdSources[k] ??= {})[value] = src;
    }
    return values;
  };
  const masterData = Object.fromEntries(
    MD_KEYS.map((k) => [k, mdList(k)]),
  ) as AiSetupProposal["masterData"];
  return {
    organization: {
      name: s(r.organization?.name, 200) || undefined,
      timezone: s(r.organization?.timezone, 60) || undefined,
    },
    portal: {
      title: s(r.portal?.title, 200) || undefined,
      emergencyNumber: s(r.portal?.emergencyNumber, 30) || undefined,
      emergencyMessage: s(r.portal?.emergencyMessage) || undefined,
    },
    masterData,
    contacts,
    roles: (Array.isArray(r.roles) ? r.roles : [])
      .map((x: Record<string, unknown>) => ({
        name: s(x.name, 200),
        summary: s(x.summary),
        level: (LEVELS as readonly string[]).includes(String(x.level))
          ? (x.level as LevelId)
          : ("" as const),
        responsibilities: list(x.responsibilities, 20),
        source: s(x.source, 300) || undefined,
      }))
      .filter((x: { name: string }) => x.name)
      .slice(0, 50),
    templates,
    notes: list(r.notes, 50),
    sources: {
      organization: s(r.organization?.source ?? r.sources?.organization, 300) || undefined,
      portal: s(r.portal?.source ?? r.sources?.portal, 300) || undefined,
      masterData: mdSources,
    },
  };
}

/* ---------- background jobs ---------- */
const jobs = new Map<string, AiJob>();

const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // provider request limits (e.g. 32 MB at Anthropic) after base64

async function startAnalysis(input: {
  provider: string;
  model: string;
  text: string;
  files: File[];
}): Promise<AiJob> {
  const p = provider(input.provider);
  const model = (input.model || p.defaultModel).trim();
  if (!model) throw new HttpError(400, `Choose a model for ${p.label}.`);
  if (input.files.length > MAX_FILES)
    throw new HttpError(400, `At most ${MAX_FILES} files at once.`);
  const total = input.files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES)
    throw new HttpError(
      413,
      `The files are too large together (${Math.round(total / 1048576)} MB, max ${MAX_TOTAL_BYTES / 1048576} MB).`,
    );

  // Prepare files: PDFs and images are sent natively, Office files become text, unsupported files are reported.
  const files: NonNullable<AiJob["files"]> = [];
  const attachments: Attachment[] = [];
  const texts: string[] = [];
  for (const f of input.files) {
    if (f.size > MAX_FILE_BYTES) {
      files.push({
        name: f.name,
        handling: "skipped",
        note: `larger than ${MAX_FILE_BYTES / 1048576} MB`,
      });
      continue;
    }
    try {
      const prepared = await prepareFile(f);
      if (prepared.kind === "text") {
        texts.push(`=== File: ${prepared.name} ===\n${prepared.text}`);
        files.push({
          name: f.name,
          handling: "text",
          note: prepared.from === "text" ? "read as text" : `${prepared.from} contents extracted`,
        });
      } else if (prepared.kind === "pdf" && p.id === "ollama") {
        files.push({
          name: f.name,
          handling: "skipped",
          note: "Ollama cannot read PDF files; use a cloud provider or save the PDF as text",
        });
      } else {
        attachments.push(prepared);
        files.push({
          name: f.name,
          handling: "native",
          note: prepared.kind === "pdf" ? "sent as PDF" : "sent as image",
        });
      }
    } catch (e) {
      files.push({
        name: f.name,
        handling: "skipped",
        note: e instanceof UnsupportedFile ? e.message : "could not be read",
      });
    }
  }

  const pasted = String(input.text ?? "").trim();
  const allText = [pasted && `=== Pasted text ===\n${pasted}`, ...texts]
    .filter(Boolean)
    .join("\n\n");
  if (allText.length < 20 && !attachments.length) {
    throw new HttpError(
      400,
      files.some((f) => f.handling === "skipped")
        ? `None of the files could be used: ${files.map((f) => `${f.name} (${f.note})`).join("; ")}`
        : "Give the AI some information to work with (paste text or add files).",
    );
  }
  const truncated = allText.length > MAX_INPUT_CHARS;
  const job: AiJob = {
    id: crypto.randomUUID(),
    status: "running",
    provider: p.id,
    model,
    startedAt: new Date().toISOString(),
    truncated,
    files,
  };
  jobs.set(job.id, job);
  // Old jobs are dropped after an hour.
  for (const [id, j] of jobs)
    if (Date.now() - new Date(j.startedAt).getTime() > 3600_000) jobs.delete(id);
  (async () => {
    try {
      const intro = attachments.length
        ? `The organization's documents are attached (${attachments.map((a) => a.name).join(", ")})${allText ? " and included below" : ""}.`
        : "The organization's documents:";
      const answer = await complete(
        p,
        model,
        systemPrompt(),
        `${intro}\n\n${allText.slice(0, MAX_INPUT_CHARS)}`,
        attachments,
      );
      job.proposal = sanitize(parseJson(answer));
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = e instanceof Error ? e.message : String(e);
      console.error("[ai] analysis failed:", job.error);
    }
  })();
  return job;
}

/* ---------- applying a (reviewed) proposal ---------- */
/**
 * Saves a reviewed proposal through IRTrack's own MCP server (loopback HTTP to /mcp), so every
 * AI setup also tests the MCP path end to end. Items that fail are reported; the rest continues.
 */
async function applyProposal(p: AiSetupProposal, actor: string): Promise<AiApplyResult> {
  const clean = sanitize(p); // never trust the client copy
  const result: AiApplyResult = {
    settings: [],
    contacts: 0,
    roles: 0,
    templates: 0,
    via: "mcp",
    mcpCalls: 0,
    failed: [],
  };
  const mcp = McpClient.loopback(`AI setup (${actor})`);
  await mcp.initialize();
  const call = async <T>(
    tool: string,
    args: Record<string, unknown>,
    label: string,
  ): Promise<T | undefined> => {
    result.mcpCalls++;
    try {
      return await mcp.call<T>(tool, args);
    } catch (e) {
      result.failed.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  };

  const sections: [string, Record<string, unknown>][] = [
    ["organization", { name: clean.organization.name, timezone: clean.organization.timezone }],
    ["portal", { ...clean.portal }],
    ["masterData", { ...clean.masterData }],
  ];
  for (const [section, values] of sections) {
    const r = await call<{ changed: string[] }>(
      "update_settings",
      { section, values },
      `Settings ${section}`,
    );
    if (r?.changed.length) result.settings.push(section);
  }
  // Templates first, so custom contacts and roles come on top of them.
  for (const k of ["roles", "rules", "processes", "guidance", "sources"] as const) {
    const ids = clean.templates[k].map((t) => t.id);
    // Template roles that selected contacts refer to come along, so the links work.
    if (k === "roles") {
      const templateRoleIds = new Set(listTemplates("roles").map((t) => t.id));
      for (const c of clean.contacts)
        for (const ref of c.roles)
          if (templateRoleIds.has(ref) && !ids.includes(ref)) ids.push(ref);
    }
    if (!ids.length) continue;
    const r = await call<{ added: unknown[] }>(
      "apply_templates",
      { kind: k, ids },
      `Templates ${k}`,
    );
    result.templates += r?.added.length ?? 0;
  }
  // Own roles before contacts, so contacts can be linked to them.
  for (const r of clean.roles) {
    const ok = await call(
      "add_role",
      { name: r.name, summary: r.summary, level: r.level, responsibilities: r.responsibilities },
      `Role ${r.name}`,
    );
    if (ok) result.roles++;
  }
  // Contacts refer to roles by template id or by name; resolve both to the ids that now exist.
  const roles = (await call<{ id: string; name: string }[]>("list_roles", {}, "List roles")) ?? [];
  const roleId = (ref: string) =>
    roles.find((x) => x.id === ref)?.id ??
    roles.find((x) => x.name.toLowerCase() === ref.toLowerCase())?.id;
  for (const c of clean.contacts) {
    const { source: _source, roles: refs, ...fields } = c; // provenance is for the review only, never saved
    const roleIds = [...new Set(refs.map(roleId).filter((x): x is string => !!x))];
    const unknown = refs.filter((ref) => !roleId(ref));
    if (unknown.length)
      result.failed.push(`Contact ${c.name}: role(s) not found: ${unknown.join(", ")}`);
    const r = await call(
      "add_contact",
      { ...fields, roleIds, notes: "Added by the AI setup — please verify." },
      `Contact ${c.name}`,
    );
    if (r) result.contacts++;
  }
  await call("complete_setup", {}, "Complete setup");
  return result;
}

/* ---------- HTTP ---------- */
export async function handleAi(req: Request, path: string): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data ?? null), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  const actorHeader = req.headers.get("x-irtrack-actor");
  const actor = actorHeader ? decodeURIComponent(actorHeader).slice(0, 200) : "anonymous";
  try {
    if (req.method === "GET" && path === "/ai/providers")
      return json(providers().map(({ key: _k, baseUrl: _b, ...info }) => info));
    let m = /^\/ai\/providers\/([^/]+)\/models$/.exec(path);
    if (req.method === "GET" && m) return json(await listModels(provider(m[1])));
    if (req.method === "POST" && path === "/ai/setup/analyze") {
      // multipart/form-data with fields provider, model, text and files; JSON (no files) is accepted too.
      if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
        const form = await req.formData();
        const files = form.getAll("files").filter((x): x is File => typeof x !== "string");
        return json(
          await startAnalysis({
            provider: String(form.get("provider") ?? ""),
            model: String(form.get("model") ?? ""),
            text: String(form.get("text") ?? ""),
            files,
          }),
          202,
        );
      }
      const body = (await req.json()) as { provider: string; model: string; text: string };
      return json(await startAnalysis({ ...body, files: [] }), 202);
    }
    m = /^\/ai\/jobs\/([^/]+)$/.exec(path);
    if (req.method === "GET" && m) return json(jobs.get(decodeURIComponent(m[1])) ?? null);
    if (req.method === "POST" && path === "/ai/setup/apply")
      return json(await applyProposal(await req.json(), actor));
    return json({ error: `No route for ${req.method} /api${path}` }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
    console.error(`[ai] ${req.method} ${path}`, e);
    return json({ error: e instanceof Error ? e.message : "Internal server error" }, 500);
  }
}
