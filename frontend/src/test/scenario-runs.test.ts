import { describe, expect, it } from "vitest";

import { buildDeterministicFactSet, buildTemplateDraft } from "../lib/local-ai";
import { buildDeterministicRouteRecommendations } from "../lib/local-routing";
import type { TranscriptDocument } from "../lib/runtime";

interface ScenarioResult {
  scenario: string;
  transcript: string;
  incident_type: string | null;
  places: string[];
  businesses: string[];
  key_facts: string[];
  routes: Array<{
    name: string;
    group: string;
    source_label: string;
    trust: string;
    complaint_url: string | null;
  }>;
  draft_subject: string;
}

function runScenario(input: {
  scenario: string;
  transcript: TranscriptDocument;
  location_address: string | null;
  place_name: string | null;
  place_phone: string | null;
}) {
  const factSet = buildDeterministicFactSet(input.transcript, {
    location_address: input.location_address,
    confirmed_place_id: null,
    confirmed_place_name: input.place_name,
    confirmed_place_phone: input.place_phone,
  });

  const routes = buildDeterministicRouteRecommendations({
    incident_id: crypto.randomUUID(),
    fact_set: {
      fact_set_id: crypto.randomUUID(),
      ...factSet,
      reviewed_by_user: true,
    },
    context: {
      location_address: input.location_address,
      location_lat: null,
      location_lng: null,
      confirmed_place_name: input.place_name,
      confirmed_place_phone: input.place_phone,
      transcript_excerpt: input.transcript.full_text,
    },
  });

  const selected = routes[0];
  const draft = selected
    ? buildTemplateDraft(
        {
          fact_set_id: crypto.randomUUID(),
          ...factSet,
          reviewed_by_user: true,
        },
        {
          destination_name_snapshot: selected.destination_name_snapshot,
          route_group: selected.route_group,
          reason: selected.reason,
          source_label: selected.source_label,
          trust_level: selected.trust_level,
        },
      )
    : {
        subject: "No route selected",
      };

  const result: ScenarioResult = {
    scenario: input.scenario,
    transcript: input.transcript.full_text,
    incident_type: factSet.incident_type,
    places: factSet.places,
    businesses: factSet.businesses,
    key_facts: factSet.key_facts,
    routes: routes.map((route) => ({
      name: route.destination_name_snapshot,
      group: route.route_group,
      source_label: route.source_label,
      trust: route.trust_level,
      complaint_url: route.complaint_url,
    })),
    draft_subject: draft.subject,
  };

  return result;
}

describe("scenario runs", () => {
  it("scenario 1: Phoenix consumer billing complaint", () => {
    const result = runScenario({
      scenario: "Phoenix consumer billing complaint",
      transcript: {
        full_text:
          "I was charged twice by Desert Market in Phoenix, Arizona. The manager refused to refund the $85 charge.",
        language: "en",
        segment_count: 1,
        segments: [
          {
            start_ms: 0,
            end_ms: 5000,
            speaker_label: "Speaker 1",
            text: "I was charged twice by Desert Market in Phoenix, Arizona. The manager refused to refund the $85 charge.",
            confidence: 0.88,
          },
        ],
      },
      location_address: "Phoenix, AZ",
      place_name: "Desert Market",
      place_phone: null,
    });

    expect(result.incident_type).toBe("consumer_billing");
    expect(result.routes[0]?.group).toBe("Business");
    expect(result.routes.some((route) => route.group === "State" && /arizona|az/i.test(route.name))).toBe(true);
    console.info(JSON.stringify(result, null, 2));
  });

  it("scenario 2: Dallas vehicle break-in police report", () => {
    const result = runScenario({
      scenario: "Dallas vehicle break-in police report",
      transcript: {
        full_text: "I need to file a police report. My car got broken into in Dallas, Texas.",
        language: "en",
        segment_count: 1,
        segments: [
          {
            start_ms: 0,
            end_ms: 3000,
            speaker_label: "Speaker 1",
            text: "I need to file a police report. My car got broken into in Dallas, Texas.",
            confidence: 0.86,
          },
        ],
      },
      location_address: "Dallas, TX",
      place_name: null,
      place_phone: null,
    });

    expect(result.incident_type).toBe("emergency_safety");
    expect(result.routes.some((route) => /dallas.*police/i.test(route.name))).toBe(true);
    expect(result.routes.some((route) => route.group === "Local")).toBe(true);
    console.info(JSON.stringify(result, null, 2));
  });

  it("scenario 3: tenant complaint in Seattle", () => {
    const result = runScenario({
      scenario: "Seattle tenant complaint",
      transcript: {
        full_text:
          "My landlord in Seattle, Washington kept my deposit and ignored repair requests. I need to file a complaint.",
        language: "en",
        segment_count: 1,
        segments: [
          {
            start_ms: 0,
            end_ms: 4000,
            speaker_label: "Speaker 1",
            text: "My landlord in Seattle, Washington kept my deposit and ignored repair requests. I need to file a complaint.",
            confidence: 0.84,
          },
        ],
      },
      location_address: "Seattle, WA",
      place_name: null,
      place_phone: null,
    });

    expect(result.incident_type).toBe("tenant_issue");
    expect(result.routes.some((route) => /WA state consumer office directory/i.test(route.name))).toBe(true);
    expect(result.routes[0]?.group).toBe("State");
    console.info(JSON.stringify(result, null, 2));
  });

  it("scenario 4: police misconduct complaint in Phoenix", () => {
    const result = runScenario({
      scenario: "Phoenix police misconduct complaint",
      transcript: {
        full_text:
          "I need to file a complaint against a police officer in Phoenix, Arizona for excessive force by the department.",
        language: "en",
        segment_count: 1,
        segments: [
          {
            start_ms: 0,
            end_ms: 4000,
            speaker_label: "Speaker 1",
            text: "I need to file a complaint against a police officer in Phoenix, Arizona for excessive force by the department.",
            confidence: 0.84,
          },
        ],
      },
      location_address: "Phoenix, AZ",
      place_name: null,
      place_phone: null,
    });

    expect(result.incident_type).toBe("police_misconduct");
    expect(result.routes.some((route) => /civil rights/i.test(route.name) || /justice\.gov/i.test(route.source_label))).toBe(true);
    expect(result.routes.some((route) => /state attorney general|attorney general office directory/i.test(route.name))).toBe(true);
    expect(result.routes.some((route) => /google\.com\/search/i.test(route.complaint_url ?? ""))).toBe(false);
    console.info(JSON.stringify(result, null, 2));
  });
});
