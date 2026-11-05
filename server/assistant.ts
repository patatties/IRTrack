/**
 * AI assistant for the portal and the Admin Console.
 *
 * The model works with IRTrack through its own MCP server (loopback), using tool calling:
 * - portal mode: read-only tools about guidance, contacts and processes (no incidents)
 * - admin mode: all tools; tools that change data are only run after the user approves them
 *
 * Tool calling is implemented per provider with plain fetch (Anthropic, OpenAI, OpenRouter, Ollama).
 * Conversations are kept in memory for an hour.
 */
import type { AiChatTurn, AiProviderId } from "../src/data/ports";
import { HttpError } from "./errors";
import { provider as getProvider, providers, type ProviderConfig } from "./ai";
import { McpClient, type McpToolDef } from "./mcpClient";
import { callApi } from "./internal";
import type { Settings } from "../src/domain/types";

type Mode = "portal" | "admin";
interface Call {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; calls: Call[] }
  | {
      role: "tool";
      results: { callId: string; name: string; content: string; isError: boolean }[];
    };

interface Chat {
  id: string;
  mode: Mode;
  actor: string;
  provider: AiProviderId;
  model: string;
  transcript: Msg[];
  pending: Call[];
  touchedAt: number;
}

const PORTAL_TOOLS = ["search_guidance", "get_escalation_ladder", "list_processes"];
const MAX_ROUNDS = 8;
const chats = new Map<string, Chat>();

/* ---------- configuration ---------- */
/** The provider/model used by the assistant: AI_CHAT_PROVIDER/AI_CHAT_MODEL, else the first configured provider that has a model. */
function chatProvider(): { p: ProviderConfig; model: string } | null {
  const env = process.env;
  const all = providers().filter((p) => p.configured);
  const preferred = env.AI_CHAT_PROVIDER
    ? all.find((p) => p.id === env.AI_CHAT_PROVIDER)
    : undefined;
  for (const p of preferred ? [preferred] : all) {
    const model = (preferred && env.AI_CHAT_MODEL) || p.defaultModel;
    if (model) return { p, model };
  }
  return null;
}

export function chatConfig() {
  const c = chatProvider();
  return c
    ? { available: true, provider: c.p.id, providerLabel: c.p.label, model: c.model }
    : { available: false };
}

/* ---------- prompts ---------- */
async function systemPrompt(mode: Mode): Promise<string> {
  const s = await callApi<Settings>("AI assistant", "GET", "/settings").catch(() => null);
  const org = s?.organization.name || "the organization";
  const emergency = s?.portal.emergencyNumber || "112";
  const common = `Answer in the language of the user. Be short and practical. Base facts only on tool results; if IRTrack has no answer, say so. Never invent phone numbers, names or procedures.`;
  if (mode === "portal") {
    return `You are the IRTrack assistant for employees of ${org}. You help people understand what to do when something goes wrong and who to contact.
- If anyone may be in danger, tell them first to call ${emergency}.
- Use the tools to look up guidance (first steps, what not to do) and the escalation ladder of contacts.
- You cannot see or change incidents. To report an incident, point them to the Report page (/report); to follow a report, to /track.
${common}`;
  }
  return `You are the IRTrack assistant for incident managers and administrators of ${org}.
You can look up and change IRTrack data with the tools: incidents, deadlines, the dashboard, contacts, guidance, processes, templates and settings.
- Look things up before you change them (ids, current values).
- Changes are only carried out after the user approves them; propose them with the tools, the system asks for approval.
- After a change, confirm briefly what was done.
${common}`;
}

/* ---------- provider adapters ---------- */
interface Turn {
  text: string;
  calls: Call[];
}

