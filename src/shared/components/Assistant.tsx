import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageCircle, RotateCcw, Send, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { repos } from "@/data";
import type { AiChatMode, AiChatTurn } from "@/data/ports";
import { useSettings } from "@/shared/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type Line =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; actions: AiChatTurn["actions"] }
  | { role: "pending"; items: AiChatTurn["pending"]; decided?: "approved" | "declined" }
  | { role: "error"; text: string };

const examples = (mode: AiChatMode) => [1, 2].map((n) => t(`assistant.${mode}Example${n}`));

/** Anything from the server becomes plain text before it is rendered (providers differ in what they return). */
const asText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  if (Array.isArray(v))
    return v
      .map((x) =>
        typeof x === "object" && x && "text" in x
          ? asText((x as { text: unknown }).text)
          : asText(x),
      )
      .join("");
  if (typeof v === "object")
    return "text" in v ? asText((v as { text: unknown }).text) : JSON.stringify(v);
  return String(v);
};

/** Validates a turn from the server so a malformed answer can never break the page. */
function normalize(raw: unknown): AiChatTurn {
  const r = (raw ?? {}) as Partial<AiChatTurn>;
  return {
    chatId: asText(r.chatId),
    reply: asText(r.reply),
    pending: (Array.isArray(r.pending) ? r.pending : []).map((p) => ({
      id: asText(p?.id),
      name: asText(p?.name),
      title: asText(p?.title || p?.name),
      args: p?.args && typeof p.args === "object" ? p.args : {},
    })),
    actions: (Array.isArray(r.actions) ? r.actions : []).map((a) => ({
      name: asText(a?.name),
      title: asText(a?.title || a?.name),
      write: !!a?.write,
      ok: !!a?.ok,
    })),
  };
}

/** Keeps a failure inside the assistant from taking down the whole page, and shows what went wrong. */
class AssistantBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error("[assistant]", error);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] rounded-xl border bg-card p-4 text-sm shadow-2xl"
        role="alert"
      >
        <p className="font-semibold">{t("assistant.crashed")}</p>
        <p className="mt-1 break-words font-mono text-xs text-destructive">
          {this.state.error.message}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => this.setState({ error: null })}
        >
          {t("assistant.restart")}
        </Button>
      </div>
    );
  }
}

/**
 * Floating AI assistant. Portal mode answers questions from guidance and contacts only;
 * admin mode can also change data, but every change waits for the user's approval.
 */
export function Assistant({ mode }: { mode: AiChatMode }) {
  return (
    <AssistantBoundary>
      <AssistantPanel mode={mode} />
    </AssistantBoundary>
  );
}

function AssistantPanel({ mode }: { mode: AiChatMode }) {
  const { data: cfg } = useQuery({
    queryKey: ["assistant-config"],
    queryFn: () => repos().assistant.config(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>();
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, busy]);

  if (!cfg?.available) return null;

  const show = (raw: AiChatTurn) => {
    const r = normalize(raw);
    setChatId(r.chatId || undefined);
    const next: Line[] = [];
    if (r.reply || r.actions.length)
      next.push({ role: "assistant", text: r.reply, actions: r.actions });
    if (r.pending.length) next.push({ role: "pending", items: r.pending });
    setLines((l) => [...l, ...next]);
    if (r.actions.some((a) => a.write && a.ok)) void qc.invalidateQueries();
  };
  const fail = (e: unknown) =>
    setLines((l) => [...l, { role: "error", text: e instanceof Error ? e.message : asText(e) }]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setLines((l) => [...l, { role: "user", text: message }]);
    setBusy(true);
    try {
      show(await repos().assistant.message({ chatId, mode, message }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (approve: boolean) => {
    if (!chatId) return;
    setLines((l) =>
      l.map((x) =>
        x.role === "pending" && !x.decided
          ? { ...x, decided: approve ? "approved" : "declined" }
          : x,
      ),
    );
    setBusy(true);
    try {
      show(await repos().assistant.decide({ chatId, approve }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const waiting = lines.some((x) => x.role === "pending" && !x.decided);

  return (
    <div className="no-print">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
        >
          <MessageCircle className="size-5" /> {t("assistant.open")}
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label={t("assistant.title")}
          className="fixed bottom-5 right-5 z-50 flex h-[min(640px,calc(100vh-2.5rem))] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <MessageCircle className="size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("assistant.title")}</p>
              <p className="truncate text-xs text-muted-foreground">
                {cfg.providerLabel} · {cfg.model}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("assistant.newChat")}
              title={t("assistant.newChat")}
              onClick={() => {
                setChatId(undefined);
                setLines([]);
              }}
              disabled={busy}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("assistant.close")}
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {!lines.length && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  {mode === "portal"
                    ? t("assistant.portalIntro", {
                        number: settings?.portal.emergencyNumber ?? "112",
                      })
                    : t("assistant.adminIntro")}
                </p>
                <div className="flex flex-col items-start gap-1">
                  {examples(mode).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="rounded-full border px-3 py-1 text-left text-xs hover:bg-muted"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {lines.map((l, i) => {
              if (l.role === "user")
                return (
                  <div
                    key={i}
                    className="ml-8 whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                  >
                    {l.text}
                  </div>
                );
              if (l.role === "error")
                return (
                  <div key={i} className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                    {l.text}
                  </div>
                );
              if (l.role === "assistant")
                return (
                  <div key={i} className="mr-4 space-y-1">
                    {l.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {l.actions.map((a, k) => (
                          <span
                            key={k}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                              a.write ? "border-primary/40 bg-primary/5" : "text-muted-foreground",
                              !a.ok && "border-destructive/40 text-destructive",
                            )}
                          >
                            <Wrench className="size-3" />{" "}
                            {a.write ? t("assistant.changed") : t("assistant.used")}: {a.title}
                            {!a.ok && ` (${t("assistant.failed")})`}
                          </span>
                        ))}
                      </div>
                    )}
                    {l.text && (
                      <div className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2">
                        {l.text}
                      </div>
                    )}
                  </div>
                );
              return (
                <div key={i} className="rounded-lg border-2 border-primary/40 p-3">
                  <p className="mb-2 font-semibold">{t("assistant.approveTitle")}</p>
                  <ul className="space-y-2">
                    {l.items.map((p) => (
                      <li key={p.id}>
                        <p className="font-medium">{p.title}</p>
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                          {Object.entries(p.args).map(([k, v]) => (
                            <div key={k} className="contents">
                              <dt className="text-muted-foreground">{k}</dt>
                              <dd className="break-words">
                                {typeof v === "string" ? v : JSON.stringify(v)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    ))}
                  </ul>
                  {l.decided ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {l.decided === "approved"
                        ? `✓ ${t("assistant.approve")}`
                        : `✕ ${t("assistant.decline")}`}
                    </p>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => decide(true)} disabled={busy}>
                        <Check className="size-4" /> {t("assistant.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(false)}
                        disabled={busy}
                      >
                        {t("assistant.decline")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {busy && (
              <p className="flex items-center gap-2 text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" /> {t("assistant.thinking")}
              </p>
            )}
            <div ref={end} />
          </div>

          <form
            className="border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={t("assistant.placeholder")}
                aria-label={t("assistant.placeholder")}
                className="min-h-10 resize-none text-sm"
                rows={1}
                disabled={busy || waiting}
              />
              <Button
                type="submit"
                size="icon"
                aria-label={t("assistant.send")}
                disabled={busy || waiting || !input.trim()}
              >
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("assistant.disclaimer")}</p>
          </form>
        </section>
      )}
    </div>
  );
}
