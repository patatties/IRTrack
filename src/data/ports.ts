import type {
  Activation,
  AuditEvent,
  Contact,
  ContactInput,
  DomainId,
  GuidanceContent,
  GuidanceSituation,
  GuidanceStatus,
  Incident,
  LevelId,
  PhaseId,
  Process,
  ReportingRule,
  ResponsibilityAssignment,
  Role,
  Settings,
  Severity,
  SourceId,
  SourceSystem,
  Playbook,
  TemplateApplyResult,
  TemplateItem,
  TemplateKind,
} from "@/domain/types";
import type { ViewContext } from "@/domain/rules";

export interface SetupStatus {
  completed: boolean;
  completedAt?: string;
  counts: Record<TemplateKind, number>;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IncidentQuery {
  search?: string;
  domain?: DomainId;
  phase?: PhaseId;
  severity?: Severity;
  minSeverity?: Severity;
  level?: LevelId;
  source?: SourceId;
  processId?: string;
  location?: string;
  service?: string;
  category?: string;
  businessUnit?: string;
  days?: number;
  open?: boolean;
  weekday?: number;
  hour?: number;
  sort?: "createdAt" | "severity" | "ref";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  ctx?: ViewContext;
}

export interface DashboardFilters {
  days: number;
  domain?: DomainId;
  processId?: string;
  source?: SourceId;
  location?: string;
  businessUnit?: string;
  ctx: ViewContext;
}

export interface Kpi {
  key: string;
  value: number;
  previous: number;
  unit?: string;
  better: "up" | "down";
  link: IncidentQuery;
}

export interface DashboardData {
  summary: { serious: number; deadlinesToday: number; open: number };
  kpis: Kpi[];
  funnel: { stage: string; value: number; link: IncidentQuery }[];
  volume: Record<string, number | string>[];
  heatmap: number[][];
  severity: { severity: Severity; level: LevelId; count: number }[];
  phaseHours: { phase: PhaseId; hours: number }[];
  topServices: { name: string; count: number }[];
  topLocations: { name: string; count: number }[];
  topCategories: { name: string; count: number }[];
  latest: { at: string; ref: string; id: string; text: string }[];
  serious: Incident[];
}

export interface NewIncidentInput {
  title: string;
  description: string;
  processId: string;
  severity: Severity;
  level: LevelId;
  startedAt: string;
  detectedAt: string;
  awareAt: string;
  personalData: boolean;
  location: string;
  suggestion: Incident["suggestion"];
}

export interface Repositories {
  incidents: {
    list(q: IncidentQuery): Promise<Page<Incident>>;
    get(id: string): Promise<Incident | undefined>;
    create(input: NewIncidentInput): Promise<Incident>;
    update(
      id: string,
      patch: Partial<Incident>,
      summary: string,
      highlight?: boolean,
    ): Promise<Incident>;
    activate(id: string, a: Omit<Activation, "id" | "at" | "by">): Promise<Incident>;
    reapplyRules(id: string): Promise<Incident>;
    track(
      ref: string,
    ): Promise<{ ref: string; phase: PhaseId; updatedAt: string; contact: string } | undefined>;
  };
  analytics: { dashboard(f: DashboardFilters): Promise<DashboardData> };
  contacts: {
    list(opts?: { includeArchived?: boolean; search?: string }): Promise<Contact[]>;
    save(id: string | null, input: ContactInput): Promise<Contact>;
    archive(id: string, archived: boolean): Promise<void>;
    move(id: string, dir: -1 | 1): Promise<void>;
    verify(id: string): Promise<void>;
    importCsv(csv: string): Promise<number>;
  };
  roles: {
    list(): Promise<Role[]>;
    save(role: Role): Promise<Role>;
    raci(processId?: string): Promise<ResponsibilityAssignment[]>;
    setRaci(a: ResponsibilityAssignment): Promise<void>;
  };
  processes: { list(): Promise<Process[]>; save(p: Process): Promise<Process> };
  guidance: {
    list(): Promise<GuidanceSituation[]>;
    get(idOrSlug: string): Promise<GuidanceSituation | undefined>;
    saveDraft(id: string, content: GuidanceContent): Promise<GuidanceSituation>;
    setStatus(id: string, version: number, status: GuidanceStatus): Promise<GuidanceSituation>;
    restore(id: string, version: number): Promise<GuidanceSituation>;
  };
  rules: { list(): Promise<ReportingRule[]>; save(r: ReportingRule): Promise<ReportingRule> };
  sources: {
    list(): Promise<SourceSystem[]>;
    preview(
      id: SourceId,
    ): Promise<{ row: Record<string, string>; mapped: Partial<Incident>; duplicateOf?: string }[]>;
    runImport(id: SourceId): Promise<{ imported: number; duplicates: number }>;
  };
  settings: {
    get(): Promise<Settings>;
    save<K extends keyof Settings>(section: K, value: Settings[K]): Promise<Settings>;
    setSecret(key: string, value: string): Promise<void>;
    testConnection(): Promise<{ ok: boolean; message: string; ms: number }>;
  };
  audit: { list(limit?: number): Promise<AuditEvent[]> };
  system: { info(): Promise<SystemInfo> };
  templates: {
    list(kind: TemplateKind): Promise<TemplateItem[]>;
    apply(kind: TemplateKind, ids: string[]): Promise<TemplateApplyResult>;
    playbooks(): Promise<Playbook[]>;
    masterData(): Promise<Record<keyof Settings["masterData"], string[]>>;
  };
  setup: {
    status(): Promise<SetupStatus>;
    complete(skipped?: boolean): Promise<void>;
    /** Fills a new database with the complete demo data set and completes the setup. */
    loadDemo(): Promise<{ incidents: number }>;
  };
  ai: {
    providers(): Promise<AiProviderInfo[]>;
    models(provider: AiProviderId): Promise<AiModel[]>;
    /** Starts the analysis in the background; poll job() for the result. */
    analyze(input: {
      provider: AiProviderId;
      model: string;
      text: string;
      files: File[];
    }): Promise<AiJob>;
    job(id: string): Promise<AiJob | null>;
    apply(proposal: AiSetupProposal): Promise<AiApplyResult>;
  };
  assistant: {
    config(): Promise<AiChatConfig>;
    message(input: { chatId?: string; mode: AiChatMode; message: string }): Promise<AiChatTurn>;
    decide(input: { chatId: string; approve: boolean }): Promise<AiChatTurn>;
  };
}

export interface SystemInfo {
  version: string;
  runtime: string;
  sqliteVersion: string;
  schemaVersion: number;
  /** Path of the SQLite file inside the container (set by IRTRACK_DB). */
  dbPath: string;
  dbSizeBytes: number;
  createdAt?: string;
  startedAt: string;
}

/* ---------- AI-assisted setup ---------- */
export type AiProviderId = "anthropic" | "openai" | "openrouter" | "ollama";

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  configured: boolean;
  /** Model used when none is chosen (from the .env file). */
  defaultModel: string;
  /** The model can be picked on the setup page (OpenRouter, Ollama). */
  chooseModel: boolean;
}

