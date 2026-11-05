import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Monitor, Smartphone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction, useContacts, useProcesses, useRoles, useSituation } from "@/shared/hooks";
import { latestVersion, validateFlowchart } from "@/domain/rules";
import type { GuidanceContent, GuidanceStatus } from "@/domain/types";
import { DOMAINS } from "@/domain/types";
import { repos } from "@/data";
import { PageHeader, Card } from "@/features/admin/ui";
import { FlowBuilder } from "@/features/admin/FlowBuilder";
import { SituationGuidance } from "@/features/portal/SituationGuidance";
import { Pill } from "@/shared/components/badges";
import { both } from "@/shared/format";
import { PermissionGate } from "@/auth/permissions";
import { t } from "@/i18n";

export const Route = createFileRoute("/admin/guidance/$id")({
  head: () => ({
    meta: [
      { title: "Edit guidance — IRTrack" },
      { name: "description", content: "Edit situation guidance and its flowchart." },
      { property: "og:title", content: "Edit guidance — IRTrack" },
      { property: "og:description", content: "Edit situation guidance and its flowchart." },
    ],
  }),
  component: Editor,
});

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function Editor() {
  const { id } = Route.useParams();
  const { data: s } = useSituation(id);
  const { data: contacts = [] } = useContacts({ includeArchived: true });
  const { data: roles = [] } = useRoles();
  const { data: processes = [] } = useProcesses();
  const [draft, setDraft] = useState<GuidanceContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [compare, setCompare] = useState<number | null>(null);
  useEffect(() => {
    if (s && !draft) setDraft(structuredClone(latestVersion(s).content));
  }, [s, draft]);
  useBlocker({
    shouldBlockFn: () => dirty && !confirm(t("common.unsaved")),
    enableBeforeUnload: () => dirty,
  });
  const issues = useMemo(() => {
    if (!draft) return [];
    const base = validateFlowchart(draft.flowchart, {
      contacts: new Set(contacts.filter((c) => !c.archived).map((c) => c.id)),
      roles: new Set(roles.map((r) => r.id)),
    });
    draft.contactIds.forEach((cid) => {
      const c = contacts.find((x) => x.id === cid);
      if (c && !c.phone && !c.email)
        base.push({ severity: "warning", message: `${c.name} has no phone or email.` });
    });
    if (new Date(draft.reviewDate) < new Date())
      base.push({ severity: "warning", message: "This guidance is overdue for review." });
    return base;
  }, [draft, contacts, roles]);
  const errors = issues.filter((i) => i.severity === "error");
  const save = useAction(async () => repos().guidance.saveDraft(id, draft!));
  const status = useAction(async (a: { v: number; st: GuidanceStatus }) =>
    repos().guidance.setStatus(id, a.v, a.st),
  );
  const restore = useAction(async (v: number) => repos().guidance.restore(id, v));
  if (!s || !draft) return <p role="status">Loading…</p>;
  const latest = latestVersion(s);
  const set = (p: Partial<GuidanceContent>) => {
    setDraft({ ...draft, ...p });
    setDirty(true);
  };
  const saveDraft = async () => {
    await save.mutateAsync(undefined);
    setDirty(false);
    toast.success("Draft saved");
  };
  const publish = async () => {
    if (errors.length) {
      toast.error("Fix the validation errors before publishing.");
      return;
    }
    if (dirty) await saveDraft();
    const fresh = await repos().guidance.get(id);
    const v = latestVersion(fresh!);
    if (
      !confirm(
        `Publish v${v.version}? It replaces the current published version in the User Portal.`,
      )
    )
      return;
    await status.mutateAsync({ v: v.version, st: "published" });
    toast.success(`v${v.version} published`);
  };
  const cmp = compare ? s.versions.find((v) => v.version === compare)?.content : undefined;

  return (
    <div>
      <Link to="/admin/guidance" className="text-sm text-primary underline">
        ← Guidance
      </Link>
      <PageHeader
        title={draft.title}
        description={`Latest: v${latest.version} (${latest.status}). ${dirty ? "Unsaved changes." : ""}`}
        actions={
          <PermissionGate action="guidance.edit">
            <Button
              variant="ghost"
              disabled={!dirty}
              onClick={() => {
                setDraft(structuredClone(latest.content));
                setDirty(false);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={saveDraft}>
              Save draft
            </Button>
            {latest.status === "draft" && !dirty && (
              <Button
                variant="outline"
                onClick={() => status.mutate({ v: latest.version, st: "review" })}
              >
                Send for review
              </Button>
            )}
            <PermissionGate action="guidance.publish">
              <Button onClick={publish} disabled={errors.length > 0}>
                Publish
              </Button>
            </PermissionGate>
          </PermissionGate>
        }
      />
      {errors.length > 0 && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          {errors.length} problem(s) block publishing. See the Flowchart tab.
        </p>
      )}
      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="flow">
            Flowchart {errors.length > 0 && <Pill tone="danger">{errors.length}</Pill>}
          </TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>
        <TabsContent value="content">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Basics">
              <div className="space-y-3 text-sm">
                <label className="block">
                  Name
                  <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
                </label>
                <label className="block">
                  Plain-language description
                  <Textarea
                    value={draft.description}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                </label>
                <label className="block">
                  Keywords (space separated)
                  <Input
                    value={draft.keywords.join(" ")}
                    onChange={(e) => set({ keywords: e.target.value.split(/\s+/) })}
                  />
                </label>
                <label className="block">
                  Category
                  <Input
                    value={draft.category}
                    onChange={(e) => set({ category: e.target.value })}
                  />
                </label>
                <fieldset>
                  <legend>Domains</legend>
                  <div className="flex flex-wrap gap-2">
                    {DOMAINS.map((d) => (
                      <label key={d} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={draft.domains.includes(d)}
                          onChange={(e) =>
                            set({
                              domains: e.target.checked
                                ? [...draft.domains, d]
                                : draft.domains.filter((x) => x !== d),
                            })
                          }
                        />
                        {t(`domain.${d}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block">
                  Process
                  <select
                    className="mt-1 w-full rounded-md border bg-card p-2"
                    value={draft.processId}
                    onChange={(e) => set({ processId: e.target.value })}
                  >
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    Owner
                    <Input value={draft.owner} onChange={(e) => set({ owner: e.target.value })} />
                  </label>
                  <label className="block">
                    Review date
                    <Input
                      type="date"
                      value={draft.reviewDate.slice(0, 10)}
                      onChange={(e) => set({ reviewDate: new Date(e.target.value).toISOString() })}
                    />
                  </label>
                </div>
              </div>
            </Card>
            <Card title="Guidance (one item per line)">
              <div className="space-y-3 text-sm">
                <label className="block">
                  What you may see
                  <Textarea
                    rows={3}
                    value={draft.see.join("\n")}
                    onChange={(e) => set({ see: lines(e.target.value) })}
                  />
                </label>
                <label className="block">
                  Do this first
                  <Textarea
                    rows={3}
                    value={draft.doFirst.join("\n")}
                    onChange={(e) => set({ doFirst: lines(e.target.value) })}
                  />
                </label>
                <label className="block">
                  Do not do this
                  <Textarea
                    rows={3}
                    value={draft.dont.join("\n")}
                    onChange={(e) => set({ dont: lines(e.target.value) })}
                  />
                </label>
                <label className="block">
                  What happens next
                  <Textarea
                    rows={3}
                    value={draft.next.join("\n")}
                    onChange={(e) => set({ next: lines(e.target.value) })}
                  />
                </label>
              </div>
            </Card>
            <Card title="Linked contacts">
              <div className="grid max-h-64 grid-cols-1 gap-1 overflow-auto text-sm sm:grid-cols-2">
                {contacts
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <label key={c.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.contactIds.includes(c.id)}
                        onChange={(e) =>
                          set({
                            contactIds: e.target.checked
                              ? [...draft.contactIds, c.id]
                              : draft.contactIds.filter((x) => x !== c.id),
                          })
                        }
                      />
                      {c.name}
                    </label>
                  ))}
              </div>
            </Card>
            <Card title="Linked roles">
              <div className="grid grid-cols-2 gap-1 text-sm">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.roleIds.includes(r.id)}
                      onChange={(e) =>
                        set({
                          roleIds: e.target.checked
                            ? [...draft.roleIds, r.id]
                            : draft.roleIds.filter((x) => x !== r.id),
                        })
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="flow">
          <FlowBuilder
            value={draft.flowchart}
            onChange={(f) => set({ flowchart: f })}
            issues={issues}
            contacts={contacts}
            roles={roles}
            processes={processes}
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="mb-3 flex gap-2">
            <Button
              size="sm"
              variant={preview === "desktop" ? "default" : "outline"}
              onClick={() => setPreview("desktop")}
            >
              <Monitor className="size-4" /> Desktop
            </Button>
            <Button
              size="sm"
              variant={preview === "mobile" ? "default" : "outline"}
              onClick={() => setPreview("mobile")}
            >
              <Smartphone className="size-4" /> Mobile
            </Button>
            <span className="self-center text-sm text-muted-foreground">
              Preview of your current draft — not visible in the portal until published.
            </span>
          </div>
          <div
            className={
              preview === "mobile"
                ? "mx-auto max-w-[390px] rounded-[2rem] border-8 border-foreground/80 bg-background p-4"
                : "rounded-xl border bg-background p-6"
            }
          >
            <SituationGuidance
              key={preview}
              slug={s.slug}
              c={draft}
              contacts={contacts}
              roles={roles}
              preview
              forceMode={preview}
            />
          </div>
        </TabsContent>
        <TabsContent value="versions">
          <Card title="Version history">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1">Version</th>
                  <th>Status</th>
                  <th>Saved</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...s.versions].reverse().map((v) => (
                  <tr key={v.version} className="border-t">
                    <td className="py-2">v{v.version}</td>
                    <td>
                      <Pill tone={v.status === "published" ? "primary" : "neutral"}>
                        {v.status}
                      </Pill>
                    </td>
                    <td>
                      {both(v.savedAt)} · {v.savedBy}
                    </td>
                    <td className="space-x-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setCompare(v.version)}>
                        Compare
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await restore.mutateAsync(v.version);
                          setDraft(null);
                          setDirty(false);
                          toast.success(`v${v.version} restored as draft`);
                        }}
                      >
                        Restore
                      </Button>
                      {v.status !== "archived" && v.status !== "published" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => status.mutate({ v: v.version, st: "archived" })}
                        >
                          Archive
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cmp && (
              <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                <p className="font-semibold">v{compare}</p>
                <p className="font-semibold">Current draft</p>
                {(["title", "description"] as const).map((k) => [
                  <p key={k + "a"} className={cmp[k] !== draft[k] ? "bg-destructive/10" : ""}>
                    {cmp[k]}
                  </p>,
                  <p key={k + "b"} className={cmp[k] !== draft[k] ? "bg-success/15" : ""}>
                    {draft[k]}
                  </p>,
                ])}
                {(["see", "doFirst", "dont", "next"] as const).map((k) => [
                  <ul
                    key={k + "a"}
                    className={`list-disc pl-4 ${cmp[k].join() !== draft[k].join() ? "bg-destructive/10" : ""}`}
                  >
                    {cmp[k].map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>,
                  <ul
                    key={k + "b"}
                    className={`list-disc pl-4 ${cmp[k].join() !== draft[k].join() ? "bg-success/15" : ""}`}
                  >
                    {draft[k].map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>,
                ])}
                <p>
                  {cmp.flowchart.nodes.length} steps, {cmp.flowchart.edges.length} connections
                </p>
                <p>
                  {draft.flowchart.nodes.length} steps, {draft.flowchart.edges.length} connections
                </p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
