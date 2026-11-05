/**
 * Demo data: the complete former mock data set for the fictional "Northshore Municipality"
 * (contacts, roles, processes, guidance, ~2,500 historical incidents and 7 demo scenarios).
 * Loaded only when chosen in the setup wizard ("Load demo data"); see loadDemo() in server/catalog.ts.
 */
import { addDays, addHours, addMinutes, subDays } from "date-fns";
import { autoLayout } from "../src/domain/layout";
import { computeDeadlines } from "../src/domain/rules";
import { CONTACT_ROLES, ROLE_LEVEL } from "./templates";
import type {
  Contact,
  DomainId,
  Flowchart,
  FlowchartNode,
  GuidanceContent,
  GuidanceSituation,
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
  User,
} from "../src/domain/types";

/* ---------- deterministic PRNG ---------- */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function uuidFrom(r: () => number) {
  const h = () => Math.floor(r() * 16).toString(16);
  const s = (n: number) => Array.from({ length: n }, h).join("");
  return `${s(8)}-${s(4)}-4${s(3)}-a${s(3)}-${s(12)}`;
}
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

export const DEMO_USER: User = {
  id: "u-demo",
  name: "Robin Vermeer",
  email: "robin.vermeer@northshore.example",
  team: "Incident Management",
  role: "Incident manager",
};

const SYS = (at: string) => ({
  createdAt: at,
  createdBy: "system",
  updatedAt: at,
  updatedBy: "system",
});

export const LOCATIONS = [
  "City Hall",
  "Harbour Office",
  "North Depot",
  "Library Central",
  "Sports Park",
  "Data Centre East",
  "Field Operations",
];
export const SERVICES = [
  "Email",
  "Citizen Portal",
  "Permits System",
  "Payroll",
  "Network",
  "Telephony",
  "Workstations",
  "Building Access",
  "Waste Collection",
  "Parking App",
];
export const UNITS = [
  "Public Works",
  "Citizen Services",
  "Finance",
  "Social Affairs",
  "IT & Digital",
  "HR",
  "Facilities",
];
export const DEPARTMENTS = [
  "IT",
  "Security",
  "Privacy",
  "Facilities",
  "HR",
  "Communications",
  "Legal",
  "Public Works",
  "Management Board",
];

/* ---------- contacts ---------- */
type CSeed = [
  string,
  Contact["type"],
  string,
  string,
  string,
  string,
  string,
  boolean,
  string,
  string,
];
// name, type, role, team, phone, email, availability, emergency, whenToContact, outOfHours
const C: CSeed[] = [
  [
    "Emergency services",
    "external",
    "Police, fire, ambulance",
    "National",
    "112",
    "",
    "24/7",
    true,
    "Immediate danger to life, fire, serious injury.",
    "Always call 112.",
  ],
  [
    "Security Operations Centre",
    "team",
    "SOC analyst on duty",
    "Security",
    "+31 20 555 0101",
    "soc@northshore.example",
    "24/7",
    true,
    "Suspicious email, clicked links, malware, ransom messages.",
    "Same number, 24/7.",
  ],
  [
    "Service Desk",
    "team",
    "First line support",
    "IT & Digital",
    "+31 20 555 0100",
    "servicedesk@northshore.example",
    "Mon–Fri 07:30–18:00",
    false,
    "Anything not working: systems, accounts, devices.",
    "Outside hours call the on-call IT engineer.",
  ],
  [
    "On-call IT engineer",
    "person",
    "Out-of-hours IT",
    "IT & Digital",
    "+31 6 5550 0102",
    "itoncall@northshore.example",
    "Evenings, nights, weekends",
    true,
    "Critical systems down outside office hours.",
    "This is the out-of-hours contact.",
  ],
  [
    "Building Emergency Desk",
    "team",
    "Facilities emergency line",
    "Facilities",
    "+31 20 555 0110",
    "facilities@northshore.example",
    "24/7",
    true,
    "Water damage, fire alarms, power failure, access problems.",
    "Same number, 24/7.",
  ],
  [
    "Privacy Desk",
    "mailbox",
    "Privacy team",
    "Privacy",
    "+31 20 555 0120",
    "privacy@northshore.example",
    "Mon–Fri 09:00–17:00",
    false,
    "Personal data sent to the wrong person or lost.",
    "Outside hours call the Privacy Officer on duty.",
  ],
  [
    "Privacy Officer on duty",
    "person",
    "Privacy officer",
    "Privacy",
    "+31 6 5550 0121",
    "dpo@northshore.example",
    "24/7 on-call",
    true,
    "Possible data breach with high risk.",
    "On-call mobile.",
  ],
  [
    "Confidential Advisor",
    "person",
    "Confidential advisor",
    "HR",
    "+31 20 555 0130",
    "advisor@northshore.example",
    "Mon–Fri 09:00–17:00",
    false,
    "Unwanted behaviour, integrity concerns. Confidential.",
    "Leave a message; you will be called back next working day.",
  ],
  [
    "HR Duty Officer",
    "person",
    "HR lead",
    "HR",
    "+31 20 555 0131",
    "hr@northshore.example",
    "Mon–Fri 08:30–17:00",
    false,
    "Integrity reports, workplace issues.",
    "Use the HR mailbox.",
  ],
  [
    "Health & Safety Officer",
    "person",
    "Safety lead",
    "Facilities",
    "+31 20 555 0140",
    "safety@northshore.example",
    "Mon–Fri 07:00–17:00",
    false,
    "Workplace accidents and near misses.",
    "Call the Building Emergency Desk.",
  ],
  [
    "Field Operations Coordinator",
    "person",
    "Field supervisor",
    "Public Works",
    "+31 6 5550 0141",
    "fieldops@northshore.example",
    "Mon–Sat 06:00–20:00",
    false,
    "Incidents in the field, vehicles, outdoor work.",
    "Call the Public Works on-call.",
  ],
  [
    "Public Works on-call",
    "person",
    "On-call supervisor",
    "Public Works",
    "+31 6 5550 0142",
    "pw-oncall@northshore.example",
    "Nights and weekends",
    true,
    "Urgent field incidents outside hours.",
    "This is the out-of-hours contact.",
  ],
  [
    "Major Incident Manager",
    "person",
    "Major incident manager",
    "IT & Digital",
    "+31 6 5550 0150",
    "mim@northshore.example",
    "24/7 rota",
    true,
    "Serious IT outages affecting many users.",
    "Rota mobile.",
  ],
  [
    "Security Incident Lead",
    "person",
    "Security incident lead",
    "Security",
    "+31 6 5550 0151",
    "sec-lead@northshore.example",
    "24/7 rota",
    true,
    "Confirmed security incidents.",
    "Rota mobile.",
  ],
  [
    "CISO Office",
    "mailbox",
    "Chief information security officer",
    "Security",
    "+31 20 555 0152",
    "ciso@northshore.example",
    "Mon–Fri 09:00–17:00",
    false,
    "Policy questions, escalated security risks.",
    "Via the Security Incident Lead.",
  ],
  [
    "IRT Coordinator",
    "person",
    "IRT coordinator",
    "Incident Management",
    "+31 6 5550 0160",
    "irt@northshore.example",
    "24/7 rota",
    true,
    "Incidents that cross departments.",
    "Rota mobile.",
  ],
  [
    "Crisis Manager",
    "person",
    "CRT chair",
    "Management Board",
    "+31 6 5550 0161",
    "crisis@northshore.example",
    "24/7 rota",
    true,
    "Critical impact already happening or unavoidable.",
    "Rota mobile.",
  ],
  [
    "Communications Duty Officer",
    "person",
    "Communications lead",
    "Communications",
    "+31 6 5550 0170",
    "press@northshore.example",
    "24/7 rota",
    false,
    "Press questions, public messaging.",
    "Rota mobile.",
  ],
  [
    "Legal Counsel",
    "person",
    "Legal advisor",
    "Legal",
    "+31 20 555 0180",
    "legal@northshore.example",
    "Mon–Fri 09:00–17:00",
    false,
    "Questions on obligations and liability.",
    "Via the Crisis Manager.",
  ],
  [
    "Business Continuity Manager",
    "person",
    "BCM lead",
    "Management Board",
    "+31 20 555 0190",
    "bcm@northshore.example",
    "Mon–Fri 08:00–17:00",
    false,
    "Supplier outages, continuity plans.",
    "Via the Crisis Manager.",
  ],
  [
    "Network Team",
    "team",
    "Network engineers",
    "IT & Digital",
    "+31 20 555 0103",
    "network@northshore.example",
    "Mon–Fri 08:00–17:00",
    false,
    "Network outages.",
    "Via the on-call IT engineer.",
  ],
  [
    "Workplace Support",
    "team",
    "Devices and accounts",
    "IT & Digital",
    "+31 20 555 0104",
    "workplace@northshore.example",
    "Mon–Fri 08:00–17:00",
    false,
    "Lost or stolen laptops and phones.",
    "Call the Service Desk.",
  ],
  [
    "Reception City Hall",
    "team",
    "Reception",
    "Facilities",
    "+31 20 555 0111",
    "reception@northshore.example",
    "Mon–Fri 07:00–19:00",
    false,
    "Visitors, first aid, building questions.",
    "Call the Building Emergency Desk.",
  ],
  [
    "First Aid Team",
    "team",
    "Company first responders",
    "Facilities",
    "+31 20 555 0112",
    "bhv@northshore.example",
    "Office hours",
    true,
    "First aid and evacuation inside buildings.",
    "Call 112.",
  ],
  [
    "Harbour Systems Ltd (supplier)",
    "supplier",
    "Hosting supplier",
    "Harbour Systems Ltd",
    "+31 10 555 0200",
    "support@harboursystems.example",
    "24/7",
    false,
    "Hosting or data centre problems.",
    "24/7 support line.",
  ],
  [
    "CivicSoft (supplier)",
    "supplier",
    "Permits software supplier",
    "CivicSoft",
    "+31 30 555 0210",
    "help@civicsoft.example",
    "Mon–Fri 08:00–18:00",
    false,
    "Permits System outages.",
    "Emergency line +31 30 555 0219.",
  ],
  [
    "Telco North (supplier)",
    "supplier",
    "Telephony provider",
    "Telco North",
    "+31 88 555 0220",
    "noc@telconorth.example",
    "24/7",
    false,
    "Telephony outages.",
    "24/7 NOC.",
  ],
  [
    "National CSIRT liaison",
    "external",
    "Sector CSIRT",
    "National authority",
    "+31 70 555 0230",
    "liaison@csirt.example",
    "24/7",
    false,
    "Significant cyber incidents, coordination.",
    "24/7.",
  ],
  [
    "Data Protection Authority desk",
    "external",
    "Supervisory authority",
    "Regulator",
    "+31 70 555 0240",
    "notify@dpa.example",
    "Online form",
    false,
    "Data breach notifications (by Privacy Officer only).",
    "Online form.",
  ],
  [
    "Facilities Manager",
    "person",
    "Facilities lead",
    "Facilities",
    "+31 6 5550 0113",
    "fm@northshore.example",
    "Mon–Fri 08:00–17:00",
    false,
    "Building damage, contractors.",
    "Via the Building Emergency Desk.",
  ],
  [
    "Integrity Officer",
    "person",
    "Integrity officer",
    "HR",
    "+31 20 555 0132",
    "integrity@northshore.example",
    "Mon–Fri 09:00–17:00",
    false,
    "Fraud, conflicts of interest.",
    "Leave a message.",
  ],
  [
    "Application Management",
    "team",
    "Application managers",
    "IT & Digital",
    "+31 20 555 0105",
    "appman@northshore.example",
    "Mon–Fri 08:00–17:00",
    false,
    "Specific application errors.",
    "Via the on-call IT engineer.",
  ],
];
const BACKUP: Record<number, number> = {
  1: 13,
  2: 3,
  3: 12,
  4: 23,
  5: 6,
  6: 5,
  7: 8,
  8: 30,
  9: 4,
  10: 11,
  11: 10,
  12: 15,
  13: 1,
  15: 16,
  16: 12,
  17: 18,
  19: 16,
  20: 3,
  21: 2,
};

