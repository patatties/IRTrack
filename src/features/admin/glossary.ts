export const GLOSSARY = {
  IRT: "Incident Response Team: a cross-functional team that coordinates incidents across departments. Can apply to any type of incident.",
  CRT: "Critical Response Team: leads only when an event is happening (or virtually unavoidable) AND the impact is critical.",
  CSIRT:
    "Computer Security Incident Response Team — the common cybersecurity name for an IRT. Informational label only.",
  CERT: "Computer Emergency Response Team — a cybersecurity name that may be used for a CRT. Informational label only.",
  RACI: "Responsible (does the work), Accountable (decides), Consulted, Informed.",
  SLA: "Service Level Agreement: the agreed time to respond to or resolve an incident.",
  TLP: "Traffic Light Protocol: labels (CLEAR, GREEN, AMBER, RED) that say how widely security information may be shared.",
  NIS2: "EU directive on network and information security, implemented in the Netherlands as the Cybersecurity Act (Cbw).",
  GDPR: "General Data Protection Regulation. Data breaches with risk must be reported to the authority within 72 hours.",
  Severity: "How bad the impact is: 1 Low, 2 Medium, 3 High, 4 Critical.",
  "Response level":
    "Who handles it: Standard (support line), Elevated (specialist), Coordinated (IRT), Critical (CRT).",
  Phase: "Universal phases: Report, Assess, Respond, Recover, Close and learn.",
  "Became aware":
    "The moment the organization had reasonable certainty an incident occurred. Many legal deadlines start here.",
} as const;
