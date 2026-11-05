/**
 * IRTrack server: one process that serves the REST API under /api and the built web app.
 *
 *   IRTRACK_DB      SQLite file (default ./data/irtrack.db; /data/irtrack.db in Docker)
 *   IRTRACK_STATIC  folder with the built app (default ./dist)
 *   PORT            HTTP port (default 3000)
 *   IRTRACK_MCP_TOKEN  optional Bearer token for the MCP server at /mcp; unset = no token check
 */
import { normalize, resolve, sep } from "node:path";
import { DB_PATH, getMeta, openDb } from "./db";
import { handleApi, VERSION } from "./api";
import { handleMcp } from "./mcp";
import { handleAi } from "./ai";
import { handleAssistant } from "./assistant";

const PORT = Number(process.env.PORT ?? 3000);
const STATIC_DIR = resolve(process.env.IRTRACK_STATIC ?? "./dist");

openDb();

async function serveStatic(pathname: string): Promise<Response> {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const file = resolve(STATIC_DIR, rel);
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep))
    return new Response("Not found", { status: 404 });
  const f = Bun.file(file);
  if (rel && (await f.exists())) {
    const headers: Record<string, string> = {};
    if (rel.startsWith("assets/")) headers["cache-control"] = "public, max-age=31536000, immutable";
    return new Response(f, { headers });
  }
  // Missing files (e.g. /favicon.ico) get a 404; only page paths fall back to the app shell.
  if (/\.[a-z0-9]+$/i.test(rel)) return new Response("Not found", { status: 404 });
  // SPA fallback: unknown paths get the app shell; the client router takes over.
  const shell = Bun.file(resolve(STATIC_DIR, "index.html"));
  if (await shell.exists())
    return new Response(shell, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  return new Response("IRTrack web app not built. Run `bun run build` or use the Docker image.", {
    status: 404,
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/ai/")) return handleAi(req, url.pathname.slice(4));
    if (url.pathname.startsWith("/api/assistant/"))
      return handleAssistant(req, url.pathname.slice(4));
    if (url.pathname === "/api" || url.pathname.startsWith("/api/"))
      return handleApi(req, url.pathname.slice(4) || "/");
    if (url.pathname === "/mcp") return handleMcp(req);
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    return serveStatic(url.pathname);
  },
});

console.log(
  `IRTrack ${VERSION} listening on :${PORT} · MCP at /mcp (${process.env.IRTRACK_MCP_TOKEN ? "token required" : "no token"}) · database ${DB_PATH} (created ${getMeta("created_at")}, setup ${getMeta("setup_completed_at") ? "done" : "pending"}) · app ${STATIC_DIR}`,
);