export function buildContacts(now: Date): Contact[] {
  return C.map((c, i) => {
    const overdue = i === 9 || i === 20 || i === 26;
    const at = subDays(now, overdue ? 220 : 10 + i * 3).toISOString();
    return {
      id: `c-${i + 1}`,
      name: c[0],
      type: c[1],
      role: c[2],
      team: c[3],
      organization: c[1] === "supplier" || c[1] === "external" ? c[3] : "Northshore Municipality",
      phone: c[4],
      mobile: "",
      email: c[5],
      availability: c[6],
      timezone: "Europe/Amsterdam",
      outOfHours: c[9],
      whenToContact: c[8],
      backupId: BACKUP[i] !== undefined ? `c-${BACKUP[i] + 1}` : "",
      notes: "",
      emergency: c[7],
      roleIds: CONTACT_ROLES[c[0]] ?? [],
      order: i,
      archived: false,
      situationIds: [],
      processIds: [],
      lastVerifiedAt: at,
      verifiedBy: "Robin Vermeer",
      ...SYS(at),
    };
  });
}

/* ---------- roles ---------- */
export function buildRoles(now: string): Role[] {
  const R = (
    id: string,
    name: string,
    summary: string,
    resp: string[],
    decides: string[],
    contactIds: string[],
    onEscalation: string,
    skills: string[] = [],
  ): Role => ({
    id,
    name,
    summary,
    level: ROLE_LEVEL[id] ?? "",
    responsibilities: resp,
    decides,
    contactIds,
    onEscalation,
    skills,
    ...SYS(now),
  });
  return [
    R(
      "r-reporter",
      "Reporter",
      "Anyone who notices something and reports it.",
      ["Report quickly and honestly", "Follow the first steps", "Stay available for questions"],
      [],
      [],
      "Stays informed about the outcome.",
    ),
    R(
      "r-first",
      "First line",
      "Service desk, SOC analyst, reception or first responder.",
      ["Register the report", "Do the first assessment", "Solve simple incidents"],
      ["Whether it can be solved directly"],
      ["c-3", "c-2", "c-23"],
      "Hands over to the specialist lead and keeps supporting.",
      ["Triage", "Customer contact"],
    ),
    R(
      "r-lead",
      "Specialist lead",
      "Major incident manager or domain lead.",
      ["Own the incident", "Assign tasks", "Decide on escalation to the IRT"],
      ["Severity", "Escalation to IRT"],
      ["c-13", "c-14"],
      "Becomes a member of the IRT and keeps domain ownership.",
      ["Domain expertise", "Coordination"],
    ),
    R(
      "r-irt",
      "IRT coordinator",
      "Coordinates when several departments are involved.",
      ["Bring departments together", "Keep one shared picture", "Track decisions and deadlines"],
      ["Priorities across departments", "Proposal to activate CRT"],
      ["c-16"],
      "Supports the CRT chair and runs the operational picture.",
      ["Coordination", "Facilitation"],
    ),
    R(
      "r-crt",
      "CRT chair",
      "Leads the response when impact is critical.",
      ["Take strategic decisions", "Approve public communication", "Decide on stand-down"],
      ["CRT activation", "Stand-down", "Public statements"],
      ["c-17"],
      "—",
      ["Crisis leadership"],
    ),
    R(
      "r-comms",
      "Communications lead",
      "Prepares internal and external messages.",
      ["Draft updates", "Handle the press", "Keep staff informed"],
      ["Message timing (with CRT chair)"],
      ["c-18"],
      "Joins the IRT or CRT.",
      ["Writing", "Media"],
    ),
    R(
      "r-privacy",
      "Privacy officer",
      "Assesses data breaches and notifications.",
      ["Assess risk to people", "Prepare notifications", "Advise on informing people"],
      ["Whether to notify the authority"],
      ["c-7", "c-6"],
      "Joins the IRT when personal data is involved.",
      ["GDPR"],
    ),
    R(
      "r-security",
      "Security incident lead",
      "Leads technical security response.",
      ["Contain the threat", "Preserve evidence", "Coordinate with suppliers"],
      ["Containment measures"],
      ["c-14", "c-2"],
      "Joins the IRT; may brief the CRT.",
      ["Forensics", "Threat analysis"],
    ),
    R(
      "r-facilities",
      "Facilities lead",
      "Responsible for buildings and safety on site.",
      ["Make the site safe", "Call contractors", "Coordinate evacuation"],
      ["Closing a building"],
      ["c-5", "c-30"],
      "Joins the IRT for building-related incidents.",
      ["Building systems"],
    ),
    R(
      "r-safety",
      "Health & safety officer",
      "Handles accidents and legal safety duties.",
      ["Support the injured", "Investigate the cause", "Report to the labour inspectorate"],
      ["Stopping unsafe work"],
      ["c-10"],
      "Joins the IRT for serious accidents.",
      ["Occupational safety"],
    ),
    R(
      "r-hr",
      "HR lead",
      "Handles people-related and integrity cases.",
      ["Protect the people involved", "Keep the case confidential", "Start an investigation"],
      ["Investigation scope"],
      ["c-9", "c-31"],
      "Keeps the case confidential within the IRT.",
      ["Employment law"],
    ),
    R(
      "r-bcm",
      "Continuity manager",
      "Keeps critical services running.",
      ["Activate continuity plans", "Prioritise services", "Coordinate with suppliers"],
      ["Switch to fallback"],
      ["c-20"],
      "Joins the CRT for critical outages.",
      ["Continuity planning"],
    ),
  ];
}

