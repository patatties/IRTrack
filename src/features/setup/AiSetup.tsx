import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Info, Loader2, Sparkles, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/features/admin/ui";
import { Pill } from "@/shared/components/badges";
import { repos } from "@/data";
import { useTemplates } from "@/shared/hooks";
import type { AiJob, AiProviderId, AiSetupProposal } from "@/data/ports";
import { t } from "@/i18n";

const MD_KEYS = ["locations", "services", "businessUnits", "departments", "suppliers"] as const;
const TPL_KEYS = ["processes", "rules", "roles", "guidance", "sources"] as const;

interface Selection {
  organization: boolean;
  portal: boolean;
  masterData: Record<(typeof MD_KEYS)[number], Set<string>>;
  contacts: Set<number>;
  roles: Set<number>;
  templates: Record<(typeof TPL_KEYS)[number], Set<string>>;
}

const selectAll = (p: AiSetupProposal): Selection => ({
  organization: true,
  portal: true,
  masterData: Object.fromEntries(
    MD_KEYS.map((k) => [k, new Set(p.masterData[k])]),
  ) as Selection["masterData"],
  contacts: new Set(p.contacts.map((_, i) => i)),
  roles: new Set(p.roles.map((_, i) => i)),
  templates: Object.fromEntries(
    TPL_KEYS.map((k) => [k, new Set(p.templates[k].map((x) => x.id))]),
  ) as Selection["templates"],
});

function selected(p: AiSetupProposal, s: Selection): AiSetupProposal {
  return {
    organization: s.organization ? p.organization : {},
    portal: s.portal ? p.portal : {},
    masterData: Object.fromEntries(
      MD_KEYS.map((k) => [k, p.masterData[k].filter((v) => s.masterData[k].has(v))]),
    ) as AiSetupProposal["masterData"],
    contacts: p.contacts.filter((_, i) => s.contacts.has(i)),
    roles: p.roles.filter((_, i) => s.roles.has(i)),
    templates: Object.fromEntries(
      TPL_KEYS.map((k) => [k, p.templates[k].filter((x) => s.templates[k].has(x.id))]),
    ) as AiSetupProposal["templates"],
    notes: p.notes,
  };
}

/** Shows where a proposed item came from on hover. The source is for review only and is never saved. */
function SourceTip({ source, children }: { source?: string; children: ReactNode }) {
  if (!source) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <span className="font-semibold">{t("setup.ai.source")}</span> {source}
      </TooltipContent>
    </Tooltip>
  );
}

/** How the server handled each uploaded file. */
function FileReport({ files }: { files?: AiJob["files"] }) {
  if (!files?.length) return null;
  const tone = { native: "primary", text: "neutral", skipped: "danger" } as const;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {files.map((f) => (
        <li key={f.name} className="flex flex-wrap items-center gap-2">
          <Pill tone={tone[f.handling]}>{t(`setup.ai.handling.${f.handling}`)}</Pill>
          <span className="font-medium">{f.name}</span>
          <span className="text-muted-foreground">{f.note}</span>
        </li>
      ))}
    </ul>
  );
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