async function turn(
  p: ProviderConfig,
  model: string,
  system: string,
  transcript: Msg[],
  tools: McpToolDef[],
): Promise<Turn> {
  const signal = AbortSignal.timeout(120_000);
  const fail = async (res: Response) =>
    new HttpError(
      502,
      `${p.label} returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`,
    );

  if (p.id === "anthropic") {
    const messages = transcript.map((m) =>
      m.role === "user"
        ? { role: "user", content: m.text }
        : m.role === "assistant"
          ? {
              role: "assistant",
              content: [
                ...(m.text ? [{ type: "text", text: m.text }] : []),
                ...m.calls.map((c) => ({
                  type: "tool_use",
                  id: c.id,
                  name: c.name,
                  input: c.args,
                })),
              ],
            }
          : {
              role: "user",
              content: m.results.map((r) => ({
                type: "tool_result",
                tool_use_id: r.callId,
                content: r.content,
                is_error: r.isError,
              })),
            },
    );
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
        max_tokens: 4096,
        system,
        messages,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
      }),
    });
    if (!res.ok) throw await fail(res);
    const data = (await res.json()) as {
      content: {
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }[];
    };
    return {
      text: data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(""),
      calls: data.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id!, name: b.name!, args: b.input ?? {} })),
    };
  }

  if (p.id === "openai" || p.id === "openrouter") {
    const messages: unknown[] = [{ role: "system", content: system }];
    for (const m of transcript) {
      if (m.role === "user") messages.push({ role: "user", content: m.text });
      else if (m.role === "assistant")
        messages.push({
          role: "assistant",
          content: m.text || null,
          ...(m.calls.length
            ? {
                tool_calls: m.calls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: JSON.stringify(c.args) },
                })),
              }
            : {}),
        });
      else
        for (const r of m.results)
          messages.push({ role: "tool", tool_call_id: r.callId, content: r.content });
    }
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
        messages,
        tools: tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
      }),
    });
    if (!res.ok) throw await fail(res);
    const data = (await res.json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
    };
    const msg = data.choices[0]?.message;
    return {
      text: textOf(msg?.content),
      calls: (msg?.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        args: safeJson(c.function.arguments),
      })),
    };
  }

  // Ollama (needs a model with tool support)
  const messages: unknown[] = [{ role: "system", content: system }];
  for (const m of transcript) {
    if (m.role === "user") messages.push({ role: "user", content: m.text });
    else if (m.role === "assistant")
      messages.push({
        role: "assistant",
        content: m.text,
        ...(m.calls.length
          ? { tool_calls: m.calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) }
          : {}),
      });
    else
      for (const r of m.results)
        messages.push({ role: "tool", content: r.content, tool_name: r.name });
  }
  const res = await fetch(`${p.baseUrl}/api/chat`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages,
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
    }),
  });
  if (!res.ok) throw await fail(res);
  const data = (await res.json()) as {
    message: {
      content: string;
      tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
    };
  };
  return {
    text: textOf(data.message.content),
    calls: (data.message.tool_calls ?? []).map((c) => ({
      id: crypto.randomUUID(),
      name: c.function.name,
      args:
        typeof c.function.arguments === "string"
          ? safeJson(c.function.arguments)
          : c.function.arguments,
    })),
  };
}

/** Some providers return content as a list of parts instead of a string. */
function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v))
    return v
      .map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : ""))
      .join("");
  return "";
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

/* ---------- the loop ---------- */
async function connect(chat: Chat): Promise<{ mcp: McpClient; tools: McpToolDef[] }> {
  const mcp = McpClient.loopback(`AI assistant (${chat.actor})`);
  const { tools } = await mcp.initialize("irtrack-assistant");
  return {
    mcp,
    tools: chat.mode === "portal" ? tools.filter((t) => PORTAL_TOOLS.includes(t.name)) : tools,
  };
}

const isWrite = (tools: McpToolDef[], name: string) =>
  !tools.find((t) => t.name === name)?.annotations?.readOnlyHint;
const toolTitle = (tools: McpToolDef[], name: string) =>
  tools.find((t) => t.name === name)?.title ?? name;

async function execute(
  mcp: McpClient,
  tools: McpToolDef[],
  calls: Call[],
  actions: AiChatTurn["actions"],
) {
  const results: Extract<Msg, { role: "tool" }>["results"] = [];
  for (const c of calls) {
    if (!tools.some((t) => t.name === c.name)) {
      results.push({
        callId: c.id,
        name: c.name,
        content: `Tool ${c.name} is not available here.`,
        isError: true,
      });
      continue;
    }
    const r = await mcp
      .callRaw(c.name, c.args)
      .catch((e: unknown) => ({ text: e instanceof Error ? e.message : String(e), isError: true }));
    results.push({
      callId: c.id,
      name: c.name,
      content: r.text.slice(0, 30_000),
      isError: r.isError,
    });
    actions.push({
      name: c.name,
      title: toolTitle(tools, c.name),
      write: isWrite(tools, c.name),
      ok: !r.isError,
    });
  }
  return results;
}