/* ---------- processes ---------- */
const P = (
  o: Partial<Process> & Pick<Process, "id" | "name" | "purpose" | "domain">,
  now: string,
): Process => ({
  version: 1,
  phaseNames: {
    report: "Report",
    assess: "Assess",
    respond: "Respond",
    recover: "Recover",
    close: "Close and learn",
  },
  levelNames: { standard: "Standard", elevated: "Elevated", coordinated: "IRT", critical: "CRT" },
  roleIds: ["r-reporter", "r-first", "r-lead", "r-irt", "r-crt", "r-comms"],
  triage: ["Is anyone in danger?", "How many people are affected?", "Is personal data involved?"],
  tasks: [
    { title: "Register and confirm the report", phase: "report", roleId: "r-first" },
    { title: "Assess impact and urgency", phase: "assess", roleId: "r-lead" },
    { title: "Contain and resolve", phase: "respond", roleId: "r-lead" },
    { title: "Restore normal service", phase: "recover", roleId: "r-lead" },
    { title: "Hold a short review", phase: "close", roleId: "r-irt" },
  ],
  reportingRuleIds: [],
  templates: [
    {
      title: "Staff update",
      body: "We are working on an incident affecting {service}. Next update at {time}.",
    },
  ],
  irtCriteria: "More than one department is needed to resolve the incident.",
  crtCriteria: "The event is happening or virtually unavoidable AND the impact is critical.",
  situationIds: [],
  ...SYS(now),
  ...o,
});

export function buildProcesses(now: string): Process[] {
  return [
    P(
      {
        id: "p-it",
        name: "IT incident",
        purpose: "Restore IT services quickly.",
        domain: "it",
        levelNames: {
          standard: "Service desk",
          elevated: "Major incident manager",
          coordinated: "IRT",
          critical: "CRT",
        },
      },
      now,
    ),
    P(
      {
        id: "p-security",
        name: "Security incident",
        purpose: "Contain threats and protect information.",
        domain: "security",
        roleIds: ["r-reporter", "r-first", "r-security", "r-irt", "r-crt", "r-comms", "r-privacy"],
        levelNames: {
          standard: "SOC analyst",
          elevated: "Security incident lead",
          coordinated: "IRT (CSIRT)",
          critical: "CRT (CERT)",
        },
        alias: { irt: "CSIRT", crt: "CERT" },
        reportingRuleIds: ["rr-nis2"],
        phaseNames: {
          report: "Detect",
          assess: "Analyse",
          respond: "Contain & eradicate",
          recover: "Recover",
          close: "Lessons learned",
        },
      },
      now,
    ),
    P(
      {
        id: "p-irt",
        name: "Coordinated incident response",
        purpose: "Coordinate across departments.",
        domain: "continuity",
        roleIds: ["r-irt", "r-lead", "r-comms", "r-crt"],
      },
      now,
    ),
    P(
      {
        id: "p-crt",
        name: "Critical incident response",
        purpose: "Lead when impact is critical.",
        domain: "continuity",
        roleIds: ["r-crt", "r-irt", "r-comms", "r-bcm"],
        phaseNames: {
          report: "Alert",
          assess: "Judge",
          respond: "Act",
          recover: "Recover",
          close: "Evaluate",
        },
      },
      now,
    ),
    P(
      {
        id: "p-privacy",
        name: "Data breach and privacy",
        purpose: "Limit harm to people whose data is affected.",
        domain: "privacy",
        roleIds: ["r-reporter", "r-first", "r-privacy", "r-irt", "r-comms"],
        levelNames: {
          standard: "Privacy team",
          elevated: "Privacy officer",
          coordinated: "IRT",
          critical: "CRT",
        },
        reportingRuleIds: ["rr-gdpr"],
      },
      now,
    ),
    P(
      {
        id: "p-facilities",
        name: "Facilities and buildings",
        purpose: "Keep buildings safe and usable.",
        domain: "facilities",
        roleIds: ["r-reporter", "r-first", "r-facilities", "r-irt", "r-crt"],
        levelNames: {
          standard: "Reception",
          elevated: "Facilities lead",
          coordinated: "IRT",
          critical: "CRT",
        },
        phaseNames: {
          report: "Alarm",
          assess: "Inspect",
          respond: "Make safe",
          recover: "Repair",
          close: "Evaluate",
        },
      },
      now,
    ),
    P(
      {
        id: "p-safety",
        name: "Safety and workplace accident",
        purpose: "Care for people and prevent repeats.",
        domain: "safety",
        roleIds: ["r-reporter", "r-first", "r-safety", "r-irt", "r-hr"],
        levelNames: {
          standard: "First responder",
          elevated: "Emergency response lead",
          coordinated: "IRT",
          critical: "CRT",
        },
      },
      now,
    ),
    P(
      {
        id: "p-hr",
        name: "HR and integrity",
        purpose: "Handle sensitive reports with care.",
        domain: "hr",
        roleIds: ["r-reporter", "r-hr", "r-irt"],
        levelNames: {
          standard: "Confidential advisor",
          elevated: "HR lead",
          coordinated: "IRT",
          critical: "CRT",
        },
      },
      now,
    ),
    P(
      {
        id: "p-continuity",
        name: "Business continuity",
        purpose: "Keep critical services available.",
        domain: "continuity",
        roleIds: ["r-bcm", "r-lead", "r-irt", "r-crt", "r-comms"],
        reportingRuleIds: ["rr-exception"],
      },
      now,
    ),
  ];
}

export function buildRaci(processes: Process[]): ResponsibilityAssignment[] {
  const out: ResponsibilityAssignment[] = [];
  const phases: PhaseId[] = ["report", "assess", "respond", "recover", "close"];
  const table: Record<string, string> = {
    "r-reporter": "RIIII",
    "r-first": "ARCCI",
    "r-lead": "IARRC",
    "r-security": "IARRC",
    "r-privacy": "CARCI",
    "r-facilities": "IARRC",
    "r-safety": "IARRC",
    "r-hr": "IARRC",
    "r-bcm": "ICARC",
    "r-irt": "ICACA",
    "r-crt": "IICIA",
    "r-comms": "IICII",
  };
  for (const p of processes)
    for (const r of p.roleIds)
      phases.forEach((ph, i) =>
        out.push({
          id: `${p.id}-${r}-${ph}`,
          processId: p.id,
          roleId: r,
          phase: ph,
          value: (table[r] ?? "IIIII")[i] as "R",
        }),
      );
  return out;
}