export interface AiModel {
  id: string;
  name: string;
}

export interface AiContactProposal {
  name: string;
  type: "person" | "team" | "mailbox" | "supplier" | "external";
  role: string;
  team: string;
  organization: string;
  phone: string;
  email: string;
  availability: string;
  whenToContact: string;
  outOfHours: string;
  /** Roles this contact fills: template role ids (e.g. "r-privacy") or names of own roles in this proposal. */
  roles: string[];
  emergency: boolean;
  /** Where this came from (file + short quote). Shown on hover in the review only; never saved. */
  source?: string;
}

/** What the AI suggests; nothing is stored until the user applies (a selection of) it. */
export interface AiSetupProposal {
  organization: { name?: string; timezone?: string };
  portal: { title?: string; emergencyNumber?: string; emergencyMessage?: string };
  masterData: Record<
    "locations" | "services" | "businessUnits" | "departments" | "suppliers",
    string[]
  >;
  contacts: AiContactProposal[];
  roles: {
    name: string;
    summary: string;
    level: LevelId | "";
    responsibilities: string[];
    source?: string;
  }[];
  templates: Record<
    "roles" | "rules" | "processes" | "guidance" | "sources",
    { id: string; name: string; reason: string }[]
  >;
  notes: string[];
  /** Provenance for the review screen only (file + short quote); never saved. */
  sources?: {
    organization?: string;
    portal?: string;
    masterData?: Partial<
      Record<
        "locations" | "services" | "businessUnits" | "departments" | "suppliers",
        Record<string, string>
      >
    >;
  };
}

export interface AiJob {
  id: string;
  status: "running" | "done" | "error";
  provider: AiProviderId;
  model: string;
  startedAt: string;
  proposal?: AiSetupProposal;
  error?: string;
  /** The input was longer than the limit and was cut off. */
  truncated?: boolean;
  /** How each uploaded file was handled: sent natively (PDF, image), as extracted text, or skipped. */
  files?: { name: string; handling: "native" | "text" | "skipped"; note: string }[];
}

export interface AiApplyResult {
  settings: string[];
  contacts: number;
  roles: number;
  templates: number;
  /** Saved through IRTrack's own MCP server (loopback). */
  via: "mcp";
  mcpCalls: number;
  /** Items that could not be saved, with the reason. */
  failed: string[];
}

/* ---------- AI assistant (portal and Admin Console) ---------- */
export type AiChatMode = "portal" | "admin";

export interface AiChatConfig {
  available: boolean;
  provider?: AiProviderId;
  providerLabel?: string;
  model?: string;
}

export interface AiChatTurn {
  chatId: string;
  /** The assistant's answer in this turn (may be empty while a change waits for approval). */
  reply: string;
  /** Changes the assistant wants to make; nothing happens until the user approves (admin only). */
  pending: { id: string; name: string; title: string; args: Record<string, unknown> }[];
  /** Tools that were run in this turn. */
  actions: { name: string; title: string; write: boolean; ok: boolean }[];
}
