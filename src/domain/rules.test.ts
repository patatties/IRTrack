import { describe, expect, it } from "vitest";
import {
  computeDeadlines,
  crtApplies,
  maskIncident,
  publishedVersion,
  validateFlowchart,
} from "./rules";
import { buildRules, buildSituations } from "../../server/templates";
import type { GuidanceSituation } from "./types";

describe("CRT activation", () => {
  it("applies only when happening AND critical", () => {
    expect(crtApplies(true, true)).toBe(true);
    expect(crtApplies(false, true)).toBe(false);
    expect(crtApplies(true, false)).toBe(false);
  });
});

describe("NIS2 deadlines", () => {
  it("early warning 24h, notification 72h, final report 1 month after notification", () => {
    const rule = buildRules(new Date("2026-01-01T00:00:00Z")).find((r) => r.id === "rr-nis2")!;
    const aware = "2026-03-10T08:00:00.000Z";
    const d = computeDeadlines(
      rule,
      { startedAt: aware, detectedAt: aware, awareAt: aware },
      new Date(aware),
    );
    expect(d.map((x) => x.dueAt)).toEqual([
      "2026-03-11T08:00:00.000Z",
      "2026-03-13T08:00:00.000Z",
      "2026-04-13T08:00:00.000Z",
    ]);
  });
  it("GDPR notification is due 72 hours after becoming aware", () => {
    const rule = buildRules(new Date()).find((r) => r.id === "rr-gdpr")!;
    const d = computeDeadlines(rule, {
      startedAt: "2026-01-01T00:00:00.000Z",
      detectedAt: "2026-01-02T00:00:00.000Z",
      awareAt: "2026-01-05T00:00:00.000Z",
    });
    expect(d[0].dueAt).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("confidential masking", () => {
  const hr = {
    classification: "confidential" as const,
    title: "Harassment case",
    description: "x",
    ownerId: "HR",
    location: "City Hall",
  };
  it("hides details on the wallboard and executive view", () => {
    expect(maskIncident(hr, "wallboard").title).toBe("Confidential incident");
    expect(maskIncident(hr, "executive").title).toBe("Confidential incident");
  });
  it("shows details in the admin view", () => {
    expect(maskIncident(hr, "admin").title).toBe("Harassment case");
  });
});

describe("flowchart validation", () => {
  it("reports a dead end", () => {
    const issues = validateFlowchart(
      {
        nodes: [
          { id: "s", type: "start", label: "S", x: 0, y: 0 },
          { id: "a", type: "action", label: "Do it", x: 0, y: 0 },
        ],
        edges: [{ id: "e", source: "s", target: "a" }],
      },
      { contacts: new Set(), roles: new Set() },
    );
    expect(issues.some((i) => i.nodeId === "a" && i.severity === "error")).toBe(true);
  });
  it("template flowcharts have no errors", () => {
    const sits = buildSituations(new Date());
    const contacts = new Set(Array.from({ length: 40 }, (_, i) => `c-${i + 1}`));
    const roles = new Set([
      "r-reporter",
      "r-first",
      "r-lead",
      "r-irt",
      "r-crt",
      "r-comms",
      "r-privacy",
      "r-security",
      "r-facilities",
      "r-safety",
      "r-hr",
      "r-bcm",
    ]);
    for (const s of sits)
      expect(
        validateFlowchart(s.versions[0].content.flowchart, { contacts, roles }).filter(
          (i) => i.severity === "error",
        ),
      ).toEqual([]);
  });
});

describe("publishing", () => {
  it("the portal never shows a draft", () => {
    const base = buildSituations(new Date())[0];
    const s: GuidanceSituation = {
      ...base,
      versions: [...base.versions, { ...base.versions[0], version: 2, status: "draft" }],
    };
    expect(publishedVersion(s)?.version).toBe(1);
  });
});