export function buildRules(now: Date): ReportingRule[] {
  const at = subDays(now, 200).toISOString();
  return [
    {
      id: "rr-nis2",
      version: 1,
      name: "Cbw / NIS2",
      legalBasis: "Dutch Cybersecurity Act (Cbw), NIS2 Directive art. 23",
      regulator: "National CSIRT / sector authority",
      jurisdiction: "Netherlands / EU",
      processIds: ["p-security", "p-continuity"],
      trigger: "Significant incident affecting network and information systems",
      anchor: "awareAt",
      stages: [
        { label: "Early warning", amount: 24, unit: "hours", from: "anchor" },
        { label: "Incident notification", amount: 72, unit: "hours", from: "anchor" },
        {
          label: "Final report (or progress report if ongoing)",
          amount: 1,
          unit: "months",
          from: "previous",
        },
      ],
      reminders: "50% and 90% of each period",
      ownerRole: "r-security",
      effectiveFrom: at,
      active: true,
      history: [],
      ...SYS(at),
    },
    {
      id: "rr-gdpr",
      version: 1,
      name: "GDPR data breach",
      legalBasis: "GDPR art. 33",
      regulator: "Dutch Data Protection Authority",
      jurisdiction: "Netherlands / EU",
      processIds: ["p-privacy"],
      trigger: "Personal data breach likely to result in a risk",
      anchor: "awareAt",
      stages: [
        {
          label: "Notify the Data Protection Authority",
          amount: 72,
          unit: "hours",
          from: "anchor",
        },
      ],
      reminders: "24 and 60 hours",
      ownerRole: "r-privacy",
      effectiveFrom: at,
      active: true,
      history: [],
      ...SYS(at),
    },
    {
      id: "rr-exception",
      version: 1,
      name: "Exception profile (sector)",
      legalBasis: "Sector agreement",
      regulator: "Sector authority",
      jurisdiction: "Netherlands",
      processIds: ["p-continuity"],
      trigger: "Outage of a vital service",
      anchor: "detectedAt",
      stages: [{ label: "Early warning", amount: 4, unit: "hours", from: "anchor" }],
      reminders: "1 hour before",
      ownerRole: "r-bcm",
      effectiveFrom: at,
      active: true,
      history: [],
      ...SYS(at),
    },
  ];
}

/* ---------- guidance ---------- */
type N = [string, FlowchartNode["type"], string, FlowchartNode["ref"]?];
type E = [string, string, string?];
const fc = (nodes: N[], edges: E[]): Flowchart =>
  autoLayout({
    nodes: nodes.map(([id, type, label, ref]) => ({ id, type, label, ref, x: 0, y: 0 })),
    edges: edges.map(([s, t, l], i) => ({ id: `e${i}`, source: s, target: t, label: l })),
  });

const genericFlow = (
  danger: string,
  first: string,
  contact: string,
  contactId: string,
  esc: string,
  escRef: string,
) =>
  fc(
    [
      ["s", "start", "Start"],
      ["q1", "question", danger],
      ["c0", "contact", "Call emergency services (112)", { kind: "contact", id: "c-1" }],
      ["a1", "action", first],
      ["q2", "question", "Is it affecting many people or a critical service?"],
      ["c1", "contact", contact, { kind: "contact", id: contactId }],
      ["x1", "escalate", esc, { kind: "role", id: escRef }],
      ["r", "report", "Report the incident"],
    ],
    [
      ["s", "q1"],
      ["q1", "c0", "Yes"],
      ["q1", "a1", "No"],
      ["c0", "a1"],
      ["a1", "q2"],
      ["q2", "x1", "Yes"],
      ["q2", "c1", "No"],
      ["q2", "c1", "Not sure"],
      ["x1", "r"],
      ["c1", "r"],
    ],
  );

type SitSeed = Omit<GuidanceContent, "owner" | "reviewDate" | "keywords" | "flowchart"> & {
  slug: string;
  keywords: string;
  flowchart?: Flowchart;
  overdue?: boolean;
};

