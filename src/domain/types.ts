import { z } from "zod";

export const PHASES = ["report", "assess", "respond", "recover", "close"] as const;
export type PhaseId = (typeof PHASES)[number];

export const LEVELS = ["standard", "elevated", "coordinated", "critical"] as const;
export type LevelId = (typeof LEVELS)[number];

export const SEVERITIES = [1, 2, 3, 4] as const; // 1 = Low ... 4 = Critical
export type Severity = (typeof SEVERITIES)[number];

export const CLASSIFICATIONS = ["normal", "confidential", "strict"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const TLP = ["clear", "green", "amber", "amber-strict", "red"] as const;
export type Tlp = (typeof TLP)[number];

export const DOMAINS = [
  "it",
  "security",
  "privacy",
  "facilities",
  "safety",
  "hr",
  "continuity",
] as const;
export type DomainId = (typeof DOMAINS)[number];

export const SOURCES = ["topdesk", "servicenow", "jira", "csv", "webhook", "irtrack"] as const;
export type SourceId = (typeof SOURCES)[number];

export type ISO = string;

export interface Audited {
  createdAt: ISO;
  createdBy: string;
  updatedAt: ISO;
  updatedBy: string;
}

export interface Task {
  id: string;
  title: string;
  phase: PhaseId;
  roleId: string;
  done: boolean;
}
export interface Decision {
  id: string;
  what: string;
  why: string;
  by: string;
  at: ISO;
  override?: boolean;
}
export interface TimelineEvent {
  id: string;
  at: ISO;
  actor: string;
  kind:
    | "created"
    | "phase"
    | "level"
    | "note"
    | "activation"
    | "decision"
    | "comm"
    | "sync"
    | "deadline"
    | "override";
  text: string;
  highlight?: boolean;
}
export interface Communication {
  id: string;
  audience: "internal" | "external";
  title: string;
  body: string;
  status: "draft" | "sent";
  at: ISO;
}
export interface Attachment {
  id: string;
  name: string;
  size: number;
  at: ISO;
  by: string;
}
export interface ImprovementAction {
  id: string;
  title: string;
  owner: string;
  due: ISO;
  done: boolean;
}
export interface Activation {
  id: string;
  team: "irt" | "crt";
  at: ISO;
  by: string;
  rationale: string;
  departments?: string[];
  happening?: boolean;
  critical?: boolean;
  override?: boolean;
  stoodDownAt?: ISO;
  standDownRationale?: string;
}
export interface ReportingDeadline {
  id: string;
  ruleId: string;
  ruleVersion: number;
  ruleName: string;
  stage: string;
  dueAt: ISO;
  status: "open" | "submitted" | "overdue";
  ownerRole: string;
  draft: string;
}

export interface Incident extends Audited {
  id: string;
  ref: string;
  title: string;
  description: string;
  processId: string;
  processVersion: number;
  domain: DomainId;
  source: SourceId;
  sourceId: string;
  sourceUrl?: string;
  lastSyncAt?: ISO;
  sourceFields?: Record<string, string>;
  severity: Severity;
  level: LevelId;
  phase: PhaseId;
  classification: Classification;
  tlp?: Tlp;
  ownerId: string;
  location: string;
  service: string;
  businessUnit: string;
  category: string;
  startedAt: ISO;
  detectedAt: ISO;
  awareAt: ISO;
  firstResponseAt?: ISO;
  resolvedAt?: ISO;
  closedAt?: ISO;
  phaseHours?: Partial<Record<PhaseId, number>>;
  slaMet?: boolean;
  personalData?: boolean;
  nextStep?: string;
  tasks: Task[];
  decisions: Decision[];
  timeline: TimelineEvent[];
  comms: Communication[];
  attachments: Attachment[];
  actions: ImprovementAction[];
  deadlines: ReportingDeadline[];
  activations: Activation[];
  relatedIds: string[];
  suggestion?: {
    processId: string;
    severity: Severity;
    level: LevelId;
    reasons: string[];
    overridden: boolean;
  };
  reviewNotes?: string;
}

export interface Process extends Audited {
  id: string;
  name: string;
  purpose: string;
  domain: DomainId;
  version: number;
  phaseNames: Record<PhaseId, string>;
  levelNames: Record<LevelId, string>;
  roleIds: string[];
  triage: string[];
  tasks: { title: string; phase: PhaseId; roleId: string }[];
  reportingRuleIds: string[];
  templates: { title: string; body: string }[];
  irtCriteria: string;
  crtCriteria: string;
  situationIds: string[];
  alias?: { irt?: string; crt?: string };
}

export type NodeType = "start" | "question" | "action" | "contact" | "escalate" | "report" | "end";
export interface FlowchartNode {
  id: string;
  type: NodeType;
  label: string;
  ref?: { kind: "contact" | "role" | "process" | "level"; id: string };
  x: number;
  y: number;
}
export interface FlowchartEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
export interface Flowchart {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

export type GuidanceStatus = "draft" | "review" | "published" | "archived";
export interface GuidanceContent {
  title: string;
  description: string;
  keywords: string[];
  category: string;
  domains: DomainId[];
  see: string[];
  doFirst: string[];
  dont: string[];
  next: string[];
  processId: string;
  contactIds: string[];
  roleIds: string[];
  owner: string;
  reviewDate: ISO;
  icon: string;
  flowchart: Flowchart;
}
export interface GuidanceVersion {
  version: number;
  status: GuidanceStatus;
  savedAt: ISO;
  savedBy: string;
  content: GuidanceContent;
}
export interface GuidanceSituation {
  id: string;
  slug: string;
  versions: GuidanceVersion[];
}

export const ContactSchema = z.object({
  name: z.string().min(2, "Enter a name of at least 2 characters"),
  type: z.enum(["person", "team", "mailbox", "supplier", "external"]),
  role: z.string().min(1, "Enter a role"),
  team: z.string().min(1, "Enter a team or department"),
  organization: z.string(),
  phone: z.string(),
  mobile: z.string(),
  email: z.string().email("Enter a valid email address").or(z.literal("")),
  availability: z.string(),
  timezone: z.string(),
  outOfHours: z.string(),
  whenToContact: z.string(),
  backupId: z.string(),
  notes: z.string(),
  emergency: z.boolean(),
  /** Roles this contact fills. The escalation level comes from the roles; no roles = not on the ladder (suppliers, authorities, 112). */
  roleIds: z.array(z.string()).optional(),
  /** @deprecated Replaced by roleIds (schema v4). Kept only so older data can still be read. */
  escalationLevel: z.union([z.enum(LEVELS), z.literal("")]).optional(),
});
export type ContactInput = z.infer<typeof ContactSchema>;
export interface Contact extends ContactInput, Audited {
  id: string;
  order: number;
  archived: boolean;
  situationIds: string[];
  processIds: string[];
  lastVerifiedAt: ISO;
  verifiedBy: string;
}

export interface Role extends Audited {
  id: string;
  name: string;
  summary: string;
  /** Level on the escalation ladder this role works at. Missing or "": not tied to a level. */
  // Note: contactIds is derived by the server from Contact.roleIds (the contact side is the source).
  level?: LevelId | "";
  responsibilities: string[];
  skills: string[];
  decides: string[];
  contactIds: string[];
  onEscalation: string;
}

export type Raci = "R" | "A" | "C" | "I";
export interface ResponsibilityAssignment {
  id: string;
  processId: string;
  roleId: string;
  phase: PhaseId;
  value: Raci;
}

export type DurationUnit = "minutes" | "hours" | "days" | "months";
export interface DeadlineStage {
  label: string;
  amount: number;
  unit: DurationUnit;
  from: "anchor" | "previous";
}
export interface ReportingRule extends Audited {
  id: string;
  version: number;
  name: string;
  legalBasis: string;
  regulator: string;
  jurisdiction: string;
  processIds: string[];
  trigger: string;
  anchor: "startedAt" | "detectedAt" | "awareAt";
  stages: DeadlineStage[];
  reminders: string;
  ownerRole: string;
  effectiveFrom: ISO;
  active: boolean;
  history: { version: number; at: ISO; by: string; stages: DeadlineStage[] }[];
}

export interface SourceSystem {
  id: SourceId;
  name: string;
  status: "connected" | "warning" | "disconnected";
  lastSyncAt: ISO;
  fieldMap: { from: string; to: string }[];
  valueMap: { field: string; from: string; to: string }[];
  errors: { at: ISO; message: string }[];
}

export interface AuditEvent {
  id: string;
  at: ISO;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  highlight?: boolean;
}

export interface Settings {
  organization: {
    name: string;
    brandColor: string;
    language: string;
    timezone: string;
    dateFormat: string;
    businessHours: string;
    holidays: string;
  };
  /** The SQLite database itself is configured by the deployment (IRTRACK_DB); see SystemInfo. */
  database: { storage: "local" | "s3"; s3Bucket: string };
  portal: {
    title: string;
    welcome: string;
    emergencyMessage: string;
    emergencyNumber: string;
    contactVerificationDays: number;
    reviewReminderDays: number;
    featured: string[];
  };
  severity: { slaHours: Record<string, number> };
  teams: {
    irtName: string;
    crtName: string;
    irtDepartments: string[];
    crtActivators: string[];
    csirtAlias: string;
    certAlias: string;
  };
  notifications: {
    smtpHost: string;
    teamsWebhook: string;
    slackChannel: string;
    reminderHours: number;
  };
  privacy: { hrDefault: Classification; retentionMonths: number; anonymizeAfterMonths: number };
  masterData: {
    locations: string[];
    services: string[];
    businessUnits: string[];
    departments: string[];
    suppliers: string[];
  };
  secrets: Record<string, boolean>; // only "configured" flags; values are never stored
  history: { at: ISO; by: string; section: string; summary: string }[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  team: string;
  role: string;
}

/** Ready-made content for handling one kind of incident (see server/templates.ts). */
export interface Playbook {
  id: string;
  name: string;
  domain: DomainId;
  description: string;
  tasks: { title: string; phase: PhaseId; roleId: string }[];
  comms: { audience: "internal" | "external"; title: string; body: string }[];
  decisions: { what: string; why: string }[];
  actions: { title: string }[];
}

/** Kinds of configuration that can be added from the template catalog. */
export const TEMPLATE_KINDS = [
  "contacts",
  "roles",
  "rules",
  "processes",
  "guidance",
  "sources",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  group?: string;
  /** Already present in the database. */
  exists: boolean;
  /** Other templates that are added automatically with this one (names). */
  requires: string[];
}

export interface TemplateApplyResult {
  added: { kind: TemplateKind; id: string; name: string }[];
  skipped: { kind: TemplateKind; id: string; name: string }[];
}
