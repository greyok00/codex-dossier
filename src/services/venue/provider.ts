import { ServiceUnavailableError } from "../../lib/errors.js";
import type { TrustLevel } from "../contracts.js";

export interface PlaceProviderSearchInput {
  lat: number;
  lng: number;
  address: string | null;
  transcriptExcerpt: string | null;
  businessHints: string[];
}

export interface PlaceProviderCandidate {
  provider: string;
  place_id: string;
  business_name: string;
  address: string;
  phone: string | null;
  website: string | null;
  lat: number;
  lng: number;
  source_label: string;
  source_url: string;
  trust_level: TrustLevel;
  provider_confidence?: number;
  captured_at?: string;
}

export interface PlaceProvider {
  search(input: PlaceProviderSearchInput): Promise<PlaceProviderCandidate[]>;
}

interface GooglePlacesSearchTextResponse {
  places?: Array<{
    id?: string;
    name?: string;
    displayName?: {
      text?: string;
    };
    formattedAddress?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
    nationalPhoneNumber?: string;
    websiteUri?: string;
  }>;
}

export class GooglePlacesProvider implements PlaceProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fieldMask = [
      "places.id",
      "places.name",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.nationalPhoneNumber",
      "places.websiteUri",
    ].join(","),
  ) {}

  async search(input: PlaceProviderSearchInput): Promise<PlaceProviderCandidate[]> {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": this.fieldMask,
      },
      body: JSON.stringify({
        textQuery: buildTextQuery(input),
        languageCode: "en",
        regionCode: "US",
        maxResultCount: 5,
        locationBias: {
          circle: {
            center: {
              latitude: input.lat,
              longitude: input.lng,
            },
            radius: 1200,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ServiceUnavailableError("Place provider lookup failed.", {
        provider: "google_places",
        status: response.status,
        body,
      });
    }

    const payload = (await response.json()) as GooglePlacesSearchTextResponse;
    const capturedAt = new Date().toISOString();

    const candidates: Array<PlaceProviderCandidate | null> = (payload.places ?? []).map((place, index) => {
        const placeId = place.id ?? extractPlaceId(place.name);
        const businessName = place.displayName?.text?.trim() ?? "";
        const address = place.formattedAddress?.trim() ?? "";
        const lat = place.location?.latitude;
        const lng = place.location?.longitude;
        if (!placeId || !businessName || !address || lat === undefined || lng === undefined) {
          return null;
        }

        return {
          provider: "google_places",
          place_id: placeId,
          business_name: businessName,
          address,
          phone: place.nationalPhoneNumber?.trim() ?? null,
          website: place.websiteUri?.trim() ?? null,
          lat,
          lng,
          source_label: "Google Places",
          source_url: buildGoogleMapsUrl(placeId, businessName),
          trust_level: "directory" as const,
          provider_confidence: Math.max(0.2, 1 - index * 0.15),
          captured_at: capturedAt,
        } satisfies PlaceProviderCandidate;
      });

    return candidates.filter((candidate): candidate is PlaceProviderCandidate => candidate !== null);
  }
}

export function createDefaultPlaceProvider(): PlaceProvider {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return {
      async search() {
        throw new ServiceUnavailableError("Google Places is not configured.");
      },
    };
  }

  return new GooglePlacesProvider(apiKey);
}

function buildTextQuery(input: PlaceProviderSearchInput) {
  const hintText = input.businessHints.filter(Boolean).slice(0, 3).join(" ");
  const excerptText = normalizeFreeText(input.transcriptExcerpt ?? "");
  const locationText = input.address?.trim() || `${input.lat}, ${input.lng}`;
  const subject = hintText || excerptText || "business";
  return `${subject} ${locationText}`.trim();
}

function normalizeFreeText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function extractPlaceId(resourceName?: string) {
  if (!resourceName) {
    return null;
  }
  const parts = resourceName.split("/");
  return parts.at(-1) ?? null;
}

function buildGoogleMapsUrl(placeId: string, businessName: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(businessName)}&query_place_id=${encodeURIComponent(placeId)}`;
}