const SITS: SitSeed[] = [
  {
    slug: "suspicious-email",
    icon: "Mail",
    title: "I received a suspicious email",
    category: "Digital",
    domains: ["security"],
    processId: "p-security",
    description:
      "An email that asks for passwords, payment or urgent action, or comes from an unexpected sender.",
    keywords: "phishing email spam suspicious sender attachment",
    see: [
      "An unexpected sender or a strange address",
      "Pressure: “act now”, “your account will be closed”",
      "A link or attachment you did not expect",
    ],
    doFirst: [
      "Do not click links or open attachments",
      "Use the “Report phishing” button in Outlook",
      "If you entered a password, change it now and call the SOC",
    ],
    dont: [
      "Do not forward the email to colleagues",
      "Do not reply to the sender",
      "Do not delete it before reporting",
    ],
    next: [
      "The SOC checks the email within 1 hour",
      "If others received it, the SOC removes it from all mailboxes",
      "You get a short message with the outcome",
    ],
    contactIds: ["c-2", "c-3"],
    roleIds: ["r-reporter", "r-first", "r-security"],
    flowchart: fc(
      [
        ["s", "start", "You received a suspicious email"],
        ["q1", "question", "Did you click a link, open an attachment or enter a password?"],
        ["a1", "action", "Disconnect from Wi-Fi or unplug the network cable"],
        ["c1", "contact", "Call the SOC now", { kind: "contact", id: "c-2" }],
        ["a2", "action", "Use the “Report phishing” button"],
        ["q2", "question", "Does it ask for personal data of citizens or colleagues?"],
        ["x1", "escalate", "SOC involves the Privacy Officer", { kind: "role", id: "r-privacy" }],
        ["r", "report", "Report the incident"],
        ["e", "end", "Done — delete the email after reporting"],
      ],
      [
        ["s", "q1"],
        ["q1", "a1", "Yes"],
        ["q1", "a2", "No"],
        ["q1", "a1", "Not sure"],
        ["a1", "c1"],
        ["c1", "r"],
        ["a2", "q2"],
        ["q2", "x1", "Yes"],
        ["q2", "e", "No"],
        ["x1", "r"],
      ],
    ),
  },
  {
    slug: "clicked-link",
    icon: "MousePointerClick",
    title: "I clicked a suspicious link",
    category: "Digital",
    domains: ["security"],
    processId: "p-security",
    description: "You clicked a link or opened a file and now doubt it was safe.",
    keywords: "clicked link malware download password entered",
    see: [
      "A login page that looked slightly off",
      "A file that started downloading",
      "Your computer behaves strangely",
    ],
    doFirst: [
      "Disconnect from the network",
      "Call the SOC immediately",
      "Change your password from another device",
    ],
    dont: [
      "Do not turn the computer off",
      "Do not try to fix it yourself",
      "Do not wait to see what happens",
    ],
    next: [
      "The SOC checks your device remotely",
      "Your account may be reset",
      "You can keep working on a spare laptop",
    ],
    contactIds: ["c-2"],
    roleIds: ["r-reporter", "r-security"],
  },
  {
    slug: "ransom-message",
    icon: "Lock",
    title: "My screen shows a ransom message",
    category: "Digital",
    domains: ["security", "continuity"],
    processId: "p-security",
    description: "Files are locked or renamed and a message asks for payment.",
    keywords: "ransomware encrypted files ransom bitcoin locked",
    see: [
      "A message asking for payment",
      "Files with strange extensions",
      "Several colleagues with the same problem",
    ],
    doFirst: [
      "Unplug the network cable and disable Wi-Fi",
      "Leave the computer on",
      "Call the SOC immediately — 24/7",
    ],
    dont: [
      "Never pay or contact the attackers",
      "Do not turn off the computer",
      "Do not plug in USB drives",
    ],
    next: [
      "The Security Incident Lead takes charge",
      "The IRT is activated if more departments are affected",
      "The CRT is activated only if critical impact is happening or unavoidable",
    ],
    contactIds: ["c-2", "c-14"],
    roleIds: ["r-security", "r-irt", "r-crt"],
  },
  {
    slug: "lost-device",
    icon: "Smartphone",
    title: "I lost a laptop or phone",
    category: "Digital",
    domains: ["it", "privacy"],
    processId: "p-it",
    description: "A work device is lost or stolen.",
    keywords: "lost stolen laptop phone tablet device",
    see: ["You cannot find your device", "Your bag was stolen"],
    doFirst: [
      "Call the Service Desk so the device can be locked",
      "Report theft to the police",
      "Tell your manager",
    ],
    dont: ["Do not wait until the next day", "Do not keep searching for hours before reporting"],
    next: [
      "The device is locked and wiped remotely",
      "The Privacy Desk checks if personal data was on it",
      "You receive a replacement device",
    ],
    contactIds: ["c-3", "c-22"],
    roleIds: ["r-first", "r-privacy"],
  },
  {
    slug: "misdirected-data",
    icon: "Send",
    title: "I sent personal data to the wrong person",
    category: "Privacy",
    domains: ["privacy"],
    processId: "p-privacy",
    description: "An email, letter or file with personal data reached the wrong recipient.",
    keywords: "wrong person email personal data data breach misdirected gdpr",
    see: ["You notice a typo in the address", "The recipient tells you"],
    doFirst: [
      "Ask the recipient to delete it and confirm",
      "Try to recall the message",
      "Report to the Privacy Desk today",
    ],
    dont: [
      "Do not hide it — deadlines start when we know",
      "Do not contact the affected people yourself",
    ],
    next: [
      "The Privacy Officer assesses the risk",
      "If needed, the authority is notified within 72 hours",
      "Affected people may be informed",
    ],
    contactIds: ["c-6", "c-7"],
    roleIds: ["r-reporter", "r-privacy"],
  },
  {
    slug: "system-down",
    icon: "ServerCrash",
    title: "A system is down",
    category: "Digital",
    domains: ["it"],
    processId: "p-it",
    description: "An application or service is not available.",
    keywords: "down outage not working error system application slow",
    see: ["Error messages", "Pages that do not load", "Colleagues with the same problem"],
    doFirst: [
      "Check the status page on the intranet",
      "Report it to the Service Desk",
      "Mention how many people are affected",
    ],
    dont: ["Do not report the same outage many times", "Do not restart servers yourself"],
    next: [
      "The Service Desk registers it",
      "Serious outages go to the Major Incident Manager",
      "Updates appear on the intranet",
    ],
    contactIds: ["c-3", "c-4", "c-13"],
    roleIds: ["r-first", "r-lead"],
  },
  {
    slug: "water-damage",
    icon: "Droplets",
    title: "There is water damage",
    category: "Building",
    domains: ["facilities"],
    processId: "p-facilities",
    description: "A leak, flooding or water where it should not be.",
    keywords: "water leak flood flooding wet ceiling pipe",
    see: ["Water on the floor or dripping from the ceiling", "Wet walls near equipment"],
    doFirst: [
      "Stay away from electrical equipment",
      "Call the Building Emergency Desk",
      "Move valuable items if it is safe",
    ],
    dont: ["Do not touch wet electrical equipment", "Do not try to repair pipes"],
    next: [
      "Facilities sends someone",
      "If IT equipment is at risk, IT is involved",
      "Cross-department impact activates the IRT",
    ],
    contactIds: ["c-5", "c-30"],
    roleIds: ["r-facilities", "r-irt"],
  },
  {
    slug: "fire-smoke",
    icon: "Flame",
    title: "I smell smoke or see fire",
    category: "Safety",
    domains: ["safety", "facilities"],
    processId: "p-facilities",
    description: "Smoke, fire or a burning smell.",
    keywords: "fire smoke burning alarm",
    see: ["Smoke or flames", "A burning smell", "A fire alarm"],
    doFirst: [
      "Call 112 if there is fire",
      "Raise the alarm and evacuate",
      "Follow the first aid team",
    ],
    dont: ["Do not use lifts", "Do not go back for belongings"],
    next: ["The fire brigade takes charge", "Facilities coordinates with the IRT"],
    contactIds: ["c-1", "c-5", "c-24"],
    roleIds: ["r-facilities", "r-safety"],
  },
  {
    slug: "injury",
    icon: "HeartPulse",
    title: "Someone was injured",
    category: "Safety",
    domains: ["safety"],
    processId: "p-safety",
    description: "An accident or injury at work, in a building or in the field.",
    keywords: "injured accident hurt fall ambulance wound",
    see: ["A person who fell or got hurt", "A near miss that could have been serious"],
    doFirst: [
      "Call 112 for serious injuries",
      "Give first aid if you can",
      "Inform the Health & Safety Officer",
    ],
    dont: [
      "Do not move a seriously injured person",
      "Do not clean up the scene before it is documented",
    ],
    next: [
      "The safety officer investigates",
      "Serious accidents are reported to the labour inspectorate",
    ],
    contactIds: ["c-1", "c-24", "c-10", "c-11"],
    roleIds: ["r-safety", "r-hr"],
    overdue: true,
  },
  {
    slug: "unwanted-behaviour",
    icon: "ShieldAlert",
    title: "I want to report unwanted behaviour",
    category: "People",
    domains: ["hr"],
    processId: "p-hr",
    description: "Harassment, bullying, discrimination or an integrity concern.",
    keywords: "harassment bullying unwanted behaviour integrity discrimination fraud",
    see: ["Behaviour that makes you or others feel unsafe", "Possible fraud or misuse"],
    doFirst: ["Talk to the Confidential Advisor", "Write down what happened and when"],
    dont: ["Do not confront the person if you feel unsafe", "Do not share the details widely"],
    next: [
      "Your report is handled confidentially",
      "You decide on next steps together with the advisor",
    ],
    contactIds: ["c-8", "c-9", "c-31"],
    roleIds: ["r-hr"],
  },
  {
    slug: "supplier-outage",
    icon: "Truck",
    title: "A supplier has an outage",
    category: "Continuity",
    domains: ["continuity", "it"],
    processId: "p-continuity",
    description: "A supplier service we depend on is unavailable.",
    keywords: "supplier vendor outage hosting provider",
    see: ["Supplier status page shows problems", "A service run by a supplier stops"],
    doFirst: ["Report to the Service Desk", "Check the supplier status page"],
    dont: ["Do not sign new agreements with the supplier during the incident"],
    next: [
      "The Continuity Manager checks fallback plans",
      "The IRT is activated when several departments are affected",
    ],
    contactIds: ["c-3", "c-20", "c-25"],
    roleIds: ["r-bcm", "r-irt"],
  },
  {
    slug: "unauthorised-person",
    icon: "DoorOpen",
    title: "I see an unknown person in a secure area",
    category: "Building",
    domains: ["facilities", "security"],
    processId: "p-facilities",
    description: "Someone without a badge in a restricted area, or a door that was forced.",
    keywords: "intruder badge door forced unknown person tailgating",
    see: ["Someone without a visible badge", "A door propped open"],
    doFirst: ["Do not confront the person", "Call Reception or the Building Emergency Desk"],
    dont: ["Do not hold doors for people without badges"],
    next: ["Facilities checks camera images", "Security is involved if systems were accessed"],
    contactIds: ["c-23", "c-5"],
    roleIds: ["r-facilities", "r-security"],
    overdue: true,
  },
];

export function buildSituations(now: Date): GuidanceSituation[] {
  return SITS.map((s, i) => {
    const contactName = C[Number(s.contactIds[0].slice(2)) - 1][0];
    const flow =
      s.flowchart ??
      genericFlow(
        "Is anyone in immediate danger?",
        s.doFirst[0],
        `Contact ${contactName}`,
        s.contactIds[0],
        "Escalate to the specialist lead",
        "r-lead",
      );
    const reviewDate = (s.overdue ? subDays(now, 20) : addDays(now, 60 + i * 9)).toISOString();
    const { slug, overdue: _o, flowchart: _f, keywords, ...rest } = s;
    const content: GuidanceContent = {
      ...rest,
      keywords: keywords.split(" "),
      owner: i % 2 ? "Facilities & Safety" : "Incident Management",
      reviewDate,
      flowchart: flow,
    };
    return {
      id: `s-${i + 1}`,
      slug,
      versions: [
        {
          version: 1,
          status: "published",
          savedAt: subDays(now, 90).toISOString(),
          savedBy: "Robin Vermeer",
          content,
        },
      ],
    };
  });
}

