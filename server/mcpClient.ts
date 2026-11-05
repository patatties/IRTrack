/**
 * Minimal MCP client (Streamable HTTP, JSON responses) used by IRTrack to talk to its own MCP
 * server over loopback. The AI setup saves everything through it, so every setup also exercises
 * the full MCP path: protocol handshake, token check, tools and audit trail.
 */
import { VERSION } from "./api";

const PROTOCOL_VERSION = "2025-06-18";

export class McpCallError extends Error {}

export interface McpToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; title?: string };
}

export class McpClient {
  private nextId = 1;
  private protocolVersion = PROTOCOL_VERSION;
  private readonly url: string;
  private readonly actor: string;
  private readonly token: string;

  constructor(url: string, actor: string, token = process.env.IRTRACK_MCP_TOKEN ?? "") {
    this.url = url;
    this.actor = actor;
    this.token = token;
  }

  /** Loopback client for this server's own /mcp endpoint. */
  static loopback(actor: string) {
    return new McpClient(`http://127.0.0.1:${process.env.PORT ?? 3000}/mcp`, actor);
  }

  private async rpc(method: string, params?: unknown, notification = false): Promise<unknown> {
    const msg = {
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
      ...(notification ? {} : { id: this.nextId++ }),
    };
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": this.protocolVersion,
        "x-irtrack-actor": encodeURIComponent(this.actor),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(60_000),
    });
    if (notification) {
      if (res.status !== 202 && !res.ok)
        throw new McpCallError(`MCP ${method} failed with HTTP ${res.status}`);
      return null;
    }
    if (!res.ok)
      throw new McpCallError(
        `MCP ${method} failed with HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    const body = (await res.json()) as {
      result?: unknown;
      error?: { code: number; message: string };
    };
    if (body.error)
      throw new McpCallError(`MCP ${method} error ${body.error.code}: ${body.error.message}`);
    return body.result;
  }

  async initialize(
    clientName = "irtrack-ai-setup",
  ): Promise<{ serverInfo: { name: string; version: string }; tools: McpToolDef[] }> {
    const init = (await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: VERSION },
    })) as { protocolVersion: string; serverInfo: { name: string; version: string } };
    this.protocolVersion = init.protocolVersion;
    await this.rpc("notifications/initialized", undefined, true);
    const list = (await this.rpc("tools/list")) as { tools: McpToolDef[] };
    return { serverInfo: init.serverInfo, tools: list.tools };
  }

  /** Calls a tool and returns its JSON output; a tool error becomes an exception. */
  /** Calls a tool and returns its text output and error flag, as an LLM should see it. */
  async callRaw(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ text: string; isError: boolean }> {
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      content: { type: string; text?: string }[];
      isError?: boolean;
    };
    return {
      text: result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join(""),
      isError: !!result.isError,
    };
  }

  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { text, isError } = await this.callRaw(name, args);
    if (isError) throw new McpCallError(`${name}: ${text}`);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}
