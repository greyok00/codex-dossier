import { describe, expect, it } from "vitest";

import { buildDeterministicFactSet, buildTemplateDraft } from "../lib/local-ai";
import { buildDeterministicRouteRecommendations } from "../lib/local-routing";
import type { TranscriptDocument } from "../lib/runtime";

describe("local deterministic AI helpers", () => {
  it("extracts facts from a transcript using deterministic rules", () => {
    const transcript: TranscriptDocument = {
      full_text: "I was charged twice at Desert Market on April 8, 2026 and the manager refused a refund of $42.17.",
      language: "en",
      segment_count: 2,
      segments: [
        {
          start_ms: 0,
          end_ms: 2000,
          speaker_label: "Speaker 1",
          text: "I was charged twice at Desert Market on April 8, 2026.",
          confidence: 0.88,
        },
        {
          start_ms: 2000,
          end_ms: 4000,
          speaker_label: "Speaker 1",
          text: "The manager refused a refund of $42.17.",
          confidence: 0.84,
        },
      ],
    };

    const factSet = buildDeterministicFactSet(transcript, {
      location_address: "Phoenix, AZ 85004",
      confirmed_place_id: null,
      confirmed_place_name: "Desert Market",
      confirmed_place_phone: "+1-602-555-0101",
    });

    expect(factSet.incident_type).toBe("consumer_billing");
    expect(factSet.businesses).toContain("Desert Market");
    expect(factSet.people).toContain("Manager");
    expect(factSet.amounts).toContain("$42.17");
    expect(factSet.timeline).toHaveLength(2);
  });

  it("builds ordered routes from local facts and the embedded registry bundle", () => {
    const routes = buildDeterministicRouteRecommendations({
      incident_id: crypto.randomUUID(),
      fact_set: {
        fact_set_id: crypto.randomUUID(),
        incident_type: "consumer_billing",
        people: ["Manager"],
        places: ["Phoenix, AZ 85004"],
        businesses: ["Desert Market"],
        phones: [],
        dates: ["April 8, 2026"],
        amounts: ["$42.17"],
        timeline: [
          {
            time_label: "00:00",
            description: "The customer reported a duplicate charge.",
          },
        ],
        key_facts: ["The customer reported a duplicate charge.", "The manager refused a refund."],
        reviewed_by_user: false,
      },
      context: {
        location_address: "Phoenix, AZ 85004",
        location_lat: 33.4484,
        location_lng: -112.074,
        confirmed_place_name: "Desert Market",
        confirmed_place_phone: null,
        transcript_excerpt: "Duplicate charge and refused refund at Desert Market.",
      },
    });

    expect(routes.map((route) => route.route_group)).toEqual(["Business", "State", "Other"]);
    expect(routes[0]?.destination_name_snapshot).toMatch(/Desert Market public contact/i);
    expect(routes[0]?.selected).toBe(false);
    expect(routes[1]?.destination_name_snapshot).toMatch(/Arizona Consumer Complaint/i);
  });

  it("builds a local draft from facts and the selected route", () => {
    const draft = buildTemplateDraft(
      {
        fact_set_id: crypto.randomUUID(),
        incident_type: "consumer_billing",
        people: ["Manager"],
        places: ["Phoenix, AZ 85004"],
        businesses: ["Desert Market"],
        phones: [],
        dates: ["April 8, 2026"],
        amounts: ["$42.17"],
        timeline: [
          {
            time_label: "00:00",
            description: "The customer reported a duplicate charge.",
          },
        ],
        key_facts: ["The customer reported a duplicate charge.", "The manager refused a refund."],
        reviewed_by_user: false,
      },
      {
        destination_name_snapshot: "Arizona Consumer Complaint",
        route_group: "State",
        reason: "This route fits a consumer complaint about goods or services in Arizona.",
        source_label: "azag.gov",
        trust_level: "official",
      },
    );

    expect(draft.subject).toMatch(/Consumer billing:\s*Desert Market/i);
    expect(draft.body).toMatch(/Arizona Consumer Complaint/);
    expect(draft.attachment_labels).toContain("Transcript");
  });

  it("classifies police report and break-in language as emergency/public safety", () => {
    const transcript: TranscriptDocument = {
      full_text: "I need to file a police report. My car got broken into in Dallas, Texas.",
      language: "en",
      segment_count: 1,
      segments: [
        {
          start_ms: 0,
          end_ms: 3000,
          speaker_label: "Speaker 1",
          text: "I need to file a police report. My car got broken into in Dallas, Texas.",
          confidence: 0.82,
        },
      ],
    };

    const factSet = buildDeterministicFactSet(transcript, {
      location_address: "Dallas, TX",
      confirmed_place_id: null,
      confirmed_place_name: null,
      confirmed_place_phone: null,
    });

    expect(factSet.incident_type).toBe("emergency_safety");
    expect(factSet.places.join(" ").toLowerCase()).toContain("dallas");
    expect(factSet.key_facts.join(" ").toLowerCase()).toMatch(/police|broken into|break-in|burglary/);
  });
});