export function buildSources(now: Date): SourceSystem[] {
  const fm = (prefix: string) => [
    { from: `${prefix}.number`, to: "sourceId" },
    { from: `${prefix}.briefDescription`, to: "title" },
    { from: `${prefix}.request`, to: "description" },
    { from: `${prefix}.category`, to: "category" },
    { from: `${prefix}.priority`, to: "severity" },
    { from: `${prefix}.processingStatus`, to: "phase" },
    { from: `${prefix}.branch`, to: "location" },
  ];
  const vm = [
    { field: "priority", from: "P1", to: "4 · Critical" },
    { field: "priority", from: "P2", to: "3 · High" },
    { field: "priority", from: "P3", to: "2 · Medium" },
    { field: "priority", from: "P4", to: "1 · Low" },
    { field: "status", from: "Registered", to: "Report" },
    { field: "status", from: "In progress", to: "Respond" },
    { field: "status", from: "Completed", to: "Close and learn" },
    { field: "category", from: "Hardware", to: "Workstations" },
  ];
  const at = (m: number) => addMinutes(now, -m).toISOString();
  return [
    {
      id: "topdesk",
      name: "TOPdesk",
      status: "connected",
      lastSyncAt: at(4),
      fieldMap: fm("incident"),
      valueMap: vm,
      errors: [
        {
          at: at(320),
          message: "Incident I-2406-1189: unknown category “Facilitair-Overig”, mapped to Other.",
        },
      ],
    },
    {
      id: "servicenow",
      name: "ServiceNow",
      status: "connected",
      lastSyncAt: at(11),
      fieldMap: fm("sys_incident"),
      valueMap: vm,
      errors: [],
    },
    {
      id: "jira",
      name: "Jira Service Management",
      status: "warning",
      lastSyncAt: at(95),
      fieldMap: fm("issue"),
      valueMap: vm,
      errors: [{ at: at(95), message: "Rate limit reached (429). Next attempt in 15 minutes." }],
    },
    {
      id: "csv",
      name: "CSV upload",
      status: "connected",
      lastSyncAt: at(60 * 24 * 3),
      fieldMap: fm("row"),
      valueMap: vm,
      errors: [],
    },
    {
      id: "webhook",
      name: "Generic webhook",
      status: "disconnected",
      lastSyncAt: at(60 * 24 * 12),
      fieldMap: fm("payload"),
      valueMap: vm,
      errors: [{ at: at(60 * 24 * 12), message: "Signature check failed for 3 requests." }],
    },
  ];
}

export function buildSettings(): Settings {
  return {
    organization: {
      name: "Northshore Municipality",
      brandColor: "#1f5f5b",
      language: "en",
      timezone: "Europe/Amsterdam",
      dateFormat: "dd MMM yyyy",
      businessHours: "Mon–Fri 08:00–17:30",
      holidays: "Dutch public holidays",
    },
    database: { storage: "local", s3Bucket: "" },
    portal: {
      title: "Northshore Incident Help",
      welcome: "Not sure what to do? Start here.",
      emergencyMessage: "If there is immediate danger to life, call the emergency services first.",
      emergencyNumber: "112",
      contactVerificationDays: 180,
      reviewReminderDays: 30,
      featured: ["s-1", "s-3", "s-5", "s-6", "s-8", "s-9"],
    },
    severity: { slaHours: { "1": 72, "2": 24, "3": 8, "4": 2 } },
    teams: {
      irtName: "Incident Response Team",
      crtName: "Critical Response Team",
      irtDepartments: ["IT", "Security", "Facilities", "Communications"],
      crtActivators: ["Crisis Manager", "Municipal Secretary"],
      csirtAlias: "CSIRT",
      certAlias: "CERT",
    },
    notifications: {
      smtpHost: "smtp.northshore.example",
      teamsWebhook: "",
      slackChannel: "#incidents",
      reminderHours: 4,
    },
    privacy: { hrDefault: "confidential", retentionMonths: 84, anonymizeAfterMonths: 24 },
    masterData: {
      locations: LOCATIONS,
      services: SERVICES,
      businessUnits: UNITS,
      departments: DEPARTMENTS,
      suppliers: ["Harbour Systems Ltd", "CivicSoft", "Telco North"],
    },
    secrets: {
      dbPassword: true,
      smtpPassword: true,
      topdeskApiKey: true,
      servicenowApiKey: false,
      webhookSecret: false,
    },
    history: [],
  };
}

/* ---------- incidents ---------- */
const CAT: Record<DomainId, [string, string][]> = {
  it: [
    ["Workstation not starting", "Workstations"],
    ["Email not syncing", "Email"],
    ["Permits System slow", "Permits System"],
    ["Printer offline", "Workstations"],
    ["VPN connection fails", "Network"],
    ["Account locked", "Workstations"],
    ["Telephony dropped calls", "Telephony"],
    ["Citizen Portal error", "Citizen Portal"],
  ],
  security: [
    ["Phishing reported", "Email"],
    ["Malware alert on laptop", "Workstations"],
    ["Suspicious login", "Network"],
    ["Lost USB stick", "Workstations"],
  ],
  privacy: [
    ["Email to wrong recipient", "Email"],
    ["Letter sent to old address", "Citizen Portal"],
    ["File shared too widely", "Email"],
  ],
  facilities: [
    ["Heating failure", "Building Access"],
    ["Badge reader broken", "Building Access"],
    ["Small water leak", "Building Access"],
    ["Power dip", "Building Access"],
  ],
  safety: [
    ["Slip in corridor", "Waste Collection"],
    ["Near miss with vehicle", "Waste Collection"],
    ["Minor cut", "Waste Collection"],
  ],
  hr: [
    ["Integrity question", "Payroll"],
    ["Conflict at work", "Payroll"],
  ],
  continuity: [
    ["Supplier degraded service", "Parking App"],
    ["Payment provider outage", "Parking App"],
  ],
};
const DOMAIN_W: [DomainId, number][] = [
  ["it", 0.62],
  ["security", 0.12],
  ["privacy", 0.06],
  ["facilities", 0.1],
  ["safety", 0.05],
  ["hr", 0.02],
  ["continuity", 0.03],
];
const PROC: Record<DomainId, string> = {
  it: "p-it",
  security: "p-security",
  privacy: "p-privacy",
  facilities: "p-facilities",
  safety: "p-safety",
  hr: "p-hr",
  continuity: "p-continuity",
};
const OWNERS = [
  "Service Desk",
  "Major Incident Manager",
  "Security Incident Lead",
  "Privacy Officer on duty",
  "Facilities Manager",
  "Health & Safety Officer",
  "HR Duty Officer",
  "Business Continuity Manager",
];

function baseIncident(
  o: Partial<Incident> & Pick<Incident, "id" | "ref" | "title" | "domain" | "createdAt">,
): Incident {
  return {
    description: "",
    processId: PROC[o.domain],
    processVersion: 1,
    source: "irtrack",
    sourceId: o.ref,
    severity: 1,
    level: "standard",
    phase: "close",
    classification: o.domain === "hr" ? "confidential" : "normal",
    ownerId: "Service Desk",
    location: "City Hall",
    service: "Workstations",
    businessUnit: "IT & Digital",
    category: "General",
    startedAt: o.createdAt,
    detectedAt: o.createdAt,
    awareAt: o.createdAt,
    createdBy: "system",
    updatedAt: o.createdAt,
    updatedBy: "system",
    tasks: [],
    decisions: [],
    timeline: [],
    comms: [],
    attachments: [],
    actions: [],
    deadlines: [],
    activations: [],
    relatedIds: [],
    ...o,
  } as Incident;
}