/** Runs model turns until it answers, needs approval for a change, or hits the round limit. */
async function run(
  chat: Chat,
  mcp: McpClient,
  tools: McpToolDef[],
  actions: AiChatTurn["actions"],
): Promise<AiChatTurn> {
  const p = getProvider(chat.provider);
  const system = await systemPrompt(chat.mode);
  let reply = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const t = await turn(p, chat.model, system, chat.transcript, tools);
    // An empty assistant message is not allowed in the next request (e.g. by Anthropic).
    if (!t.text && !t.calls.length) t.text = "…";
    chat.transcript.push({ role: "assistant", text: t.text, calls: t.calls });
    if (t.text) reply += (reply ? "\n\n" : "") + t.text;
    if (!t.calls.length) return { chatId: chat.id, reply, pending: [], actions };
    // Any change in this turn waits for approval (all calls of a turn are answered together).
    if (chat.mode === "admin" && t.calls.some((c) => isWrite(tools, c.name))) {
      chat.pending = t.calls;
      return {
        chatId: chat.id,
        reply,
        actions,
        pending: t.calls
          .filter((c) => isWrite(tools, c.name))
          .map((c) => ({ id: c.id, name: c.name, title: toolTitle(tools, c.name), args: c.args })),
      };
    }
    chat.transcript.push({ role: "tool", results: await execute(mcp, tools, t.calls, actions) });
  }
  return {
    chatId: chat.id,
    reply:
      reply ||
      "I could not finish this within the step limit. Please ask a more specific question.",
    pending: [],
    actions,
  };
}

export async function chatMessage(
  input: { chatId?: string; mode: Mode; message: string },
  actor: string,
): Promise<AiChatTurn> {
  for (const [id, c] of chats) if (Date.now() - c.touchedAt > 3600_000) chats.delete(id);
  const message = String(input.message ?? "")
    .trim()
    .slice(0, 8000);
  if (!message) throw new HttpError(400, "Type a question.");
  const mode: Mode = input.mode === "admin" ? "admin" : "portal";
  let chat = input.chatId ? chats.get(input.chatId) : undefined;
  if (chat && chat.mode !== mode) chat = undefined; // never reuse an admin conversation in the portal or the other way round
  if (!chat) {
    const cfg = chatProvider();
    if (!cfg)
      throw new HttpError(
        409,
        "The AI assistant is not configured. Add an AI provider to the .env file (see README).",
      );
    chat = {
      id: crypto.randomUUID(),
      mode,
      actor,
      provider: cfg.p.id,
      model: cfg.model,
      transcript: [],
      pending: [],
      touchedAt: Date.now(),
    };
    chats.set(chat.id, chat);
  }
  if (chat.pending.length)
    throw new HttpError(409, "Approve or decline the proposed change first.");
  chat.touchedAt = Date.now();
  chat.transcript.push({ role: "user", text: message });
  const { mcp, tools } = await connect(chat);
  return run(chat, mcp, tools, []);
}

export async function chatDecision(input: {
  chatId: string;
  approve: boolean;
}): Promise<AiChatTurn> {
  const chat = chats.get(String(input.chatId));
  if (!chat || chat.mode !== "admin")
    throw new HttpError(404, "This conversation has expired. Start a new one.");
  if (!chat.pending.length) throw new HttpError(409, "There is nothing to approve.");
  chat.touchedAt = Date.now();
  const { mcp, tools } = await connect(chat);
  const calls = chat.pending;
  chat.pending = [];
  const actions: AiChatTurn["actions"] = [];
  if (input.approve) {
    chat.transcript.push({ role: "tool", results: await execute(mcp, tools, calls, actions) });
  } else {
    // Read-only calls of the same turn still run; changes are reported as declined.
    const reads = calls.filter((c) => !isWrite(tools, c.name));
    const readResults = await execute(mcp, tools, reads, actions);
    const declined = calls
      .filter((c) => isWrite(tools, c.name))
      .map((c) => ({
        callId: c.id,
        name: c.name,
        content: "The user declined this change. Do not retry it unless asked.",
        isError: true,
      }));
    chat.transcript.push({ role: "tool", results: [...readResults, ...declined] });
  }
  return run(chat, mcp, tools, actions);
}

/* ---------- HTTP: /api/assistant/* ---------- */
export async function handleAssistant(req: Request, path: string): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data ?? null), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  const actorHeader = req.headers.get("x-irtrack-actor");
  const actor = actorHeader ? decodeURIComponent(actorHeader).slice(0, 200) : "anonymous";
  try {
    if (req.method === "GET" && path === "/assistant/config") return json(chatConfig());
    if (req.method === "POST" && path === "/assistant/message")
      return json(await chatMessage(await req.json(), actor));
    if (req.method === "POST" && path === "/assistant/decision")
      return json(await chatDecision(await req.json()));
    return json({ error: `No route for ${req.method} /api${path}` }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
    console.error(`[assistant] ${req.method} ${path}`, e);
    return json({ error: e instanceof Error ? e.message : "Internal server error" }, 500);
  }
}