/** The "let AI set it up" path of the setup wizard: input → background analysis → review → apply. */
export function AiSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => repos().ai.providers(),
  });
  const { data: roleTemplates = [] } = useTemplates("roles");
  const configured = providers.filter((p) => p.configured);
  const [providerId, setProviderId] = useState<AiProviderId | "">("");
  const prov = configured.find((p) => p.id === providerId) ?? configured[0];
  const [model, setModel] = useState("");
  const {
    data: models = [],
    isFetching: modelsLoading,
    error: modelsError,
  } = useQuery({
    queryKey: ["ai-models", prov?.id],
    queryFn: () => repos().ai.models(prov!.id),
    enabled: !!prov?.chooseModel,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (prov) setModel(prov.defaultModel);
  }, [prov?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useQuery({
    queryKey: ["ai-job", jobId],
    queryFn: () => repos().ai.job(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
  });
  const proposal = job?.status === "done" ? job.proposal : undefined;
  const [sel, setSel] = useState<Selection | null>(null);
  useEffect(() => {
    if (proposal) setSel(selectAll(proposal));
  }, [proposal]);
  const [busy, setBusy] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added = [...list];
    setFiles((prev) => [...prev.filter((p) => !added.some((a) => a.name === p.name)), ...added]);
  };
  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1048576;
  const ext = (f: File) => f.name.toLowerCase().split(".").pop() ?? "";
  /** Client-side hint; the server makes the final decision per file. */
  const fileHint = (f: File) => {
    const e = ext(f);
    if (["doc", "xls", "ppt"].includes(e)) return t("setup.ai.legacy", { ext: `${e}x` });
    if (e === "pdf" && prov?.id === "ollama") return t("setup.ai.ollamaPdf");
    if (f.size > 25 * 1048576) return t("setup.ai.tooLarge");
    return "";
  };
  const analyze = async () => {
    if (!prov) return;
    setBusy(true);
    try {
      const j = await repos().ai.analyze({ provider: prov.id, model, text, files });
      setJobId(j.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!proposal || !sel) return;
    setBusy(true);
    try {
      const r = await repos().ai.apply(selected(proposal, sel));
      await qc.invalidateQueries();
      toast.success(
        t("setup.ai.applied", { contacts: r.contacts, roles: r.roles, templates: r.templates }),
      );
      if (r.contacts) toast.info(t("setup.ai.verify"));
      toast.info(t("setup.ai.viaMcp", { n: r.mcpCalls }));
      if (r.failed.length)
        toast.warning(
          `${t("setup.ai.someFailed", { n: r.failed.length })} ${r.failed.join(" · ")}`,
          { duration: 20000 },
        );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const modelOptions = useMemo(() => models.slice(0, 2000), [models]);

  if (isLoading) return <p role="status">{t("common.loading")}</p>;

  /* ---------- review ---------- */
  if (proposal && sel) {
    const chk = (
      checked: boolean,
      onChange: () => void,
      label: ReactNode,
      sub?: ReactNode,
      source?: string,
    ) => (
      <SourceTip source={source}>
        <label className="flex items-start gap-2 rounded-md p-1 text-sm hover:bg-muted">
          <input type="checkbox" className="mt-1" checked={checked} onChange={onChange} />
          <span>
            {label}
            {source && <Info className="ml-1 inline size-3 text-muted-foreground" aria-hidden />}
            {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
          </span>
        </label>
      </SourceTip>
    );
    const src = proposal.sources;
    const roleLabel = (ref: string) => roleTemplates.find((x) => x.id === ref)?.name ?? ref;
    const orgLine = [proposal.organization.name, proposal.organization.timezone]
      .filter(Boolean)
      .join(" · ");
    const portalLine = [
      proposal.portal.title,
      proposal.portal.emergencyNumber && `☎ ${proposal.portal.emergencyNumber}`,
      proposal.portal.emergencyMessage,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="space-y-4">
        <Card title={t("setup.ai.reviewTitle")} takeaway={t("setup.ai.reviewHelp")}>
          {job?.truncated && <p className="text-sm text-destructive">{t("setup.ai.truncated")}</p>}
          <p className="text-xs text-muted-foreground">
            {job?.provider} · {job?.model}
          </p>
          <FileReport files={job?.files} />
        </Card>
        <Card title={t("setup.ai.organization")}>
          {orgLine || portalLine ? (
            <>
              {orgLine &&
                chk(
                  sel.organization,
                  () => setSel({ ...sel, organization: !sel.organization }),
                  orgLine,
                  undefined,
                  src?.organization,
                )}
              {portalLine &&
                chk(
                  sel.portal,
                  () => setSel({ ...sel, portal: !sel.portal }),
                  portalLine,
                  undefined,
                  src?.portal,
                )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("setup.ai.nothing")}</p>
          )}
        </Card>
        <Card title={t("setup.ai.masterData")}>
          {MD_KEYS.every((k) => !proposal.masterData[k].length) && (
            <p className="text-sm text-muted-foreground">{t("setup.ai.nothing")}</p>
          )}
          {MD_KEYS.filter((k) => proposal.masterData[k].length).map((k) => (
            <div key={k} className="mb-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{k}</p>
              <div className="flex flex-wrap gap-1">
                {proposal.masterData[k].map((v) => {
                  const source = src?.masterData?.[k]?.[v];
                  return (
                    <SourceTip key={v} source={source}>
                      <button
                        type="button"
                        onClick={() =>
                          setSel({
                            ...sel,
                            masterData: { ...sel.masterData, [k]: toggle(sel.masterData[k], v) },
                          })
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs ${sel.masterData[k].has(v) ? "border-primary bg-primary/10" : "line-through opacity-50"}`}
                      >
                        {v}
                        {source && <Info className="ml-1 inline size-3 opacity-60" aria-hidden />}
                      </button>
                    </SourceTip>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
        <Card title={`${t("setup.ai.contacts")} (${proposal.contacts.length})`}>
          {!proposal.contacts.length && (
            <p className="text-sm text-muted-foreground">{t("setup.ai.nothing")}</p>
          )}
          <div className="grid gap-1 md:grid-cols-2">
            {proposal.contacts.map((c, i) => (
              <div key={i}>
                {chk(
                  sel.contacts.has(i),
                  () => setSel({ ...sel, contacts: toggle(sel.contacts, i) }),
                  <>
                    {c.name}{" "}
                    {c.roles.map((ref) => (
                      <Pill key={ref}>{roleLabel(ref)}</Pill>
                    ))}{" "}
                    {c.emergency && <Pill tone="danger">Emergency</Pill>}
                  </>,
                  [c.role, c.team, c.phone, c.email].filter(Boolean).join(" · "),
                  c.source,
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card title={t("setup.ai.templatesTitle")}>
          {TPL_KEYS.every((k) => !proposal.templates[k].length) && (
            <p className="text-sm text-muted-foreground">{t("setup.ai.nothing")}</p>
          )}
          {TPL_KEYS.filter((k) => proposal.templates[k].length).map((k) => (
            <div key={k} className="mb-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {t(`setup.steps.${k}.title`)}
              </p>
              {proposal.templates[k].map((x) => (
                <div key={x.id}>
                  {chk(
                    sel.templates[k].has(x.id),
                    () =>
                      setSel({
                        ...sel,
                        templates: { ...sel.templates, [k]: toggle(sel.templates[k], x.id) },
                      }),
                    x.name,
                    x.reason,
                  )}
                </div>
              ))}
            </div>
          ))}
        </Card>
        {proposal.roles.length > 0 && (
          <Card title={t("setup.ai.roles")}>
            {proposal.roles.map((r, i) => (
              <div key={i}>
                {chk(
                  sel.roles.has(i),
                  () => setSel({ ...sel, roles: toggle(sel.roles, i) }),
                  r.name,
                  r.summary,
                  r.source,
                )}
              </div>
            ))}
          </Card>
        )}
        {proposal.notes.length > 0 && (
          <Card title={t("setup.ai.notes")}>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {proposal.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </Card>
        )}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              setJobId(null);
              setSel(null);
            }}
          >
            {t("setup.ai.again")}
          </Button>
          <Button onClick={apply} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} {t("setup.ai.apply")}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- running ---------- */
  // A job that the server no longer knows (e.g. after a restart) is reported as an error below.
  const lost = !!jobId && job === null;
  if (jobId && !lost && job?.status !== "error") {
    return (
      <Card>
        <p className="flex items-center gap-2" role="status">
          <Loader2 className="size-5 animate-spin" /> {t("setup.ai.running")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {job?.provider ?? prov?.id} · {job?.model ?? model}
        </p>
        <FileReport files={job?.files} />
      </Card>
    );
  }

  /* ---------- input ---------- */
  return (
    <Card title={t("setup.ai.title")} takeaway={t("setup.ai.help")}>
      {lost && (
        <p className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {t("setup.ai.failed", { error: "the server restarted during the analysis" })}
        </p>
      )}
      {job?.status === "error" && (
        <p className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {t("setup.ai.failed", { error: job.error ?? "" })}
        </p>
      )}
      {!configured.length ? (
        <>
          <p className="text-sm">{t("setup.ai.notConfigured")}</p>
          <Button className="mt-4" variant="ghost" onClick={onCancel}>
            {t("setup.back")}
          </Button>
        </>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              {t("setup.ai.provider")}
              <select
                className="mt-1 w-full rounded-md border bg-card p-2"
                value={prov?.id}
                onChange={(e) => setProviderId(e.target.value as AiProviderId)}
              >
                {configured.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              {t("setup.ai.model")}
              {prov?.chooseModel ? (
                <>
                  <Input
                    list="ai-models"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={
                      modelsLoading ? t("setup.ai.modelsLoading") : t("setup.ai.modelSearch")
                    }
                  />
                  <datalist id="ai-models">
                    {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </datalist>
                  {modelsError && (
                    <span className="text-xs text-destructive">
                      {(modelsError as Error).message}
                    </span>
                  )}
                </>
              ) : (
                <Input value={model} readOnly />
              )}
            </label>
          </div>
          <div>
            <p className="font-medium">{t("setup.ai.input")}</p>
            <p className="text-xs text-muted-foreground">{t("setup.ai.inputHelp")}</p>
            <div className="mt-2 rounded-lg border border-dashed p-3">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-3 py-1.5 hover:bg-muted">
                <FileUp className="size-4" /> {t("setup.ai.addFiles")}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.xlsx,.xlsm,.pptx,.doc,.xls,.ppt,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.tsv,.json,.xml,.html,text/*"
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f) => {
                    const hint = fileHint(f);
                    return (
                      <li key={f.name} className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{f.name}</span>
                        <span className="text-muted-foreground">
                          {(f.size / 1048576).toFixed(1)} MB
                        </span>
                        {hint && <span className="text-destructive">{hint}</span>}
                        <button
                          type="button"
                          className="ml-auto rounded p-0.5 hover:bg-muted"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => setFiles(files.filter((x) => x !== f))}
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {t("setup.ai.filesHelp")}
                {files.length > 0 && ` · ${totalMb.toFixed(1)} MB / 30 MB`}
              </p>
            </div>
            <Textarea
              className="mt-2 min-h-32 text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("setup.ai.placeholder")}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("setup.ai.privacy")}</p>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={onCancel}>
              {t("setup.back")}
            </Button>
            <Button
              onClick={analyze}
              disabled={
                busy || (text.trim().length < 20 && !files.length) || !model || totalMb > 30
              }
            >
              <Sparkles className="size-4" /> {t("setup.ai.analyze")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