export function generateHistory(anchor: Date, count = 2500): Incident[] {
  const r = rng(20261104);
  const out: Incident[] = [];
  const srcW: [SourceId, number][] = [
    ["topdesk", 0.5],
    ["servicenow", 0.16],
    ["jira", 0.08],
    ["csv", 0.03],
    ["webhook", 0.03],
    ["irtrack", 0.2],
  ];
  const wpick = <T>(ws: [T, number][]) => {
    let x = r();
    for (const [v, w] of ws) {
      if ((x -= w) <= 0) return v;
    }
    return ws[0][0];
  };
  let n = 0;
  while (out.length < count) {
    const day = Math.floor(r() * 365);
    const date = subDays(anchor, day);
    const month = date.getMonth();
    const seasonal = 0.75 + 0.25 * Math.cos(((month - 0) / 12) * Math.PI * 2);
    const dow = date.getDay();
    const weekly = dow === 0 || dow === 6 ? 0.3 : 1;
    if (r() > seasonal * weekly) continue;
    const hour = r() < 0.85 ? 8 + Math.floor(r() * 10) : Math.floor(r() * 24);
    const created = addMinutes(
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour),
      Math.floor(r() * 60),
    );
    if (created > anchor) continue;
    const domain = wpick(DOMAIN_W);
    const x = r();
    const severity: Severity = x < 0.7 ? 1 : x < 0.92 ? 2 : x < 0.985 ? 3 : 4;
    const level: LevelId =
      severity === 4
        ? r() < 0.3
          ? "critical"
          : "coordinated"
        : severity === 3
          ? r() < 0.35
            ? "coordinated"
            : "elevated"
          : severity === 2 && r() < 0.3
            ? "elevated"
            : "standard";
    const resolveH = [6, 18, 36, 60][severity - 1] * (0.3 + r() * 1.6);
    const ageH = (anchor.getTime() - created.getTime()) / 36e5;
    const open = ageH < resolveH * 1.2;
    const phase: PhaseId = open
      ? ageH < 1
        ? "report"
        : ageH < resolveH * 0.3
          ? "assess"
          : ageH < resolveH * 0.8
            ? "respond"
            : "recover"
      : "close";
    const [title, service] = pick(r, CAT[domain]);
    const source = wpick(srcW);
    n++;
    const ref = `IRT-${String(created.getFullYear()).slice(2)}${String(n).padStart(5, "0")}`;
    const sid =
      source === "topdesk"
        ? `I ${created.getFullYear() % 100}${String(created.getMonth() + 1).padStart(2, "0")} ${String(n).padStart(4, "0")}`
        : source === "servicenow"
          ? `INC00${40000 + n}`
          : source === "jira"
            ? `HELP-${3000 + n}`
            : `${source.toUpperCase()}-${n}`;
    const respMin = [20, 15, 10, 5][severity - 1] * (0.3 + r() * 2);
    out.push(
      baseIncident({
        id: uuidFrom(r),
        ref,
        title,
        domain,
        createdAt: created.toISOString(),
        source,
        sourceId: sid,
        sourceUrl:
          source !== "irtrack"
            ? `https://${source}.northshore.example/incident/${encodeURIComponent(sid)}`
            : undefined,
        lastSyncAt:
          source !== "irtrack"
            ? addMinutes(anchor, -Math.floor(r() * 30)).toISOString()
            : undefined,
        severity,
        level,
        phase,
        location: pick(r, LOCATIONS),
        service,
        businessUnit: pick(r, UNITS),
        category: service,
        ownerId: OWNERS[[0, 2, 3, 4, 5, 6, 7][DOMAINS_IDX[domain]] ?? 0] ?? "Service Desk",
        firstResponseAt: addMinutes(created, respMin).toISOString(),
        resolvedAt: open ? undefined : addHours(created, resolveH).toISOString(),
        closedAt: open ? undefined : addHours(created, resolveH + 4).toISOString(),
        slaMet: resolveH <= [72, 24, 8, 2][severity - 1] * 1.4 || r() < 0.5,
        phaseHours: {
          report: 0.3 + r(),
          assess: resolveH * 0.2,
          respond: resolveH * (domain === "privacy" ? 0.7 : 0.5),
          recover: resolveH * 0.25,
          close: 2 + r() * 20,
        },
        personalData: domain === "privacy",
      }),
    );
  }
  return out;
}
const DOMAINS_IDX: Record<DomainId, number> = {
  it: 0,
  security: 1,
  privacy: 2,
  facilities: 3,
  safety: 4,
  hr: 5,
  continuity: 6,
};

let ev = 0;
const T = (
  at: Date,
  actor: string,
  kind: Incident["timeline"][number]["kind"],
  text: string,
  highlight = false,
) => ({ id: `t${++ev}`, at: at.toISOString(), actor, kind, text, highlight });

