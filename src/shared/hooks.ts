import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { repos } from "@/data";
import type { DashboardFilters, IncidentQuery } from "@/data/ports";
import type { TemplateKind } from "@/domain/types";

export const useContacts = (opts?: { includeArchived?: boolean; search?: string }) =>
  useQuery({ queryKey: ["contacts", opts], queryFn: () => repos().contacts.list(opts) });
export const useRoles = () =>
  useQuery({ queryKey: ["roles"], queryFn: () => repos().roles.list() });
export const useRaci = (processId?: string) =>
  useQuery({ queryKey: ["raci", processId], queryFn: () => repos().roles.raci(processId) });
export const useProcesses = () =>
  useQuery({ queryKey: ["processes"], queryFn: () => repos().processes.list() });
export const useSituations = () =>
  useQuery({ queryKey: ["guidance"], queryFn: () => repos().guidance.list() });
export const useSituation = (id: string) =>
  useQuery({ queryKey: ["guidance", id], queryFn: () => repos().guidance.get(id) });
export const useRules = () =>
  useQuery({ queryKey: ["rules"], queryFn: () => repos().rules.list() });
export const useSources = () =>
  useQuery({ queryKey: ["sources"], queryFn: () => repos().sources.list() });
export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => repos().settings.get() });
export const useAudit = (limit?: number) =>
  useQuery({ queryKey: ["audit", limit], queryFn: () => repos().audit.list(limit) });
export const useIncidents = (q: IncidentQuery) =>
  useQuery({
    queryKey: ["incidents", q],
    queryFn: () => repos().incidents.list(q),
    placeholderData: keepPreviousData,
  });
export const useIncident = (id: string) =>
  useQuery({ queryKey: ["incident", id], queryFn: () => repos().incidents.get(id) });
export const useDashboard = (f: DashboardFilters) =>
  useQuery({
    queryKey: ["dashboard", f],
    queryFn: () => repos().analytics.dashboard(f),
    placeholderData: keepPreviousData,
  });

/** Mutation that invalidates everything afterwards — simple and safe. */
export function useAction<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export const useSetupStatus = () =>
  useQuery({ queryKey: ["setup"], queryFn: () => repos().setup.status(), retry: false });
export const useTemplates = (kind: TemplateKind) =>
  useQuery({ queryKey: ["templates", kind], queryFn: () => repos().templates.list(kind) });
export const usePlaybooks = () =>
  useQuery({
    queryKey: ["playbooks"],
    queryFn: () => repos().templates.playbooks(),
    staleTime: Infinity,
  });
export const useMasterDataExamples = () =>
  useQuery({
    queryKey: ["master-data-examples"],
    queryFn: () => repos().templates.masterData(),
    staleTime: Infinity,
  });
