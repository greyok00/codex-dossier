import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { withTransaction } from "../../db/pool.js";
import { DatabaseError, ValidationError } from "../../lib/errors.js";
import { venueMatchRequestSchema, venueMatchSchema, type VenueMatch, type VenueMatchRequest } from "../contracts.js";
import type { PlaceProvider, PlaceProviderCandidate } from "./provider.js";

export class VenueService {
  constructor(
    private readonly pool: Pool,
    private readonly placeProvider: PlaceProvider,
  ) {}

  async matchVenue(rawRequest: unknown) {
    let request: VenueMatchRequest;
    try {
      request = venueMatchRequestSchema.parse(rawRequest);
    } catch (error) {
      throw new ValidationError("Venue match request validation failed.", error);
    }

    const providerMatches = await this.placeProvider.search({
      lat: request.location.lat,
      lng: request.location.lng,
      address: request.location.address ?? null,
      transcriptExcerpt: request.transcript_excerpt ?? null,
      businessHints: request.business_hints,
    });

    const rankedMatches = providerMatches
      .map((candidate) => toVenueMatch(candidate, request))
      .sort((left, right) => right.match_confidence - left.match_confidence)
      .map((candidate) => venueMatchSchema.parse(candidate));

    const client = await this.pool.connect();
    try {
      await withTransaction(client, async () => {
        for (const match of rankedMatches) {
          await client.query(
            `
              INSERT INTO dossier_backend.venue_match_cache (
                id,
                provider,
                place_id,
                business_name,
                address,
                phone,
                website,
                lat,
                lng,
                captured_at,
                source_url,
                trust_level
              )
              VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11, $12::dossier_enum.trust_level_enum)
              ON CONFLICT (provider, place_id) DO UPDATE SET
                business_name = EXCLUDED.business_name,
                address = EXCLUDED.address,
                phone = EXCLUDED.phone,
                website = EXCLUDED.website,
                lat = EXCLUDED.lat,
                lng = EXCLUDED.lng,
                captured_at = EXCLUDED.captured_at,
                source_url = EXCLUDED.source_url,
                trust_level = EXCLUDED.trust_level
            `,
            [
              randomUUID(),
              match.provider,
              match.place_id,
              match.business_name,
              match.address,
              match.phone,
              match.website,
              match.lat,
              match.lng,
              match.captured_at,
              match.source_url,
              match.trust_level,
            ],
          );
        }
      });
    } catch (error) {
      throw new DatabaseError("Venue match cache write failed.", error);
    } finally {
      client.release();
    }

    return {
      incident_id: request.incident_id,
      matches: rankedMatches,
    };
  }
}

function toVenueMatch(candidate: PlaceProviderCandidate, request: VenueMatchRequest): VenueMatch {
  return {
    provider: candidate.provider,
    place_id: candidate.place_id,
    business_name: candidate.business_name,
    address: candidate.address,
    phone: candidate.phone,
    website: candidate.website,
    lat: candidate.lat,
    lng: candidate.lng,
    match_confidence: computeMatchConfidence(candidate, request),
    source_label: candidate.source_label,
    source_url: candidate.source_url,
    trust_level: candidate.trust_level,
    captured_at: candidate.captured_at ?? new Date().toISOString(),
  };
}

function computeMatchConfidence(candidate: PlaceProviderCandidate, request: VenueMatchRequest) {
  const normalizedName = normalize(candidate.business_name);
  const normalizedAddress = normalize(candidate.address);
  let score = candidate.provider_confidence ?? 0.5;

  for (const hint of request.business_hints) {
    const normalizedHint = normalize(hint);
    if (!normalizedHint) {
      continue;
    }
    if (normalizedName === normalizedHint) {
      score += 0.35;
      continue;
    }
    if (normalizedName.includes(normalizedHint) || normalizedHint.includes(normalizedName)) {
      score += 0.2;
      continue;
    }
    if (overlap(normalizedHint, normalizedName) >= 0.5) {
      score += 0.12;
    }
  }

  if (request.transcript_excerpt) {
    const normalizedExcerpt = normalize(request.transcript_excerpt);
    if (normalizedExcerpt.includes(normalizedName)) {
      score += 0.08;
    } else {
      score += Math.min(0.08, overlap(normalizedExcerpt, normalizedName) * 0.12);
    }
  }

  if (request.location.address) {
    const normalizedRequestAddress = normalize(request.location.address);
    if (normalizedRequestAddress && normalizedAddress.includes(normalizedRequestAddress)) {
      score += 0.1;
    } else {
      score += Math.min(0.08, overlap(normalizedRequestAddress, normalizedAddress) * 0.1);
    }
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlap(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}