export function buildDemoIncidents(now: Date, rules: ReportingRule[]): Incident[] {
  const h = (x: number) => addHours(now, -x);
  const rule = (id: string) => rules.find((r) => r.id === id)!;
  const withDl = (i: Incident, ids: string[]) => ({
    ...i,
    deadlines: ids.flatMap((id) => computeDeadlines(rule(id), i, now)),
  });
  const tasks = (list: [string, PhaseId, string, boolean][]) =>
    list.map(([title, phase, roleId, done], k) => ({ id: `tk${k}`, title, phase, roleId, done }));

  const ransomware = withDl(
    baseIncident({
      id: "d-ransomware",
      ref: "IRT-DEMO-001",
      title: "Ransomware at hosting supplier Harbour Systems",
      domain: "security",
      createdAt: h(30).toISOString(),
      startedAt: h(34).toISOString(),
      detectedAt: h(30).toISOString(),
      awareAt: h(29).toISOString(),
      description:
        "Harbour Systems reports ransomware in their data centre. Our Permits System and Citizen Portal run there. Their backups are being checked.",
      source: "topdesk",
      sourceId: "I 2611 0042",
      sourceUrl: "https://topdesk.northshore.example/incident/I%202611%200042",
      lastSyncAt: h(0.1).toISOString(),
      severity: 4,
      level: "critical",
      phase: "respond",
      ownerId: "Crisis Manager",
      location: "Data Centre East",
      service: "Citizen Portal",
      businessUnit: "IT & Digital",
      category: "Ransomware",
      tlp: "amber",
      nextStep:
        "Approve the public statement about the Citizen Portal outage and confirm the fallback counter process for permits.",
      tasks: tasks([
        ["Isolate connections to Harbour Systems", "respond", "r-security", true],
        ["Check which personal data is stored at the supplier", "assess", "r-privacy", true],
        ["Open manual permit counter", "respond", "r-bcm", false],
        ["Publish statement on website", "respond", "r-comms", false],
        ["Send NIS2 early warning", "respond", "r-security", true],
      ]),
      activations: [
        {
          id: "a1",
          team: "irt",
          at: h(28).toISOString(),
          by: "Security Incident Lead",
          rationale:
            "IT, Security, Privacy and Communications are all needed. Supplier contact and data questions cross departments.",
          departments: ["IT", "Security", "Privacy", "Communications"],
        },
        {
          id: "a2",
          team: "crt",
          at: h(9).toISOString(),
          by: "Crisis Manager",
          rationale:
            "Supplier confirmed backups are encrypted. Citizen Portal and permits will be unavailable for days — critical impact is now unavoidable.",
          happening: true,
          critical: true,
        },
      ],
      decisions: [
        {
          id: "dc1",
          what: "Disconnect all links to Harbour Systems",
          why: "Prevent spread to our own network.",
          by: "Security Incident Lead",
          at: h(29).toISOString(),
        },
        {
          id: "dc2",
          what: "Do not activate CRT yet",
          why: "Supplier expected backups to be intact. Serious risk, but still preventable.",
          by: "IRT Coordinator",
          at: h(20).toISOString(),
        },
        {
          id: "dc3",
          what: "Activate CRT",
          why: "Backups confirmed encrypted; multi-day outage of vital citizen services is unavoidable.",
          by: "Crisis Manager",
          at: h(9).toISOString(),
        },
      ],
      timeline: [
        T(h(30), "TOPdesk", "sync", "Imported from TOPdesk: “Citizen portal not reachable”."),
        T(
          h(29),
          "Security Incident Lead",
          "level",
          "Raised to Elevated: confirmed ransomware at supplier.",
        ),
        T(
          h(28),
          "Security Incident Lead",
          "activation",
          "IRT activated with IT, Security, Privacy, Communications.",
          true,
        ),
        T(h(20), "IRT Coordinator", "decision", "CRT not activated: risk still preventable."),
        T(
          h(9),
          "Crisis Manager",
          "activation",
          "CRT activated: critical impact unavoidable.",
          true,
        ),
        T(h(5), "Communications lead", "comm", "Draft public statement prepared."),
      ],
      comms: [
        {
          id: "cm1",
          audience: "internal",
          title: "Staff update #2",
          body: "The Citizen Portal and Permits System are unavailable because of an attack at our supplier. Use the manual counter procedure. Next update at 16:00.",
          status: "sent",
          at: h(6).toISOString(),
        },
        {
          id: "cm2",
          audience: "external",
          title: "Website statement",
          body: "Some online services are temporarily unavailable. You can still apply for permits at City Hall.",
          status: "draft",
          at: h(4).toISOString(),
        },
      ],
      attachments: [
        {
          id: "at1",
          name: "supplier-incident-notice.pdf",
          size: 182000,
          at: h(29).toISOString(),
          by: "Security Incident Lead",
        },
      ],
      relatedIds: ["d-outage"],
      actions: [
        {
          id: "ia1",
          title: "Add backup-integrity clause to hosting contract",
          owner: "Business Continuity Manager",
          due: addDays(now, 45).toISOString(),
          done: false,
        },
      ],
    }),
    ["rr-nis2"],
  );

  const phishing = withDl(
    baseIncident({
      id: "d-phishing",
      ref: "IRT-DEMO-002",
      title: "Phishing campaign with possible data breach",
      domain: "security",
      createdAt: h(20).toISOString(),
      detectedAt: h(20).toISOString(),
      awareAt: h(18).toISOString(),
      startedAt: h(22).toISOString(),
      description:
        "42 staff received a fake Microsoft login email. 3 entered their password. One mailbox holds social-affairs case files.",
      severity: 3,
      level: "coordinated",
      phase: "respond",
      processId: "p-security",
      ownerId: "IRT Coordinator",
      location: "City Hall",
      service: "Email",
      businessUnit: "Social Affairs",
      category: "Phishing",
      tlp: "amber",
      personalData: true,
      nextStep:
        "Privacy Officer decides before the 72-hour deadline whether the Data Protection Authority must be notified.",
      tasks: tasks([
        ["Reset 3 compromised accounts", "respond", "r-security", true],
        ["Purge email from all mailboxes", "respond", "r-security", true],
        ["Check mailbox access logs", "assess", "r-security", false],
        ["Risk assessment for case files", "assess", "r-privacy", false],
      ]),
      activations: [
        {
          id: "a1",
          team: "irt",
          at: h(17).toISOString(),
          by: "Security Incident Lead",
          rationale: "Security and Privacy must work together; Social Affairs is affected.",
          departments: ["Security", "Privacy", "Social Affairs"],
        },
      ],
      decisions: [
        {
          id: "dc1",
          what: "CRT not needed",
          why: "No critical impact is happening: accounts are reset and services run normally.",
          by: "IRT Coordinator",
          at: h(15).toISOString(),
        },
      ],
      timeline: [
        T(h(20), "SOC analyst", "created", "Reported via “Report phishing” button by 12 staff."),
        T(
          h(18),
          "SOC analyst",
          "note",
          "3 users entered credentials. Personal data possibly accessed.",
        ),
        T(
          h(17),
          "Security Incident Lead",
          "activation",
          "IRT activated (Security, Privacy, Social Affairs).",
          true,
        ),
        T(h(15), "IRT Coordinator", "decision", "CRT does not apply."),
      ],
      relatedIds: [],
    }),
    ["rr-gdpr", "rr-nis2"],
  );

  const misdirected = withDl(
    baseIncident({
      id: "d-misdirected",
      ref: "IRT-DEMO-003",
      title: "Benefit decision emailed to wrong citizen",
      domain: "privacy",
      createdAt: h(10).toISOString(),
      awareAt: h(10).toISOString(),
      description:
        "A decision letter with income details was emailed to a citizen with the same surname.",
      severity: 2,
      level: "elevated",
      phase: "assess",
      ownerId: "Privacy Officer on duty",
      service: "Email",
      businessUnit: "Social Affairs",
      category: "Misdirected email",
      personalData: true,
      nextStep: "Get written confirmation from the recipient that the email was deleted.",
      tasks: tasks([
        ["Ask recipient to delete", "respond", "r-reporter", true],
        ["Record in breach register", "assess", "r-privacy", false],
      ]),
      timeline: [T(h(10), "Citizen Services", "created", "Reported via the User Portal.")],
      decisions: [],
      relatedIds: [],
    }),
    ["rr-gdpr"],
  );

  const flood = baseIncident({
    id: "d-flood",
    ref: "IRT-DEMO-004",
    title: "Flooding in server room City Hall",
    domain: "facilities",
    processId: "p-facilities",
    createdAt: h(6).toISOString(),
    description:
      "A burst pipe above the basement server room. Water on the floor next to two racks.",
    severity: 3,
    level: "coordinated",
    phase: "respond",
    ownerId: "Facilities Manager",
    location: "City Hall",
    service: "Network",
    businessUnit: "Facilities",
    category: "Water damage",
    nextStep:
      "IT decides whether to shut down rack B2 before the water reaches the power distribution.",
    tasks: tasks([
      ["Shut off main water valve", "respond", "r-facilities", true],
      ["Place water barriers", "respond", "r-facilities", true],
      ["Assess rack B2 shutdown", "respond", "r-lead", false],
    ]),
    activations: [
      {
        id: "a1",
        team: "irt",
        at: h(5.5).toISOString(),
        by: "Facilities Manager",
        rationale: "Water damage threatens IT equipment: Facilities and IT must act together.",
        departments: ["Facilities", "IT"],
      },
    ],
    timeline: [
      T(h(6), "Reception City Hall", "created", "Alarm: “Water in basement”."),
      T(h(5.5), "Facilities Manager", "activation", "IRT activated with Facilities and IT.", true),
    ],
    decisions: [
      {
        id: "dc1",
        what: "Keep rack A running",
        why: "Water level is below the rack base.",
        by: "Facilities Manager",
        at: h(5).toISOString(),
      },
    ],
    relatedIds: [],
  });

  const accident = baseIncident({
    id: "d-accident",
    ref: "IRT-DEMO-005",
    title: "Worker injured during road works",
    domain: "safety",
    processId: "p-safety",
    createdAt: h(52).toISOString(),
    description:
      "A field worker was hit by a reversing vehicle and taken to hospital with a leg injury.",
    severity: 3,
    level: "elevated",
    phase: "recover",
    ownerId: "Health & Safety Officer",
    location: "Field Operations",
    service: "Waste Collection",
    businessUnit: "Public Works",
    category: "Workplace accident",
    nextStep: "Submit the report to the labour inspectorate and plan the team debrief.",
    tasks: tasks([
      ["Call 112", "report", "r-reporter", true],
      ["Secure the location", "respond", "r-first", true],
      ["Inform family", "respond", "r-hr", true],
      ["Report to labour inspectorate", "recover", "r-safety", false],
    ]),
    timeline: [T(h(52), "Field Operations Coordinator", "created", "Reported by phone.")],
    decisions: [],
    relatedIds: [],
    actions: [
      {
        id: "ia1",
        title: "Install reversing cameras on all trucks",
        owner: "Field Operations Coordinator",
        due: addDays(now, 60).toISOString(),
        done: false,
      },
    ],
  });

  const integrity = baseIncident({
    id: "d-integrity",
    ref: "IRT-DEMO-006",
    title: "Integrity report — procurement",
    domain: "hr",
    processId: "p-hr",
    createdAt: h(70).toISOString(),
    description:
      "Report of a possible conflict of interest in a tender. Names are recorded in the confidential file only.",
    severity: 2,
    level: "elevated",
    phase: "assess",
    classification: "strict",
    ownerId: "Integrity Officer",
    location: "City Hall",
    service: "Payroll",
    businessUnit: "Finance",
    category: "Integrity",
    nextStep: "Integrity Officer decides on the scope of the investigation.",
    timeline: [T(h(70), "Confidential Advisor", "created", "Report received in confidence.")],
    decisions: [],
    relatedIds: [],
  });

  const outage = withDl(
    baseIncident({
      id: "d-outage",
      ref: "IRT-DEMO-007",
      title: "National outage of DigiD-style login service",
      domain: "continuity",
      processId: "p-continuity",
      createdAt: h(3).toISOString(),
      detectedAt: h(3).toISOString(),
      description:
        "The national login service used for all citizen transactions is down nationwide.",
      severity: 4,
      level: "critical",
      phase: "respond",
      ownerId: "Crisis Manager",
      location: "City Hall",
      service: "Citizen Portal",
      businessUnit: "Citizen Services",
      category: "Supplier outage",
      nextStep: "Decide whether to extend counter opening hours tonight.",
      activations: [
        {
          id: "a1",
          team: "crt",
          at: h(2.5).toISOString(),
          by: "Crisis Manager",
          rationale:
            "Outage is happening and all citizen transactions are blocked: critical impact.",
          happening: true,
          critical: true,
        },
      ],
      timeline: [
        T(h(3), "Webhook", "sync", "Status feed: national login service unavailable."),
        T(h(2.5), "Crisis Manager", "activation", "CRT activated.", true),
      ],
      decisions: [],
      relatedIds: ["d-ransomware"],
    }),
    ["rr-exception"],
  );

  return [ransomware, phishing, misdirected, flood, accident, integrity, outage];
}
