import { addDays, addHours, addMinutes, addMonths } from "date-fns";
import type {
  Classification,
  DeadlineStage,
  Flowchart,
  GuidanceSituation,
  GuidanceVersion,
  Incident,
  LevelId,
  ReportingDeadline,
  ReportingRule,
  Severity,
} from "./types";

/** CRT applies only when the event is happening/unavoidable AND the impact is critical. */
export function crtApplies(happening: boolean, critical: boolean) {
  return happening && critical;
}

export function crtExplanation(happening: boolean, critical: boolean): string | null {
  if (crtApplies(happening, critical)) return null;
  if (!happening && !critical)
    return "The event is not happening yet and the impact is not critical. Handle it at Elevated or Coordinated level and keep monitoring.";
  if (!happening)
    return "The risk is serious but can still realistically be prevented. Keep the IRT in charge and monitor closely.";
  return "The event is happening, but the impact is not critical. The IRT can coordinate this without a CRT.";
}

function addDuration(d: Date, s: DeadlineStage) {
  switch (s.unit) {
    case "minutes":
      return addMinutes(d, s.amount);
    case "hours":
      return addHours(d, s.amount);
    case "days":
      return addDays(d, s.amount);
    case "months":
      return addMonths(d, s.amount);
  }
}

/** Builds a deadline snapshot from a rule. The snapshot is stored on the incident. */
export function computeDeadlines(
  rule: ReportingRule,
  incident: Pick<Incident, "startedAt" | "detectedAt" | "awareAt">,
  now = new Date(),
): ReportingDeadline[] {
  const anchor = new Date(incident[rule.anchor]);
  let prev = anchor;
  return rule.stages.map((s, i) => {
    const due = addDuration(s.from === "previous" ? prev : anchor, s);
    prev = due;
    return {
      id: `${rule.id}-${i}`,
      ruleId: rule.id,
      ruleVersion: rule.version,
      ruleName: rule.name,
      stage: s.label,
      dueAt: due.toISOString(),
      status: due < now ? "overdue" : "open",
      ownerRole: rule.ownerRole,
      draft: "",
    };
  });
}

export interface ReportAnswers {
  what: string;
  situationId?: string;
  danger: boolean;
  personalData: boolean;
  affected: "me" | "team" | "many" | "public";
}

const KEYWORDS: [RegExp, string][] = [
  [/ransom|encrypt|malware|virus|hack|phish|suspicious|link|password/i, "p-security"],
  [/personal data|wrong person|gdpr|privacy|misdirect|leak/i, "p-privacy"],
  [/fire|smoke|water|flood|leak|building|power|door|elevator/i, "p-facilities"],
  [/injur|accident|hurt|fall|wound|ambulance/i, "p-safety"],
  [/harass|behaviou?r|integrity|bully|fraud/i, "p-hr"],
  [/supplier|vendor|outage|nationwide|continuity/i, "p-continuity"],
  [/down|slow|error|laptop|phone|system|application|printer/i, "p-it"],
];

export function suggest(a: ReportAnswers, situationProcess?: string) {
  const reasons: string[] = [];
  let processId = situationProcess ?? "p-it";
  if (situationProcess) reasons.push("You started from a situation that belongs to this process.");
  else {
    const hit = KEYWORDS.find(([re]) => re.test(a.what));
    if (hit) {
      processId = hit[1];
      reasons.push("Words in your description match this process.");
    } else reasons.push("No specific keywords found, so the general IT process is used.");
  }
  if (a.personalData && processId !== "p-privacy") {
    processId = "p-privacy";
    reasons.push("Personal data may be involved, so the privacy process applies.");
  }
  let severity: Severity = 1;
  if (a.affected === "team") severity = 2;
  if (a.affected === "many") severity = 3;
  if (a.affected === "public") severity = 3;
  reasons.push(
    `Impact: ${a.affected === "me" ? "only you" : a.affected === "team" ? "your team" : a.affected === "many" ? "many people" : "citizens or the public"}.`,
  );
  if (a.danger) {
    severity = 4;
    reasons.push("You reported immediate danger, so severity is set to Critical.");
  }
  if (a.personalData && severity < 2) {
    severity = 2;
    reasons.push("Personal data raises the minimum severity to Medium.");
  }
  const level: LevelId = severity === 4 ? "coordinated" : severity === 3 ? "elevated" : "standard";
  if (severity === 4)
    reasons.push(
      "Critical severity needs cross-department coordination (IRT). The CRT is decided separately.",
    );
  return { processId, severity, level, reasons };
}

export interface FlowIssue {
  nodeId?: string;
  severity: "error" | "warning";
  message: string;
}

export function validateFlowchart(
  f: Flowchart,
  refs: { contacts: Set<string>; roles: Set<string> },
): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const out = new Map<string, number>();
  const inc = new Map<string, number>();
  f.edges.forEach((e) => {
    out.set(e.source, (out.get(e.source) ?? 0) + 1);
    inc.set(e.target, (inc.get(e.target) ?? 0) + 1);
  });
  const starts = f.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1)
    issues.push({ severity: "error", message: "The flowchart needs exactly one Start step." });
  for (const n of f.nodes) {
    const o = out.get(n.id) ?? 0;
    const i = inc.get(n.id) ?? 0;
    const terminal = n.type === "end" || n.type === "report";
    if (n.type !== "start" && i === 0)
      issues.push({
        nodeId: n.id,
        severity: "error",
        message: `"${n.label}" is not connected to anything before it.`,
      });
    if (!terminal && o === 0)
      issues.push({
        nodeId: n.id,
        severity: "error",
        message: `"${n.label}" is a dead end. Connect it to a next step, End or Report.`,
      });
    if (n.type === "question" && o < 2)
      issues.push({
        nodeId: n.id,
        severity: "error",
        message: `Question "${n.label}" needs at least two answers.`,
      });
    if (n.ref?.kind === "contact" && !refs.contacts.has(n.ref.id))
      issues.push({
        nodeId: n.id,
        severity: "error",
        message: `"${n.label}" points to a contact that no longer exists.`,
      });
    if (n.ref?.kind === "role" && !refs.roles.has(n.ref.id))
      issues.push({
        nodeId: n.id,
        severity: "error",
        message: `"${n.label}" points to a role that no longer exists.`,
      });
    if (n.type === "contact" && !n.ref)
      issues.push({
        nodeId: n.id,
        severity: "warning",
        message: `Contact step "${n.label}" has no contact selected.`,
      });
  }
  return issues;
}

/** The portal only ever shows the newest published version. */
export function publishedVersion(s: GuidanceSituation): GuidanceVersion | undefined {
  return [...s.versions]
    .sort((a, b) => b.version - a.version)
    .find((v) => v.status === "published");
}
export function latestVersion(s: GuidanceSituation): GuidanceVersion {
  return [...s.versions].sort((a, b) => b.version - a.version)[0];
}

export type ViewContext = "admin" | "wallboard" | "executive" | "portal";

export function isConfidential(c: Classification) {
  return c !== "normal";
}

/** Central masking rule for confidential incidents. */
export function maskIncident<
  T extends Pick<Incident, "classification" | "title" | "description" | "ownerId" | "location">,
>(i: T, ctx: ViewContext): T {
  if (ctx === "admin" || !isConfidential(i.classification)) return i;
  return { ...i, title: "Confidential incident", description: "", ownerId: "", location: "—" };
}

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
